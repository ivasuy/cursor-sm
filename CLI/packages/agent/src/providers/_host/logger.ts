import type { Logger } from '../_shared/types.js';

export function createConsoleLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    info: (msg, meta) => console.log(prefix, msg, meta ?? ''),
    warn: (msg, meta) => console.warn(prefix, msg, meta ?? ''),
    error: (msg, meta) => console.error(prefix, msg, meta ?? ''),
    debug: (msg, meta) => {
      if (process.env.WORKTRACE_DEBUG) console.debug(prefix, msg, meta ?? '');
    },
  };
}
