import type Database from 'better-sqlite3';
import type { ProviderId } from '../providers/_shared/types.js';

export const DRIFT_TOLERANCE_PCT = 2;

export interface ReconcileInput {
  provider: ProviderId;
  reportedUsed: number;
  periodStart: number;
  periodEnd: number;
  now: number;
}

export interface ReconcileResult {
  attributed: number;
  reported: number;
  driftPct: number;
  exceededTolerance: boolean;
}

export function reconcileProvider(db: Database.Database, input: ReconcileInput): ReconcileResult {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM attributions
    WHERE provider = ? AND attributed_at >= ? AND attributed_at <= ?
  `).get(input.provider, input.periodStart, input.periodEnd) as { total: number };

  const attributed = row.total;
  const reported = input.reportedUsed;
  const driftPct = reported === 0
    ? (attributed === 0 ? 0 : 100)
    : (Math.abs(attributed - reported) / reported) * 100;
  const exceededTolerance = driftPct > DRIFT_TOLERANCE_PCT;

  if (exceededTolerance) {
    db.prepare(`
      INSERT INTO reconciliation_log
        (provider, period_start, period_end, attributed, reported, drift_pct, reconciled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.provider,
      input.periodStart,
      input.periodEnd,
      attributed,
      reported,
      driftPct,
      input.now,
    );
  }

  return { attributed, reported, driftPct, exceededTolerance };
}
