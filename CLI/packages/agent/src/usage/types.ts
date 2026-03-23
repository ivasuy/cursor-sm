// ---------------------------------------------------------------------------
// Provider Usage Intelligence — shared types
// ---------------------------------------------------------------------------

/** Normalised usage snapshot returned by every adapter. */
export interface ProviderUsage {
  provider: string;
  displayName: string;
  plan: string | null;
  quotaUsed: number | null;
  quotaLimit: number | null;
  quotaRemaining: number | null;
  quotaUnit: string;                       // "requests" | "tokens" | "credits" | "dollars" | "percent"
  /** Secondary quota window (e.g. Opus limit, 5-hour rate, daily cap). */
  secondary: QuotaWindow | null;
  /** Tertiary quota window (e.g. Opus-specific weekly, Sonnet weekly). */
  tertiary: QuotaWindow | null;
  /** Credits balance (Codex credits, OpenRouter credits, etc.) */
  credits: { balance: number | null; unlimited: boolean; currency: string } | null;
  resetAt: string | null;                  // ISO 8601
  resetWindow: string | null;              // "daily" | "weekly" | "monthly" | "5h" | "billing-cycle"
  costUsd: number | null;
  status: 'ok' | 'warning' | 'exhausted' | 'unknown' | 'error';
  lastFetched: string;                     // ISO 8601
  error: string | null;
}

export interface QuotaWindow {
  label: string;                           // e.g. "Opus", "5-hour rate", "daily"
  used: number | null;
  limit: number | null;
  remaining: number | null;
  unit: string;
  resetAt: string | null;
}

/** What this adapter can do on the current OS. */
export interface AdapterCapabilities {
  canFetchQuota: boolean;
  canFetchCost: boolean;
  canFetchPlan: boolean;
  canFetchResetWindow: boolean;
  canRefreshAuth: boolean;
  requiresBrowser: boolean;
  requiresCli: boolean;
  platformSupport: 'full' | 'partial' | 'unsupported';
  missingDependencies: string[];
}

/** Per-provider user configuration. */
export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  projectId?: string;
  cookieSource?: 'auto' | 'manual' | 'off';
  manualCookie?: string;
  extraOptions?: Record<string, unknown>;
}

/** Top-level usage configuration stored in ~/.worktrace/config.json. */
export interface UsageConfig {
  enabled: boolean;
  pollIntervalMs: number;                  // default 300_000 (5 min)
  providers: Record<string, ProviderConfig>;
}

/** Cached entry with TTL. */
export interface CacheEntry {
  usage: ProviderUsage;
  expiresAt: number;                       // Date.now() + ttlMs
}

export type ProviderID =
  | 'codex' | 'claude' | 'cursor' | 'gemini'
  | 'antigravity' | 'droid' | 'copilot' | 'zai'
  | 'kimi' | 'kimi-k2' | 'kiro' | 'vertex'
  | 'augment' | 'amp' | 'jetbrains' | 'openrouter';

export const ALL_PROVIDER_IDS: ProviderID[] = [
  'codex', 'claude', 'cursor', 'gemini',
  'antigravity', 'droid', 'copilot', 'zai',
  'kimi', 'kimi-k2', 'kiro', 'vertex',
  'augment', 'amp', 'jetbrains', 'openrouter',
];

/** Default config: auto-enable popular providers, disable niche ones. */
export function defaultUsageConfig(): UsageConfig {
  return {
    enabled: true,
    pollIntervalMs: 300_000,
    providers: {
      codex:        { enabled: true },
      claude:       { enabled: true },
      cursor:       { enabled: true },
      gemini:       { enabled: true },
      copilot:      { enabled: true },
      'kimi-k2':    { enabled: false },
      kimi:         { enabled: false },
      kiro:         { enabled: true },
      vertex:       { enabled: false },
      jetbrains:    { enabled: true },
      openrouter:   { enabled: false },
      zai:          { enabled: false },
      antigravity:  { enabled: false },
      droid:        { enabled: false },
      augment:      { enabled: false },
      amp:          { enabled: false },
    },
  };
}
