import Database from 'better-sqlite3';
import { existsSync, copyFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

export type Browser = 'chrome' | 'brave' | 'arc' | 'edge' | 'chromium' | 'firefox' | 'auto';

export interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresUtc?: number;
}

export interface BrowserCookiesHost {
  /** Read cookies for a domain. Pass browser='auto' to try all installed browsers. */
  read(domain: string, browser?: Browser): Promise<CookieRecord[]>;
  /** Extract a specific named cookie from the best available browser. */
  extractCookie(domain: string, names: string[], browser?: Browser): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Keychain helpers — called at most once per (service,account) per process lifetime
// ---------------------------------------------------------------------------

const keychainCache = new Map<string, Buffer | null>();
const keychainAttempted = new Set<string>();

function getKeychainPassword(service: string, account = 'Chrome'): Buffer | null {
  const cacheKey = `${service}::${account}`;
  if (keychainCache.has(cacheKey)) return keychainCache.get(cacheKey) ?? null;
  // Only attempt once per process — macOS shows an interactive dialog on first access
  // which can block the agent. If it already timed out or failed, don't retry.
  if (keychainAttempted.has(cacheKey)) return null;
  keychainAttempted.add(cacheKey);
  try {
    const raw = execFileSync('security', [
      'find-generic-password', '-s', service, '-a', account, '-w',
    ], {
      timeout: 8_000,  // allow time for user to approve the dialog
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();
    if (!raw) { keychainCache.set(cacheKey, null); return null; }
    const buf = Buffer.from(raw);
    keychainCache.set(cacheKey, buf);
    return buf;
  } catch {
    keychainCache.set(cacheKey, null);
    return null;
  }
}

/** Pre-warm all known browser keychain entries at agent startup (one-shot). */
export function warmBrowserKeychains(): void {
  const services: Array<[string, string]> = [
    ['Chrome Safe Storage', 'Chrome'],
    ['Brave Safe Storage', 'Brave'],
    ['Arc Safe Storage', 'Arc'],
    ['Microsoft Edge Safe Storage', 'Microsoft Edge'],
    ['Chromium Safe Storage', 'Chromium'],
  ];
  for (const [service, account] of services) {
    // Fire-and-forget in background; result is cached for subsequent reads
    setImmediate(() => getKeychainPassword(service, account));
  }
}

// Chrome/Chromium forks use: PBKDF2-SHA1("saltysalt", 1003 iter, 16 bytes)
function deriveChromeKey(rawPassword: Buffer): Buffer {
  return pbkdf2Sync(rawPassword, 'saltysalt', 1003, 16, 'sha1');
}

// Linux Chrome uses static password "peanuts", 1 iteration
function deriveLinuxChromeKey(): Buffer {
  return pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
}

function decryptChromeCookie(encryptedValue: Buffer, key: Buffer): string {
  if (!encryptedValue || encryptedValue.length < 4) return '';
  const prefix = encryptedValue.slice(0, 3).toString();
  if (prefix !== 'v10' && prefix !== 'v11') {
    return encryptedValue.toString('utf8');
  }
  try {
    const iv = Buffer.alloc(16, 0x20); // 16 space chars
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    const data = encryptedValue.slice(3);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    // Strip PKCS7 padding
    const pad = dec[dec.length - 1];
    return dec.slice(0, dec.length - (pad > 16 ? 0 : pad)).toString('utf8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Browser profile discovery
// ---------------------------------------------------------------------------

interface BrowserProfile {
  browser: string;
  cookiesDb: string;
  keychainService?: string;
  keychainAccount?: string;
  isFirefox?: boolean;
}

function scanChromiumProfiles(baseDir: string, keychainService: string, keychainAccount = 'Chrome'): BrowserProfile[] {
  if (!existsSync(baseDir)) return [];
  const profiles: BrowserProfile[] = [];
  for (const entry of ['Default', ...readdirSync(baseDir).filter((e) => /^Profile\s*\d+/.test(e))]) {
    const cookiesPath = join(baseDir, entry, 'Cookies');
    if (existsSync(cookiesPath)) {
      profiles.push({ browser: keychainService, cookiesDb: cookiesPath, keychainService, keychainAccount });
    }
  }
  return profiles;
}

function getProfiles(browser: Browser): BrowserProfile[] {
  const home = homedir();
  if (process.platform === 'darwin') {
    switch (browser) {
      case 'chrome':
        return scanChromiumProfiles(join(home, 'Library/Application Support/Google/Chrome'), 'Chrome Safe Storage');
      case 'brave':
        return scanChromiumProfiles(join(home, 'Library/Application Support/BraveSoftware/Brave-Browser'), 'Brave Safe Storage', 'Brave');
      case 'arc':
        return scanChromiumProfiles(join(home, 'Library/Application Support/Arc/User Data'), 'Arc Safe Storage', 'Arc');
      case 'edge':
        return scanChromiumProfiles(join(home, 'Library/Application Support/Microsoft Edge'), 'Microsoft Edge Safe Storage', 'Microsoft Edge');
      case 'chromium':
        return scanChromiumProfiles(join(home, 'Library/Application Support/Chromium'), 'Chromium Safe Storage', 'Chromium');
      case 'firefox': {
        const ffBase = join(home, 'Library/Application Support/Firefox/Profiles');
        if (!existsSync(ffBase)) return [];
        return readdirSync(ffBase)
          .map((e) => join(ffBase, e, 'cookies.sqlite'))
          .filter(existsSync)
          .map((p) => ({ browser: 'firefox', cookiesDb: p, isFirefox: true }));
      }
      case 'auto':
        return [
          ...getProfiles('chrome'),
          ...getProfiles('brave'),
          ...getProfiles('arc'),
          ...getProfiles('edge'),
          ...getProfiles('chromium'),
          ...getProfiles('firefox'),
        ];
    }
  }
  if (process.platform === 'linux') {
    switch (browser) {
      case 'chrome':
        return [{ browser: 'chrome-linux', cookiesDb: join(home, '.config/google-chrome/Default/Cookies') }].filter((p) => existsSync(p.cookiesDb));
      case 'brave':
        return [{ browser: 'brave-linux', cookiesDb: join(home, '.config/BraveSoftware/Brave-Browser/Default/Cookies') }].filter((p) => existsSync(p.cookiesDb));
      case 'edge':
        return [{ browser: 'edge-linux', cookiesDb: join(home, '.config/microsoft-edge/Default/Cookies') }].filter((p) => existsSync(p.cookiesDb));
      case 'firefox': {
        const ffBase = join(home, '.mozilla/firefox');
        if (!existsSync(ffBase)) return [];
        return readdirSync(ffBase)
          .map((e) => join(ffBase, e, 'cookies.sqlite'))
          .filter(existsSync)
          .map((p) => ({ browser: 'firefox', cookiesDb: p, isFirefox: true }));
      }
      case 'auto':
        return ['chrome', 'brave', 'edge', 'firefox'].flatMap((b) => getProfiles(b as Browser));
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Cookie reading
// ---------------------------------------------------------------------------

type RawChromiumRow = { host_key: string; name: string; encrypted_value: Buffer; value: string; path: string; expires_utc: number };
type RawFirefoxRow = { host: string; name: string; value: string; path: string; expiry: number };

function readChromiumCookies(profile: BrowserProfile, domain: string): CookieRecord[] {
  if (!existsSync(profile.cookiesDb)) return [];
  const tempDir = mkdtempSync(join(tmpdir(), 'wt-ck-'));
  const copy = join(tempDir, 'Cookies');
  let db: Database.Database | null = null;
  try {
    copyFileSync(profile.cookiesDb, copy);
    db = new Database(copy, { readonly: true, fileMustExist: true });

    // Get decryption key (lazy, cached)
    let decryptKey: Buffer | null = null;
    if (profile.keychainService) {
      const raw = getKeychainPassword(profile.keychainService, profile.keychainAccount);
      if (raw) decryptKey = deriveChromeKey(raw);
    }
    if (!decryptKey && process.platform === 'linux') {
      decryptKey = deriveLinuxChromeKey();
    }

    const rows = db.prepare(`
      SELECT host_key, name, encrypted_value, value, path, expires_utc
      FROM cookies WHERE host_key LIKE ?
    `).all(`%${domain}%`) as RawChromiumRow[];

    return rows.map((row) => {
      let value = row.value || '';
      if ((!value || value === '') && row.encrypted_value && decryptKey) {
        value = decryptChromeCookie(row.encrypted_value, decryptKey);
      }
      return { name: row.name, value, domain: row.host_key, path: row.path, expiresUtc: row.expires_utc || undefined };
    }).filter((c) => c.value !== '');
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch { /* ignore */ }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readFirefoxCookies(profile: BrowserProfile, domain: string): CookieRecord[] {
  if (!existsSync(profile.cookiesDb)) return [];
  const tempDir = mkdtempSync(join(tmpdir(), 'wt-ff-'));
  const copy = join(tempDir, 'cookies.sqlite');
  let db: Database.Database | null = null;
  try {
    copyFileSync(profile.cookiesDb, copy);
    db = new Database(copy, { readonly: true, fileMustExist: true });
    const rows = db.prepare(`
      SELECT host, name, value, path, expiry
      FROM moz_cookies WHERE host LIKE ?
    `).all(`%${domain}%`) as RawFirefoxRow[];
    return rows.map((r) => ({ name: r.name, value: r.value, domain: r.host, path: r.path, expiresUtc: r.expiry }));
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch { /* ignore */ }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Host factory
// ---------------------------------------------------------------------------

export function createBrowserCookiesHost(): BrowserCookiesHost {
  return {
    async read(domain: string, browser: Browser = 'auto'): Promise<CookieRecord[]> {
      const profiles = getProfiles(browser);
      const all: CookieRecord[] = [];
      for (const profile of profiles) {
        const cookies = profile.isFirefox
          ? readFirefoxCookies(profile, domain)
          : readChromiumCookies(profile, domain);
        all.push(...cookies);
      }
      // Deduplicate by name (prefer first found non-empty)
      const seen = new Set<string>();
      return all.filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      });
    },

    async extractCookie(domain: string, names: string[], browser: Browser = 'auto'): Promise<string | null> {
      const cookies = await this.read(domain, browser);
      for (const name of names) {
        const found = cookies.find((c) => c.name === name);
        if (found?.value) return found.value;
      }
      return null;
    },
  };
}
