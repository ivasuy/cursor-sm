import type { Database as DB } from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getDb } from './db.js';
import { DB_FILENAME } from './constants.js';
import type { HostAPIs } from '../providers/_shared/types.js';
import { createHostAPIs } from '../providers/_host/index.js';
import type { SnapshotCache } from '../providers/_shared/cache.js';
import { createSnapshotCache } from '../providers/_shared/cache.js';
import type { FetchDriver } from '../providers/_shared/fetch-driver.js';
import { createFetchDriver } from '../providers/_shared/fetch-driver.js';

export interface AppContext {
  db: DB;
  hosts: HostAPIs;
  cache: SnapshotCache;
  fetchDriver: FetchDriver;
  dataDir: string;
}

let ctx: AppContext | null = null;

export function getAppContext(): AppContext {
  if (ctx) return ctx;
  const dataDir = process.env.WORKTRACE_DATA_DIR ?? join(homedir(), '.worktrace');
  const db = getDb(join(dataDir, DB_FILENAME));
  const hosts = createHostAPIs('worktrace-agent');
  const cache = createSnapshotCache();
  const fetchDriver = createFetchDriver({ cache, hosts, logger: hosts.logger });
  ctx = { db, hosts, cache, fetchDriver, dataDir };
  return ctx;
}

export function resetAppContextForTests(): void {
  ctx = null;
}
