import chalk from 'chalk';

export function printTitle(text: string): void {
  console.log(chalk.bold.cyan(text));
}

export function printSection(text: string): void {
  console.log('');
  console.log(chalk.bold(text));
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printMuted(text: string): void {
  console.log(chalk.dim(text));
}
