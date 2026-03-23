// Claude — reads OAuth token from Keychain/credentials, calls Anthropic usage API
// Falls back to `claude auth status` CLI if no token available
import { BaseAdapter } from './base.js';
import { getClaudeOAuthInfo } from '../platform/keychain.js';
import type { ProviderUsage, AdapterCapabilities, ProviderConfig, QuotaWindow } from '../types.js';

const USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';

// ── API response types (matching real API output) ────────────────────────

interface RateWindow {
  utilization: number;   // 0-100
  resets_at: string;     // ISO 8601
}

interface ClaudeUsageResponse {
  five_hour?: RateWindow | null;
  seven_day?: RateWindow | null;
  seven_day_opus?: RateWindow | null;
  seven_day_sonnet?: RateWindow | null;
  seven_day_oauth_apps?: RateWindow | null;
  seven_day_cowork?: RateWindow | null;
  iguana_necktie?: RateWindow | null;
  extra_usage?: {
    is_enabled: boolean;
    monthly_limit: number | null;
    used_credits: number | null;
    utilization: number | null;
    currency?: string;
  } | null;
}

// ── Plan name mapping (matches CodexBar) ─────────────────────────────────

function planLabel(subscriptionType: string | null, rateLimitTier: string | null): string | null {
  // Check both fields — rateLimitTier may be "default_claude_ai", subscriptionType may be "pro"
  const combined = `${rateLimitTier || ''} ${subscriptionType || ''}`.toLowerCase();
  if (combined.includes('max'))        return 'Claude Max';
  if (combined.includes('ultra'))      return 'Claude Ultra';
  if (combined.includes('enterprise')) return 'Claude Enterprise';
  if (combined.includes('team'))       return 'Claude Team';
  if (combined.includes('pro'))        return 'Claude Pro';
  if (subscriptionType)                return subscriptionType;
  return null;
}

export class ClaudeAdapter extends BaseAdapter {
  readonly id = 'claude' as const;
  readonly displayName = 'Claude';
  readonly ttlMs = 120_000;

  capabilities(): AdapterCapabilities {
    return {
      canFetchQuota: true,
      canFetchCost: true,
      canFetchPlan: true,
      canFetchResetWindow: true,
      canRefreshAuth: false,
      requiresBrowser: false,
      requiresCli: false,
      platformSupport: 'full',
      missingDependencies: [],
    };
  }

  async detect(): Promise<boolean> {
    // Check for token in Keychain/credentials first (faster)
    const info = await getClaudeOAuthInfo();
    if (info) return true;
    // Fall back to CLI detection
    return (await this.which('claude')) !== null;
  }

  async fetch(_config: ProviderConfig): Promise<ProviderUsage> {
    // 1. Try to get OAuth info (token + plan) from Keychain / credentials file
    const oauthInfo = await getClaudeOAuthInfo();

    if (oauthInfo) {
      const plan = planLabel(oauthInfo.subscriptionType, oauthInfo.rateLimitTier);
      const result = await this.fetchFromApi(oauthInfo.accessToken, plan);
      if (result) return result;
      // API failed — return plan-only from credentials
      return this.ok({
        plan,
        quotaUsed: null, quotaLimit: null, quotaRemaining: null,
        quotaUnit: 'percent', secondary: null,
        resetAt: null, resetWindow: null, costUsd: null,
        status: plan ? 'ok' : 'unknown',
      });
    }

    // 2. No OAuth token — fall back to `claude auth status` CLI
    return this.fetchFromCli();
  }

  private async fetchFromApi(token: string, plan: string | null): Promise<ProviderUsage | null> {
    // Call the OAuth usage API with required headers
    const data = await this.httpGet<ClaudeUsageResponse>(USAGE_API_URL, {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'worktrace/1.0',
    });

    if (!data) return null;

    // ── Primary: 5-hour session window ────────────────────────────
    const fiveHour = data.five_hour;
    const quotaUsed = fiveHour?.utilization ?? null;
    const quotaLimit = fiveHour ? 100 : null;
    const resetAt = fiveHour?.resets_at ?? null;

    // ── Secondary: 7-day weekly window ────────────────────────────
    let secondary: QuotaWindow | null = null;
    if (data.seven_day) {
      secondary = this.makeWindow('Weekly', data.seven_day);
    }

    // ── Tertiary: pick the most relevant model-specific window ────
    // Priority: opus > sonnet > oauth_apps > cowork > iguana_necktie
    let tertiary: QuotaWindow | null = null;
    if (data.seven_day_opus) {
      tertiary = this.makeWindow('Opus Weekly', data.seven_day_opus);
    } else if (data.seven_day_sonnet) {
      tertiary = this.makeWindow('Sonnet Weekly', data.seven_day_sonnet);
    } else if (data.seven_day_oauth_apps) {
      tertiary = this.makeWindow('OAuth Apps Weekly', data.seven_day_oauth_apps);
    } else if (data.seven_day_cowork) {
      tertiary = this.makeWindow('Cowork Weekly', data.seven_day_cowork);
    }

    // ── Extra usage / credits ─────────────────────────────────────
    let credits: ProviderUsage['credits'] = null;
    let costUsd: number | null = null;
    const eu = data.extra_usage;
    if (eu && eu.is_enabled) {
      costUsd = eu.used_credits ?? null;
      const limit = eu.monthly_limit ?? null;
      credits = {
        balance: limit !== null && eu.used_credits !== null
          ? limit - eu.used_credits
          : null,
        unlimited: false,
        currency: eu.currency || 'USD',
      };
    }

    const status = this.deriveStatus(quotaUsed, quotaLimit);

    return this.ok({
      plan,
      quotaUsed,
      quotaLimit,
      quotaRemaining: quotaUsed !== null && quotaLimit !== null
        ? Math.max(0, quotaLimit - quotaUsed)
        : null,
      quotaUnit: 'percent',
      secondary,
      tertiary,
      credits,
      resetAt,
      resetWindow: fiveHour ? '5h' : null,
      costUsd,
      status,
    });
  }

  private makeWindow(label: string, rw: RateWindow): QuotaWindow {
    return {
      label,
      used: rw.utilization,
      limit: 100,
      remaining: Math.max(0, 100 - rw.utilization),
      unit: 'percent',
      resetAt: rw.resets_at,
    };
  }

  private async fetchFromCli(): Promise<ProviderUsage> {
    const out = await this.exec('claude', ['auth', 'status'], 10_000);
    if (!out) return this.err('Claude CLI not responding');

    const authData = this.parseJson<{
      loggedIn?: boolean;
      subscriptionType?: string;
    }>(out);

    if (!authData?.loggedIn) return this.err('Not signed in — run `claude auth login`');

    const plan = authData.subscriptionType || null;
    return this.ok({
      plan,
      quotaUsed: null, quotaLimit: null, quotaRemaining: null,
      quotaUnit: 'percent', secondary: null,
      resetAt: null, resetWindow: null, costUsd: null,
      status: plan ? 'ok' : 'unknown',
    });
  }
}
