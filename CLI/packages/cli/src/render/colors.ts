import chalk from 'chalk';

export interface Palette {
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
  cyan(s: string): string;
  dim(s: string): string;
  bold(s: string): string;
  gray(s: string): string;
  white(s: string): string;
}

const passthrough = (s: string): string => s;

export function palette(enabled = true): Palette {
  if (!enabled) {
    return {
      green: passthrough, yellow: passthrough, red: passthrough,
      cyan: passthrough, dim: passthrough, bold: passthrough,
      gray: passthrough, white: passthrough,
    };
  }

  return {
    green: chalk.green, yellow: chalk.yellow, red: chalk.red,
    cyan: chalk.cyan, dim: chalk.dim, bold: chalk.bold,
    gray: chalk.gray, white: chalk.white,
  };
}
