import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, WorkOrderStatus, WorkOrderPriority, NotificationType } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { UnitsService } from '../units/units.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeWO = (overrides = {}) => ({
  id: 'wo-1',
  companyId: 'company-1',
  unitId: 'unit-1',
  assetId: null,
  creatorId: 'user-creator',
  assigneeId: 'user-tech',
  code: 'OS-2026-ABC1',
  title: 'Manutenção preventiva',
  description: 'Descrição detalhada',
  status: WorkOrderStatus.ASSIGNED,
  priority: WorkOrderPriority.MEDIUM,
  dueDate: null,
  startedAt: null,
  completedAt: null,
  notes: null,
  photoUrls: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  unit: { id: 'unit-1', name: 'Torre A' },
  asset: null,
  creator: { id: 'user-creator', name: 'Maria Gestora', email: 'gestor@test.com' },
  assignee: { id: 'user-tech', name: 'João Técnico', email: 'tecnico@test.com' },
  ...overrides,
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  workOrder: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
  },
  unit: { findFirst: jest.fn() },
  user: { findFirst: jest.fn() },
  asset: { findFirst: jest.fn() },
};

const mockNotifications = {
  create: jest.fn().mockResolvedValue({}),
  notifyManagers: jest.fn().mockResolvedValue(undefined),
};

const mockPush = {
  sendToUser: jest.fn().mockResolvedValue(undefined),
  sendToUsers: jest.fn().mockResolvedValue(undefined),
};

