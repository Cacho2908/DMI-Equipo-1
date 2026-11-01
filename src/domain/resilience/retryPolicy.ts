export type RetryInput = Readonly<{
  method: 'GET' | 'POST'; status: number | 'timeout'; attempt: number;
  retryAfterMs?: number | undefined; idempotencyKey?: string | undefined;
}>;
export type RetryLimits = Readonly<{ maxAttempts: number; baseDelayMs: number; maxDelayMs: number }>;
export const DEFAULT_RETRY_LIMITS: RetryLimits = { maxAttempts: 4, baseDelayMs: 400, maxDelayMs: 30000 };
export function validateRetryLimits(limits: RetryLimits): void {
  if (!Number.isInteger(limits.maxAttempts) || limits.maxAttempts < 1 || limits.maxAttempts > 4 ||
    !Number.isFinite(limits.baseDelayMs) || limits.baseDelayMs <= 0 ||
    !Number.isFinite(limits.maxDelayMs) || limits.maxDelayMs < limits.baseDelayMs || limits.maxDelayMs > 2147483647) {
    throw new Error('invalid_retry_limits');
  }
}
export function planRetry(input: RetryInput, limits: RetryLimits = DEFAULT_RETRY_LIMITS) {
  validateRetryLimits(limits);
  const requiresStableIdempotencyKey = input.method === 'POST' && !input.idempotencyKey?.trim();
  const stop = { retry: false, delayMs: 0, requiresStableIdempotencyKey };
  if (requiresStableIdempotencyKey || !Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt >= limits.maxAttempts) return stop;
  if (input.status !== 'timeout' && ![408, 429, 500, 502, 503, 504].includes(input.status)) return stop;
  const supplied = input.retryAfterMs;
  const valid = supplied !== undefined && Number.isFinite(supplied) && supplied >= 0;
  // Never shorten a provider's required wait to fit our budget: stop instead.
  if (valid && supplied > limits.maxDelayMs) return stop;
  const delayMs = Math.max(Math.min(limits.baseDelayMs * 2 ** (input.attempt - 1), limits.maxDelayMs), valid ? supplied : 0);
  return { retry: true, delayMs, requiresStableIdempotencyKey: false };
}
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const ms = Number(text) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (!/^[A-Za-z]{3},/.test(text)) return undefined;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
