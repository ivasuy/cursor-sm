import { palette } from './colors.js';

export interface ProgressBarInput {
  used: number;
  limit: number;
  width?: number;
  color?: boolean;
  suffix?: string;
  unit?: string;
  isPercent?: boolean; // when true, shows "19.2%" instead of "19.2/100"
}

const FILL = '█';
const EMPTY = '░';

export function renderProgressBar(input: ProgressBarInput): string {
  const used = Number.isFinite(input.used) ? input.used : 0;
  const limit = Number.isFinite(input.limit) ? input.limit : 0;
  const width = Math.max(8, input.width ?? 24);
  const p = palette(input.color !== false);

  if (limit <= 0) {
    const suffix = input.suffix ? ` ${p.dim(input.suffix)}` : '';
    return `${p.bold(formatNumber(used))} (unlimited)${suffix}`;
  }

  const ratio = clamp(used / limit, 0, 1);
  const filled = Math.round(ratio * width);
  const bar = `${FILL.repeat(filled)}${EMPTY.repeat(width - filled)}`;

  const colorize =
    ratio >= 0.9 ? p.red :
    ratio >= 0.75 ? p.yellow :
    p.green;

  const suffix = input.suffix ? ` ${p.dim(input.suffix)}` : '';

  if (input.isPercent) {
    // Show "19.2%" rather than "19.2/100"
    const pct = `${used.toFixed(1)}%`;
    return `${colorize(bar)} ${colorize(pct)}${suffix}`;
  }

  const unitStr = input.unit ? ` ${input.unit}` : '';
  const pct = `${(ratio * 100).toFixed(1)}%`;
  return `${colorize(bar)} ${formatNumber(used)}/${formatNumber(limit)}${unitStr} ${colorize(pct)}${suffix}`;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}
