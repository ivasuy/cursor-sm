import { Router } from 'express';
import { login, isAuthenticated, getCredentials, getConfig, saveCredentials, clearCredentials, callBackend } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { scheme } = req.body || {};

    // Extension flow: return auth URL without opening browser
    if (scheme) {
      const config = await getConfig();
      const authUrl = `${config.backendUrl}/api/auth/google?scheme=${encodeURIComponent(scheme)}`;
      return res.json({ authUrl });
    }

    // CLI flow: full login with browser + local server
    const result = await login();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/callback', async (req, res) => {
  try {
    const { idToken, refreshToken, email, userId } = req.body;
    if (!idToken || !refreshToken || !email || !userId) {
      return res.status(400).json({ error: 'idToken, refreshToken, email, and userId are required' });
    }

    await saveCredentials({
      idToken,
      refreshToken,
      email,
      userId,
      expiresAt: Date.now() + 3600_000,
    });

    // Register user with backend (non-critical)
    try {
      await callBackend('POST', '/api/user/register', { email });
    } catch { /* ignore */ }

    res.json({ email, userId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/logout', async (_req, res) => {
  try {
    await clearCredentials();
    res.json({ status: 'ok' });
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
  res.json({
    authenticated: true,
    email: creds?.email,
    userId: creds?.userId,
    displayName,
  });
});

export default router;
