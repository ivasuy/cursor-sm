// Cursor — reads auth token from Cursor's local state.vscdb, hits cursor.com/api/usage-summary
// (falls back to api2.cursor.sh/auth/usage for model-level request counts)
import { readFile, copyFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseAdapter } from './base.js';
import type { ProviderUsage, AdapterCapabilities, ProviderConfig } from '../types.js';

function cursorStatePath(): string {
  if (process.platform === 'darwin') {
    return join(process.env.HOME || '', 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || '', 'Cursor/User/globalStorage/state.vscdb');
  }
  return join(process.env.HOME || '', '.config/Cursor/User/globalStorage/state.vscdb');
}

interface UsageSummaryResponse {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  individualUsage?: {
    plan?: {
      used?: number;
      limit?: number;
      remaining?: number;
      autoPercentUsed?: number;
      totalPercentUsed?: number;
    };
    onDemand?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
    };
  };
}

export class CursorAdapter extends BaseAdapter {
  readonly id = 'cursor' as const;
  readonly displayName = 'Cursor';
  readonly ttlMs = 60_000;

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
    if (process.platform === 'darwin') {
      const exists = await this.readFileSafe('/Applications/Cursor.app/Contents/Info.plist');
      if (exists) return true;
    }
    const bin = await this.which('cursor');
    if (bin) return true;
    // Check if state DB exists (Cursor was installed at some point)
    const db = await this.readFileSafe(cursorStatePath());
    return db !== null;
  }

  async fetch(config: ProviderConfig): Promise<ProviderUsage> {
    const token = config.manualCookie || await this.getAccessToken();
    if (!token) return this.err('Cursor auth token not found — sign in to Cursor');

    // Try the richer usage-summary endpoint first
    const summary = await this.fetchUsageSummary(token);
    if (summary) {
      return summary;
    }

    // Fall back to the api2.cursor.sh approach (model-level request counts)
    return this.fetchLegacyUsage(token);
  }

  /** Attempt to fetch from cursor.com/api/usage-summary using Cookie auth.
   *  Returns null if the endpoint is unavailable or returns non-JSON (e.g. 401 / redirect). */
  private async fetchUsageSummary(token: string): Promise<ProviderUsage | null> {
    try {
      const res = await fetch('https://www.cursor.com/api/usage-summary', {
        headers: {
          Cookie: `WorkosCursorSessionToken=${token}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return null;

      // Guard against HTML redirect responses masquerading as 200
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;

      const data = await res.json() as UsageSummaryResponse;

      // Validate the shape minimally
      if (!data || typeof data !== 'object' || !data.individualUsage) return null;

      const planData = data.individualUsage.plan;
      const onDemandData = data.individualUsage.onDemand;

      // plan.used and plan.limit are in cents — convert to USD
      const quotaUsed = planData?.used != null ? planData.used / 100 : null;
      const quotaLimit = planData?.limit != null ? planData.limit / 100 : null;
      const quotaRemaining = planData?.remaining != null ? planData.remaining / 100 : null;
      const totalPercentUsed = planData?.totalPercentUsed ?? null;

      // Derive status from totalPercentUsed
      let status: ProviderUsage['status'] = 'unknown';
      if (totalPercentUsed !== null) {
        if (totalPercentUsed >= 100) status = 'exhausted';
        else if (totalPercentUsed >= 80) status = 'warning';
        else status = 'ok';
      } else {
        status = this.deriveStatus(quotaUsed, quotaLimit);
      }

      // On-demand secondary info
      let secondary: ProviderUsage['secondary'] = null;
      if (onDemandData != null) {
        secondary = {
          label: 'On-Demand',
          used: onDemandData.used != null ? onDemandData.used / 100 : 0,
          limit: onDemandData.limit != null ? onDemandData.limit / 100 : null,
          remaining: null,
          unit: 'dollars',
          resetAt: data.billingCycleEnd || null,
        };
      }

      return this.ok({
        plan: data.membershipType || null,
        quotaUsed,
        quotaLimit,
        quotaRemaining,
        quotaUnit: 'dollars',
        secondary,
        resetAt: data.billingCycleEnd || null,
        resetWindow: 'billing-cycle',
        costUsd: quotaUsed,
        status,
      });
    } catch {
      return null;
    }
  }

  /** Fallback: use api2.cursor.sh endpoints for plan profile + model-level request counts. */
  private async fetchLegacyUsage(token: string): Promise<ProviderUsage> {
    // Fetch plan info
    const profile = await this.httpGet<{
      membershipType?: string;
      individualMembershipType?: string;
      subscriptionStatus?: string;
    }>(
      'https://api2.cursor.sh/auth/full_stripe_profile',
      { Authorization: `Bearer ${token}` },
    );

    // Fetch usage data
    const usage = await this.httpGet<Record<string, {
      numRequests?: number;
      numRequestsTotal?: number;
      numTokens?: number;
      maxRequestUsage?: number | null;
    }> & { startOfMonth?: string }>(
      'https://api2.cursor.sh/auth/usage',
      { Authorization: `Bearer ${token}` },
    );

    if (!usage) return this.err('Failed to fetch Cursor usage');

    // Sum up all model requests
    let totalRequests = 0;
    let totalTokens = 0;
    for (const [model, data] of Object.entries(usage)) {
      if (model === 'startOfMonth') continue;
      if (typeof data !== 'object' || data === null) continue;
      const reqs = data.numRequests || 0;
      const tokens = data.numTokens || 0;
      totalRequests += reqs;
      totalTokens += tokens;
    }

    const plan = profile?.membershipType || profile?.individualMembershipType || null;
    // Free plan has 50 slow premium requests/month; pro has 500 fast
    const planLimits: Record<string, number> = { free: 50, pro: 500, business: 500 };
    const limit = plan ? planLimits[plan] ?? null : null;

    // Calculate reset date (next month from startOfMonth)
    let resetAt: string | null = null;
    if (usage.startOfMonth) {
      const start = new Date(usage.startOfMonth as unknown as string);
      start.setMonth(start.getMonth() + 1);
      resetAt = start.toISOString();
    }

    return this.ok({
      plan,
      quotaUsed: totalRequests,
      quotaLimit: limit,
      quotaRemaining: limit !== null ? Math.max(0, limit - totalRequests) : null,
      quotaUnit: 'requests',
      secondary: totalTokens > 0 ? {
        label: 'Tokens',
        used: totalTokens,
        limit: null,
        remaining: null,
        unit: 'tokens',
        resetAt: null,
      } : null,
      resetAt,
      resetWindow: 'monthly',
      costUsd: null,
      status: limit !== null ? this.deriveStatus(totalRequests, limit) : (totalRequests > 0 ? 'ok' : 'unknown'),
    });
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      // Copy DB to avoid lock conflicts with running Cursor
      const src = cursorStatePath();
      const tmp = join(tmpdir(), `cursor-state-${Date.now()}.db`);
      await copyFile(src, tmp);

      // Dynamic import of better-sqlite3
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(tmp, { readonly: true });
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get() as { value: string } | undefined;
      db.close();
      await unlink(tmp).catch(() => {});
      return row?.value || null;
    } catch {
      return null;
    }
  }
}
