import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { withRetry } from '../common/utils/retry';

const TOKEN_TTL = 365 * 24 * 60 * 60; // 1 ano
const MAX_TOKENS_PER_USER = 5;

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expoEndpoint = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly redis: RedisService) {}

  private tokenKey(userId: string) {
    return `push:tokens:${userId}`;
  }

  /** Salva ou atualiza o push token de um device no Redis */
  async registerToken(userId: string, _companyId: string, token: string, platform: string) {
    const key = this.tokenKey(userId);
    const existing = (await this.redis.get<string[]>(key)) ?? [];

    // Adiciona se não existe ainda
    if (!existing.includes(token)) {
      const updated = [...existing, token].slice(-MAX_TOKENS_PER_USER);
      await this.redis.set(key, updated, TOKEN_TTL);
      this.logger.log(`Token push registrado para ${userId} (${platform})`);
    }
    return { registered: true };
  }

  /** Remove um token (logout do device) */
  async removeToken(userId: string, token: string) {
    const key = this.tokenKey(userId);
    const existing = (await this.redis.get<string[]>(key)) ?? [];
    await this.redis.set(key, existing.filter((t) => t !== token), TOKEN_TTL);
    return { removed: true };
  }

  /** Envia push para um usuário específico */
  async sendToUser(userId: string, _companyId: string, payload: PushPayload) {
    const tokens = (await this.redis.get<string[]>(this.tokenKey(userId))) ?? [];
    if (tokens.length > 0) await this.sendToTokens(tokens, payload);
  }

  /** Envia push para múltiplos usuários */
  async sendToUsers(userIds: string[], _companyId: string, payload: PushPayload) {
    const allTokens: string[] = [];
    for (const id of userIds) {
      const tokens = (await this.redis.get<string[]>(this.tokenKey(id))) ?? [];
      allTokens.push(...tokens);
    }
    if (allTokens.length > 0) await this.sendToTokens(allTokens, payload);
  }

  private async sendToTokens(tokens: string[], payload: PushPayload) {
    // Filtra tokens Expo válidos
    const expoTokens = tokens.filter((t) => t.startsWith('ExponentPushToken['));

    if (expoTokens.length === 0) return;

    // Envia em lotes de 100 (limite da API Expo)
    for (let i = 0; i < expoTokens.length; i += 100) {
      const batch = expoTokens.slice(i, i + 100);
      const messages = batch.map((token) => ({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: payload.sound ?? 'default',
        badge: payload.badge,
        channelId: 'visao360',
      }));

      try {
        await withRetry(
          async () => {
            const res = await fetch(this.expoEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(messages),
            });
            if (!res.ok) {
              const err = new Error(`Expo Push HTTP ${res.status}`);
              (err as Error & { status: number }).status = res.status;
              throw err;
            }
          },
          { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000 },
        );
        this.logger.log(`Push enviado para ${batch.length} devices`);
      } catch (err) {
        this.logger.error(`Expo Push falhou após 3 tentativas: ${String(err)}`);
      }
    }
  }
}