const mockUnits = {
  getUserUnitIds: jest.fn().mockResolvedValue(['unit-1']),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: PushService, useValue: mockPush },
        { provide: UnitsService, useValue: mockUnits },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { title: 'Nova OS', description: 'Desc', unitId: 'unit-1', priority: WorkOrderPriority.HIGH };

    it('gera código com formato OS-YYYY-SUFFIX sem usar count (sem race condition)', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockPrisma.workOrder.create.mockResolvedValue(makeWO());

      await service.create('company-1', 'creator-1', dto);

      // Novo algoritmo NÃO usa count
      expect(mockPrisma.workOrder.count).not.toHaveBeenCalled();

      const createCall = mockPrisma.workOrder.create.mock.calls[0][0];
      expect(createCall.data.code).toMatch(/^OS-\d{4}-[A-Z0-9]+$/);
    });

    it('status OPEN quando sem assignee', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockPrisma.workOrder.create.mockResolvedValue(makeWO({ status: WorkOrderStatus.OPEN, assigneeId: null }));

      await service.create('company-1', 'creator-1', dto);

      expect(mockPrisma.workOrder.create.mock.calls[0][0].data.status).toBe(WorkOrderStatus.OPEN);
    });

    it('status ASSIGNED e notificação quando assignee pertence à unidade', async () => {
      mockPrisma.unit.findFirst
        .mockResolvedValueOnce({ id: 'unit-1' })  // validar unidade
        .mockResolvedValueOnce({ id: 'unit-1' }); // validar assignee na unidade
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-tech', companyId: 'company-1' });
      mockPrisma.workOrder.create.mockResolvedValue(makeWO({ status: WorkOrderStatus.ASSIGNED }));

      await service.create('company-1', 'creator-1', { ...dto, assigneeId: 'user-tech' });

      expect(mockPrisma.workOrder.create.mock.calls[0][0].data.status).toBe(WorkOrderStatus.ASSIGNED);
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.WORK_ORDER_ASSIGNED, userId: 'user-tech' }),
      );
    });

    it('lança NotFoundException se unidade não existir', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue(null);
      await expect(service.create('company-1', 'creator-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('lança BadRequestException se assignee não pertencer à unidade', async () => {
      mockPrisma.unit.findFirst
        .mockResolvedValueOnce({ id: 'unit-1' })  // unidade existe
        .mockResolvedValueOnce(null);             // assignee NÃO na unidade
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-tech', companyId: 'company-1' });

      await expect(
        service.create('company-1', 'creator-1', { ...dto, assigneeId: 'user-tech' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('transição válida ASSIGNED → IN_PROGRESS', async () => {
      const wo = makeWO({ status: WorkOrderStatus.ASSIGNED, assigneeId: 'user-tech' });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      mockPrisma.workOrder.update.mockResolvedValue({ ...wo, status: WorkOrderStatus.IN_PROGRESS });

      await service.updateStatus('wo-1', 'company-1', 'user-tech', Role.TECNICO, {
        status: WorkOrderStatus.IN_PROGRESS,
      });

      const updateData = mockPrisma.workOrder.update.mock.calls[0][0].data;
      expect(updateData.status).toBe(WorkOrderStatus.IN_PROGRESS);
      expect(updateData.startedAt).toBeInstanceOf(Date);
    });

    it('transição inválida COMPLETED → IN_PROGRESS lança BadRequestException', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(makeWO({ status: WorkOrderStatus.COMPLETED }));

      await expect(
        service.updateStatus('wo-1', 'company-1', 'admin', Role.ADMIN, {
          status: WorkOrderStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('TECNICO não pode atualizar OS atribuída a outro técnico', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(makeWO({ assigneeId: 'outro-tecnico' }));

      await expect(
        service.updateStatus('wo-1', 'company-1', 'meu-id', Role.TECNICO, {
          status: WorkOrderStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('notifica criador ao COMPLETAR a OS', async () => {
      const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, assigneeId: 'user-tech', creatorId: 'user-creator' });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      mockPrisma.workOrder.update.mockResolvedValue({ ...wo, status: WorkOrderStatus.COMPLETED });

      await service.updateStatus('wo-1', 'company-1', 'user-tech', Role.TECNICO, {
        status: WorkOrderStatus.COMPLETED,
      });

      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-creator', type: NotificationType.SYSTEM }),
      );
    });

    it('define completedAt ao COMPLETAR', async () => {
      const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, assigneeId: 'user-tech' });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      mockPrisma.workOrder.update.mockResolvedValue(wo);

      await service.updateStatus('wo-1', 'company-1', 'user-tech', Role.TECNICO, {
        status: WorkOrderStatus.COMPLETED,
      });

      expect(mockPrisma.workOrder.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    });
  });

  // ── assign ─────────────────────────────────────────────────────────────────

  describe('assign', () => {
    it('lança BadRequestException se técnico não pertencer à unidade da OS', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(makeWO());
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-tech', companyId: 'company-1' });
      mockPrisma.unit.findFirst.mockResolvedValue(null); // não está na unidade

      await expect(service.assign('wo-1', 'company-1', 'user-tech')).rejects.toThrow(BadRequestException);
    });

    it('atribui técnico da unidade e envia notificação', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(makeWO());
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-tech', companyId: 'company-1' });
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockPrisma.workOrder.update.mockResolvedValue(
        makeWO({ assigneeId: 'user-tech', status: WorkOrderStatus.ASSIGNED }),
      );

      await service.assign('wo-1', 'company-1', 'user-tech');

      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.WORK_ORDER_ASSIGNED }),
      );
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('TECNICO vê apenas OS das suas unidades (RBAC)', async () => {
      mockUnits.getUserUnitIds.mockResolvedValue(['unit-1', 'unit-2']);
      mockPrisma.workOrder.findMany.mockResolvedValue([]);
      mockPrisma.workOrder.count.mockResolvedValue(0);

      await service.findAll('company-1', { page: 1, limit: 20, skip: 0 }, 'user-tech', 'TECNICO');

      const where = mockPrisma.workOrder.findMany.mock.calls[0][0].where;
      expect(where.unitId).toEqual({ in: ['unit-1', 'unit-2'] });
    });

    it('ADMIN não tem filtro de unidade', async () => {
      mockPrisma.workOrder.findMany.mockResolvedValue([]);
      mockPrisma.workOrder.count.mockResolvedValue(0);

      await service.findAll('company-1', { page: 1, limit: 20, skip: 0 }, 'user-admin', 'ADMIN');

      const where = mockPrisma.workOrder.findMany.mock.calls[0][0].where;
      expect(where.unitId).toBeUndefined();
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('retorna OS existente', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(makeWO());
      const result = await service.findOne('wo-1', 'company-1');
      expect(result.id).toBe('wo-1');
    });

    it('lança NotFoundException quando OS não existe', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(null);
      await expect(service.findOne('inexistente', 'company-1')).rejects.toThrow(NotFoundException);
    });

    it('isolamento multi-tenant — query sempre filtra por companyId', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(null);
      await expect(service.findOne('wo-1', 'empresa-errada')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.workOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'empresa-errada' }) }),
      );
    });
  });
});
