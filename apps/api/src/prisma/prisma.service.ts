import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const SLOW_QUERY_THRESHOLD_MS = 500;

/**
 * Pool de conexões: Prisma usa 1 connection string e o próprio driver gerencia o pool.
 * Em produção com Railway, configuramos via DATABASE_URL com parâmetros de pool:
 *   ?connection_limit=20&pool_timeout=30&connect_timeout=10
 *
 * Sem configuração explícita, Prisma usa num_cpus * 2 + 1 connections.
 * Com múltiplas instâncias e Railway, isso pode esgotar o PgBouncer ou o pool do Postgres.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL ?? '';

    // Adiciona parâmetros de connection pool à URL se não presentes
    const urlWithPool = PrismaService.addPoolParams(dbUrl);

    super({
      datasources: { db: { url: urlWithPool } },
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'info' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'event', level: 'query' }, // eventos para slow query em prod
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
    });
  }

  private static addPoolParams(url: string): string {
    if (!url || url.includes('connection_limit')) return url;
    try {
      const parsed = new URL(url);
      // connection_limit: máximo de conexões por instância da API
      // pool_timeout: segundos esperando por conexão disponível antes de lançar erro
      // connect_timeout: segundos para estabelecer a conexão TCP inicial
      const poolLimit = process.env.DB_POOL_SIZE ?? '10';
      parsed.searchParams.set('connection_limit', poolLimit);
      parsed.searchParams.set('pool_timeout', '30');
      parsed.searchParams.set('connect_timeout', '10');
      return parsed.toString();
    } catch {
      return url;
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conectado ao PostgreSQL via Prisma');

    // statement_timeout: mata queries que demorem mais de 10s — protege contra
    // full table scans acidentais e queries travadas em produção.
    // Aplica globalmente para toda nova conexão do pool.
    try {
      await this.$executeRaw`SET statement_timeout = '10000'`; // 10 segundos em ms
      await this.$executeRaw`SET lock_timeout = '5000'`;        // 5 segundos para locks
      await this.$executeRaw`SET idle_in_transaction_session_timeout = '30000'`; // 30s idle
      this.logger.log('PostgreSQL timeouts configurados: query=10s, lock=5s, idle=30s');
    } catch (err) {
      this.logger.warn(`Não foi possível configurar timeouts: ${String(err)}`);
    }

    // Slow query logging — ativo em todos os ambientes
    // @ts-expect-error prisma event typing
    this.$on('query', (e: { query: string; params: string; duration: number }) => {
      if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
        this.logger.warn(
          `[SLOW QUERY] ${e.duration}ms${process.env.NODE_ENV !== 'production' ? `: ${e.query}` : ''}`,
        );
      }
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Desconectado do PostgreSQL');
  }

  async executeInTransaction<T>(
    fn: (
      tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn, {
      timeout: 10_000,   // transações abortam após 10s
      maxWait: 5_000,    // espera até 5s para adquirir lock
    });
  }
}
