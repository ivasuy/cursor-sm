import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';
import { summarizeByRepo, summarizeByWorktree, summarizeByFile } from '../report/report-service.js';
import { loadAll, hasLivePlan, probeAvailability } from '../providers/_shared/registry.js';
import { computePace } from '../report/pace-calculator.js';
import type { QuotaBar } from '../providers/_shared/types.js';

const router = Router();

router.get('/', async (req, res) => {
  const { db, fetchDriver } = getAppContext();
  const now = Date.now();
  const range = parseRange(typeof req.query.period === 'string' ? req.query.period : undefined, now);

  const repos = summarizeByRepo(db, range);
  const worktrees = summarizeByWorktree(db, range);
  const files = summarizeByFile(db, { ...range, limit: 20 });
  const features = worktrees
    .filter((row) => row.branch !== null)
    .filter((row) => {
      const branch = row.branch?.toLowerCase();
      return branch !== 'main' && branch !== 'master' && branch !== 'head';
    })
    .map((row) => ({
      branch: row.branch ?? 'HEAD',
      worktreeId: row.worktreeId,
      repoId: row.repoId,
      path: row.path,
      perProvider: row.perProvider,
    }));

  const { hosts } = getAppContext();
  const withPlan = (await loadAll()).filter((descriptor) => hasLivePlan(descriptor));
  const descriptors: typeof withPlan = [];
  for (const d of withPlan) {
    if (await probeAvailability(d, hosts)) descriptors.push(d);
  }
  const providerRows = await Promise.all(descriptors.map(async (descriptor) => {
    try {
      const snapshot = await fetchDriver.fetch(descriptor, { force: false });
      return {
        descriptor,
        snapshot,
        status: 'live' as const,
      };
    } catch (err) {
      return {
        descriptor,
        snapshot: null,
        status: 'error' as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }));

  const pace = providerRows.map((provider) => {
    const quota = pickPrimaryQuota(provider.snapshot ?? undefined);
    if (!quota) {
      return {
        id: provider.descriptor.id,
        displayName: provider.descriptor.metadata.displayName,
        icon: provider.descriptor.branding.icon,
        pace: null,
        quota: null,
        error: provider.status === 'error' ? provider.error : undefined,
      };
    }

    const resetsAt = toEpochMs(quota.resetsAt) ?? now;
    const periodWindowMs = inferPeriodWindowMs(resetsAt - now);
    const periodEnd = Math.max(resetsAt, now + 1);
    const periodStart = periodEnd - periodWindowMs;
    const paceResult = computePace({
      used: quota.used,
      limit: quota.cap,
      periodStart,
      periodEnd,
      now,
    });

    return {
      id: provider.descriptor.id,
      displayName: provider.descriptor.metadata.displayName,
      icon: provider.descriptor.branding.icon,
      pace: paceResult,
      quota: {
        used: quota.used,
        limit: quota.cap,
        unit: quota.unit,
        resetsAt,
      },
    };
  });

  res.json({
    fetchedAt: now,
    range,
    providers: providerRows,
    repos,
    worktrees,
    features,
    files,
    pace,
  });
});

export default router;

function parseRange(period: string | undefined, now: number): { since: number; until: number } {
  const day = 24 * 60 * 60 * 1000;
  if (period === 'all') return { since: 0, until: now };
  if (period === '30d') return { since: now - (30 * day), until: now };
  return { since: now - (7 * day), until: now };
}

function pickPrimaryQuota(snapshot: { weekly?: QuotaBar; session?: QuotaBar; secondary?: QuotaBar } | undefined): QuotaBar | null {
  if (!snapshot) return null;
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
