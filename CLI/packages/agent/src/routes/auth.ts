import { Router } from 'express';
import { login, isAuthenticated, getCredentials, callBackend } from '../auth.js';

const router = Router();

router.post('/login', async (_req, res) => {
  try {
    const result = await login();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/status', async (_req, res) => {
  const authenticated = await isAuthenticated();
  if (!authenticated) return res.json({ authenticated: false });
  const creds = await getCredentials();
  let displayName: string | null = null;
  try {
    const profileRes = await callBackend('GET', '/api/user/profile');
    const profile = await profileRes.json() as { displayName?: string };
    displayName = profile.displayName || null;
  } catch { /* ignore */ }
  res.json({ authenticated: true, email: creds?.email, displayName });
});

export default router;
