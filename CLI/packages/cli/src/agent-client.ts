import { ensureAgent, getAgentUrl } from '@worktrace/agent/daemon';

export async function agentFetch(path: string, options?: RequestInit): Promise<Response> {
  await ensureAgent();
  const url = `${getAgentUrl()}${path}`;
  const res = await fetch(url, options);
  return res;
}

export async function agentGet<T>(path: string): Promise<T> {
  const res = await agentFetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await agentFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await agentFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
