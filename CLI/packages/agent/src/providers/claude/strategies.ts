import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderFetchStrategy, UsageSnapshot, ModelUsage } from '../_shared/types.js';
import { parseClaudeWebUsage, parseApiKeyResponse } from './parser.js';

const CLAUDE_COOKIE_DOMAIN = 'claude.ai';
const CLAUDE_SESSION_COOKIE = 'sessionKey';

const CLAUDE_WEB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'anthropic-client-sha': 'worktrace',
};

// ---------------------------------------------------------------------------
// Strategy 1: cookies-http  →  claude.ai/api (five_hour, seven_day, extra_usage)
// ---------------------------------------------------------------------------
export const cookiesHttp: ProviderFetchStrategy = {
  id: 'claude-cookies-http',
  kind: 'cookies-http',
  async isAvailable(ctx) {
    const sk = await ctx.hosts.browserCookies.extractCookie(CLAUDE_COOKIE_DOMAIN, [CLAUDE_SESSION_COOKIE]);
    return sk !== null && sk.startsWith('sk-ant');
  },
  async fetch(ctx): Promise<UsageSnapshot> {
    const sk = await ctx.hosts.browserCookies.extractCookie(CLAUDE_COOKIE_DOMAIN, [CLAUDE_SESSION_COOKIE]);
    if (!sk) throw new Error('claude sessionKey cookie not found');

    const headers = { ...CLAUDE_WEB_HEADERS, 'Cookie': `sessionKey=${sk}` };

    // 1) Get org UUID
    const orgsRes = await ctx.hosts.http.request<Array<{ uuid: string; capabilities?: string[]; rate_limit_tier?: string }>>({
      url: 'https://claude.ai/api/organizations',
      headers,
      timeoutMs: 10_000,
    });
    if (orgsRes.status === 401 || orgsRes.status === 403) {
      throw new Error(`claude cookie rejected (${orgsRes.status}) — re-login in browser`);
    }
    const orgs = Array.isArray(orgsRes.body) ? orgsRes.body : [];
    if (orgs.length === 0) throw new Error('claude: no organizations returned');
    const org = orgs[0];
    const orgId = org.uuid;

    // 2) Get usage
    const usageRes = await ctx.hosts.http.request({
      url: `https://claude.ai/api/organizations/${orgId}/usage`,
      headers,
      timeoutMs: 10_000,
    });
    const snapshot = parseClaudeWebUsage(usageRes.body, Date.now());

    // 3) Get account info
    try {
      const accountRes = await ctx.hosts.http.request<{ email?: string; display_name?: string }>({
        url: 'https://claude.ai/api/account',
        headers,
        timeoutMs: 6_000,
      });
      if (accountRes.body?.email) {
        snapshot.identity = { email: accountRes.body.email, plan: org.rate_limit_tier ?? undefined };
      }
    } catch { /* email is nice-to-have */ }

    return snapshot;
  },
  shouldFallback(err) {
    return !err.message.includes('cookie rejected');
  },
};

// ---------------------------------------------------------------------------
// Strategy 2: apikey-http  →  api.anthropic.com/v1/organizations/usage
// ---------------------------------------------------------------------------
const ANTHROPIC_USAGE_URL = 'https://api.anthropic.com/v1/organizations/usage';

export const apiKeyHttp: ProviderFetchStrategy = {
  id: 'claude-apikey-http',
  kind: 'apikey-http',
  async isAvailable() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
  async fetch(ctx) {
    const key = process.env.ANTHROPIC_API_KEY!;
    const res = await ctx.hosts.http.request({
      url: ANTHROPIC_USAGE_URL,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      timeoutMs: 10_000,
      retries: 1,
    });
    return parseApiKeyResponse(res.body, Date.now());
  },
  shouldFallback() { return true; },
};

// ---------------------------------------------------------------------------
// Strategy 3: local log scan  →  ~/.claude/metrics/costs.jsonl + project dirs
// ---------------------------------------------------------------------------
function metricsPath(): string {
  return join(homedir(), '.claude', 'metrics', 'costs.jsonl');
}

function projectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

interface CostEntry {
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

function parseMetrics(): CostEntry[] {
  if (!existsSync(metricsPath())) return [];
  return readFileSync(metricsPath(), 'utf8').split('\n').filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as CostEntry; } catch { return null; } })
    .filter((e): e is CostEntry => e !== null);
}

