import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';
import { ExecutionsService } from './executions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChecklistSchedulesService } from '../checklist-schedules/checklist-schedules.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockTx = {
  executionItem: { upsert: jest.fn().mockResolvedValue({}) },
  execution: { update: jest.fn() },
};

const mockPrisma = {
  checklist: { findFirst: jest.fn() },
  asset: { findFirst: jest.fn() },
  execution: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  executionItem: { upsert: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
};

const mockSchedules = {
  advanceAfterExecution: jest.fn().mockResolvedValue(undefined),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CHECKLIST = {
  id: 'cl-1',
  name: 'Inspeção Mensal',
  isActive: true,
  items: [{ id: 'item-1' }, { id: 'item-2' }],
};

const makeExecution = (overrides = {}) => ({
  id: 'exec-1',
  companyId: 'company-1',
  checklistId: 'cl-1',
  userId: 'user-tech',
  assetId: null,
  status: ExecutionStatus.IN_PROGRESS,
  startedAt: new Date(),
  completedAt: null,
  score: null,
  checklist: { id: 'cl-1', name: 'Inspeção', items: [{ id: 'item-1', order: 1 }, { id: 'item-2', order: 2 }] },
  items: [],
  user: { id: 'user-tech', name: 'Tech', email: 'tech@test.com' },
  asset: null,
  ...overrides,
});

const SUBMIT_DTO = {
  items: [
    { checklistItemId: 'item-1', answer: true, notes: 'ok' },
    { checklistItemId: 'item-2', answer: false, notes: 'falhou' },
  ],
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ExecutionsService', () => {
  let service: ExecutionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChecklistSchedulesService, useValue: mockSchedules },
      ],
    }).compile();

    service = module.get<ExecutionsService>(ExecutionsService);
  });

  // ── start ──────────────────────────────────────────────────────────────────

  describe('start', () => {
    it('cria execução com status IN_PROGRESS', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(CHECKLIST);
      mockPrisma.execution.create.mockResolvedValue(makeExecution());

      await service.start('company-1', 'user-tech', { checklistId: 'cl-1' });

      expect(mockPrisma.execution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ExecutionStatus.IN_PROGRESS }),
        }),
      );
    });

    it('lança NotFoundException se checklist não existe', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(null);
      await expect(service.start('company-1', 'user-tech', { checklistId: 'cl-1' })).rejects.toThrow(NotFoundException);
    });

    it('lança BadRequestException se checklist não tem itens', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue({ ...CHECKLIST, items: [] });
      await expect(service.start('company-1', 'user-tech', { checklistId: 'cl-1' })).rejects.toThrow(BadRequestException);
    });

    it('valida assetId quando fornecido', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(CHECKLIST);
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.start('company-1', 'user-tech', { checklistId: 'cl-1', assetId: 'asset-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── complete ───────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('completa execução dentro de $transaction (atomicidade)', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockTx.execution.update.mockResolvedValue(makeExecution({ status: ExecutionStatus.COMPLETED, score: 50 }));

      await service.complete('exec-1', 'company-1', 'user-tech', SUBMIT_DTO);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockTx.executionItem.upsert).toHaveBeenCalledTimes(2);
    });

    it('calcula score corretamente: 1 de 2 itens OK = 50%', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockTx.execution.update.mockResolvedValue(makeExecution({ score: 50 }));

      await service.complete('exec-1', 'company-1', 'user-tech', SUBMIT_DTO);

      const updateCall = mockTx.execution.update.mock.calls[0][0];
      expect(updateCall.data.score).toBe(50);
    });

    it('score 100% quando todos os itens são OK', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockTx.execution.update.mockResolvedValue(makeExecution({ score: 100 }));
      const allOk = {
        items: [
          { checklistItemId: 'item-1', answer: true },
          { checklistItemId: 'item-2', answer: true },
        ],
      };

      await service.complete('exec-1', 'company-1', 'user-tech', allOk);

      const updateCall = mockTx.execution.update.mock.calls[0][0];
      expect(updateCall.data.score).toBe(100);
    });

    it('score 0% quando nenhum item é OK', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockTx.execution.update.mockResolvedValue(makeExecution({ score: 0 }));
      const allFail = {
        items: [
          { checklistItemId: 'item-1', answer: false },
          { checklistItemId: 'item-2', answer: false },
        ],
      };

      await service.complete('exec-1', 'company-1', 'user-tech', allFail);

      const updateCall = mockTx.execution.update.mock.calls[0][0];
      expect(updateCall.data.score).toBe(0);
    });

    it('lança BadRequestException se execução já foi concluída', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(
        makeExecution({ status: ExecutionStatus.COMPLETED }),
      );

      await expect(service.complete('exec-1', 'company-1', 'user-tech', SUBMIT_DTO)).rejects.toThrow(BadRequestException);
    });

    it('lança ForbiddenException se técnico diferente tentar concluir', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution({ userId: 'outro-tecnico' }));

      await expect(
        service.complete('exec-1', 'company-1', 'meu-user', SUBMIT_DTO),
      ).rejects.toThrow(ForbiddenException);
    });

    it('avança agenda após conclusão (fora da transação)', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockTx.execution.update.mockResolvedValue(makeExecution({ status: ExecutionStatus.COMPLETED }));

      await service.complete('exec-1', 'company-1', 'user-tech', SUBMIT_DTO);

      // Aguarda promise fire-and-forget
      await new Promise((r) => setTimeout(r, 0));
      expect(mockSchedules.advanceAfterExecution).toHaveBeenCalledWith('cl-1', null, 'company-1');
    });

    it('não falha se advanceAfterExecution lançar erro', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockTx.execution.update.mockResolvedValue(makeExecution({ status: ExecutionStatus.COMPLETED }));
      mockSchedules.advanceAfterExecution.mockRejectedValue(new Error('schedule error'));

      // Não deve propagar o erro
      await expect(
        service.complete('exec-1', 'company-1', 'user-tech', SUBMIT_DTO),
      ).resolves.toBeDefined();
    });

    it('isolamento multi-tenant: não encontra execução de outra empresa', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(null);

      await expect(
        service.complete('exec-1', 'empresa-errada', 'user-tech', SUBMIT_DTO),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.execution.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'empresa-errada' }) }),
      );
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancela execução em andamento', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution());
      mockPrisma.execution.update.mockResolvedValue(makeExecution({ status: ExecutionStatus.CANCELLED }));

      await service.cancel('exec-1', 'company-1', 'user-tech');

      expect(mockPrisma.execution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: ExecutionStatus.CANCELLED } }),
      );
    });

    it('lança BadRequestException ao cancelar execução já concluída', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(
        makeExecution({ status: ExecutionStatus.COMPLETED }),
      );

      await expect(service.cancel('exec-1', 'company-1', 'user-tech')).rejects.toThrow(BadRequestException);
    });

    it('lança ForbiddenException ao cancelar execução de outro técnico', async () => {
      mockPrisma.execution.findFirst.mockResolvedValue(makeExecution({ userId: 'outro' }));

      await expect(service.cancel('exec-1', 'company-1', 'meu-user')).rejects.toThrow(ForbiddenException);
    });
  });
});
