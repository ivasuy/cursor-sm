import { ensureAgent, agentPost, agentDelete } from '../agent-client.js';
import { printJson } from '../output.js';

export interface WatchOptions { stop?: boolean; json?: boolean; }

export async function runWatch(opts: WatchOptions): Promise<void> {
  await ensureAgent();
  const cwd = process.cwd();
  if (opts.stop) {
    const data = await agentDelete<unknown>(`/watch?path=${encodeURIComponent(cwd)}`);
    if (opts.json) printJson(data);
    else console.log(`Stopped watching ${cwd}`);
    return;
  }
  const data = await agentPost<unknown>('/watch', { path: cwd });
  if (opts.json) printJson(data);
  else console.log(`Watching ${cwd}`);
}
