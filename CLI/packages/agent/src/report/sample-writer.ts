import type Database from 'better-sqlite3';
import type { ProviderId } from '../providers/_shared/types.js';

export interface SampleInput {
  pid: number;
  provider: ProviderId;
  command: string;
  cwd?: string;
  sampledAt: number;
}

export function writeSample(db: Database.Database, input: SampleInput): void {
  let worktreeId: number | null = null;
  if (input.cwd) {
    const row = db.prepare(
      'SELECT id FROM worktrees WHERE ? LIKE path || \'%\' ORDER BY length(path) DESC LIMIT 1'
    ).get(input.cwd) as { id: number } | undefined;
    if (row) worktreeId = row.id;
  }

  db.prepare(`
    INSERT INTO provider_samples (
      sampled_at, provider, weekly_cap, weekly_used, resets_at,
      input_tokens_cum, output_tokens_cum, cost_cum_usd, credits_remaining_usd,
      pid, command, cwd, worktree_id
    ) VALUES (?, ?, NULL, 0, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
  `).run(
    input.sampledAt,
    input.provider,
    input.sampledAt,
    input.pid,
    input.command,
    input.cwd ?? null,
    worktreeId,
  );
}
