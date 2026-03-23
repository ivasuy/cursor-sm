// ---------------------------------------------------------------------------
// BaseAdapter — abstract class all 16 provider adapters extend
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import type { ProviderUsage, AdapterCapabilities, ProviderConfig, ProviderID } from '../types.js';

const execFileAsync = promisify(execFile);

export abstract class BaseAdapter {
  abstract readonly id: ProviderID;
  abstract readonly displayName: string;
  /** Cache TTL in ms — adapters with fast-changing data use shorter TTLs. */
  abstract readonly ttlMs: number;

  /** What this adapter can report on the current OS. */
  abstract capabilities(): AdapterCapabilities;

  /** Fetch usage — should throw on unrecoverable errors. */
  abstract fetch(config: ProviderConfig): Promise<ProviderUsage>;

  /** Quick check: is the provider likely installed / reachable? */
  abstract detect(): Promise<boolean>;

  // ── Helpers available to all adapters ─────────────────────────────────

  protected ok(partial: Omit<ProviderUsage, 'provider' | 'displayName' | 'lastFetched' | 'error' | 'tertiary' | 'credits'> & { tertiary?: ProviderUsage['tertiary']; credits?: ProviderUsage['credits'] }): ProviderUsage {
    return {
      tertiary: null,
      credits: null,
      ...partial,
      provider: this.id,
      displayName: this.displayName,
      lastFetched: new Date().toISOString(),
      error: null,
    };
  }

  protected err(message: string): ProviderUsage {
    return {
      provider: this.id,
      displayName: this.displayName,
      plan: null,
      quotaUsed: null,
      quotaLimit: null,
      quotaRemaining: null,
      quotaUnit: 'requests',
      secondary: null,
      tertiary: null,
      credits: null,
      resetAt: null,
      resetWindow: null,
      costUsd: null,
      status: 'error',
      lastFetched: new Date().toISOString(),
      error: message,
    };
  }

  /** Derive status from quota numbers. */
  protected deriveStatus(used: number | null, limit: number | null): ProviderUsage['status'] {
    if (used === null || limit === null) return 'unknown';
    if (limit === 0) return 'unknown';
    const pct = used / limit;
    if (pct >= 1) return 'exhausted';
    if (pct >= 0.8) return 'warning';
    return 'ok';
  }

  /** Run a CLI command safely (execFile, no shell) and return stdout, or null on failure. */
  protected async exec(cmd: string, args: string[], timeoutMs = 10_000): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        env: { ...process.env, NO_COLOR: '1' },
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /** Check if a CLI binary exists on PATH. */
  protected async which(bin: string): Promise<string | null> {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return this.exec(cmd, [bin], 3_000);
  }

  /** Read a file, return null if not found. */
  protected async readFileSafe(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /** Safe JSON parse. */
  protected parseJson<T = unknown>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** HTTP GET with timeout. */
  protected async httpGet<T = unknown>(url: string, headers?: Record<string, string>): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return await res.json() as T;
    } catch {
      return null;
    }
  }

  /** HTTP POST with timeout. */
  protected async httpPost<T = unknown>(url: string, body: unknown, headers?: Record<string, string>): Promise<T | null> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return await res.json() as T;
    } catch {
      return null;
    }
  }
}
