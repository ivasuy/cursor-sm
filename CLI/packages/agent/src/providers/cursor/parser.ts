import type { UsageSnapshot } from '../_shared/types.js';

// ---------------------------------------------------------------------------
// Usage-summary API  (cursor.com/api/usage-summary)
// ---------------------------------------------------------------------------
interface UsageSummaryPlan {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
  breakdown?: { included: number; bonus: number; total: number };
  autoPercentUsed?: number;   // Auto + Composer %
  apiPercentUsed?: number;    // API (named models) %
  totalPercentUsed?: number;  // Combined %
}

interface UsageSummaryOnDemand {
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

interface UsageSummaryResponse {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  limitType?: string;
  isUnlimited?: boolean;
  autoModelSelectedDisplayMessage?: string;
  namedModelSelectedDisplayMessage?: string;
  individualUsage?: {
    plan?: UsageSummaryPlan;
    onDemand?: UsageSummaryOnDemand;
  };
}

export function parseUsageSummary(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as UsageSummaryResponse;
  const plan = r.individualUsage?.plan;
  const onDemand = r.individualUsage?.onDemand;

  const billingEnd = r.billingCycleEnd ? new Date(r.billingCycleEnd) : new Date(Date.now() + 30 * 86400_000);

  // Primary: total included usage (fast + API combined) as a percentage
  const totalPct = plan?.totalPercentUsed ?? 0;
  const autoPct = plan?.autoPercentUsed ?? 0;
  const apiPct = plan?.apiPercentUsed ?? 0;

  // weekly = total included usage bar
  const weekly = plan ? {
    used: Math.round(totalPct * 10) / 10,
    cap: 100,
    unit: 'requests' as const,
    resetsAt: billingEnd,
    label: 'total usage',
  } : undefined;

  // session = Auto+Composer usage (the 6% figure)
  const session = plan ? {
    used: Math.round(autoPct * 10) / 10,
    cap: 100,
    unit: 'requests' as const,
    resetsAt: billingEnd,
    label: 'auto + composer',
  } : undefined;

  // secondary = API (named model) usage (the 63% figure)
  const secondary = plan ? {
    used: Math.round(apiPct * 10) / 10,
    cap: 100,
    unit: 'requests' as const,
    resetsAt: billingEnd,
    label: 'api usage',
  } : undefined;

  // On-demand spend
  const onDemandCost = onDemand?.enabled && onDemand.used > 0 ? onDemand.used : undefined;

  const planName = r.membershipType
    ? `${r.membershipType.charAt(0).toUpperCase()}${r.membershipType.slice(1)}`
    : 'Pro';

  return {
    weekly,      // total %
    session,     // auto+composer %
    secondary,   // api %
    costUSD: onDemandCost,
    updatedAt: new Date(fetchedAt),
    identity: { plan: planName },
  };
}

// ---------------------------------------------------------------------------
// Legacy local state.vscdb (fallback when API unavailable)
// ---------------------------------------------------------------------------
interface CursorStateConfig {
  user?: { email?: string; plan?: string };
  usage?: {
    periodStart?: string;
    periodEnd?: string;
    fastRequests?: { used?: number; limit?: number };
    slowRequests?: { used?: number; limit?: number };
  };
}

function asDateOrNow(value: string | undefined, fallbackMs: number): Date {
  const ts = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ts) ? new Date(fallbackMs) : new Date(ts);
}

export function parseCursorConfig(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CursorStateConfig;
  const usage = r.usage;

  const weekly = usage?.fastRequests
    && typeof usage.fastRequests.used === 'number'
    && typeof usage.fastRequests.limit === 'number'
    ? { used: usage.fastRequests.used, cap: usage.fastRequests.limit, unit: 'requests' as const, resetsAt: asDateOrNow(usage.periodEnd, fetchedAt) }
    : undefined;

  const slowUsed = usage?.slowRequests?.used;
  const slowLimit = usage?.slowRequests?.limit;

  return {
    weekly,
    secondary: typeof slowUsed === 'number' && typeof slowLimit === 'number'
      ? { used: slowUsed, cap: slowLimit, unit: 'requests' as const, resetsAt: asDateOrNow(usage?.periodEnd, fetchedAt) }
      : undefined,
    updatedAt: new Date(fetchedAt),
    identity: r.user?.email ? { email: r.user.email, plan: r.user.plan } : undefined,
  };
}
