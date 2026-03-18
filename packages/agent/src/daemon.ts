import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKTRACE_DIR = path.join(os.homedir(), '.worktrace');
const PID_FILE = path.join(WORKTRACE_DIR, 'agent.pid');
const LOG_FILE = path.join(WORKTRACE_DIR, 'agent.log');
const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);

export function getAgentUrl(): string {
  return `http://127.0.0.1:${PORT}`;
}

export async function isAgentRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${getAgentUrl()}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json() as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function ensureAgent(): Promise<void> {
  if (await isAgentRunning()) return;

  await mkdir(WORKTRACE_DIR, { recursive: true });

  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js');
  const isWindows = process.platform === 'win32';

  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    ...(isWindows ? { shell: true } : {}),
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(PORT) },
  });

  child.unref();
  await writeFile(PID_FILE, String(child.pid));

  // Wait for agent to be ready (up to 3s)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (await isAgentRunning()) return;
  }

  throw new Error('Failed to start worktrace agent');
}
