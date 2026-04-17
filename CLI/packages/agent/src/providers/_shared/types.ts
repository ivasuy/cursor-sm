export type ProviderId = 'claude' | 'cursor' | 'codex';

export const ALL_PROVIDER_IDS: readonly ProviderId[] = [
  'claude', 'cursor', 'codex',
] as const;

export type FetchKind =
  | 'cli-rpc' | 'cli-pty' | 'oauth-http' | 'apikey-http'
  | 'cookies-http' | 'playwright-scrape' | 'local-log-scan'
  | 'local-config-scan' | 'keychain' | 'lsp-probe';

export type ProviderCategory = 'ide' | 'cli' | 'api' | 'cloud';

export interface ProviderMetadata {
  displayName: string;
  vendor: string;
  category: ProviderCategory;
  website: string;
}

export interface ProviderBranding {
  icon: string;
  accentColor: string;
}

export interface ProviderCapabilities {
  quotaBar: boolean;
  tokenBreakdown: boolean;
  costTracking: boolean;
  creditsBalance: boolean;
  sessionUsage: boolean;
  modelSelection: boolean;
}

export type QuotaUnit = 'requests' | 'tokens' | 'credits' | 'minutes';

export interface QuotaBar {
  used: number;
  cap: number;
  unit: QuotaUnit;
  resetsAt: Date;
  label?: string; // e.g. "5h window", "weekly", "auto+composer", "api usage", "total usage"
}

export interface ExtraUsageBar {
  label: string;
  used: number;
  cap: number;
  unit: string;
}

export interface ProviderIdentity {
  email?: string;
  username?: string;
  plan?: string;
}

export interface UsageCostSummary {
  today: number;
  last30d: number;
  totalTokens: number;
  todayTokens?: number;
}

export interface ModelUsage {
  model: string;
  tokens: number;
  costUSD: number;
}

export interface UsageSnapshot {
  session?: QuotaBar;
  weekly?: QuotaBar;
  secondary?: QuotaBar;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  creditsRemainingUSD?: number;
  extraUsage?: ExtraUsageBar;
  cost?: UsageCostSummary;
  sessionCount?: number;
  modelBreakdown?: ModelUsage[];
  updatedAt: Date;
  identity?: ProviderIdentity;
}

export interface ProviderCLIConfig {
  listLabel: string;
  detailSections: string[];
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface HostAPIs {
  readonly http: import('../_host/http.js').HttpHost;
  readonly pty: import('../_host/pty.js').PtyHost;
  readonly keychain: import('../_host/keychain.js').KeychainHost;
  readonly browserCookies: import('../_host/browser-cookies.js').BrowserCookiesHost;
  readonly tokenCost: import('../_host/token-cost.js').TokenCostHost;
  readonly status: import('../_host/status.js').StatusHost;
  readonly processSampler: import('../_host/process-sampler.js').ProcessSamplerHost;
  readonly playwright: import('../_host/playwright.js').PlaywrightHost;
  readonly logger: Logger;
}

export interface FetchContext {
  readonly timeout: number;
  readonly cacheTTL: number;
  readonly logger: Logger;
  readonly hosts: HostAPIs;
}

export type FetchAttemptStatus = 'ok' | 'unavailable' | 'error';

export interface FetchAttempt {
  id: string;
  status: FetchAttemptStatus;
  error?: Error;
}

export interface ProviderFetchOutcome {
  snapshot: UsageSnapshot;
  attempts: FetchAttempt[];
  sourceLabel: FetchKind;
}

export interface ProviderFetchStrategy {
  readonly id: string;
  readonly kind: FetchKind;
  isAvailable(ctx: FetchContext): Promise<boolean>;
  fetch(ctx: FetchContext): Promise<UsageSnapshot>;
  shouldFallback(err: Error, ctx: FetchContext): boolean;
}

export interface StrategyPipeline {
  resolveStrategies(ctx: FetchContext): ProviderFetchStrategy[];
}

export interface ProviderFetchPlan {
  pipeline: StrategyPipeline;
  sampleIntervalMs: number;
  cacheMaxAgeMs: number;
}

export interface ProviderDescriptor {
  id: ProviderId;
  metadata: ProviderMetadata;
  branding: ProviderBranding;
  capabilities: ProviderCapabilities;
  fetchPlan: ProviderFetchPlan;
  cli: ProviderCLIConfig;
}

export class AllStrategiesFailedError extends Error {
  readonly allUnavailable: boolean;
  constructor(readonly providerId: ProviderId, readonly attempts: FetchAttempt[]) {
    super(`All strategies failed for provider ${providerId}`);
    this.name = 'AllStrategiesFailedError';
    this.allUnavailable = attempts.length > 0 && attempts.every((a) => a.status === 'unavailable');
  }
}

export class TimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}
