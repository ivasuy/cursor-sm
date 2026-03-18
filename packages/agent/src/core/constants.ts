export const SUMMARY_FOLDER = "sessions";

export const EXCLUDED_PATTERNS = [
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^out\//,
  /^target\//,
  /^coverage\//,
  /^\.git\//,
  /^sessions\//,
  /^\.worktrace\//,
  /^\.env$/,
  /\.min\.js$/,
  /\.bundle\.js$/,
  /\.map$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^go\.sum$/,
  /^Cargo\.lock$/,
  /^\.gradle\//,
  /^__pycache__\//,
  /^\.venv\//,
  /^vendor\//,
  /^artifacts\//,
  /^\.hardhat\//,
  /^cache\//,
];

export function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

export const MAX_FILE_CONTENT_LENGTH = 10000;
export const MAX_AFFECTED_CONTENT_LENGTH = 5000;
export const MAX_AFFECTED_FILES = 10;

export const WATCHER_IGNORED_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/out/**',
  '**/target/**',
  '**/coverage/**',
  '**/.git/**',
  '**/sessions/**',
  '**/.worktrace/**',
  '**/.env*',
  '**/*.min.js',
  '**/*.map',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/.gradle/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.venv/**',
  '**/vendor/**',
  '**/.hardhat/**',
  '**/cache/**',
  '**/*.bundle.js',
  '**/go.sum',
  '**/Cargo.lock',
  '**/artifacts/**',
];
