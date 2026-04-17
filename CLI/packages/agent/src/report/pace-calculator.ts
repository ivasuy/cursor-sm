import { PACE_CRITICAL_DELTA_PCT, PACE_WARN_DELTA_PCT } from './constants.js';

export interface PaceInput {
  used: number;
  limit: number;
  periodStart: number;
  periodEnd: number;
  now: number;
}

export type PaceStatus = 'ahead' | 'on-track' | 'warning' | 'critical';

export interface PaceResult {
  expectedPct: number;
  actualPct: number;
  paceDelta: number;
  status: PaceStatus;
  burnRatePerMs: number;
  runwayMs: number | null;
  etaAt: number | null;
}

export function computePace(input: PaceInput): PaceResult {
  const totalMs = Math.max(1, input.periodEnd - input.periodStart);
  const elapsedMs = clamp(input.now - input.periodStart, 0, totalMs);
  const expectedPct = (elapsedMs / totalMs) * 100;
  const actualPct = input.limit > 0 ? (input.used / input.limit) * 100 : 0;
  const paceDelta = actualPct - expectedPct;

  let status: PaceStatus = 'on-track';
  if (paceDelta <= -PACE_CRITICAL_DELTA_PCT) status = 'ahead';
  else if (paceDelta > PACE_CRITICAL_DELTA_PCT) status = 'critical';
  else if (paceDelta > PACE_WARN_DELTA_PCT) status = 'warning';

  const burnRatePerMs = elapsedMs > 0 ? input.used / elapsedMs : 0;
  if (burnRatePerMs <= 0) {
    return {
      expectedPct,
      actualPct,
      paceDelta,
      status,
      burnRatePerMs,
      runwayMs: null,
      etaAt: null,
    };
  }

  const remaining = Math.max(0, input.limit - input.used);
  const runwayMsRaw = remaining / burnRatePerMs;
  const runwayMs = Math.min(runwayMsRaw, Math.max(0, input.periodEnd - input.now));
  const etaAt = input.now + runwayMs;

  return {
    expectedPct,
    actualPct,
    paceDelta,
    status,
    burnRatePerMs,
    runwayMs,
    etaAt,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
