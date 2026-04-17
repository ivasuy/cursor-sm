import express from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import healthRouter from './routes/health.js';
import reposRouter from './routes/repos.js';
import worktreesRouter from './routes/worktrees.js';
import providersRouter from './routes/providers.js';
import featuresRouter from './routes/features.js';
import filesRouter from './routes/files.js';
import paceRouter from './routes/pace.js';
import watchRouter from './routes/watch.js';
import usageRouter from './routes/usage.js';
import reportRouter from './routes/report.js';
import { stopAllWatchers } from './watcher.js';
import { getAppContext } from './report/app-context.js';
import { warmBrowserKeychains } from './providers/_host/browser-cookies.js';
import { startSampling, stopSampling } from './report/sample-loop.js';
import { startAttributionLoops, stopAttributionLoops } from './report/attribution-loop.js';
import { startReconcileLoop, stopReconcileLoop } from './report/reconcile-loop.js';

function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/health', healthRouter);
  app.use('/repos', reposRouter);
  app.use('/worktrees', worktreesRouter);
  app.use('/providers', providersRouter);
  app.use('/features', featuresRouter);
  app.use('/files', filesRouter);
  app.use('/pace', paceRouter);
  app.use('/watch', watchRouter);
  app.use('/usage', usageRouter);
  app.use('/report', reportRouter);
  return app;
}

const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);
const app = createApp();

let started = false;
export function startServer(): void {
  if (started) return;
  started = true;
  getAppContext();
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`worktrace-agent listening on 127.0.0.1:${PORT}`);
    warmBrowserKeychains(); // pre-warm Keychain access once at startup
    startSampling();
    void startAttributionLoops();
    startReconcileLoop();
  });

  async function shutdown(): Promise<void> {
    console.log('Shutting down...');
    stopReconcileLoop();
    stopAttributionLoops();
    stopSampling();
    await stopAllWatchers();
    server.close();
    const { unlink } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    try { await unlink(join(homedir(), '.worktrace', 'agent.pid')); } catch { /* ignore */ }
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  if (process.platform === 'win32') {
    process.on('SIGBREAK' as NodeJS.Signals, shutdown);
  }
}

const isEntrypoint = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) startServer();

export default app;
