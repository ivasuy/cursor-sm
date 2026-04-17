import type { UsageSnapshot } from '../_shared/types.js';

interface CliUsage {
  account?: string;
  tier?: string;
  period_end?: string;
  credits?: { used?: number; limit?: number };
  tokens?: { input?: number; output?: number };
}

interface AuthCache {
  email?: string;
  plan?: string;
  usage_cached_at?: string;
  messages_used?: number;
  messages_limit?: number;
}

function asDateOrNow(value: string | undefined, fallbackMs: number): Date {
  const ts = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ts) ? new Date(fallbackMs) : new Date(ts);
}

export function parseCodexCliUsage(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CliUsage;
  const creditsUsed = r.credits?.used;
  const creditsLimit = r.credits?.limit;
  return {
    weekly: typeof creditsUsed === 'number' && typeof creditsLimit === 'number'
      ? {
          used: creditsUsed,
          cap: creditsLimit,
          unit: 'credits',
          resetsAt: asDateOrNow(r.period_end, fetchedAt),
        }
      : undefined,
    inputTokens: typeof r.tokens?.input === 'number' ? r.tokens.input : undefined,
    outputTokens: typeof r.tokens?.output === 'number' ? r.tokens.output : undefined,
    costUSD: typeof creditsUsed === 'number' ? creditsUsed : undefined,
    creditsRemainingUSD: typeof creditsUsed === 'number' && typeof creditsLimit === 'number'
      ? Math.max(creditsLimit - creditsUsed, 0)
      : undefined,
    updatedAt: new Date(fetchedAt),
    identity: r.account ? { email: r.account, plan: r.tier } : undefined,
  };
}

export function parseCodexAuthCache(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as AuthCache;
  return {
    weekly: typeof r.messages_used === 'number' && typeof r.messages_limit === 'number'
      ? {
          used: r.messages_used,
          cap: r.messages_limit,
          unit: 'requests',
          resetsAt: asDateOrNow(r.usage_cached_at, fetchedAt),
        }
      : undefined,
    updatedAt: new Date(fetchedAt),
    identity: r.email ? { email: r.email, plan: r.plan } : undefined,
  };
}
