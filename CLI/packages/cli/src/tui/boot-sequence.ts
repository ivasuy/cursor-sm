export interface BootFrame {
  lines: string[];
  durationMs: number;
  revealPercent: number;
}

const BOOT_LINES = [
  'loading module registry',
  'binding provider surfaces',
  'hydrating cached snapshots',
  'restoring tracked repos',
  'arming command deck',
];

export function buildBootFrames(): BootFrame[] {
  return BOOT_LINES.map((_, index) => ({
    lines: BOOT_LINES.slice(0, index + 1),
    durationMs: 250,
    revealPercent: Math.round(((index + 1) / BOOT_LINES.length) * 100),
  }));
}
