import { ensureAgent, agentDelete, agentGet, agentPost } from '../agent-client.js';
import type {
  ProviderDetailResponse,
  ProvidersListResponse,
  ReportResponse,
} from '../types.js';

export interface WatchedWorktree {
  id: number;
  repoId: number;
  path: string;
  isPrimary: 0 | 1;
  detectedAt: number;
}

export interface WatchedRepo {
  id: number;
  path: string;
  name: string;
  addedAt: number;
  worktrees: WatchedWorktree[];
}

export async function loadShellData(period = '7d'): Promise<{
  report: ReportResponse;
  providers: ProviderDetailResponse[];
  watched: WatchedRepo[];
}> {
  await ensureAgent();

  const [report, providerList, watchedRes] = await Promise.all([
    agentGet<ReportResponse>(`/report?period=${encodeURIComponent(period)}`),
    agentGet<ProvidersListResponse>('/providers'),
    agentGet<{ repos: WatchedRepo[] }>('/watch'),
  ]);

  const providers = await Promise.all(
    providerList.providers.map((provider) =>
      agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(provider.id)}`),
    ),
  );

  return { report, providers, watched: watchedRes.repos };
}

export async function addWorkspace(path: string): Promise<WatchedRepo> {
  await ensureAgent();
  const res = await agentPost<{ repo: WatchedRepo }>('/watch', { path });
  return res.repo;
}

export async function removeWorkspace(path: string): Promise<void> {
  await ensureAgent();
  await agentDelete(`/watch?path=${encodeURIComponent(path)}`);
}

export async function startWatching(path: string): Promise<unknown> {
  await ensureAgent();
  return agentPost('/watch', { path });
}

export async function stopWatching(path: string): Promise<unknown> {
  await ensureAgent();
  return agentDelete(`/watch?path=${encodeURIComponent(path)}`);
}
