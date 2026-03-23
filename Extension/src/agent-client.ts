import { spawn } from "child_process";
import * as vscode from "vscode";
import * as path from "path";

const AGENT_PORT = 9315;
const AGENT_URL = `http://127.0.0.1:${AGENT_PORT}`;

export function getAgentUrl(): string {
  return AGENT_URL;
}

export async function ensureAgent(): Promise<void> {
  if (await isAgentHealthy()) return;

  const config = vscode.workspace.getConfiguration("worktrace");
  let agentPath = config.get<string>("agentPath") || "";

  if (!agentPath) {
    const extensionPath = vscode.extensions.getExtension("local.worktrace")?.extensionPath;
    if (extensionPath) {
      agentPath = path.join(extensionPath, "..", "CLI", "packages", "agent", "dist", "server.js");
    }
  }

  if (!agentPath) {
    throw new Error("Cannot find worktrace-agent. Set worktrace.agentPath in settings.");
  }

  const child = spawn(process.execPath, [agentPath], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(AGENT_PORT) },
  });
  child.unref();

  let delay = 100;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    if (await isAgentHealthy()) return;
    delay = Math.min(delay * 2, 1000);
  }

  throw new Error("Failed to start worktrace agent within 5 seconds.");
}

async function isAgentHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function agentGet<T>(urlPath: string): Promise<T> {
  const res = await fetch(`${AGENT_URL}${urlPath}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPost<T>(urlPath: string, body?: unknown): Promise<T> {
  const res = await fetch(`${AGENT_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPatch<T>(urlPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_URL}${urlPath}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function agentPostFireAndForget(urlPath: string, body?: unknown): void {
  fetch(`${AGENT_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {});
}
