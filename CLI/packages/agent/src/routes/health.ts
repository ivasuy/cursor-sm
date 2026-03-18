import { Router } from 'express';
import { getActiveSessions } from '../session-state.js';

const router = Router();
const startTime = Date.now();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '0.1.0',
    activeSessions: getActiveSessions().size,
  });
});

export default router;
