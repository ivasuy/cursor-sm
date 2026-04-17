export interface ProviderAmount {
  provider: string;
  amount: number;
  unit: string;
}

export interface RepoSummary {
  repoId: number;
  name: string;
  path: string;
  perProvider: ProviderAmount[];
}

export interface WorktreeSummary {
  worktreeId: number;
  repoId: number;
  path: string;
  isPrimary: boolean;
  branch: string | null;
  perProvider: ProviderAmount[];
}

export interface FeatureSummary {
  branch: string;
  worktreeId: number;
  repoId: number;
  path: string;
  perProvider: ProviderAmount[];
}

export interface FileSummary {
  path: string;
  worktreeId: number;
  branch: string;
  eventCount: number;
}

export interface ProviderDescriptor {
  id: string;
  metadata: {
    displayName: string;
    vendor: string;
    category: string;
    website: string;
  };
  branding: {
    icon: string;
    accentColor: string;
  };
}

export interface QuotaBar {
  used: number;
  cap: number;
  unit: string;
  resetsAt: string | number | Date;
  label?: string;
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
  extraUsage?: {
    label: string;
    used: number;
    cap: number;
    unit: string;
  };
  cost?: { today: number; last30d: number; totalTokens: number; todayTokens?: number };
  sessionCount?: number;
  modelBreakdown?: ModelUsage[];
  updatedAt: string | number | Date;
  identity?: {
    email?: string;
    username?: string;
    plan?: string;
  };
}

export interface ProviderDetailResponse {
  descriptor: ProviderDescriptor;
  snapshot: UsageSnapshot | null;
  status: 'live' | 'coming-soon' | 'error';
  error?: string;
}

export interface ProvidersListResponse {
  providers: Array<{
    id: string;
    displayName: string;
    vendor: string;
    category: string;
    live: boolean;
  }>;
}

export interface UsageResponse {
  fetchedAt: number;
  providers: Array<
    | { id: string; status: 'ok'; snapshot: UsageSnapshot }
    | { id: string; status: 'error'; error: string }
  >;
}

export type PaceStatus = 'ahead' | 'on-track' | 'warning' | 'critical';

export interface PaceProvider {
  id: string;
  displayName: string;
  icon: string;
  pace: null | {
    expectedPct: number;
    actualPct: number;
    paceDelta: number;
    status: PaceStatus;
    burnRatePerMs: number;
    runwayMs: number | null;
    etaAt: number | null;
  };
  quota: null | {
    used: number;
    limit: number;
    unit: string;
    resetsAt: number;
  };
  error?: string;
}

export interface PaceResponse {
  fetchedAt: number;
  providers: PaceProvider[];
}

export interface ReportResponse {
  fetchedAt: number;
  range: { since: number; until: number };
  providers: ProviderDetailResponse[];
  repos: RepoSummary[];
  worktrees: WorktreeSummary[];
  features: FeatureSummary[];
  files: FileSummary[];
  pace: PaceProvider[];
}
