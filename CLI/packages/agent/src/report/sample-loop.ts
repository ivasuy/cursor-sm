import { getAppContext } from './app-context.js';
import { writeSample } from './sample-writer.js';
import { PROVIDER_SAMPLE_INTERVAL_MS } from './constants.js';

let timer: NodeJS.Timeout | null = null;

export function startSampling(): void {
  if (timer) return;

  const tick = async (): Promise<void> => {
    try {
      const ctx = getAppContext();
      const detected = await ctx.hosts.processSampler.sample();
      const sampledAt = Date.now();
      for (const proc of detected) {
        writeSample(ctx.db, {
          pid: proc.pid,
          provider: proc.provider,
          command: proc.command,
          cwd: proc.cwd,
          sampledAt,
        });
      }
    } catch (err) {
      const ctx = getAppContext();
      ctx.hosts.logger.warn('sample tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  timer = setInterval(() => {
    void tick();
  }, PROVIDER_SAMPLE_INTERVAL_MS);
  void tick();
}

export function stopSampling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
