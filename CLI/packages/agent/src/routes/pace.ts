import { Router } from 'express';
import { loadAll, hasLivePlan, probeAvailability } from '../providers/_shared/registry.js';
import { getAppContext } from '../report/app-context.js';
import type { QuotaBar } from '../providers/_shared/types.js';
import { computePace } from '../report/pace-calculator.js';

const router = Router();

router.get('/', async (_req, res) => {
  const now = Date.now();
  const all = await loadAll();
  const ctx = getAppContext();
  const withPlan = all.filter((descriptor) => hasLivePlan(descriptor));
  const live: typeof withPlan = [];
  for (const d of withPlan) {
    if (await probeAvailability(d, ctx.hosts)) live.push(d);
  }
  const { fetchDriver } = ctx;

  const providers = await Promise.all(live.map(async (descriptor) => {
    try {
      const snapshot = await fetchDriver.fetch(descriptor, { force: false });
      const quota = pickPrimaryQuota(snapshot);
      if (!quota) {
        return {
          id: descriptor.id,
          displayName: descriptor.metadata.displayName,
          icon: descriptor.branding.icon,
          pace: null,
          quota: null,
        };
      }

      const resetsAt = toEpochMs(quota.resetsAt) ?? now;
      const periodWindowMs = inferPeriodWindowMs(resetsAt - now);
      const periodEnd = Math.max(resetsAt, now + 1);
      const periodStart = periodEnd - periodWindowMs;

      const pace = computePace({
        used: quota.used,
        limit: quota.cap,
        periodStart,
        periodEnd,
        now,
      });

      return {
        id: descriptor.id,
        displayName: descriptor.metadata.displayName,
        icon: descriptor.branding.icon,
        pace,
        quota: {
          used: quota.used,
          limit: quota.cap,
          unit: quota.unit,
          resetsAt,
        },
      };
    } catch (err) {
      return {
        id: descriptor.id,
        displayName: descriptor.metadata.displayName,
        icon: descriptor.branding.icon,
        pace: null,
        quota: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }));

  res.json({
    fetchedAt: now,
    providers,
  });
});

export default router;

function pickPrimaryQuota(snapshot: { weekly?: QuotaBar; session?: QuotaBar; secondary?: QuotaBar }): QuotaBar | null {
  return snapshot.weekly ?? snapshot.session ?? snapshot.secondary ?? null;
}

function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }
  return null;
}

function inferPeriodWindowMs(remainingMs: number): number {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  if (remainingMs <= 6 * HOUR) return 5 * HOUR;
  if (remainingMs <= 2 * DAY) return DAY;
  if (remainingMs <= 9 * DAY) return 7 * DAY;
  if (remainingMs <= 40 * DAY) return 30 * DAY;
  return 30 * DAY;
}
