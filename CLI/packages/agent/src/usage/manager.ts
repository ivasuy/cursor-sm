// ---------------------------------------------------------------------------
// UsageManager — orchestrates all provider adapters, caching, and polling
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { ProviderUsage, UsageConfig, ProviderConfig, ProviderID, AdapterCapabilities } from './types.js';
import { defaultUsageConfig, ALL_PROVIDER_IDS } from './types.js';
import { getCached, setCache, getAllCached, clearCache } from './cache.js';
import { worktraceDir } from './platform/paths.js';
import { BaseAdapter } from './adapters/base.js';

// Import all adapters
import { CodexAdapter } from './adapters/codex.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { CursorAdapter } from './adapters/cursor.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { AntigravityAdapter } from './adapters/antigravity.js';
import { DroidAdapter } from './adapters/droid.js';
import { CopilotAdapter } from './adapters/copilot.js';
import { ZaiAdapter } from './adapters/zai.js';
import { KimiAdapter } from './adapters/kimi.js';
import { KimiK2Adapter } from './adapters/kimi-k2.js';
import { KiroAdapter } from './adapters/kiro.js';
import { VertexAdapter } from './adapters/vertex.js';
import { AugmentAdapter } from './adapters/augment.js';
import { AmpAdapter } from './adapters/amp.js';
import { JetBrainsAdapter } from './adapters/jetbrains.js';
import { OpenRouterAdapter } from './adapters/openrouter.js';

// ── Adapter registry ────────────────────────────────────────────────────

const adapters: Map<ProviderID, BaseAdapter> = new Map();

function registerAll(): void {
  const all: BaseAdapter[] = [
    new CodexAdapter(),
    new ClaudeAdapter(),
    new CursorAdapter(),
    new GeminiAdapter(),
    new AntigravityAdapter(),
    new DroidAdapter(),
    new CopilotAdapter(),
    new ZaiAdapter(),
    new KimiAdapter(),
    new KimiK2Adapter(),
    new KiroAdapter(),
    new VertexAdapter(),
    new AugmentAdapter(),
    new AmpAdapter(),
    new JetBrainsAdapter(),
    new OpenRouterAdapter(),
  ];
  for (const a of all) adapters.set(a.id, a);
}

registerAll();

// ── Config management ───────────────────────────────────────────────────

const CONFIG_PATH = () => `${worktraceDir()}/config.json`;

interface FullConfig {
  usage?: UsageConfig;
  [key: string]: unknown;
}

