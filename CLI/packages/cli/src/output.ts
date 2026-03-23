import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import gradient from 'gradient-string';
import Table from 'cli-table3';
import boxen from 'boxen';

// Worktrace colour system — see colour.md
const ACCENT = '#00e5a0';       // --accent (the trace)
const ACCENT_BRIGHT = '#00ffb3'; // --accent-bright
const FG_PRIMARY = '#e4e6f0';   // --fg-primary
const FG_SECONDARY = '#a0a3b5'; // --fg-secondary
const FG_MUTED = '#5c5f73';     // --fg-muted
const WARNING = '#f0b429';      // --warning
const ERROR = '#ff4d6a';        // --error
const INFO = '#5b9aff';         // --info

export const noEffects = (): boolean =>
  process.env.NO_COLOR !== undefined ||
  process.argv.includes('--no-color') ||
  process.argv.includes('--json') ||
  process.env.TERM === 'dumb';

export const isJson = (): boolean => process.argv.includes('--json');

// Color helpers
export const g = chalk.hex(ACCENT);
export const w = chalk.hex(WARNING);
export const r = chalk.hex(ERROR);
export const d = chalk.dim;
export const white = chalk.hex(FG_PRIMARY);
export const dimGreen = chalk.hex(FG_SECONDARY);
export const info = chalk.hex(INFO);

// Typing effect — char-by-char with delay
export async function typeText(text: string, delay = 20): Promise<void> {
  if (noEffects()) { console.log(text); return; }
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  process.stdout.write('\n');
}

// Matrix rain — brief green char cascade
export async function matrixRain(durationMs = 500): Promise<void> {
  if (noEffects()) return;
  const cols = Math.min(process.stdout.columns || 80, 40);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+-=~';
  const intervals = 50;
  const frames = Math.floor(durationMs / intervals);
  for (let f = 0; f < frames; f++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      line += Math.random() > 0.7 ? g(chars[Math.floor(Math.random() * chars.length)]) : ' ';
    }
    process.stdout.write('\r' + line);
    await new Promise(resolve => setTimeout(resolve, intervals));
  }
  process.stdout.write('\r' + ' '.repeat(cols) + '\r');
}

// Glitch text — flash random chars then resolve
export async function glitchText(text: string): Promise<void> {
  if (noEffects()) { console.log(text); return; }
  const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  let garbled = '';
  for (let i = 0; i < text.length; i++) {
    garbled += text[i] === ' ' ? ' ' : glitchChars[Math.floor(Math.random() * glitchChars.length)];
  }
  process.stdout.write(g(garbled));
  await new Promise(resolve => setTimeout(resolve, 60));
  process.stdout.write('\r' + text + '\n');
}

// Spinner — preconfigured ora with Matrix green
export function spinner(text: string): Ora {
  if (noEffects()) {
    console.log(text);
    return ora({ text, isEnabled: false });
  }
  return ora({
    text: white(text),
    color: 'cyan',
    spinner: { interval: 80, frames: ['▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰', '▱▰▰▰▰', '▱▱▰▰▰', '▱▱▱▰▰', '▱▱▱▱▰'] },
  }).start();
}

// Box — bordered panel
export function box(content: string, options?: { title?: string; borderColor?: string }): void {
  if (noEffects()) { console.log(content); return; }
  console.log(boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: (options?.borderColor || 'green') as any,
    title: options?.title,
    titleAlignment: 'left',
  }));
}

// Table — cli-table3 with green borders
export function table(headers: string[], rows: string[][]): void {
  const t = new Table({
    head: headers.map(h => g(h)),
    style: { head: [], border: ['dim'] },
  });
  rows.forEach(row => t.push(row.map(cell => white(cell))));
  console.log(t.toString());
}

// Banner — gradient worktrace header
export function banner(): void {
  if (noEffects()) { console.log('worktrace'); return; }
  const worktrace = gradient([ACCENT, INFO])('w o r k t r a c e');
  console.log(`\n  ${worktrace}`);
  console.log(d('  ' + String.fromCharCode(0x2500).repeat(17)));
}

// Personality message — dim green quoted text with typing
export async function personality(message: string): Promise<void> {
  if (noEffects()) { console.log(`> "${message}"`); return; }
  await typeText(dimGreen(`> "${message}"`), 15);
}

// Success/warning/error labels
export function success(text: string): void { console.log(g('+ ') + white(text)); }
export function warn(text: string): void { console.log(w('! ') + white(text)); }
export function error(text: string): void { console.log(r('x ') + white(text)); }

// JSON output helper
export function jsonOut(data: unknown): void { console.log(JSON.stringify(data, null, 2)); }
