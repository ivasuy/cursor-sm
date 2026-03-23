// Claude — uses `claude auth status` CLI for plan info, calls OAuth usage API for quota data
// Safe: uses execFile (not exec) via BaseAdapter — no shell injection risk
import { BaseAdapter } from './base.js';
import { getClaudeOAuthToken } from '../platform/keychain.js';
import type { ProviderUsage, AdapterCapabilities, ProviderConfig, QuotaWindow } from '../types.js';

const USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';

interface ClaudeUsageResponse {
  five_hour?: { utilization: number; resets_at: string };
  seven_day?: { utilization: number; resets_at: string };
  seven_day_opus?: { utilization: number; resets_at: string };
  extra_usage?: {
    is_enabled: boolean;
    monthly_limit: number;
    used_credits: number;
    currency: string;
  };
}

interface ClaudeAuthStatus {
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  subscriptionType?: string;
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
      requiresCli: true,
      platformSupport: 'full',
      missingDependencies: [],
    };
  }

  async detect(): Promise<boolean> {
    return (await this.which('claude')) !== null;
  }

  async fetch(_config: ProviderConfig): Promise<ProviderUsage> {
    // Always try to get plan info from `claude auth status`
    const out = await this.exec('claude', ['auth', 'status'], 10_000);
    if (!out) return this.err('Claude CLI not responding');

    const authData = this.parseJson<ClaudeAuthStatus>(out);
    if (!authData?.loggedIn) return this.err('Not signed in — run `claude auth login`');

    const plan = authData.subscriptionType || null;

    // Try to get OAuth token for full usage data
    const token = await getClaudeOAuthToken();
    if (!token) {
      // Fall back to plan-only info (current behavior)
      return this.ok({
        plan,
        quotaUsed: null,
        quotaLimit: null,
        quotaRemaining: null,
        quotaUnit: 'requests',
        secondary: null,
        resetAt: null,
        resetWindow: null,
        costUsd: null,
        status: plan ? 'ok' : 'unknown',
      });
    }

    // Fetch usage from the OAuth API
    const usageData = await this.httpGet<ClaudeUsageResponse>(USAGE_API_URL, {
      'Authorization': `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'worktrace/1.0',
    });

    if (!usageData) {
      // API call failed — fall back to plan-only info
      return this.ok({
        plan,
        quotaUsed: null,
        quotaLimit: null,
        quotaRemaining: null,
        quotaUnit: 'requests',
        secondary: null,
        resetAt: null,
        resetWindow: null,
        costUsd: null,
        status: plan ? 'ok' : 'unknown',
      });
    }

    // Map five_hour → primary quota
    const fiveHour = usageData.five_hour;
    const quotaUsed = fiveHour?.utilization ?? null;
    const quotaLimit = fiveHour ? 100 : null;
    const resetAt = fiveHour?.resets_at ?? null;

    // Map seven_day → secondary QuotaWindow
    let secondary: QuotaWindow | null = null;
    if (usageData.seven_day) {
      secondary = {
        label: 'Weekly',
        used: usageData.seven_day.utilization,
        limit: 100,
        remaining: Math.max(0, 100 - usageData.seven_day.utilization),
        unit: 'percent',
        resetAt: usageData.seven_day.resets_at,
      };
    }

    // Map seven_day_opus → tertiary QuotaWindow
    let tertiary: QuotaWindow | null = null;
    if (usageData.seven_day_opus) {
      tertiary = {
        label: 'Opus Weekly',
        used: usageData.seven_day_opus.utilization,
        limit: 100,
        remaining: Math.max(0, 100 - usageData.seven_day_opus.utilization),
        unit: 'percent',
        resetAt: usageData.seven_day_opus.resets_at,
      };
    }

    // Map extra_usage → credits and costUsd
    let credits: ProviderUsage['credits'] = null;
    let costUsd: number | null = null;
    if (usageData.extra_usage) {
      const eu = usageData.extra_usage;
      costUsd = eu.used_credits;
      credits = {
        balance: eu.monthly_limit - eu.used_credits,
        unlimited: false,
        currency: eu.currency,
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
}
