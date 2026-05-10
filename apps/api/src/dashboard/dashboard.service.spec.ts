import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-test-1';

const mockPrisma = {
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
  incident: {
    count: jest.fn().mockResolvedValue(1),
  },
};

// Redis mock que sempre retorna null (sem cache, força computação)
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
};

let service: DashboardService;

beforeEach(async () => {
  jest.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DashboardService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RedisService, useValue: mockRedis },
    ],
  }).compile();

  service = module.get<DashboardService>(DashboardService);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  describe('getKPIs', () => {
    it('deve retornar estrutura completa de KPIs', async () => {
      const result = await service.getKPIs(COMPANY_ID);

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
        `dashboard:kpis:${COMPANY_ID}`,
        expect.any(Function),
        30,
      );
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
});
