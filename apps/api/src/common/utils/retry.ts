/**
 * Retry com exponential backoff e jitter.
 *
 * Padrão usado em sistemas distribuídos (AWS, GCP, Stripe) para lidar com
 * falhas transitórias em serviços externos (Supabase, Expo Push, SMTP, etc.)
 *
 * Sem retry: uma falha temporária de rede causa erro 500 para o usuário.
 * Sem jitter: múltiplas instâncias retentam ao mesmo tempo (thundering herd).
 * Sem max attempts: loop infinito em falhas persistentes.
 */

export interface RetryOptions {
  maxAttempts?: number;   // máximo de tentativas (default: 3)
  baseDelayMs?: number;   // delay inicial em ms (default: 200)
  maxDelayMs?: number;    // delay máximo em ms (default: 5000)
  factor?: number;        // multiplicador exponencial (default: 2)
  jitter?: boolean;       // adicionar aleatoriedade ao delay (default: true)
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export class RetryExhaustedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(
      `Esgotadas ${attempts} tentativas. Último erro: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    this.name = 'RetryExhaustedError';
  }
}

/**
 * Executa fn com retry automático.
 * @example
 * const result = await withRetry(() => fetch(url), { maxAttempts: 3 });
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    factor = 2,
    jitter = true,
    shouldRetry = isRetryableError,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw new RetryExhaustedError(attempt, error);
      }

      const exponentialDelay = Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs);
      const delay = jitter
        ? exponentialDelay * (0.5 + Math.random() * 0.5) // 50-100% do delay calculado
        : exponentialDelay;

      await sleep(delay);
    }
  }

  throw new RetryExhaustedError(maxAttempts, lastError);
}

/**
 * Verifica se o erro é transitório e vale tentar novamente.
 * Erros de validação, autenticação, 4xx nunca devem ser retentados.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Erros de rede e timeout são sempre retentáveis
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset')) {
      return true;
    }
    // Erros de validação nunca são retentáveis
    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('not found')) {
      return false;
    }
  }

  // Erros HTTP 5xx são retentáveis, 4xx não
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return status >= 500;
  }

  return true; // por padrão, tentar novamente
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Versão decorativa para métodos de classe.
 * @example
 * @Retryable({ maxAttempts: 3 })
 * async sendPush(payload: PushPayload) { ... }
 */
export function Retryable(options: RetryOptions = {}) {
  return function (
    _target: object,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = async function (...args: unknown[]) {
      return withRetry((attempt) => {
        if (attempt > 1) {
          // Log de retry — em produção isso vai para os logs estruturados
          console.warn(`[Retry] Tentativa ${attempt} para ${_propertyKey}`);
        }
        return originalMethod.apply(this, args);
      }, options);
    };
    return descriptor;
  };
}
