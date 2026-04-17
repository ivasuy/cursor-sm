import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';

const AGENT_PORT = Number(process.env.WORKTRACE_AGENT_PORT || 9315);
const AGENT_BASE = `http://127.0.0.1:${AGENT_PORT}`;

export async function ensureAgent(context: vscode.ExtensionContext): Promise<void> {
  if (await isHealthy()) return;

  const configured = vscode.workspace.getConfiguration('worktrace').get<string>('agentPath');
  const fallback = path.join(context.extensionPath, '..', 'cli', 'packages', 'agent', 'dist', 'server.js');
  const agentPath = configured && configured.trim().length > 0 ? configured : fallback;

  const child = spawn(process.execPath, [agentPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(AGENT_PORT) },
  });
  child.unref();

  for (let i = 0; i < 25; i++) {
    await sleep(200);
    if (await isHealthy()) return;
  }
  throw new Error(`Unable to start worktrace-agent at ${agentPath}`);
}

export async function agentGet<T = unknown>(urlPath: string): Promise<T> {
  const response = await fetch(`${AGENT_BASE}${urlPath}`);
  if (!response.ok) {
    throw new Error(`GET ${urlPath} -> ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function agentPost<T = unknown>(urlPath: string, body: unknown): Promise<T> {
  const response = await fetch(`${AGENT_BASE}${urlPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${urlPath} -> ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function agentDelete<T = unknown>(urlPath: string): Promise<T> {
  const response = await fetch(`${AGENT_BASE}${urlPath}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE ${urlPath} -> ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function isHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${AGENT_BASE}/health`, {
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
