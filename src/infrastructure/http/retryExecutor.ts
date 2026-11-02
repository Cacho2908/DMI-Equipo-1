import { DEFAULT_RETRY_LIMITS, planRetry, validateRetryLimits, type RetryLimits } from '../../domain/resilience/retryPolicy';
export type AttemptMetric = Readonly<{
  attempt: number; status: number | 'timeout'; startedAtMs: number; durationMs: number; delayMs: number; retry: boolean;
}>;
export type RetryOptions = Readonly<{
  limits?: RetryLimits; timeoutMs?: number;
  now?: () => number; sleep?: (ms: number) => Promise<void>;
  onAttempt?: (metric: AttemptMetric) => void; shouldContinue?: () => boolean;
}>;
export async function executeWithRetry<T>(
  input: { method: 'GET' | 'POST'; idempotencyKey?: string | undefined },
  execute: () => Promise<{ status: number | 'timeout'; value: T; retryAfterMs?: number | undefined }>,
  options: RetryOptions = {},
): Promise<T> {
  const limits = options.limits ?? DEFAULT_RETRY_LIMITS;
  validateRetryLimits(limits);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt++) {
    if (options.shouldContinue && !options.shouldContinue()) throw new Error('retry_cancelled');
    const startedAtMs = now();
    const result = await execute();
    const plan = planRetry({ ...input, status: result.status, attempt, retryAfterMs: result.retryAfterMs }, limits);
    // Telemetry contains only allowlisted technical fields, never URL, token, body, actor or location.
    try { options.onAttempt?.({ attempt, status: result.status, startedAtMs, durationMs: Math.max(0, now() - startedAtMs), delayMs: plan.delayMs, retry: plan.retry }); } catch { /* Metrics cannot change delivery semantics. */ }
    if (!plan.retry) return result.value;
    await sleep(plan.delayMs);
  }
}
