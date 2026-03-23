// Copilot — uses `gh` CLI to obtain a token, then calls the internal Copilot API
// NOTE: All CLI execution uses execFile (no shell) via BaseAdapter.exec() — safe from injection
import { BaseAdapter } from './base.js';
import type { ProviderUsage, AdapterCapabilities, ProviderConfig } from '../types.js';

interface CopilotInternalResponse {
  copilotPlan?: string;
  quotaSnapshots?: {
    premiumInteractions?: { entitlement: number; remaining: number; percentRemaining: number };
    chat?: { entitlement: number; remaining: number; percentRemaining: number };
  };
  quotaResetDate?: string;
}

export class CopilotAdapter extends BaseAdapter {
  readonly id = 'copilot' as const;
  readonly displayName = 'GitHub Copilot';
  readonly ttlMs = 300_000;

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
    return (await this.which('gh')) !== null;
  }

  async fetch(_config: ProviderConfig): Promise<ProviderUsage> {
    // Get the gh auth token via execFile (safe — no shell)
    const token = await this.exec('gh', ['auth', 'token'], 5_000);
    if (!token) return this.err('GitHub not authenticated — run `gh auth login`');

    const ghToken = token.trim();

    // Call the internal Copilot API with all required editor headers
    let data: CopilotInternalResponse | null = null;
    let is404 = false;

    try {
      const res = await fetch('https://api.github.com/copilot_internal/user', {
        headers: {
          Authorization: `token ${ghToken}`,
          Accept: 'application/json',
          'Editor-Version': 'vscode/1.96.2',
          'Editor-Plugin-Version': 'copilot-chat/0.26.7',
          'User-Agent': 'GitHubCopilotChat/0.26.7',
          'X-Github-Api-Version': '2025-04-01',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 404) {
        is404 = true;
      } else if (res.ok) {
        data = (await res.json()) as CopilotInternalResponse;
      }
    } catch {
      return this.err('Failed to reach GitHub Copilot API');
    }

    // 404 = no Copilot subscription
    if (is404 || !data) {
      return this.ok({
        plan: 'no subscription',
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

    const premium = data.quotaSnapshots?.premiumInteractions;
    const chat = data.quotaSnapshots?.chat;
    const resetAt = data.quotaResetDate ?? null;

    const quotaUsed = premium ? premium.entitlement - premium.remaining : null;
    const quotaLimit = premium?.entitlement ?? null;
    const quotaRemaining = premium?.remaining ?? null;

    // Derive status from premiumInteractions percentRemaining
    let status: ProviderUsage['status'] = 'unknown';
    if (premium) {
      if (premium.percentRemaining < 0) {
        status = 'exhausted';
      } else if (premium.percentRemaining < 20) {
        status = 'warning';
      } else {
        status = 'ok';
      }
    } else {
      status = this.deriveStatus(quotaUsed, quotaLimit);
    }

    return this.ok({
      plan: data.copilotPlan ?? null,
      quotaUsed,
      quotaLimit,
      quotaRemaining,
      quotaUnit: 'requests',
      secondary: chat
        ? {
            label: 'Chat',
            used: chat.entitlement - chat.remaining,
            limit: chat.entitlement,
            remaining: chat.remaining,
            unit: 'requests',
            resetAt,
          }
        : null,
      resetAt,
      resetWindow: 'monthly',
      costUsd: null,
      status,
    });
  }
}
