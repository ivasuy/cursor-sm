// Codex — calls the ChatGPT usage API; falls back to JWT plan reading if the
// API is unreachable or returns an error.
import { join } from 'node:path';
import { BaseAdapter } from './base.js';
import type { ProviderUsage, AdapterCapabilities, ProviderConfig, QuotaWindow } from '../types.js';

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

function codexAuthPath(): string {
  return join(process.env.HOME || '', '.codex', 'auth.json');
}

function codexConfigPath(): string {
  return join(process.env.HOME || '', '.codex', 'config.toml');
}

/** Decode a JWT payload without verification. */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1];
    payload += '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Map limit_window_seconds to a human-readable reset-window label. */
function windowLabel(seconds: number): string {
  if (seconds === 18000) return '5h';
  if (seconds === 604800) return 'weekly';
  if (seconds === 86400) return 'daily';
  if (seconds === 3600) return 'hourly';
  // Generic fallback
  const hours = Math.round(seconds / 3600);
  return hours > 0 ? `${hours}h` : `${seconds}s`;
}

interface RateLimitWindow {
  used_percent?: number;
  reset_at?: number;
  limit_window_seconds?: number;
}

interface UsageApiResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: RateLimitWindow;
    secondary_window?: RateLimitWindow;
  };
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: number;
  };
}

export class CodexAdapter extends BaseAdapter {
  readonly id = 'codex' as const;
  readonly displayName = 'Codex';
  readonly ttlMs = 120_000;

  capabilities(): AdapterCapabilities {
    return {
      canFetchQuota: true,
      canFetchCost: false,
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
    return (await this.which('codex')) !== null;
  }

  async fetch(_config: ProviderConfig): Promise<ProviderUsage> {
    // ── 1. Read auth.json ────────────────────────────────────────────────
    const authRaw = await this.readFileSafe(codexAuthPath());
    const configRaw = await this.readFileSafe(codexConfigPath());

    // Parse the model from config.toml
    let model: string | null = null;
    if (configRaw) {
      const modelMatch = configRaw.match(/^model\s*=\s*"([^"]+)"/m);
      if (modelMatch) model = modelMatch[1];
    }

    if (!authRaw) {
      return this.ok({
        plan: null,
        quotaUsed: null,
        quotaLimit: null,
        quotaRemaining: null,
        quotaUnit: 'requests',
        secondary: null,
        resetAt: null,
        resetWindow: null,
        costUsd: null,
        status: 'unknown',
      });
    }

    const auth = this.parseJson<{
      auth_mode?: string;
      tokens?: {
        id_token?: string;
        access_token?: string;
      };
    }>(authRaw);

    // ── 2. Decode JWT claims (used for both API auth and fallback) ────────
    const accessToken = auth?.tokens?.access_token ?? null;
    const idToken = auth?.tokens?.id_token ?? null;

    let jwtPlan: string | null = null;
    let subscriptionUntil: string | null = null;
    let accountId: string | null = null;

    const tokenToDecode = idToken || accessToken;
    if (tokenToDecode) {
      const claims = decodeJwt(tokenToDecode);
      if (claims) {
        const authInfo = claims['https://api.openai.com/auth'] as Record<string, string> | undefined;
        if (authInfo) {
          jwtPlan = authInfo.chatgpt_plan_type || null;
          subscriptionUntil = authInfo.chatgpt_subscription_active_until || null;
          accountId = authInfo.chatgpt_account_id || null;
        }
      }
    }

    // ── 3. Try the live usage API ─────────────────────────────────────────
    if (accessToken) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
      };
      if (accountId) {
        headers['ChatGPT-Account-Id'] = accountId;
      }

      const data = await this.httpGet<UsageApiResponse>(USAGE_URL, headers);

      if (data) {
        return this.buildFromApi(data, model);
      }
    }

    // ── 4. Fallback: JWT-only plan info ───────────────────────────────────
    let status: 'ok' | 'warning' | 'unknown' = jwtPlan ? 'ok' : 'unknown';
    if (subscriptionUntil) {
      const diff = new Date(subscriptionUntil).getTime() - Date.now();
      if (diff < 7 * 24 * 60 * 60 * 1000 && diff > 0) status = 'warning';
    }

    return this.ok({
      plan: jwtPlan ? `${jwtPlan}${model ? ` (${model})` : ''}` : model || null,
      quotaUsed: null,
      quotaLimit: null,
      quotaRemaining: null,
      quotaUnit: 'requests',
      secondary: null,
      resetAt: subscriptionUntil,
      resetWindow: subscriptionUntil ? 'billing-cycle' : null,
      costUsd: null,
      status,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private buildFromApi(data: UsageApiResponse, model: string | null): ProviderUsage {
    const primary = data.rate_limit?.primary_window;
    const secondaryRaw = data.rate_limit?.secondary_window;

    // Primary quota
    const quotaUsed = primary?.used_percent ?? null;
    const quotaLimit = quotaUsed !== null ? 100 : null;
    const quotaRemaining = quotaUsed !== null ? Math.max(0, 100 - quotaUsed) : null;
    const resetAt =
      primary?.reset_at != null
        ? new Date(primary.reset_at * 1000).toISOString()
        : null;
    const resetWindow =
      primary?.limit_window_seconds != null
        ? windowLabel(primary.limit_window_seconds)
        : null;

    // Secondary quota window
    let secondary: QuotaWindow | null = null;
    if (secondaryRaw) {
      const secUsed = secondaryRaw.used_percent ?? null;
      const secResetAt =
        secondaryRaw.reset_at != null
          ? new Date(secondaryRaw.reset_at * 1000).toISOString()
          : null;
      const secLabel =
        secondaryRaw.limit_window_seconds != null
          ? windowLabel(secondaryRaw.limit_window_seconds)
          : 'secondary';
      secondary = {
        label: secLabel,
        used: secUsed,
        limit: secUsed !== null ? 100 : null,
        remaining: secUsed !== null ? Math.max(0, 100 - secUsed) : null,
        unit: 'percent',
        resetAt: secResetAt,
      };
    }

    // Credits
    let credits: ProviderUsage['credits'] = null;
    if (data.credits) {
      credits = {
        balance: data.credits.balance ?? null,
        unlimited: data.credits.unlimited ?? false,
        currency: 'USD',
      };
    }

    // Plan label
    const planType = data.plan_type ?? null;
    const plan = planType ? `${planType}${model ? ` (${model})` : ''}` : model || null;

    const status = this.deriveStatus(quotaUsed, quotaLimit);

    return this.ok({
      plan,
      quotaUsed,
      quotaLimit,
      quotaRemaining,
      quotaUnit: 'percent',
      secondary,
      resetAt,
      resetWindow,
      costUsd: null,
      status,
      credits,
    });
  }
}
