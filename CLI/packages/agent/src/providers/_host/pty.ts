import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export interface PtyRunInput {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface PtyRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PtyHost {
  run(input: PtyRunInput): Promise<PtyRunResult>;
  isAvailable(command: string): Promise<boolean>;
}

export function createPtyHost(): PtyHost {
  return {
    async run(input) {
      try {
        const { stdout, stderr } = await execFile(input.command, input.args, {
          cwd: input.cwd,
          env: input.env ? { ...process.env, ...input.env } : process.env,
          timeout: input.timeoutMs,
          maxBuffer: 8 * 1024 * 1024,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (err) {
        const e = err as NodeJS.ErrnoException & {
          stdout?: string;
          stderr?: string;
          code?: number | string;
          killed?: boolean;
          signal?: string | null;
        };
        if (e.killed || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') {
          throw new Error(`pty timeout running ${input.command}`);
        }
        return {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? '',
          exitCode: typeof e.code === 'number' ? e.code : 1,
        };
      }
    },
    async isAvailable(command) {
      const probe = process.platform === 'win32' ? 'where' : 'which';
      try {
        await execFile(probe, [command]);
        return true;
      } catch {
        return false;
      }
    },
  };
}