async function loadFullConfig(): Promise<FullConfig> {
  try {
    const raw = await readFile(CONFIG_PATH(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveFullConfig(config: FullConfig): Promise<void> {
  await mkdir(worktraceDir(), { recursive: true });
  await writeFile(CONFIG_PATH(), JSON.stringify(config, null, 2));
}

export async function getUsageConfig(): Promise<UsageConfig> {
  const full = await loadFullConfig();
  return { ...defaultUsageConfig(), ...full.usage };
}

export async function updateUsageConfig(patch: Partial<UsageConfig>): Promise<UsageConfig> {
  const full = await loadFullConfig();
  const current = { ...defaultUsageConfig(), ...full.usage };
  const updated = { ...current, ...patch };
  if (patch.providers) {
    updated.providers = { ...current.providers, ...patch.providers };
  }
  full.usage = updated;
  await saveFullConfig(full);
  return updated;
}

// ── Fetching ────────────────────────────────────────────────────────────

/** Fetch usage for a single provider (uses cache if fresh). */
export async function fetchProvider(id: ProviderID, force = false): Promise<ProviderUsage> {
  const adapter = adapters.get(id);
  if (!adapter) {
    return {
      provider: id,
      displayName: id,
      plan: null, quotaUsed: null, quotaLimit: null, quotaRemaining: null,
      quotaUnit: 'requests', secondary: null, tertiary: null, credits: null,
      resetAt: null, resetWindow: null,
      costUsd: null, status: 'error', lastFetched: new Date().toISOString(),
      error: `Unknown provider: ${id}`,
    };
  }

  if (!force) {
    const cached = await getCached(id);
    if (cached) return cached;
  }

  const config = await getUsageConfig();
  const providerConfig: ProviderConfig = config.providers[id] || { enabled: true };

  try {
    const usage = await adapter.fetch(providerConfig);
    await setCache(id, usage, adapter.ttlMs);
    return usage;
  } catch (err) {
    const errUsage: ProviderUsage = {
      provider: id,
      displayName: adapter.displayName,
      plan: null, quotaUsed: null, quotaLimit: null, quotaRemaining: null,
      quotaUnit: 'requests', secondary: null, tertiary: null, credits: null,
      resetAt: null, resetWindow: null,
      costUsd: null, status: 'error', lastFetched: new Date().toISOString(),
      error: (err as Error).message,
    };
    await setCache(id, errUsage, 30_000); // cache errors briefly
    return errUsage;
  }
}

/** Fetch all enabled AND installed providers (uses cache where fresh). */
export async function fetchAll(force = false): Promise<ProviderUsage[]> {
  const config = await getUsageConfig();
  if (!config.enabled) return [];

  // Only fetch providers that are enabled AND actually installed on this machine
  const enabled = ALL_PROVIDER_IDS.filter(id => config.providers[id]?.enabled !== false);
  if (force) detectedCache = null; // re-scan on forced refresh
  const installed = await filterInstalled(enabled);

  const results = await Promise.allSettled(
    installed.map(id => fetchProvider(id, force)),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      provider: installed[i],
      displayName: installed[i],
      plan: null, quotaUsed: null, quotaLimit: null, quotaRemaining: null,
      quotaUnit: 'requests', secondary: null, tertiary: null, credits: null,
      resetAt: null, resetWindow: null,
      costUsd: null, status: 'error' as const, lastFetched: new Date().toISOString(),
      error: (r.reason as Error)?.message || 'Unknown error',
    };
  });
}

// ── Detection cache ──────────────────────────────────────────────────────
// Cache detected providers for 5 minutes to avoid running detect() on every poll
let detectedCache: { ids: ProviderID[]; expiresAt: number } | null = null;
const DETECT_TTL = 300_000;

/** Run detect() on each provider and return only those that are installed. */
async function filterInstalled(candidates: ProviderID[]): Promise<ProviderID[]> {
  if (detectedCache && detectedCache.expiresAt > Date.now()) {
    return candidates.filter(id => detectedCache!.ids.includes(id));
  }

  const detected: ProviderID[] = [];
  await Promise.allSettled(
    candidates.map(async id => {
      const adapter = adapters.get(id);
      if (adapter && await adapter.detect()) detected.push(id);
    }),
  );

  detectedCache = { ids: detected, expiresAt: Date.now() + DETECT_TTL };
  return detected;
}

/** Get all cached results without fetching. */
export async function getAllCachedUsage(): Promise<Record<string, ProviderUsage>> {
  return getAllCached();
}

/** Get adapter capabilities for all providers. */
export function getAdapterInfo(): Array<{ id: ProviderID; displayName: string; capabilities: AdapterCapabilities }> {
  return Array.from(adapters.entries()).map(([id, adapter]) => ({
    id,
    displayName: adapter.displayName,
    capabilities: adapter.capabilities(),
  }));
}

/** Auto-detect which providers are installed. */
export async function autoDetect(): Promise<ProviderID[]> {
  // Invalidate detection cache so we get a fresh scan
  detectedCache = null;

  const detected: ProviderID[] = [];
  await Promise.allSettled(
    Array.from(adapters.entries()).map(async ([id, adapter]) => {
      const found = await adapter.detect();
      if (found) detected.push(id);
    }),
  );

  detectedCache = { ids: detected, expiresAt: Date.now() + DETECT_TTL };
  return detected;
}

// ── Background polling ──────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function startPolling(): Promise<void> {
  if (pollTimer) return;
  const config = await getUsageConfig();
  if (!config.enabled) return;

  // Initial fetch
  fetchAll().catch(() => {}); // fire and forget

  pollTimer = setInterval(async () => {
    try {
      await fetchAll();
    } catch { /* swallow polling errors */ }
  }, config.pollIntervalMs);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export { clearCache };
