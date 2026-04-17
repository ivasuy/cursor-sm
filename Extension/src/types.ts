export type PaceStatus = 'ahead' | 'on-track' | 'warning' | 'critical';

export interface QuotaBar {
  used: number;
  cap: number;
  unit: string;
  resetsAt: string | number;
  label?: string;
}

export interface ModelUsage {
  model: string;
  tokens: number;
  costUSD: number;
}

export interface ProviderSnapshot {
  session?: QuotaBar;
  weekly?: QuotaBar;
  secondary?: QuotaBar;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  creditsRemainingUSD?: number;
  cost?: { today: number; last30d: number; totalTokens: number; todayTokens?: number };
  sessionCount?: number;
  modelBreakdown?: ModelUsage[];
  extraUsage?: { label: string; used: number; cap: number; unit: string };
  updatedAt: string | number;
  identity?: { email?: string; username?: string; plan?: string };
}

export interface ProviderListRow {
  id: string;
  displayName: string;
  vendor: string;
  category: string;
  live: boolean;
  available?: boolean;
}

export interface ProviderListResponse {
  providers: ProviderListRow[];
}

export interface ProviderDetailResponse {
  descriptor: {
    id: string;
    metadata: { displayName: string; vendor: string; category: string; website: string };
    branding: { icon: string; accentColor: string };
  };
  snapshot: ProviderSnapshot | null;
  status: 'live' | 'coming-soon' | 'error';
  error?: string;
}

export interface PacePaceData {
  expectedPct: number;
  actualPct: number;
  paceDelta: number;
  status: PaceStatus;
  burnRatePerMs: number;
  runwayMs: number | null;
  etaAt: number | null;
}

export interface PaceProvider {
  id: string;
  displayName: string;
  icon: string;
  pace: PacePaceData | null;
  quota: { used: number; limit: number; unit: string; resetsAt: number } | null;
  error?: string;
}

export interface PaceResponse {
  fetchedAt: number;
  providers: PaceProvider[];
}
