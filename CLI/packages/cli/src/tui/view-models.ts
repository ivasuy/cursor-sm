import type {
  FeatureSummary,
  FileSummary,
  PaceProvider,
  ProviderAmount,
  ProviderDetailResponse,
  RepoSummary,
  ReportResponse,
  WorktreeSummary,
} from '../types.js';
import type { WatchedRepo } from './data-client.js';

export interface SummaryCard {
  label: string;
  value: string;
}

export interface MeterViewModel {
  label: string;
  ratio: number;
  valueText: string;
}

export interface CommandDeckViewModel {
  cards: SummaryCard[];
  highlights: string[];
}

export interface ModuleRow {
  id: string;
  title: string;
  subtitle: string;
  stats: string[];
  bars: MeterViewModel[];
  details: string[];
}

export interface ListModuleViewModel {
  title: string;
  rows: ModuleRow[];
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatCurrency(value: number): string {
  return `$${value >= 100 ? value.toFixed(0) : value.toFixed(1)}`;
}

function formatProviderBreakdown(entries: ProviderAmount[]): string[] {
  if (entries.length === 0) return ['no provider-attributed usage'];
  return entries.map((entry) => `${entry.provider} ${formatAmount(entry.amount, entry.unit)}`);
}

function formatAmount(amount: number, unit: string): string {
  if (unit === 'credits') return formatCurrency(amount);
  if (unit === 'tokens') return `${formatTokens(amount)} tok`;
  if (unit === 'requests') return `${Math.round(amount)} req`;
  if (unit === 'messages') return `${Math.round(amount)} msg`;
  return `${amount.toFixed(1)} ${unit}`;
}

function buildProviderBars(provider: ProviderDetailResponse): MeterViewModel[] {
  const snapshot = provider.snapshot;
  if (!snapshot) return [];

  const quotaBars = [snapshot.weekly, snapshot.session, snapshot.secondary]
    .filter((bar): bar is NonNullable<typeof bar> => Boolean(bar))
    .map((bar) => ({
      label: bar.label ?? 'quota',
      ratio: bar.cap > 0 ? Math.max(0, Math.min(1, bar.used / bar.cap)) : 0,
      valueText: bar.unit === 'percent'
        ? `${(bar.used).toFixed(1)}%`
        : `${Math.round(bar.used)}/${Math.round(bar.cap)} ${bar.unit}`.trim(),
    }));

  if (snapshot.extraUsage) {
    quotaBars.push({
      label: snapshot.extraUsage.label,
      ratio: snapshot.extraUsage.cap > 0
        ? Math.max(0, Math.min(1, snapshot.extraUsage.used / snapshot.extraUsage.cap))
        : 0,
      valueText: snapshot.extraUsage.unit === 'percent'
        ? `${(snapshot.extraUsage.used).toFixed(1)}%`
        : `${Math.round(snapshot.extraUsage.used)}/${Math.round(snapshot.extraUsage.cap)} ${snapshot.extraUsage.unit}`.trim(),
    });
  }

  return quotaBars;
}

function buildProviderDetails(provider: ProviderDetailResponse): string[] {
  const snapshot = provider.snapshot;
  if (!snapshot) {
    return provider.error ? [provider.error] : ['provider not configured'];
  }

  const details: string[] = [];
  if (snapshot.cost?.totalTokens) {
    details.push(`${formatTokens(snapshot.cost.totalTokens)} total tokens`);
  }
  if (snapshot.cost?.today || snapshot.cost?.last30d) {
    details.push(`today ${formatCurrency(snapshot.cost?.today ?? 0)} | 30d ${formatCurrency(snapshot.cost?.last30d ?? 0)}`);
  }
  if (typeof snapshot.creditsRemainingUSD === 'number') {
    details.push(`credits remaining ${formatCurrency(snapshot.creditsRemainingUSD)}`);
  }
  if (snapshot.modelBreakdown?.length) {
    details.push(
      ...snapshot.modelBreakdown.slice(0, 3).map((model) =>
        `${model.model} ${formatTokens(model.tokens)} tok ${formatCurrency(model.costUSD)}`,
      ),
    );
  }
  return details;
}

export function buildCommandDeck(report: ReportResponse): CommandDeckViewModel {
  const liveProviderCount = report.providers.filter((provider) => provider.status === 'live').length;
  const totalSpend30d = report.providers.reduce(
    (sum, provider) => sum + (provider.snapshot?.cost?.last30d ?? 0),
    0,
  );
  const totalTokens = report.providers.reduce(
    (sum, provider) => sum + (provider.snapshot?.cost?.totalTokens ?? 0),
    0,
  );

  return {
    cards: [
      { label: 'tracked repos', value: String(report.repos.length) },
      { label: 'worktrees', value: String(report.worktrees.length) },
      { label: '30d spend', value: formatCurrency(totalSpend30d) },
      { label: 'tokens', value: formatTokens(totalTokens) },
    ],
    highlights: [
      `${liveProviderCount} live provider surfaces`,
      `${report.files.length} active files in the current report range`,
      `${report.pace.filter((item) => item.pace).length} pace signals computed`,
    ],
  };
}

function buildProviderStats(provider: ProviderDetailResponse): string[] {
  const snapshot = provider.snapshot;
  const planOrStatus = snapshot?.identity?.plan ?? provider.status;

  if (!snapshot) return [planOrStatus];

  const stats: string[] = [planOrStatus];

  if (snapshot.cost?.today || snapshot.cost?.last30d) {
    stats.push(`today ${formatCurrency(snapshot.cost.today ?? 0)} | 30d ${formatCurrency(snapshot.cost.last30d ?? 0)}`);
  } else if (typeof snapshot.costUSD === 'number' && snapshot.costUSD > 0) {
    stats.push(`cost ${formatCurrency(snapshot.costUSD)}`);
  } else if (typeof snapshot.creditsRemainingUSD === 'number') {
    stats.push(`${formatCurrency(snapshot.creditsRemainingUSD)} credits left`);
  } else if (typeof snapshot.inputTokens === 'number') {
    stats.push(`${formatTokens(snapshot.inputTokens)} tokens in`);
  } else {
    const primaryBar = snapshot.weekly ?? snapshot.session ?? snapshot.secondary;
    if (primaryBar) {
      const used = primaryBar.unit === 'percent'
        ? `${primaryBar.used.toFixed(1)}% used`
        : `${Math.round(primaryBar.used)}/${Math.round(primaryBar.cap)} ${primaryBar.unit}`;
      stats.push(used);
    }
  }

  return stats;
}

function buildPaceBars(pace: PaceProvider): MeterViewModel[] {
  if (!pace.pace) return [];
  return [{
    label: 'pace',
    ratio: Math.max(0, Math.min(1, pace.pace.actualPct / 100)),
    valueText: `${pace.pace.actualPct.toFixed(1)}% vs ${pace.pace.expectedPct.toFixed(1)}% expected`,
  }];
}

function buildPaceDetails(pace: PaceProvider): string[] {
  if (!pace.pace) return pace.error ? [`pace: ${pace.error}`] : ['pace: no signal'];
  const lines = [
    `status: ${pace.pace.status}  delta ${pace.pace.paceDelta.toFixed(1)}%`,
  ];
  if (pace.pace.etaAt) lines.push(`quota exhausts: ${new Date(pace.pace.etaAt).toLocaleString()}`);
  if (pace.quota) lines.push(`quota ${Math.round(pace.quota.used)}/${Math.round(pace.quota.limit)} ${pace.quota.unit}`);
  return lines;
}

export function buildProvidersModule(
  providers: ProviderDetailResponse[],
  pace: PaceProvider[] = [],
): ListModuleViewModel {
  const paceById = new Map(pace.map((p) => [p.id, p]));
  return {
    title: 'providers',
    rows: providers.map((provider) => {
      const providerPace = paceById.get(provider.descriptor.id);
      return {
        id: provider.descriptor.id,
        title: provider.descriptor.metadata.displayName,
        subtitle: provider.snapshot?.identity?.email ?? provider.snapshot?.identity?.username ?? provider.descriptor.metadata.vendor,
        stats: buildProviderStats(provider),
        bars: [
          ...buildProviderBars(provider),
          ...(providerPace ? buildPaceBars(providerPace) : []),
        ],
        details: [
          ...buildProviderDetails(provider),
          ...(providerPace ? buildPaceDetails(providerPace) : []),
        ],
      };
    }),
  };
}

function buildRepoRow(repo: RepoSummary): ModuleRow {
  const providerStat = repo.perProvider.length > 0
    ? `${repo.perProvider.length} provider${repo.perProvider.length !== 1 ? 's' : ''} active`
    : 'watching — no events yet';
  return {
    id: String(repo.repoId),
    title: repo.name,
    subtitle: repo.path,
    stats: [providerStat],
    bars: [],
    details: repo.perProvider.length > 0
      ? formatProviderBreakdown(repo.perProvider)
      : ['file events will appear once activity is detected'],
  };
}

function buildWorktreeRow(worktree: WorktreeSummary): ModuleRow {
  const usageDetails = worktree.perProvider.length > 0
    ? formatProviderBreakdown(worktree.perProvider)
    : ['no attributed usage in this period'];
  return {
    id: String(worktree.worktreeId),
    title: worktree.branch ?? 'HEAD',
    subtitle: worktree.path,
    stats: [
      worktree.isPrimary ? 'primary worktree' : 'linked worktree',
      worktree.perProvider.length > 0 ? `${worktree.perProvider.length} providers` : 'no usage',
    ],
    bars: [],
    details: usageDetails,
  };
}

function buildFeatureRow(feature: FeatureSummary): ModuleRow {
  return {
    id: `${feature.worktreeId}:${feature.branch}`,
    title: feature.branch,
    subtitle: feature.path,
    stats: [`repo ${feature.repoId}`, `${feature.perProvider.length} providers`],
    bars: [],
    details: formatProviderBreakdown(feature.perProvider),
  };
}

function buildFileRow(file: FileSummary): ModuleRow {
  return {
    id: file.path,
    title: file.path,
    subtitle: file.branch,
    stats: [`${file.eventCount} file events`],
    bars: [],
    details: [`worktree ${file.worktreeId}`],
  };
}

function buildPaceRow(item: PaceProvider): ModuleRow {
  return {
    id: item.id,
    title: item.displayName,
    subtitle: item.pace ? item.pace.status : 'no pace signal',
    stats: item.quota
      ? [`quota ${Math.round(item.quota.used)}/${Math.round(item.quota.limit)} ${item.quota.unit}`]
      : ['quota unavailable'],
    bars: item.pace
      ? [
          {
            label: 'actual vs expected',
            ratio: Math.max(0, Math.min(1, item.pace.actualPct / 100)),
            valueText: `${item.pace.actualPct.toFixed(1)}% vs ${item.pace.expectedPct.toFixed(1)}%`,
          },
        ]
      : [],
    details: item.pace
      ? [
          `pace delta ${item.pace.paceDelta.toFixed(1)}%`,
          item.pace.etaAt ? `eta ${new Date(item.pace.etaAt).toLocaleString()}` : 'eta unavailable',
        ]
      : [item.error ?? 'no pace signal'],
  };
}

export function buildReposModule(repos: RepoSummary[]): ListModuleViewModel {
  return { title: 'repos', rows: repos.map(buildRepoRow) };
}

export function buildWorktreesModule(worktrees: WorktreeSummary[]): ListModuleViewModel {
  return { title: 'worktrees', rows: worktrees.map(buildWorktreeRow) };
}

export function buildFeaturesModule(features: FeatureSummary[]): ListModuleViewModel {
  return { title: 'features', rows: features.map(buildFeatureRow) };
}

export function buildFilesModule(files: FileSummary[]): ListModuleViewModel {
  return { title: 'files', rows: files.map(buildFileRow) };
}

export function buildPaceModule(pace: PaceProvider[]): ListModuleViewModel {
  return { title: 'pace', rows: pace.map(buildPaceRow) };
}

export function buildWatchModule(watched: WatchedRepo[]): ListModuleViewModel {
  const repoRows: ModuleRow[] = watched.map((repo) => ({
    id: `repo:${repo.id}`,
    title: repo.name,
    subtitle: repo.path,
    stats: [
      `${repo.worktrees.length} worktree${repo.worktrees.length !== 1 ? 's' : ''}`,
      `added ${new Date(repo.addedAt).toLocaleDateString()}`,
    ],
    bars: [],
    details: [
      ...repo.worktrees.map((wt) =>
        wt.isPrimary ? `${wt.path}  [primary]` : `${wt.path}`,
      ),
      'press d to remove this workspace',
    ],
  }));

  repoRows.push({
    id: 'action:add',
    title: '+ add workspace',
    subtitle: 'press enter to watch a new directory',
    stats: [],
    bars: [],
    details: ['type the path of a git repo to start tracking it'],
  });

  return { title: 'watch', rows: repoRows };
}

export function buildSimpleListModule(
  title: string,
  rows: ModuleRow[],
): ListModuleViewModel {
  return { title, rows };
}
