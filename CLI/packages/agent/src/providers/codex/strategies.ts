import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { ProviderFetchStrategy, UsageSnapshot, ModelUsage } from '../_shared/types.js';
import { lookupModelCost } from '../_host/token-cost-models.js';
import './models.js';  // register model costs
import { parseCodexCliUsage, parseCodexAuthCache } from './parser.js';

function authCachePath(): string {
  return join(homedir(), '.codex', 'usage_cache.json');
}

function statePath(): string {
  return join(homedir(), '.codex', 'state_5.sqlite');
}

function authJsonPath(): string {
  return join(homedir(), '.codex', 'auth.json');
}

interface AuthJson {
  auth_mode?: string;
  tokens?: {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
}

interface IdTokenClaims {
  email?: string;
  name?: string;
  'https://api.openai.com/auth'?: {
    chatgpt_plan_type?: string;
    chatgpt_subscription_active_until?: string;
    chatgpt_subscription_active_start?: string;
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readAuth(): { authMode: string; accessToken?: string; identity: { email?: string; plan?: string; subscriptionUntil?: string } } {
  if (!existsSync(authJsonPath())) return { authMode: 'unknown', identity: {} };
  try {
    const auth = JSON.parse(readFileSync(authJsonPath(), 'utf8')) as AuthJson;
    const idToken = auth.tokens?.id_token;
    let email: string | undefined;
    let plan: string | undefined;
    let subscriptionUntil: string | undefined;
    if (idToken) {
      const payload = decodeJwtPayload(idToken) as IdTokenClaims;
      email = payload.email;
      const openai = payload['https://api.openai.com/auth'];
      plan = openai?.chatgpt_plan_type;
      subscriptionUntil = openai?.chatgpt_subscription_active_until;
    }
    return { authMode: auth.auth_mode ?? 'unknown', accessToken: auth.tokens?.access_token, identity: { email, plan, subscriptionUntil } };
  } catch {
    return { authMode: 'unknown', identity: {} };
  }
}

// ---------------------------------------------------------------------------
// Wham API response types (chatgpt.com/backend-api/wham/usage)
// ---------------------------------------------------------------------------
interface WhamWindow {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number; // unix epoch
}

interface WhamCredits {
  has_credits: boolean;
  unlimited: boolean;
  balance: string;
}

interface WhamUsage {
  email?: string;
  plan_type?: string;
  rate_limit?: {
    allowed: boolean;
    limit_reached: boolean;
    primary_window?: WhamWindow;   // 5-hour window
    secondary_window?: WhamWindow; // weekly window
  };
  credits?: WhamCredits;
}

function whamToSnapshot(data: WhamUsage, fetchedAt: number): UsageSnapshot {
  const now = new Date(fetchedAt);
  const rl = data.rate_limit;

  const fiveHour = rl?.primary_window;
  const weekly = rl?.secondary_window;
  const credits = data.credits;

  const sessionQuota = fiveHour ? {
    used: Math.round(fiveHour.used_percent * 100) / 100,
    cap: 100,
    unit: 'percent' as const,
    resetsAt: new Date((fiveHour.reset_at ?? (fetchedAt / 1000 + fiveHour.reset_after_seconds)) * 1000),
    label: '5h window',
  } : undefined;

  const weeklyQuota = weekly ? {
    used: Math.round(weekly.used_percent * 100) / 100,
    cap: 100,
    unit: 'percent' as const,
    resetsAt: new Date((weekly.reset_at ?? (fetchedAt / 1000 + weekly.reset_after_seconds)) * 1000),
    label: 'weekly',
  } : undefined;

  const creditsBalance = credits?.has_credits
    ? parseFloat(credits.balance || '0')
    : undefined;

  const planRaw = data.plan_type ?? 'plus';
  const planLabel = `${planRaw.charAt(0).toUpperCase()}${planRaw.slice(1)} (subscription)`;

  return {
    session: sessionQuota,   // 5-hour window
    weekly: weeklyQuota,     // weekly window
    creditsRemainingUSD: credits?.unlimited ? undefined : (creditsBalance ?? undefined),
    updatedAt: now,
    identity: {
      email: data.email,
      plan: planLabel,
    },
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: OAuth HTTP (primary — direct API, no browser needed)
// ---------------------------------------------------------------------------
export const oauthHttp: ProviderFetchStrategy = {
  id: 'codex-oauth-http',
  kind: 'oauth-http',
  async isAvailable() {
    if (!existsSync(authJsonPath())) return false;
    const { accessToken } = readAuth();
    return Boolean(accessToken);
  },
  async fetch(ctx): Promise<UsageSnapshot> {
    const { accessToken } = readAuth();
    if (!accessToken) throw new Error('codex auth.json has no access_token');

    const res = await ctx.hosts.http.request<WhamUsage>({
      url: 'https://chatgpt.com/backend-api/wham/usage',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeoutMs: 10_000,
      retries: 1,
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`codex OAuth rejected: ${res.status}`);
    }

    return whamToSnapshot(res.body, Date.now());
  },
  shouldFallback(err) {
    // Fall back on auth errors — token may have expired
    return !err.message.includes('OAuth rejected');
  },
};

// ---------------------------------------------------------------------------
// Strategy 2: Local state scan (SQLite — always available offline)
// ---------------------------------------------------------------------------

function estimateCost(model: string, tokens: number): number {
  const inputTokens = Math.round(tokens * 0.4);
  const outputTokens = tokens - inputTokens;
  const costs = lookupModelCost('codex', model.toLowerCase())
    ?? lookupModelCost('codex', 'gpt-5-codex');
  if (!costs) return 0;
  return (inputTokens / 1000) * costs.inputPer1K + (outputTokens / 1000) * costs.outputPer1K;
}

interface ThreadRow { model: string | null; tokens_used: number; created_at: number }

export const localStateScan: ProviderFetchStrategy = {
  id: 'codex-local-state-scan',
  kind: 'local-config-scan',
  async isAvailable() {
    return existsSync(statePath());
  },
  async fetch(): Promise<UsageSnapshot> {
    const db = new Database(statePath(), { readonly: true, fileMustExist: true });
    try {
      const { identity, authMode } = readAuth();
      const isChatGptAuth = authMode === 'chatgpt';

      const now = new Date();
      const todayEpoch = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const cutoff30dEpoch = Math.floor((Date.now() - 30 * 86400_000) / 1000);

      const rows = db.prepare(
        'SELECT model, tokens_used, created_at FROM threads WHERE created_at >= ? AND archived = 0',
      ).all(cutoff30dEpoch) as ThreadRow[];

      const modelMap = new Map<string, { tokens: number; sessions: number }>();
      let todayTokens = 0, last30dTokens = 0, todaySessions = 0, last30dSessions = 0;

      for (const row of rows) {
        const model = row.model ?? 'unknown';
        const tokens = row.tokens_used ?? 0;
        if (!modelMap.has(model)) modelMap.set(model, { tokens: 0, sessions: 0 });
        const rec = modelMap.get(model)!;
        rec.tokens += tokens;
        rec.sessions += 1;
        last30dTokens += tokens;
        last30dSessions += 1;
        if (row.created_at >= todayEpoch) { todayTokens += tokens; todaySessions += 1; }
      }

      const modelBreakdown: ModelUsage[] = Array.from(modelMap.entries())
        .map(([model, v]) => ({ model, tokens: v.tokens, costUSD: isChatGptAuth ? 0 : estimateCost(model, v.tokens) }))
        .sort((a, b) => b.tokens - a.tokens);

      let resetsAt = new Date();
      resetsAt.setDate(1); resetsAt.setMonth(resetsAt.getMonth() + 1); resetsAt.setHours(0, 0, 0, 0);
      if (identity.subscriptionUntil) {
        const until = new Date(identity.subscriptionUntil);
        if (!Number.isNaN(until.getTime())) resetsAt = until;
      }

      return {
        session: { used: todaySessions, cap: Math.max(todaySessions, 10), unit: 'requests', resetsAt: new Date(new Date().setHours(24, 0, 0, 0)) },
        weekly: { used: last30dSessions, cap: Math.max(last30dSessions, 100), unit: 'requests', resetsAt },
        inputTokens: Math.round(todayTokens * 0.4) || undefined,
        outputTokens: Math.round(todayTokens * 0.6) || undefined,
        costUSD: isChatGptAuth ? undefined : undefined,
        sessionCount: todaySessions,
        modelBreakdown: modelBreakdown.length > 0 ? modelBreakdown : undefined,
        cost: {
          today: 0,
          last30d: 0,
          totalTokens: last30dTokens,
          todayTokens,
        },
        updatedAt: now,
        identity: identity.email ? {
          email: identity.email,
          plan: identity.plan
            ? `${identity.plan.charAt(0).toUpperCase()}${identity.plan.slice(1)} (subscription)`
            : undefined,
        } : undefined,
      };
    } finally {
      db.close();
    }
  },
  shouldFallback() { return true; },
};

// ---------------------------------------------------------------------------
// Strategy 3: CLI PTY (codex usage --json)
// ---------------------------------------------------------------------------
export const cliPty: ProviderFetchStrategy = {
  id: 'codex-cli-pty',
  kind: 'cli-pty',
  async isAvailable(ctx) { return ctx.hosts.pty.isAvailable('codex'); },
  async fetch(ctx) {
    const result = await ctx.hosts.pty.run({ command: 'codex', args: ['usage', '--json'], timeoutMs: 8_000 });
    if (result.exitCode !== 0) throw new Error(`codex usage exited ${result.exitCode}: ${result.stderr}`);
    return parseCodexCliUsage(JSON.parse(result.stdout), Date.now());
  },
  shouldFallback() { return true; },
};

// ---------------------------------------------------------------------------
// Strategy 4: Local config cache (~/.codex/usage_cache.json)
// ---------------------------------------------------------------------------
export const localConfigScan: ProviderFetchStrategy = {
  id: 'codex-local-config-scan',
  kind: 'local-config-scan',
  async isAvailable() { return existsSync(authCachePath()); },
  async fetch() {
    return parseCodexAuthCache(JSON.parse(readFileSync(authCachePath(), 'utf8')), Date.now());
  },
  shouldFallback() { return true; },
};
