import { getAppContext } from './app-context.js';
import { loadAll, getById, hasLivePlan, probeAvailability } from '../providers/_shared/registry.js';
import { writeSnapshot, readLatestSnapshot } from './snapshot-writer.js';
import { writeAttributions } from './attribution-writer.js';
import type { ProviderId, QuotaBar, UsageSnapshot } from '../providers/_shared/types.js';
import { AllStrategiesFailedError } from '../providers/_shared/types.js';
import { flushActivityWindows } from './activity-writer.js';

const timers = new Map<ProviderId, NodeJS.Timeout>();

function pickPrimaryQuota(snapshot: UsageSnapshot): QuotaBar | null {
  return snapshot.weekly ?? snapshot.session ?? snapshot.secondary ?? null;
}

export async function startAttributionLoops(): Promise<void> {
  const ctx = getAppContext();
  const descriptors = await loadAll();
  for (const descriptor of descriptors) {
    if (!hasLivePlan(descriptor)) continue;
    const available = await probeAvailability(descriptor, ctx.hosts);
    if (!available) {
      ctx.hosts.logger.debug('skipping provider — no available strategies', {
        provider: descriptor.id,
      });
      continue;
    }
    const id = descriptor.id;
    if (timers.has(id)) continue;
    const intervalMs = descriptor.fetchPlan.sampleIntervalMs;
    const tick = async (): Promise<void> => {
      await attributionTick(id);
    };
    void tick();
    timers.set(id, setInterval(() => {
      void tick();
    }, intervalMs));
  }
}

export function stopAttributionLoops(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}

export async function attributionTick(id: ProviderId): Promise<void> {
  const ctx = getAppContext();
  const descriptor = await getById(id);
  if (!descriptor || !hasLivePlan(descriptor)) return;

  const prev = readLatestSnapshot(ctx.db, id);
  let snapshot: UsageSnapshot;
  try {
    snapshot = await ctx.fetchDriver.fetch(descriptor, { force: true });
  } catch (err) {
    if (err instanceof AllStrategiesFailedError && err.allUnavailable) {
      ctx.hosts.logger.debug('attribution fetch skipped — provider unavailable', {
        provider: id,
      });
    } else {
      ctx.hosts.logger.warn('attribution fetch failed', {
        provider: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const snapshotId = writeSnapshot(ctx.db, id, snapshot);
  if (!snapshotId || !prev) return;

  const primary = pickPrimaryQuota(snapshot);
  if (!primary) return;

  const delta = primary.used - prev.used;
  if (delta <= 0) return;

  flushActivityWindows(ctx.db, snapshot.updatedAt.getTime());
  writeAttributions(ctx.db, {
    provider: id,
    unit: primary.unit,
    delta,
    snapshotId,
    since: prev.fetchedAt,
    until: snapshot.updatedAt.getTime(),
  });
}
