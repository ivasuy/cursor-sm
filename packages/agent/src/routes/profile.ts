import { Router } from 'express';
import { callBackend, isAuthenticated } from '../auth.js';

const router = Router();

router.patch('/', async (req, res) => {
  if (!(await isAuthenticated())) return res.status(401).json({ error: 'Not authenticated' });
  const { displayName } = req.body;
  const result = await callBackend('PATCH', '/api/user/profile', { displayName });
  const data = await result.json();
  res.json(data);
});

export default router;
