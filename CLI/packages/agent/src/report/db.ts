import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DB_BUSY_TIMEOUT_MS } from './constants.js';

export const CURRENT_SCHEMA_VERSION = 3;

export function openDb(path: string): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${DB_BUSY_TIMEOUT_MS}`);
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1')
    .get() as { version: number } | undefined;
  const current = row?.version ?? 0;
  if (current < 1) applyV1(db);
  if (current < 2) applyV2(db);
  if (current < 3) applyV3(db);
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_SCHEMA_VERSION);
  else db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_SCHEMA_VERSION);
}

export function applyV1(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id       INTEGER PRIMARY KEY,
      path     TEXT UNIQUE NOT NULL,
      name     TEXT NOT NULL,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worktrees (
      id          INTEGER PRIMARY KEY,
      repo_id     INTEGER NOT NULL,
      path        TEXT UNIQUE NOT NULL,
      is_primary  INTEGER NOT NULL DEFAULT 1,
      detected_at INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );
    CREATE TABLE IF NOT EXISTS activity_windows (
      id               INTEGER PRIMARY KEY,
      window_start     INTEGER NOT NULL,
      window_end       INTEGER NOT NULL,
      worktree_id      INTEGER NOT NULL,
      branch           TEXT NOT NULL,
      file_event_count INTEGER NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
    CREATE TABLE IF NOT EXISTS provider_samples (
      id                    INTEGER PRIMARY KEY,
      sampled_at            INTEGER NOT NULL,
      provider              TEXT NOT NULL,
      weekly_cap            INTEGER,
      weekly_used           INTEGER NOT NULL,
      resets_at             INTEGER NOT NULL,
      input_tokens_cum      INTEGER,
      output_tokens_cum     INTEGER,
      cost_cum_usd          REAL,
      credits_remaining_usd REAL,
      pid                   INTEGER,
      command               TEXT,
      cwd                   TEXT,
      worktree_id           INTEGER,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
    CREATE TABLE IF NOT EXISTS attributions (
      id               INTEGER PRIMARY KEY,
      attributed_at    INTEGER NOT NULL,
      provider         TEXT NOT NULL,
      worktree_id      INTEGER NOT NULL,
      window_id        INTEGER,
      amount           REAL NOT NULL,
      unit             TEXT NOT NULL,
      snapshot_id      TEXT NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
    CREATE TABLE IF NOT EXISTS file_changes (
      id          INTEGER PRIMARY KEY,
      changed_at  INTEGER NOT NULL,
      worktree_id INTEGER NOT NULL,
      branch      TEXT NOT NULL,
      provider    TEXT,
      event_type  TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_worktree
      ON activity_windows(worktree_id, window_start);
    CREATE INDEX IF NOT EXISTS idx_samples_provider
      ON provider_samples(provider, sampled_at);
    CREATE INDEX IF NOT EXISTS idx_attributions_worktree
      ON attributions(worktree_id, attributed_at);
    CREATE INDEX IF NOT EXISTS idx_file_changes_worktree
      ON file_changes(worktree_id, branch);
  `);
}

function tableHasColumn(db: DB, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function tableExists(db: DB, name: string): boolean {
  const row = db.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
  ).get(name) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

function ensureProviderSamplesColumns(db: DB): void {
  const columns: Array<[name: string, ddl: string]> = [
    ['pid', 'INTEGER'],
    ['command', 'TEXT'],
    ['cwd', 'TEXT'],
    ['worktree_id', 'INTEGER'],
  ];
  for (const [name, ddl] of columns) {
    if (!tableHasColumn(db, 'provider_samples', name)) {
      db.exec(`ALTER TABLE provider_samples ADD COLUMN ${name} ${ddl}`);
    }
  }
}

function ensureAttributionsV2(db: DB): void {
  if (!tableExists(db, 'attributions')) {
    db.exec(`
      CREATE TABLE attributions (
        id            INTEGER PRIMARY KEY,
        attributed_at INTEGER NOT NULL,
        provider      TEXT NOT NULL,
        worktree_id   INTEGER NOT NULL,
        window_id     INTEGER,
        amount        REAL NOT NULL,
        unit          TEXT NOT NULL,
        snapshot_id   TEXT NOT NULL,
        FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
      );
    `);
    return;
  }

  if (tableHasColumn(db, 'attributions', 'amount')
    && tableHasColumn(db, 'attributions', 'unit')
    && tableHasColumn(db, 'attributions', 'snapshot_id')) {
    return;
  }

  db.exec(`
    CREATE TABLE attributions_v2 (
      id            INTEGER PRIMARY KEY,
      attributed_at INTEGER NOT NULL,
      provider      TEXT NOT NULL,
      worktree_id   INTEGER NOT NULL,
      window_id     INTEGER,
      amount        REAL NOT NULL,
      unit          TEXT NOT NULL,
      snapshot_id   TEXT NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
  `);
  if (tableHasColumn(db, 'attributions', 'cost_usd')) {
    db.exec(`
      INSERT INTO attributions_v2
        (id, attributed_at, provider, worktree_id, window_id, amount, unit, snapshot_id)
      SELECT
        id,
        attributed_at,
        provider,
        worktree_id,
        NULL,
        cost_usd,
        'credits',
        CAST(source_sample_id AS TEXT)
      FROM attributions;
    `);
  }
  db.exec('DROP TABLE attributions;');
  db.exec('ALTER TABLE attributions_v2 RENAME TO attributions;');
}

export function applyV2(db: DB): void {
  ensureProviderSamplesColumns(db);
  ensureAttributionsV2(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_samples_worktree_time
      ON provider_samples(worktree_id, sampled_at);
    CREATE INDEX IF NOT EXISTS idx_attributions_provider_time
      ON attributions(provider, attributed_at);
    CREATE TABLE IF NOT EXISTS provider_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      quota_unit TEXT NOT NULL,
      quota_used REAL NOT NULL,
      quota_limit REAL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_provider_time
      ON provider_snapshots (provider, fetched_at DESC);
  `);
}

export function applyV3(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      attributed REAL NOT NULL,
      reported REAL NOT NULL,
      drift_pct REAL NOT NULL,
      reconciled_at INTEGER NOT NULL
    );
  `);
}

let singleton: DB | null = null;

export function getDb(path: string): DB {
  if (singleton) return singleton;
  singleton = openDb(path);
  migrate(singleton);
  return singleton;
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
