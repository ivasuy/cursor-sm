import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { ProviderFetchStrategy, UsageSnapshot } from '../_shared/types.js';
import { parseUsageSummary, parseCursorConfig } from './parser.js';

// Cookie names accepted by Cursor for authentication
const CURSOR_COOKIE_NAMES = [
  'WorkosCursorSessionToken',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
];

const CURSOR_COOKIE_DOMAIN = 'cursor.com';

// ---------------------------------------------------------------------------
// Strategy 1: cookies-http — live API data (Auto%, API%, billing cycle)
// ---------------------------------------------------------------------------
export const cookiesHttp: ProviderFetchStrategy = {
  id: 'cursor-cookies-http',
  kind: 'cookies-http',
  async isAvailable(ctx) {
    const cookie = await ctx.hosts.browserCookies.extractCookie(CURSOR_COOKIE_DOMAIN, CURSOR_COOKIE_NAMES);
    return cookie !== null;
  },
  async fetch(ctx): Promise<UsageSnapshot> {
    const rawCookie = await ctx.hosts.browserCookies.extractCookie(CURSOR_COOKIE_DOMAIN, CURSOR_COOKIE_NAMES);
    if (!rawCookie) throw new Error('cursor session cookie not found');

    // Strip any garbage prefix before the actual token (url-encoded format)
    const token = extractCleanToken(rawCookie);
    const cookieHeader = `WorkosCursorSessionToken=${token}`;

    const HEADERS = {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
    };

    // Fetch usage-summary (plan %, auto%, API%, billing cycle)
    const summaryRes = await ctx.hosts.http.request({
      url: 'https://cursor.com/api/usage-summary',
      headers: HEADERS,
      timeoutMs: 10_000,
      retries: 1,
    });
    if (summaryRes.status === 401 || summaryRes.status === 403) {
      throw new Error(`cursor cookie rejected (${summaryRes.status}) — re-login in browser`);
    }

    const snapshot = parseUsageSummary(summaryRes.body, Date.now());

    // Enrich with email from /api/auth/me
    try {
      const meRes = await ctx.hosts.http.request<{ email?: string; name?: string }>({
        url: 'https://cursor.com/api/auth/me',
        headers: HEADERS,
        timeoutMs: 6_000,
      });
      if (meRes.body?.email) {
        snapshot.identity = { ...snapshot.identity, email: meRes.body.email };
      }
    } catch { /* email is nice-to-have */ }

    return snapshot;
  },
  shouldFallback(err) {
    return !err.message.includes('cookie rejected');
  },
};

// Strip garbled prefix bytes that appear before the token in some Chrome decryptions
function extractCleanToken(raw: string): string {
  // Token starts with "user_" followed by the WorkOS user ID
  const idx = raw.indexOf('user_');
  return idx >= 0 ? raw.slice(idx) : raw;
}

// ---------------------------------------------------------------------------
// Strategy 2: local state.vscdb — offline fallback (lines accepted, identity)
// ---------------------------------------------------------------------------
function resolveVscdbPath(): string | null {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  }
  if (process.platform === 'linux') {
    return join(home, '.config/Cursor/User/globalStorage/state.vscdb');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData/Roaming');
    return join(appData, 'Cursor/User/globalStorage/state.vscdb');
  }
  return null;
}

interface VscdbRow { value: string }

function readVscdbKey(db: InstanceType<typeof Database>, key: string): string | null {
  const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key) as VscdbRow | undefined;
  return row?.value ?? null;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface DailyStats {
  date: string;
  tabSuggestedLines?: number;
  tabAcceptedLines?: number;
  composerSuggestedLines?: number;
  composerAcceptedLines?: number;
}

const PLAN_FAST_LIMITS: Record<string, number> = {
  pro: 500, business: 500, enterprise: 1000, free: 50, team: 500,
};

export const localConfigScan: ProviderFetchStrategy = {
  id: 'cursor-local-config-scan',
  kind: 'local-config-scan',
  async isAvailable() {
    const path = resolveVscdbPath();
    return Boolean(path && existsSync(path));
  },
  async fetch(): Promise<UsageSnapshot> {
    const dbPath = resolveVscdbPath();
    if (!dbPath) throw new Error('cursor vscdb path could not be resolved');

    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const email = readVscdbKey(db, 'cursorAuth/cachedEmail') ?? undefined;
      const planRaw = (readVscdbKey(db, 'cursorAuth/stripeMembershipType') ?? 'free').toLowerCase();
      const subscriptionStatus = readVscdbKey(db, 'cursorAuth/stripeSubscriptionStatus');

      // Decode JWT for more identity info
      const accessToken = readVscdbKey(db, 'cursorAuth/accessToken');
      let jwtEmail: string | undefined;
      if (accessToken) {
        const payload = decodeJwtPayload(accessToken);
        jwtEmail = typeof payload['email'] === 'string' ? payload['email'] : undefined;
      }

      // Aggregate all aiCodeTracking daily stats
      const allKeys = (db.prepare("SELECT key FROM ItemTable WHERE key LIKE 'aiCodeTracking.dailyStats%'")
        .all() as Array<{ key: string }>).map((r) => r.key);

      const today = new Date().toISOString().slice(0, 10);
      const cutoff30d = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

      let todayAccepted = 0, todaySuggested = 0;
      let last30dAccepted = 0, activeDays = 0;

      for (const key of allKeys) {
        const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})$/);
        if (!dateMatch || dateMatch[1] < cutoff30d) continue;
        const rawVal = readVscdbKey(db, key);
        if (!rawVal) continue;
        const stats = JSON.parse(rawVal) as DailyStats;
        const tab = stats.tabAcceptedLines ?? 0;
        const composer = stats.composerAcceptedLines ?? 0;
        const tabSug = stats.tabSuggestedLines ?? 0;
        const composerSug = stats.composerSuggestedLines ?? 0;
        if (dateMatch[1] === today) { todayAccepted = tab + composer; todaySuggested = tabSug + composerSug; }
        if (tab + composer > 0) activeDays++;
        last30dAccepted += tab + composer;
      }

      const acceptancePct = todaySuggested > 0 ? Math.min(100, Math.round((todayAccepted / todaySuggested) * 100)) : undefined;
      const fastCap = PLAN_FAST_LIMITS[planRaw in PLAN_FAST_LIMITS ? planRaw : 'free'];

      const nextMonth = new Date();
      nextMonth.setDate(1); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setHours(0, 0, 0, 0);

      return {
        session: { used: todayAccepted, cap: Math.max(todayAccepted || 1, 500), unit: 'requests', resetsAt: new Date(new Date().setHours(24, 0, 0, 0)) },
        weekly: { used: last30dAccepted, cap: Math.max(last30dAccepted || 1, 10_000), unit: 'requests', resetsAt: nextMonth },
        secondary: { used: activeDays, cap: 30, unit: 'requests', resetsAt: nextMonth },
        extraUsage: acceptancePct !== undefined ? { label: 'acceptance rate', used: acceptancePct, cap: 100, unit: '%' } : undefined,
        cost: { today: 0, last30d: 0, totalTokens: 0, todayTokens: todayAccepted },
        sessionCount: todayAccepted,
        updatedAt: new Date(),
        identity: {
          email: email ?? jwtEmail,
          plan: subscriptionStatus === 'active'
            ? `${planRaw.charAt(0).toUpperCase()}${planRaw.slice(1)} (active)`
            : planRaw,
        },
      };
    } finally {
      db.close();
    }
  },
  shouldFallback() { return true; },
};
