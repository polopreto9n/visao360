import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, WorkOrderStatus, WorkOrderPriority, NotificationType } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeWO = (overrides = {}) => ({
  id: 'wo-1',
  companyId: 'company-1',
  unitId: 'unit-1',
  assetId: null,
  creatorId: 'user-creator',
  assigneeId: 'user-tech',
  code: 'OS-2024-0001',
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

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

let service: WorkOrdersService;

beforeEach(async () => {
  jest.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      WorkOrdersService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: NotificationsService, useValue: mockNotifications },
    ],
  }).compile();

  service = module.get<WorkOrdersService>(WorkOrdersService);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkOrdersService', () => {
  describe('create', () => {
    const createDto = {
      title: 'Nova OS',
      description: 'Descrição',
      unitId: 'unit-1',
      priority: WorkOrderPriority.HIGH,
    };

    it('deve gerar código sequencial para a OS', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockPrisma.workOrder.count.mockResolvedValue(5);
      mockPrisma.workOrder.create.mockResolvedValue(makeWO({ code: 'OS-2024-0006' }));

      await service.create('company-1', 'creator-1', createDto);

      const createCall = mockPrisma.workOrder.create.mock.calls[0][0];
      const year = new Date().getFullYear();
      expect(createCall.data.code).toBe(`OS-${year}-0006`);
    });

    it('deve criar OS com status OPEN quando sem assignee', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockPrisma.workOrder.count.mockResolvedValue(0);
      mockPrisma.workOrder.create.mockResolvedValue(makeWO({ status: WorkOrderStatus.OPEN, assigneeId: null }));

      await service.create('company-1', 'creator-1', { ...createDto, assigneeId: undefined });

      const createCall = mockPrisma.workOrder.create.mock.calls[0][0];
      expect(createCall.data.status).toBe(WorkOrderStatus.OPEN);
    });

    it('deve criar OS com status ASSIGNED e notificar quando tem assignee', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'tech-1', name: 'Técnico' });
      mockPrisma.workOrder.count.mockResolvedValue(0);
      mockPrisma.workOrder.create.mockResolvedValue(makeWO({ status: WorkOrderStatus.ASSIGNED }));

      await service.create('company-1', 'creator-1', { ...createDto, assigneeId: 'tech-1' });

      expect(mockPrisma.workOrder.create.mock.calls[0][0].data.status).toBe(WorkOrderStatus.ASSIGNED);
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.WORK_ORDER_ASSIGNED, userId: 'tech-1' }),
      );
    });

    it('deve lançar NotFoundException quando unidade não pertence à empresa', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue(null);
      await expect(service.create('company-1', 'creator-1', createDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('deve aplicar transição válida: ASSIGNED → IN_PROGRESS', async () => {
      const wo = makeWO({ status: WorkOrderStatus.ASSIGNED });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      mockPrisma.workOrder.update.mockResolvedValue({ ...wo, status: WorkOrderStatus.IN_PROGRESS });

      await service.updateStatus('wo-1', 'company-1', 'user-tech', Role.TECNICO, {
        status: WorkOrderStatus.IN_PROGRESS,
      });

      expect(mockPrisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: WorkOrderStatus.IN_PROGRESS }) }),
      );
    });

    it('deve rejeitar transição inválida: COMPLETED → IN_PROGRESS', async () => {
      const wo = makeWO({ status: WorkOrderStatus.COMPLETED });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);

      await expect(
        service.updateStatus('wo-1', 'company-1', 'user-tech', Role.GESTOR, {
          status: WorkOrderStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar quando TECNICO tenta atualizar OS de outro técnico', async () => {
      const wo = makeWO({ assigneeId: 'outro-tecnico' });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);

      await expect(
        service.updateStatus('wo-1', 'company-1', 'meu-id', Role.TECNICO, {
          status: WorkOrderStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve definir startedAt quando transição para IN_PROGRESS', async () => {
      const wo = makeWO({ status: WorkOrderStatus.ASSIGNED, assigneeId: 'user-tech' });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      mockPrisma.workOrder.update.mockResolvedValue({ ...wo, status: WorkOrderStatus.IN_PROGRESS });

      await service.updateStatus('wo-1', 'company-1', 'user-tech', Role.TECNICO, {
        status: WorkOrderStatus.IN_PROGRESS,
      });

      const updateCall = mockPrisma.workOrder.update.mock.calls[0][0];
      expect(updateCall.data.startedAt).toBeInstanceOf(Date);
      expect(updateCall.data.completedAt).toBeFalsy(); // null quando não concluída
    });

    it('deve definir completedAt e notificar criador ao completar', async () => {
      const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, assigneeId: 'user-tech', creatorId: 'user-creator' });
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      mockPrisma.workOrder.update.mockResolvedValue({ ...wo, status: WorkOrderStatus.COMPLETED, assignee: { name: 'João' } });

      await service.updateStatus('wo-1', 'company-1', 'user-tech', Role.TECNICO, {
        status: WorkOrderStatus.COMPLETED,
      });

      const updateCall = mockPrisma.workOrder.update.mock.calls[0][0];
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-creator', type: NotificationType.SYSTEM }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar OS existente', async () => {
      const wo = makeWO();
      mockPrisma.workOrder.findFirst.mockResolvedValue(wo);
      const result = await service.findOne('wo-1', 'company-1');
      expect(result.id).toBe('wo-1');
    });

    it('deve lançar NotFoundException quando OS não existe', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(null);
      await expect(service.findOne('inexistente', 'company-1')).rejects.toThrow(NotFoundException);
    });

    it('deve respeitar isolamento multi-tenant — não encontra OS de outra empresa', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(null);
      await expect(service.findOne('wo-1', 'outra-empresa')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.workOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'outra-empresa' }) }),
      );
    });
  });
});
