/**
 * Testes de Isolamento Multi-Tenant
 *
 * Garantem que NENHUM serviço vaza dados entre empresas (tenants).
 * Estes testes simulam o cenário mais crítico de segurança: empresa A
 * tentando acessar dados da empresa B, direta ou indiretamente.
 *
 * Em um SaaS, vazamento de dados entre tenants é o pior bug possível —
 * pode causar violação de LGPD, perda de clientes e processo judicial.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WorkOrdersService } from '../../work-orders/work-orders.service';
import { AssetsService } from '../../assets/assets.service';
import { UnitsService } from '../../units/units.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PushService } from '../../push/push.service';
import { RedisService } from '../../redis/redis.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  workOrder: {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
  },
  unit: { findFirst: jest.fn() },
  user: { findFirst: jest.fn() },
  asset: {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest.fn().mockImplementation((_k: string, fn: () => Promise<unknown>) => fn()),
};

const mockNotifications = { create: jest.fn().mockResolvedValue({}) };
const mockPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
const mockUnits = { getUserUnitIds: jest.fn().mockResolvedValue([]) };

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COMPANY_A = 'company-aaa';
const COMPANY_B = 'company-bbb';

const WO_COMPANY_A = {
  id: 'wo-company-a',
  companyId: COMPANY_A,
  unitId: 'unit-a',
  code: 'OS-2026-AAA1',
  title: 'OS da Empresa A',
  status: 'OPEN',
  priority: 'MEDIUM',
  unit: { id: 'unit-a', name: 'Unidade A' },
  asset: null,
  creator: { id: 'user-a', name: 'Admin A', email: 'a@a.com' },
  assignee: null,
};

const ASSET_COMPANY_A = {
  id: 'asset-a',
  companyId: COMPANY_A,
  unitId: 'unit-a',
  name: 'Elevador A',
  qrCode: 'QR-COMPANY-A',
  status: 'ACTIVE',
  unit: { id: 'unit-a', name: 'Unidade A', address: 'Rua A' },
  checklists: [],
  workOrders: [],
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Multi-Tenant Isolation', () => {
  let workOrdersService: WorkOrdersService;
  let assetsService: AssetsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        AssetsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: PushService, useValue: mockPush },
        { provide: UnitsService, useValue: mockUnits },
      ],
    }).compile();

    workOrdersService = module.get<WorkOrdersService>(WorkOrdersService);
    assetsService = module.get<AssetsService>(AssetsService);
  });

  // ── WorkOrders ─────────────────────────────────────────────────────────────

  describe('WorkOrdersService — isolamento de tenant', () => {
    it('empresa B não consegue ver OS da empresa A por ID', async () => {
      // O Prisma retorna null porque filtra por companyId
      mockPrisma.workOrder.findFirst.mockResolvedValue(null);

      await expect(
        workOrdersService.findOne(WO_COMPANY_A.id, COMPANY_B),
      ).rejects.toThrow(NotFoundException);

      // Verifica que a query incluiu o companyId da empresa B (não A)
      expect(mockPrisma.workOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: WO_COMPANY_A.id, companyId: COMPANY_B }),
        }),
      );
    });

    it('empresa B não consegue criar OS em unidade da empresa A', async () => {
      // Unidade existe na empresa A mas não na empresa B
      mockPrisma.unit.findFirst.mockResolvedValue(null);

      await expect(
        workOrdersService.create(COMPANY_B, 'user-b', {
          title: 'OS Invasora',
          description: 'Tentativa de cross-tenant',
          unitId: 'unit-a', // unidade da empresa A
          priority: 'HIGH' as any,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.unit.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_B }) }),
      );
    });

    it('findAll sempre filtra por companyId do usuário autenticado', async () => {
      await workOrdersService.findAll(COMPANY_A, { page: 1, limit: 20, skip: 0 });

      const whereArg = mockPrisma.workOrder.findMany.mock.calls[0][0].where;
      expect(whereArg.companyId).toBe(COMPANY_A);
      expect(whereArg.companyId).not.toBe(COMPANY_B);
    });
  });

  // ── Assets ─────────────────────────────────────────────────────────────────

  describe('AssetsService — isolamento de tenant', () => {
    it('empresa B não consegue ver ativo da empresa A por ID', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        assetsService.findOne(ASSET_COMPANY_A.id, COMPANY_B),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: ASSET_COMPANY_A.id, companyId: COMPANY_B }),
        }),
      );
    });

    it('empresa B não consegue escanear QR Code da empresa A', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        assetsService.findByQRCode(ASSET_COMPANY_A.qrCode, COMPANY_B),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ qrCode: ASSET_COMPANY_A.qrCode, companyId: COMPANY_B }),
        }),
      );
    });

    it('TECNICO não vê ativos de unidades que não são suas', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(ASSET_COMPANY_A);
      // getUserUnitIds retorna [] — usuário não pertence a nenhuma unidade
      mockUnits.getUserUnitIds.mockResolvedValue([]);

      await expect(
        assetsService.findOne(ASSET_COMPANY_A.id, COMPANY_A, 'tecnico-sem-unidade', 'TECNICO'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TECNICO vê apenas ativos das suas unidades em findAll', async () => {
      mockUnits.getUserUnitIds.mockResolvedValue(['unit-tecnico-1', 'unit-tecnico-2']);

      await assetsService.findAll(COMPANY_A, { page: 1, limit: 20, skip: 0 }, 'user-tech', 'TECNICO');

      const whereArg = mockPrisma.asset.findMany.mock.calls[0][0].where;
      expect(whereArg.companyId).toBe(COMPANY_A);
      expect(whereArg.unitId).toEqual({ in: ['unit-tecnico-1', 'unit-tecnico-2'] });
    });

    it('ADMIN vê todos os ativos da sua empresa sem filtro de unidade', async () => {
      await assetsService.findAll(COMPANY_A, { page: 1, limit: 20, skip: 0 }, 'user-admin', 'ADMIN');

      const whereArg = mockPrisma.asset.findMany.mock.calls[0][0].where;
      expect(whereArg.companyId).toBe(COMPANY_A);
      expect(whereArg.unitId).toBeUndefined();
    });
  });

  // ── Invariantes críticas ───────────────────────────────────────────────────

  describe('Invariantes de segurança multi-tenant', () => {
    it('companyId nunca pode vir do body — sempre do token JWT', async () => {
      // O companyId nos services vem sempre do AuthenticatedUser (JWT validado),
      // nunca de um parâmetro body que o cliente pode manipular.
      // Este teste documenta a invariante: services recebem companyId como parâmetro
      // explícito que vem do controller, que o obtém de @CurrentUser().

      // Simular tentativa de uso de outro companyId via body (não é possível por design)
      // A assinatura dos services EXIGE companyId como parâmetro separado do DTO:
      // create(companyId: string, creatorId: string, dto: CreateWorkOrderDto)
      //        ^^^^^^^^^^^^^^^^ vem do JWT, não do DTO

      mockPrisma.unit.findFirst.mockResolvedValue(null);

      // Se COMPANY_B passar o companyId de COMPANY_A via parâmetro,
      // o NestJS guard já bloqueou antes — o companyId no service É o do JWT
      await expect(
        workOrdersService.create(COMPANY_A, 'user-b', {
          title: 'Teste',
          description: 'Desc',
          unitId: 'unit-b',
          priority: 'LOW' as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('workOrder.findFirst sempre passa companyId do tenant autenticado', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(null);

      await expect(workOrdersService.findOne('wo-qualquer', COMPANY_B)).rejects.toThrow(NotFoundException);

      expect(mockPrisma.workOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_B }),
        }),
      );
    });

    it('assign OS — técnico deve pertencer ao mesmo tenant que a OS', async () => {
      mockPrisma.workOrder.findFirst.mockResolvedValue(WO_COMPANY_A);
      // usuário não existe no tenant A (é do tenant B)
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        workOrdersService.assign(WO_COMPANY_A.id, COMPANY_A, 'tecnico-empresa-b'),
      ).rejects.toThrow(NotFoundException);

      // Verifica que a busca do usuário foi feita filtrando pelo companyId correto (A)
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_A }),
        }),
      );
    });
  });

  // ── NotificationsService ──────────────────────────────────────────────────

  describe('NotificationsService — companyId defensivo', () => {
    it('markAsRead filtra por userId E companyId', async () => {
      // Importação inline para evitar dependência circular nos mocks
      const { NotificationsService: NS } = await import('../../notifications/notifications.service');
      const { PrismaService: PS } = await import('../../prisma/prisma.service');

      const mockPrismaNotif = {
        notification: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({}),
          createMany: jest.fn().mockResolvedValue({}),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const mod = await Test.createTestingModule({
        providers: [NS, { provide: PS, useValue: mockPrismaNotif }],
      }).compile();

      const svc = mod.get<InstanceType<typeof NS>>(NS);
      await svc.markAsRead('notif-id', 'user-a', COMPANY_A);

      expect(mockPrismaNotif.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'notif-id', userId: 'user-a', companyId: COMPANY_A }),
        }),
      );
    });

    it('delete filtra por userId E companyId — empresa B não apaga notificação de A', async () => {
      const { NotificationsService: NS } = await import('../../notifications/notifications.service');
      const { PrismaService: PS } = await import('../../prisma/prisma.service');

      const mockPrismaNotif = {
        notification: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({}),
          createMany: jest.fn().mockResolvedValue({}),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const mod = await Test.createTestingModule({
        providers: [NS, { provide: PS, useValue: mockPrismaNotif }],
      }).compile();

      const svc = mod.get<InstanceType<typeof NS>>(NS);
      // Empresa B tenta apagar notificação que pertence à empresa A
      await svc.delete('notif-de-A', 'user-b', COMPANY_B);

      expect(mockPrismaNotif.notification.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_B }),
        }),
      );
    });
  });
});
