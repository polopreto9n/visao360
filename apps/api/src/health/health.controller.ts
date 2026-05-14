import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';

type CheckStatus = 'ok' | 'error' | 'degraded';

interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: CheckStatus; latencyMs?: number; detail?: string }>;
  uptime: number;
  timestamp: string;
  version: string;
  environment: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — DB, Redis, uptime' })
  async check(): Promise<HealthResult> {
    const checks: HealthResult['checks'] = {};

    // Database check com latência
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = {
        status: 'error',
        latencyMs: Date.now() - dbStart,
        detail: process.env.NODE_ENV !== 'production' ? String(err) : 'unreachable',
      };
    }

    // Redis check com latência
    const redisStart = Date.now();
    try {
      if (this.redis.isUsingFallback()) {
        checks.redis = { status: 'degraded', detail: 'in-memory fallback active' };
      } else {
        await this.redis.get('__health__');
        checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
      }
    } catch (err) {
      checks.redis = {
        status: 'error',
        latencyMs: Date.now() - redisStart,
        detail: process.env.NODE_ENV !== 'production' ? String(err) : 'unreachable',
      };
    }

    const statuses = Object.values(checks).map((c) => c.status);
    const hasError = statuses.includes('error');
    const hasDegraded = statuses.includes('degraded');

    const overallStatus: HealthResult['status'] = hasError
      ? 'unhealthy'
      : hasDegraded
        ? 'degraded'
        : 'healthy';

    const result: HealthResult = {
      status: overallStatus,
      checks,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
    };

    // Retorna 503 se unhealthy — o Railway/Docker usa isso para saber se o pod está pronto
    if (overallStatus === 'unhealthy') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
