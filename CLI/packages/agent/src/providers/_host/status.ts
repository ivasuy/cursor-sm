export interface StatusHost {
  ping(url: string, timeoutMs?: number): Promise<boolean>;
}

export function createStatusHost(): StatusHost {
  return {
    async ping(url, timeoutMs = 5000) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
      } catch { return false; }
    },
  };
}
