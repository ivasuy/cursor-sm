import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const AGENT_PORT = Number(process.env.WORKTRACE_AGENT_PORT || 9315);
const AGENT_BASE = `http://127.0.0.1:${AGENT_PORT}`;

export async function ensureAgent(): Promise<void> {
  if (await isHealthy()) return;
  spawnAgent();
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    if (await isHealthy()) return;
  }
  throw new Error('Agent did not start within 6 seconds');
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function spawnAgent(): void {
  const pkgRoot = join(homedir(), '.worktrace');
  const agentServer =
    process.env.WORKTRACE_AGENT_PATH ??
    join(import.meta.dirname ?? '', '..', '..', 'agent', 'dist', 'server.js');
  if (!existsSync(agentServer)) {
    throw new Error(`Agent server.js not found at ${agentServer}`);
  }
  const child = spawn(process.execPath, [agentServer], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(AGENT_PORT) },
  });
  child.unref();
}

export async function agentGet<T>(path: string): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function agentPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function agentDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function agentPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
