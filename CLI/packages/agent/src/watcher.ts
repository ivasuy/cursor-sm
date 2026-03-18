import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';
import { WATCHER_IGNORED_GLOBS } from './core/constants.js';
import { addFileEvent } from './session-state.js';

const watchers = new Map<string, FSWatcher>();

export function startWatcher(workspacePath: string): void {
  const absPath = path.resolve(workspacePath);
  if (watchers.has(absPath)) return;

  // Segments that should always be ignored when they appear in the path
  const IGNORED_SEGMENTS = new Set([
    'node_modules', 'dist', 'build', '.next', 'out', 'target', 'coverage',
    '.git', 'sessions', '.worktrace', '.gradle', '__pycache__', 'venv',
    '.venv', 'vendor', '.hardhat', 'cache', 'artifacts',
  ]);

  const watcher = watch(absPath, {
    ignored: (filePath: string) => {
      const rel = path.relative(absPath, filePath);
      if (!rel || rel === '.') return false;
      const segments = rel.split(path.sep);
      return segments.some(seg => IGNORED_SEGMENTS.has(seg));
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('add', (filePath) => {
    addFileEvent(absPath, filePath, 'create');
  });

  watcher.on('change', (filePath) => {
    addFileEvent(absPath, filePath, 'save');
  });

  watcher.on('unlink', (filePath) => {
    addFileEvent(absPath, filePath, 'delete');
  });

  watchers.set(absPath, watcher);
}

export async function stopWatcher(workspacePath: string): Promise<void> {
  const absPath = path.resolve(workspacePath);
  const watcher = watchers.get(absPath);
  if (watcher) {
    await watcher.close();
    watchers.delete(absPath);
  }
}

export async function stopAllWatchers(): Promise<void> {
  for (const [, watcher] of watchers) {
    await watcher.close();
  }
  watchers.clear();
}
