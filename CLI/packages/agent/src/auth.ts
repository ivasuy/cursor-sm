import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import open from 'open';

const WORKTRACE_DIR = path.join(os.homedir(), '.worktrace');
const CREDENTIALS_FILE = path.join(WORKTRACE_DIR, 'credentials.json');
const CONFIG_FILE = path.join(WORKTRACE_DIR, 'config.json');

interface Credentials {
  idToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  expiresAt: number;
}

interface Config {
  backendUrl: string;
  firebaseApiKey?: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(WORKTRACE_DIR, { recursive: true });
}

export async function getConfig(): Promise<Config> {
  const defaultUrl = process.env.WORKTRACE_BACKEND_URL || 'http://localhost:3000';
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return { backendUrl: defaultUrl, ...JSON.parse(raw) };
  } catch {
    return { backendUrl: defaultUrl };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function getCredentials(): Promise<Credentials | null> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  await ensureDir();
  await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  try { await chmod(CREDENTIALS_FILE, 0o600); } catch { /* Windows no-op */ }
}

export async function clearCredentials(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(CREDENTIALS_FILE);
  } catch { /* file may not exist */ }
}

export async function isAuthenticated(): Promise<boolean> {
  const creds = await getCredentials();
  return creds !== null;
}

async function ensureFirebaseApiKey(): Promise<string> {
  const config = await getConfig();
  if (config.firebaseApiKey) return config.firebaseApiKey;
  const res = await fetch(`${config.backendUrl}/api/config`);
  const data = await res.json() as { firebaseApiKey?: string };
  if (data.firebaseApiKey) {
    config.firebaseApiKey = data.firebaseApiKey;
    await saveConfig(config);
    return data.firebaseApiKey;
  }
  throw new Error('Could not fetch Firebase API key from backend');
}

export async function refreshTokenIfNeeded(): Promise<string> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Not authenticated');
  if (Date.now() < creds.expiresAt - 60_000) return creds.idToken;

  const apiKey = await ensureFirebaseApiKey();
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${creds.refreshToken}`,
  });
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json() as { id_token: string; refresh_token: string; expires_in: string };
  creds.idToken = data.id_token;
  creds.refreshToken = data.refresh_token;
  creds.expiresAt = Date.now() + parseInt(data.expires_in, 10) * 1000;
  await saveCredentials(creds);
  return creds.idToken;
}

export async function callBackend(method: string, urlPath: string, body?: unknown): Promise<Response> {
  const config = await getConfig();
  const token = await refreshTokenIfNeeded();
  return fetch(`${config.backendUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function callBackendBuffer(method: string, urlPath: string, body?: unknown): Promise<Buffer> {
  const res = await callBackend(method, urlPath, body);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function login(): Promise<{ email: string; userId: string }> {
  const config = await getConfig();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(404);
        res.end();
        return;
      }
      const url = new URL(req.url, `http://localhost`);
      const idToken = url.searchParams.get('idToken');
      const refreshToken = url.searchParams.get('refreshToken');
      const email = url.searchParams.get('email');
      const userId = url.searchParams.get('userId');

      if (!idToken || !refreshToken || !email || !userId) {
        res.writeHead(400);
        res.end('Missing parameters');
        reject(new Error('Incomplete auth callback'));
        server.close();
        return;
      }

      await saveCredentials({
        idToken,
        refreshToken,
        userId,
        email,
        expiresAt: Date.now() + 3600_000,
      });

      // Register user with backend
      try {
        await callBackend('POST', '/api/user/register', { email });
      } catch { /* non-critical */ }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Signed in! You can close this tab.</h2></body></html>');
      server.close();
      resolve({ email, userId });
    });

    server.listen(0, '127.0.0.1', async () => {
      const port = (server.address() as { port: number }).port;
      const redirectUrl = `http://localhost:${port}/callback`;
      const authUrl = `${config.backendUrl}/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;
      await open(authUrl);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Auth timed out after 120 seconds'));
    }, 120_000);
  });
}
