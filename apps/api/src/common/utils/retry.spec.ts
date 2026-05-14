import { withRetry, RetryExhaustedError } from './retry';

// Sem fake timers — usar delays mínimos reais (1ms) para velocidade de teste
describe('withRetry', () => {
  it('retorna resultado imediatamente na 1ª tentativa bem-sucedida', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tenta novamente após falha transitória e retorna resultado', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { baseDelayMs: 1, jitter: false });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('lança RetryExhaustedError após esgotar tentativas', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent error'));

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, jitter: false }),
    ).rejects.toThrow(RetryExhaustedError);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('não retenta se shouldRetry retornar false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('validation error'));

    await expect(
      withRetry(fn, { shouldRetry: () => false, baseDelayMs: 1 }),
    ).rejects.toThrow(RetryExhaustedError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respeita maxAttempts personalizado', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('err'));

    await expect(
      withRetry(fn, { maxAttempts: 5, baseDelayMs: 1, jitter: false }),
    ).rejects.toThrow(RetryExhaustedError);

    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('RetryExhaustedError inclui número de tentativas e último erro', async () => {
    const lastError = new Error('last error');
    const fn = jest.fn().mockRejectedValue(lastError);

    try {
      await withRetry(fn, { maxAttempts: 2, baseDelayMs: 1, jitter: false });
      fail('deveria ter lançado RetryExhaustedError');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      const retryErr = err as RetryExhaustedError;
      expect(retryErr.attempts).toBe(2);
      expect(retryErr.lastError).toBe(lastError);
      expect(retryErr.message).toContain('last error');
    }
  });

  it('passa número da tentativa como argumento para fn', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('err'));

    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 }).catch(() => {});

    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    expect(fn).toHaveBeenNthCalledWith(3, 3);
  });

  it('não retenta erros HTTP 4xx (erros de cliente)', async () => {
    const err = new Error('Not Found') as Error & { status: number };
    err.status = 404;
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { baseDelayMs: 1 }),
    ).rejects.toThrow(RetryExhaustedError);

    expect(fn).toHaveBeenCalledTimes(1); // sem retry para 4xx
  });
});
