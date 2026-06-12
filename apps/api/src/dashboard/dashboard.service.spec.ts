import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UnitsService } from '../units/units.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-test-1';

const mockPrisma = {
  unit: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  asset: {
    count: jest.fn().mockResolvedValue(10),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([
      { status: 'ACTIVE', _count: { id: 8 } },
      { status: 'MAINTENANCE', _count: { id: 2 } },
    ]),
  },
  workOrder: {
    count: jest.fn().mockResolvedValue(3),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  execution: {
    count: jest.fn().mockResolvedValue(5),
    findMany: jest.fn().mockResolvedValue([]),
  },
  checklistSchedule: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  incident: {
    count: jest.fn().mockResolvedValue(1),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
};

// Redis mock que sempre retorna null (sem cache, força computação)
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
};

const mockUnits = {
  getUserUnitIds: jest.fn().mockResolvedValue([]),
};

let service: DashboardService;

beforeEach(async () => {
  jest.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DashboardService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RedisService, useValue: mockRedis },
      { provide: UnitsService, useValue: mockUnits },
    ],
  }).compile();

  service = module.get<DashboardService>(DashboardService);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  describe('getKPIs', () => {
    it('deve retornar estrutura completa de KPIs', async () => {
      const result = await service.getKPIs(COMPANY_ID);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('charts');
      expect(result).toHaveProperty('recentActivity');
      expect(result).toHaveProperty('alerts');
    });

    it('deve incluir totalAssets no summary', async () => {
      const result = await service.getKPIs(COMPANY_ID);
      expect(typeof result.summary.totalAssets).toBe('number');
      expect(typeof result.summary.activeAssets).toBe('number');
      expect(typeof result.summary.openWorkOrders).toBe('number');
    });

    it('deve calcular checklistCompletionRate corretamente', async () => {
      // 5 checklists no mês, 4 concluídos = 80%
      mockPrisma.execution.count
        .mockResolvedValueOnce(5)  // checklistsThisMonth
        .mockResolvedValueOnce(4); // completedExecutions

      const result = await service.getKPIs(COMPANY_ID);
      expect(result.summary.checklistCompletionRate).toBe(80);
    });

    it('deve retornar 0% quando não há checklists no mês', async () => {
      mockPrisma.execution.count.mockResolvedValue(0);

      const result = await service.getKPIs(COMPANY_ID);
      expect(result.summary.checklistCompletionRate).toBe(0);
    });

    it('deve usar cache Redis — chama getOrSet com TTL de 30s', async () => {
      await service.getKPIs(COMPANY_ID);

      expect(mockRedis.getOrSet).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^dashboard:kpis:${COMPANY_ID}:all:month:auto:auto:\\d+:\\d+$`),
        ),
        expect.any(Function),
        30,
      );
    });

    it('deve aplicar o período recebido nas consultas do dashboard', async () => {
      const result = await service.getKPIs(COMPANY_ID, undefined, undefined, {
        period: 'custom',
        startDate: '2026-05-01',
        endDate: '2026-05-21',
      });

      expect(mockPrisma.workOrder.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            createdAt: {
              gte: new Date(result.period.from),
              lte: new Date(result.period.to),
            },
          }),
        }),
      );
      expect(mockRedis.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining('custom:2026-05-01:2026-05-21:'),
        expect.any(Function),
        30,
      );
    });

    it('deve exigir datas no período personalizado', async () => {
      await expect(
        service.getKPIs(COMPANY_ID, undefined, undefined, { period: 'custom' }),
      ).rejects.toThrow('Informe a data inicial e a data final do periodo personalizado.');
    });

    it('deve rejeitar período personalizado com data inicial depois da final', async () => {
      await expect(
        service.getKPIs(COMPANY_ID, undefined, undefined, {
          period: 'custom',
          startDate: '2026-05-21',
          endDate: '2026-05-01',
        }),
      ).rejects.toThrow('A data inicial deve ser anterior à data final.');
    });

    it('deve escopar consultas e cache quando condomínio for informado', async () => {
      await service.getKPIs(COMPANY_ID, undefined, undefined, { unitId: 'unit-1' });

      expect(mockPrisma.asset.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            unitId: { in: ['unit-1'] },
          }),
        }),
      );
      expect(mockRedis.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining(`dashboard:kpis:${COMPANY_ID}:unit-1:`),
        expect.any(Function),
        30,
      );
    });

    it('deve separar cache global e cache por condomínio', async () => {
      await service.getKPIs(COMPANY_ID);
      await service.getKPIs(COMPANY_ID, undefined, undefined, { unitId: 'unit-1' });

      expect(mockRedis.getOrSet).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          new RegExp(`^dashboard:kpis:${COMPANY_ID}:all:month:auto:auto:\\d+:\\d+$`),
        ),
        expect.any(Function),
        30,
      );
      expect(mockRedis.getOrSet).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          new RegExp(`^dashboard:kpis:${COMPANY_ID}:unit-1:month:auto:auto:\\d+:\\d+$`),
        ),
        expect.any(Function),
        30,
      );
    });

    it('deve separar cache por preset temporal', async () => {
      await service.getKPIs(COMPANY_ID, undefined, undefined, { period: '30d' });
      await service.getKPIs(COMPANY_ID, undefined, undefined, {
        period: 'custom',
        startDate: '2026-05-01',
        endDate: '2026-05-21',
      });

      expect(mockRedis.getOrSet).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(`dashboard:kpis:${COMPANY_ID}:all:30d:auto:auto:`),
        expect.any(Function),
        30,
      );
      expect(mockRedis.getOrSet).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          `dashboard:kpis:${COMPANY_ID}:all:custom:2026-05-01:2026-05-21:`,
        ),
        expect.any(Function),
        30,
      );
    });

    it('deve escopar execuções filtradas por checklist ou equipamento do condomínio', async () => {
      await service.getKPIs(COMPANY_ID, undefined, undefined, { unitId: 'unit-1' });

      expect(mockPrisma.execution.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            OR: expect.arrayContaining([
              { checklist: { unitId: { in: ['unit-1'] } } },
              { asset: { unitId: { in: ['unit-1'] } } },
            ]),
          }),
        }),
      );
    });

    it('deve escopar dashboard de gestor aos condominios atribuidos', async () => {
      mockUnits.getUserUnitIds.mockResolvedValueOnce(['unit-gestor']);

      await service.getKPIs(COMPANY_ID, 'gestor-1', 'GESTOR');

      expect(mockPrisma.asset.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            unitId: { in: ['unit-gestor'] },
          }),
        }),
      );
      expect(mockRedis.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining(`dashboard:kpis:${COMPANY_ID}:gestor-1:all:`),
        expect.any(Function),
        30,
      );
    });

    it('deve devolver dashboard vazio se gestor adulterar unitId fora da carteira', async () => {
      mockUnits.getUserUnitIds.mockResolvedValueOnce(['unit-gestor']);

      const result = await service.getKPIs(COMPANY_ID, 'gestor-1', 'GESTOR', {
        unitId: 'unit-fora-da-carteira',
      });

      expect(result.summary.totalAssets).toBe(0);
      expect(result.recentActivity.executions).toEqual([]);
      expect(mockPrisma.asset.count).not.toHaveBeenCalled();
    });

    it('deve passar companyId em todas as queries (multi-tenant)', async () => {
      await service.getKPIs(COMPANY_ID);

      const assetCalls = mockPrisma.asset.count.mock.calls;
      assetCalls.forEach((call: [{ where: { companyId: string } }]) => {
        expect(call[0].where.companyId).toBe(COMPANY_ID);
      });
    });

    it('deve retornar charts com assets por status', async () => {
      const result = await service.getKPIs(COMPANY_ID);

      expect(result.charts.assetsByStatus).toBeInstanceOf(Array);
      expect(result.charts.assetsByStatus[0]).toHaveProperty('status');
      expect(result.charts.assetsByStatus[0]).toHaveProperty('count');
    });

    it('deve marcar assets com manutenção vencida como isOverdue', async () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 dias atrás
      mockPrisma.asset.findMany.mockResolvedValue([
        { id: 'a1', name: 'Elevador', nextMaintenanceAt: pastDate, unit: { name: 'Torre A' } },
      ]);

      const result = await service.getKPIs(COMPANY_ID);
      const overdueAssets = result.alerts.assetsNeedingMaintenance.filter((a: { isOverdue: boolean }) => a.isOverdue);
      expect(overdueAssets.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getMyActions', () => {
    it('deve aplicar unitId nas próximas ações do dashboard', async () => {
      mockUnits.getUserUnitIds
        .mockResolvedValueOnce(['unit-gestor'])
        .mockResolvedValueOnce(['unit-gestor']);

      await service.getMyActions('gestor-1', COMPANY_ID, 'GESTOR', {
        unitId: 'unit-gestor',
      });

      expect(mockPrisma.checklistSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            AND: expect.arrayContaining([
              {
                OR: [
                  { checklist: { unitId: { in: ['unit-gestor'] } } },
                  { asset: { unitId: { in: ['unit-gestor'] } } },
                ],
              },
            ]),
          }),
        }),
      );
      expect(mockPrisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            AND: expect.arrayContaining([{ unitId: { in: ['unit-gestor'] } }]),
          }),
        }),
      );
    });
  });

  describe('getUnitRanking', () => {
    it('deve ordenar melhores e piores condomínios pelo score do período', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockPrisma.unit.findMany.mockResolvedValueOnce([
        { id: 'unit-good', name: 'Jardim', code: 'JAR' },
        { id: 'unit-bad', name: 'Village', code: 'VIL' },
      ]);
      mockPrisma.asset.groupBy.mockResolvedValueOnce([
        { unitId: 'unit-good', _count: { id: 20 } },
        { unitId: 'unit-bad', _count: { id: 20 } },
      ]);
      mockPrisma.asset.findMany.mockResolvedValueOnce([
        { unitId: 'unit-good', nextMaintenanceAt: futureDate },
        { unitId: 'unit-bad', nextMaintenanceAt: pastDate },
      ]);
      mockPrisma.execution.findMany.mockResolvedValueOnce([
        ...Array.from({ length: 5 }, () => ({
          status: 'COMPLETED',
          completedAt: new Date('2026-05-10T12:00:00.000Z'),
          checklist: { unitId: 'unit-good' },
          asset: null,
        })),
        ...Array.from({ length: 3 }, () => ({
          status: 'IN_PROGRESS',
          completedAt: null,
          checklist: { unitId: 'unit-bad' },
          asset: null,
        })),
        ...Array.from({ length: 2 }, () => ({
          status: 'COMPLETED',
          completedAt: new Date('2026-05-10T12:00:00.000Z'),
          checklist: { unitId: 'unit-bad' },
          asset: null,
        })),
      ]);
      mockPrisma.workOrder.findMany
        .mockResolvedValueOnce([
          ...Array.from({ length: 3 }, () => ({
            unitId: 'unit-good',
            status: 'OPEN',
            dueDate: futureDate,
          })),
          ...Array.from({ length: 3 }, () => ({
            unitId: 'unit-bad',
            status: 'OPEN',
            dueDate: pastDate,
          })),
        ])
        .mockResolvedValueOnce([
          {
            unitId: 'unit-good',
            completedAt: pastDate,
            dueDate: futureDate,
          },
          {
            unitId: 'unit-bad',
            completedAt: futureDate,
            dueDate: pastDate,
          },
        ]);
      mockPrisma.incident.findMany.mockResolvedValueOnce([
        { unitId: 'unit-bad', severity: 'CRITICAL' },
      ]);

      const result = await service.getUnitRanking(COMPANY_ID, {
        period: 'custom',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      });

      expect(result.best[0].name).toBe('Jardim');
      expect(result.worst[0].name).toBe('Village');
      expect(result.best[0].score).toBeGreaterThan(result.worst[0].score);
      expect(result.worst[0].indicators.overdueWorkOrders).toBe(3);
    });
  });
});
