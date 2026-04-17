export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export interface HttpHost {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function doOnce<T>(req: HttpRequest): Promise<HttpResponse<T>> {
  const ctrl = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    let body: BodyInit | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === 'string' || req.body instanceof Uint8Array) {
        body = req.body as BodyInit;
      } else {
        body = JSON.stringify(req.body);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
    }
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers,
      body,
      signal: ctrl.signal,
    });
    const hOut: Record<string, string> = {};
    res.headers.forEach((v, k) => { hOut[k] = v; });
    const ct = res.headers.get('content-type') ?? '';
    const parsed = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText} for ${req.url}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return { status: res.status, headers: hOut, body: parsed as T };
  } finally {
    clearTimeout(t);
  }
}

export function createHttpHost(): HttpHost {
  return {
    async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
      const retries = req.retries ?? 0;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await doOnce<T>(req);
        } catch (err) {
          lastErr = err;
          const status = (err as { status?: number }).status;
          if (status !== undefined && shouldRetry(status) && attempt < retries) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    },
  };
}
