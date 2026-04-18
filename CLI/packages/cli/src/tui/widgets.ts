export function formatFooterShortcuts(module?: string): string {
  const base = 'j/k move | h/l modules | enter detail | esc back | / jump | r refresh | q quit';
  if (module === 'watch') return `${base} | d remove`;
  return base;
}

export function formatNavItem(label: string, active: boolean): string {
  return active ? `{green-fg}> ${label}{/green-fg}` : `  ${label}`;
}

export function formatSectionHeading(label: string): string {
  return `{bold}${label}{/bold}`;
}

export function formatMeter(label: string, ratio: number, valueText: string): string {
  const width = 16;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
  return `{green-fg}${label.padEnd(14)}{/green-fg} ${bar} {gray-fg}${valueText}{/gray-fg}`;
}
