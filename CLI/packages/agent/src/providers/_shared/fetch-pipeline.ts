import type {
  ProviderDescriptor,
  FetchContext,
  ProviderFetchOutcome,
  FetchAttempt,
} from './types.js';
import { AllStrategiesFailedError, TimeoutError } from './types.js';

export async function runPipeline(
  descriptor: ProviderDescriptor,
  ctx: FetchContext,
): Promise<ProviderFetchOutcome> {
  const attempts: FetchAttempt[] = [];

  for (const strategy of descriptor.fetchPlan.pipeline.resolveStrategies(ctx)) {
    const available = await strategy.isAvailable(ctx);
    if (!available) {
      attempts.push({ id: strategy.id, status: 'unavailable' });
      continue;
    }
    try {
      const snapshot = await withTimeout(strategy.fetch(ctx), ctx.timeout);
      attempts.push({ id: strategy.id, status: 'ok' });
      return { snapshot, attempts, sourceLabel: strategy.kind };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      attempts.push({ id: strategy.id, status: 'error', error });
      if (!strategy.shouldFallback(error, ctx)) throw error;
    }
  }
  throw new AllStrategiesFailedError(descriptor.id, attempts);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
