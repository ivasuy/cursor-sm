import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';
import { WATCHER_IGNORED_SEGMENTS } from './report/constants.js';
import { getAppContext } from './report/app-context.js';
import { getRepoByPath } from './report/repo-registry.js';
import { getWorktreeByPath } from './report/worktree-scanner.js';
import { recordFileEvent, type FileEventType } from './report/activity-writer.js';
import { currentBranch } from './report/git.js';

const watchers = new Map<string, FSWatcher>();
const branchCache = new Map<string, string>();

export function startWatcher(workspacePath: string): void {
  const absPath = path.resolve(workspacePath);
  if (watchers.has(absPath)) return;

  const watcher = watch(absPath, {
    ignored: (filePath: string) => {
      const rel = path.relative(absPath, filePath);
      if (!rel || rel === '.') return false;
      const segments = rel.split(path.sep);
      return segments.some((seg) => WATCHER_IGNORED_SEGMENTS.has(seg));
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const emit = (eventType: FileEventType) => (filePath: string) => {
    handleEvent(absPath, filePath, eventType).catch((err) => {
      console.error('watcher event failed:', err);
    });
  };

  watcher.on('add', emit('create'));
  watcher.on('change', emit('modify'));
  watcher.on('unlink', emit('delete'));

  watchers.set(absPath, watcher);
}

async function handleEvent(workspacePath: string, filePath: string, eventType: FileEventType): Promise<void> {
  const { db } = getAppContext();
  const repo = getRepoByPath(db, workspacePath);
  if (!repo) return;
  const wt = getWorktreeByPath(db, workspacePath);
  if (!wt) return;

  const cached = branchCache.get(workspacePath);
  const branch = cached ?? await currentBranch(workspacePath).catch(() => 'HEAD');
  if (!cached) branchCache.set(workspacePath, branch);

  recordFileEvent(db, {
    worktreeId: wt.id,
    branch,
    filePath,
    eventType,
    changedAt: Date.now(),
    provider: null,
  });
}

export async function stopWatcher(workspacePath: string): Promise<void> {
  const absPath = path.resolve(workspacePath);
  const watcher = watchers.get(absPath);
  if (watcher) {
    await watcher.close();
    watchers.delete(absPath);
  }
  branchCache.delete(absPath);
}

export async function stopAllWatchers(): Promise<void> {
  for (const [, watcher] of watchers) await watcher.close();
  watchers.clear();
  branchCache.clear();
}
