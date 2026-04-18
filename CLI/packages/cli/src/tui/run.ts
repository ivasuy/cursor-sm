import { createApp } from './app.js';

export async function runTui(): Promise<void> {
  await createApp();
}
