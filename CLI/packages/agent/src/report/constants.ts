export const AGENT_PORT = 9315;
export const AGENT_HOST = '127.0.0.1';

export const DB_FILENAME = 'report.db';
export const DB_BUSY_TIMEOUT_MS = 5000;

export const ACTIVITY_WINDOW_MS = 60_000;
export const PROVIDER_SAMPLE_INTERVAL_MS = 60_000;
export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_TOTAL_TIMEOUT_MS = 30_000;
export const CACHE_STALE_AFTER_MS = 5 * 60_000;

export const WATCHER_IGNORED_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules', 'dist', 'build', '.next', 'out', 'target', 'coverage',
  '.git', 'sessions', '.worktrace', '.gradle', '__pycache__', 'venv',
  '.venv', 'vendor', '.hardhat', 'cache', 'artifacts',
]);

export const PACE_WARN_DELTA_PCT = 5;
export const PACE_CRITICAL_DELTA_PCT = 15;

export const RECONCILIATION_DRIFT_TOLERANCE = 0.02;
