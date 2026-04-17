export interface PlaywrightHost {
  scrape<T = unknown>(url: string, extract: (page: unknown) => Promise<T>): Promise<T>;
}

export function createPlaywrightHost(): PlaywrightHost {
  return {
    async scrape() { throw new Error('playwright host not yet implemented'); },
  };
}