function countSessionsFromProjects(sincePrefix: string): number {
  const dir = projectsDir();
  if (!existsSync(dir)) return 0;
  let count = 0;
  const sinceMs = Date.parse(sincePrefix);
  for (const proj of readdirSync(dir)) {
    const projPath = join(dir, proj);
    try {
      if (!statSync(projPath).isDirectory()) continue;
      for (const file of readdirSync(projPath)) {
        if (!file.endsWith('.jsonl')) continue;
        if (statSync(join(projPath, file)).mtimeMs >= sinceMs) count++;
      }
    } catch { continue; }
  }
  return count;
}

export const localLogScan: ProviderFetchStrategy = {
  id: 'claude-local-log-scan',
  kind: 'local-log-scan',
  async isAvailable() {
    return existsSync(metricsPath()) || existsSync(projectsDir());
  },
  async fetch(): Promise<UsageSnapshot> {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff30d = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const entries = parseMetrics();

    const modelMap = new Map<string, { inputTokens: number; outputTokens: number; costUSD: number }>();
    let todayInput = 0, todayOutput = 0, todayCost = 0;
    let last30dInput = 0, last30dOutput = 0, last30dCost = 0;

    for (const e of entries) {
      const day = e.timestamp?.slice(0, 10);
      if (!day || day < cutoff30d) continue;
      const m = e.model || 'unknown';
      if (!modelMap.has(m)) modelMap.set(m, { inputTokens: 0, outputTokens: 0, costUSD: 0 });
      const rec = modelMap.get(m)!;
      rec.inputTokens += e.input_tokens ?? 0;
      rec.outputTokens += e.output_tokens ?? 0;
      rec.costUSD += e.estimated_cost_usd ?? 0;
      last30dInput += e.input_tokens ?? 0;
      last30dOutput += e.output_tokens ?? 0;
      last30dCost += e.estimated_cost_usd ?? 0;
      if (day === today) {
        todayInput += e.input_tokens ?? 0;
        todayOutput += e.output_tokens ?? 0;
        todayCost += e.estimated_cost_usd ?? 0;
      }
    }

    const modelBreakdown: ModelUsage[] = Array.from(modelMap.entries())
      .map(([model, v]) => ({ model, tokens: v.inputTokens + v.outputTokens, costUSD: v.costUSD }))
      .filter((m) => m.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);

    const sessionsToday = countSessionsFromProjects(today);
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);

    return {
      session: {
        used: sessionsToday,
        cap: Math.max(sessionsToday || 1, 50),
        unit: 'requests',
        resetsAt: midnight,
      },
      inputTokens: todayInput || undefined,
      outputTokens: todayOutput || undefined,
      costUSD: todayCost || undefined,
      sessionCount: sessionsToday,
      modelBreakdown: modelBreakdown.length > 0 ? modelBreakdown : undefined,
      cost: {
        today: todayCost,
        last30d: last30dCost,
        totalTokens: last30dInput + last30dOutput,
        todayTokens: todayInput + todayOutput,
      },
      updatedAt: new Date(),
    };
  },
  shouldFallback() { return true; },
};

// ---------------------------------------------------------------------------
// Strategy 4: cli-pty  →  claude usage --json
// ---------------------------------------------------------------------------
export const cliPty: ProviderFetchStrategy = {
  id: 'claude-cli-pty',
  kind: 'cli-pty',
  async isAvailable(ctx) { return ctx.hosts.pty.isAvailable('claude'); },
  async fetch(ctx) {
    const result = await ctx.hosts.pty.run({ command: 'claude', args: ['usage', '--json'], timeoutMs: 8_000 });
    if (result.exitCode !== 0) throw new Error(`claude usage exited ${result.exitCode}: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    return {
      session: typeof parsed.messages_used === 'number' && typeof parsed.messages_limit === 'number'
        ? { used: parsed.messages_used, cap: parsed.messages_limit, unit: 'requests' as const, resetsAt: new Date(parsed.period_end ?? Date.now()) }
        : undefined,
      inputTokens: typeof parsed.tokens_used === 'number' ? parsed.tokens_used : undefined,
      updatedAt: new Date(),
      identity: parsed.account ? { email: parsed.account, plan: parsed.plan } : undefined,
    };
  },
  shouldFallback() { return true; },
};
