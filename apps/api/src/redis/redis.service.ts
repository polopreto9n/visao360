import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService com fallback in-memory quando Redis não está disponível.
 * A API permanece a mesma — o cache funciona em ambos os casos.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private fallback = new Map<string, { value: string; expiresAt: number }>();
  private usingFallback = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const password = this.config.get<string>('REDIS_PASSWORD', '');

    try {
      this.client = new Redis(url, {
        password: password || undefined,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      await this.client.connect();
      await this.client.ping();
      this.logger.log('Conectado ao Redis');
    } catch {
      this.logger.warn('Redis indisponível — usando cache in-memory como fallback');
      this.client = null;
      this.usingFallback = true;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.client) {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }

    const entry = this.fallback.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.fallback.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.client) {
      await this.client.setex(key, ttlSeconds, serialized);
      return;
    }

    this.fallback.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    // Limpar entradas expiradas periodicamente (evitar memory leak)
    if (this.fallback.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.fallback.entries()) {
        if (now > v.expiresAt) this.fallback.delete(k);
      }
    }
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.fallback.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    if (this.client) {
      const keys = await this.client.keys(pattern);
      if (keys.length) await this.client.del(...keys);
      return;
    }
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.fallback.keys()) {
      if (regex.test(key)) this.fallback.delete(key);
    }
  }

  /** Cache com auto-populate: busca no cache ou executa fn e armazena o resultado */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlSeconds = 60): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  isUsingFallback(): boolean {
    return this.usingFallback;
  }
}
