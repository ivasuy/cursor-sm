import express from 'express';
import healthRouter from './routes/health.js';
import sessionRouter from './routes/session.js';
import contextRouter from './routes/context.js';
import historyRouter from './routes/history.js';
import safetyRouter from './routes/safety.js';
import authRouter from './routes/auth.js';
import cardRouter from './routes/card.js';
import profileRouter from './routes/profile.js';
import { stopAllWatchers } from './watcher.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/session', sessionRouter);
app.use('/context', contextRouter);
app.use('/history', historyRouter);
app.use('/safety/check', safetyRouter);
app.use('/auth', authRouter);
app.use('/card/generate', cardRouter);
app.use('/profile', profileRouter);

const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`worktrace-agent listening on 127.0.0.1:${PORT}`);
});

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
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

export default app;
