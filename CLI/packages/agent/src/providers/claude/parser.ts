import type { UsageSnapshot } from '../_shared/types.js';

// ---------------------------------------------------------------------------
// claude.ai/api/organizations/{id}/usage  (cookie-based web API)
// ---------------------------------------------------------------------------
interface ClaudeWebWindow {
  utilization: number;   // 0.0–1.0
  resets_at: string | null;
}

interface ClaudeWebExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
  currency: string | null;
}

interface ClaudeWebUsageResponse {
  five_hour?: ClaudeWebWindow;
  seven_day?: ClaudeWebWindow;
  seven_day_opus?: ClaudeWebWindow;
  seven_day_sonnet?: ClaudeWebWindow;
  extra_usage?: ClaudeWebExtraUsage;
}

function windowToQuotaBar(w: ClaudeWebWindow | null | undefined, unit: 'requests' | 'tokens' | 'credits' | 'minutes', fetchedAt: number, label?: string) {
  if (!w) return undefined;
  const used = Math.round(w.utilization * 1000) / 10; // convert to %
  const resetsAt = w.resets_at ? new Date(w.resets_at) : new Date(fetchedAt + 7 * 86400_000);
  return { used, cap: 100, unit, resetsAt, label };
}

export function parseClaudeWebUsage(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as ClaudeWebUsageResponse;

  const session = windowToQuotaBar(r.five_hour, 'requests', fetchedAt, '5h window');
  const weekly  = windowToQuotaBar(r.seven_day,  'requests', fetchedAt, '7-day');
  const opus    = windowToQuotaBar(r.seven_day_opus,   'requests', fetchedAt, 'opus 7-day');
  const sonnet  = windowToQuotaBar(r.seven_day_sonnet, 'requests', fetchedAt, 'sonnet 7-day');

  const extra = r.extra_usage;
  let costUSD: number | undefined;
  let creditsRemaining: number | undefined;
  if (extra?.is_enabled && typeof extra.used_credits === 'number') {
    costUSD = extra.used_credits;
    if (typeof extra.monthly_limit === 'number') {
      creditsRemaining = Math.max(0, extra.monthly_limit - extra.used_credits);
    }
  }

  return {
    session,
    weekly,
    secondary: opus ?? sonnet,
    costUSD,
    creditsRemainingUSD: creditsRemaining,
    updatedAt: new Date(fetchedAt),
  };
}

// ---------------------------------------------------------------------------
// ANTHROPIC_API_KEY → api.anthropic.com/v1/organizations/usage
// ---------------------------------------------------------------------------
interface ApiKeyResponse {
  organization?: { id?: string; name?: string };
  plan?: { id?: string; limit_usd?: number; used_usd?: number };
  period?: { start?: string; end?: string };
  models?: Array<{ id: string; input_tokens?: number; output_tokens?: number }>;
}

function asDateOrNow(value: string | undefined, fallbackMs: number): Date {
  const ts = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ts) ? new Date(fallbackMs) : new Date(ts);
}

export function parseApiKeyResponse(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as ApiKeyResponse;
  const models = Array.isArray(r.models) ? r.models : [];
  const inputTokens = models.reduce((acc, m) => acc + (m.input_tokens ?? 0), 0);
  const outputTokens = models.reduce((acc, m) => acc + (m.output_tokens ?? 0), 0);
  const used = r.plan?.used_usd;
  const limit = r.plan?.limit_usd;

  return {
    weekly: typeof used === 'number' && typeof limit === 'number'
      ? { used, cap: limit, unit: 'credits', resetsAt: asDateOrNow(r.period?.end, fetchedAt) }
      : undefined,
    inputTokens: inputTokens || undefined,
    outputTokens: outputTokens || undefined,
    costUSD: typeof used === 'number' ? used : undefined,
    creditsRemainingUSD: typeof used === 'number' && typeof limit === 'number' ? Math.max(limit - used, 0) : undefined,
    updatedAt: new Date(fetchedAt),
    identity: r.organization?.name ? { username: r.organization.name, plan: r.plan?.id } : undefined,
  };
}

// ---------------------------------------------------------------------------
// claude usage --json  (CLI PTY)
// ---------------------------------------------------------------------------
interface CliUsageResponse {
  account?: string;
  plan?: string;
  period_end?: string;
  messages_used?: number;
  messages_limit?: number;
  tokens_used?: number;
}

export function parseCliUsageResponse(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CliUsageResponse;
  return {
    session: typeof r.messages_used === 'number' && typeof r.messages_limit === 'number'
      ? { used: r.messages_used, cap: r.messages_limit, unit: 'requests', resetsAt: asDateOrNow(r.period_end, fetchedAt) }
      : undefined,
    inputTokens: typeof r.tokens_used === 'number' ? r.tokens_used : undefined,
    updatedAt: new Date(fetchedAt),
    identity: r.account ? { email: r.account, plan: r.plan } : undefined,
  };
}
