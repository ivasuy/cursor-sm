import type { ProviderId } from '../_shared/types.js';
import { createPtyHost, type PtyHost } from './pty.js';
import { matchProvider } from './process-patterns.js';

export interface DetectedProcess {
  pid: number;
  provider: ProviderId;
  command: string;
  cwd?: string;
  startedAt?: number;
}

export interface ProcessSamplerHost {
  sample(): Promise<DetectedProcess[]>;
}

export interface ProcessSamplerConfig {
  platform?: NodeJS.Platform;
  pty?: PtyHost;
}

function parsePsOutput(stdout: string): Array<{ pid: number; command: string }> {
  const rows: Array<{ pid: number; command: string }> = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /^PID\s+COMMAND/i.test(trimmed)) continue;
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), command: match[2] });
  }
  return rows;
}

function parseTasklistOutput(stdout: string): Array<{ pid: number; command: string }> {
  const rows: Array<{ pid: number; command: string }> = [];
  const lines = stdout.split('\n').slice(1);
  for (const line of lines) {
    const cols = line.replace(/"/g, '').split(',');
    if (cols.length < 2) continue;
    const pid = Number(cols[1]);
    if (!Number.isFinite(pid)) continue;
    rows.push({ pid, command: cols[0] });
  }
  return rows;
}

async function resolveCwd(pty: PtyHost, pid: number, platform: NodeJS.Platform): Promise<string | undefined> {
  if (platform === 'win32') return undefined;
  try {
    const res = await pty.run({
      command: 'lsof',
      args: ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'],
      timeoutMs: 1500,
    });
    if (res.exitCode !== 0) return undefined;
    const line = res.stdout.split('\n').find((value) => value.startsWith('n'));
    return line ? line.slice(1) : undefined;
  } catch {
    return undefined;
  }
}

export function createProcessSamplerHost(cfg: ProcessSamplerConfig = {}): ProcessSamplerHost {
  const platform = cfg.platform ?? process.platform;
  const pty = cfg.pty ?? createPtyHost();

  return {
    async sample(): Promise<DetectedProcess[]> {
      try {
        const res = platform === 'win32'
          ? await pty.run({ command: 'tasklist', args: ['/v', '/fo', 'csv'], timeoutMs: 3000 })
          : await pty.run({ command: 'ps', args: ['-eo', 'pid,command'], timeoutMs: 3000 });
        if (res.exitCode !== 0) return [];

        const rows = platform === 'win32'
          ? parseTasklistOutput(res.stdout)
          : parsePsOutput(res.stdout);

        const out: DetectedProcess[] = [];
        for (const row of rows) {
          const provider = matchProvider(row.command);
          if (!provider) continue;
          const cwd = await resolveCwd(pty, row.pid, platform);
          out.push({ pid: row.pid, provider, command: row.command, cwd });
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}
