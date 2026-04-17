import { createPtyHost, type PtyHost } from './pty.js';

export interface KeychainHost {
  readPassword(service: string, account: string): Promise<string | null>;
}

export interface KeychainConfig {
  platform?: NodeJS.Platform;
  pty?: PtyHost;
}

export function createKeychainHost(cfg: KeychainConfig = {}): KeychainHost {
  const platform = cfg.platform ?? process.platform;
  const pty = cfg.pty ?? createPtyHost();

  return {
    async readPassword(service: string, account: string): Promise<string | null> {
      try {
        if (platform === 'darwin') {
          const r = await pty.run({
            command: 'security',
            args: ['find-generic-password', '-w', '-s', service, '-a', account],
            timeoutMs: 3000,
          });
          if (r.exitCode !== 0) return null;
          return r.stdout.replace(/\n$/, '');
        }
        if (platform === 'linux') {
          const r = await pty.run({
            command: 'secret-tool',
            args: ['lookup', 'service', service, 'account', account],
            timeoutMs: 3000,
          });
          if (r.exitCode !== 0 || !r.stdout) return null;
          return r.stdout.replace(/\n$/, '');
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}
