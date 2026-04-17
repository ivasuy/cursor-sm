import { Router } from 'express';
import {
  getById,
  loadAll,
  hasLivePlan,
  probeAvailability,
} from '../providers/_shared/registry.js';
import type { ProviderId } from '../providers/_shared/types.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', async (_req, res) => {
  const all = await loadAll();
  const { hosts } = getAppContext();
  const providers = await Promise.all(all.map(async (d) => ({
    id: d.id,
    displayName: d.metadata.displayName,
    vendor: d.metadata.vendor,
    category: d.metadata.category,
    capabilities: d.capabilities,
    branding: d.branding,
    live: hasLivePlan(d),
    available: await probeAvailability(d, hosts),
  })));
  res.json({ providers });
});

router.get('/all', async (_req, res) => {
  const all = await loadAll();
  const { hosts } = getAppContext();
  const providers = await Promise.all(all.map(async (d) => ({
    id: d.id,
    displayName: d.metadata.displayName,
    live: hasLivePlan(d),
    available: await probeAvailability(d, hosts),
  })));
  res.json({ providers });
});

router.get('/:id', async (req, res) => {
  const descriptor = await getById(req.params.id as ProviderId);
  if (!descriptor) {
    res.status(404).json({ error: `unknown provider: ${req.params.id}` });
    return;
  }

  if (!hasLivePlan(descriptor)) {
    res.json({
      descriptor,
      snapshot: null,
      status: 'coming-soon',
    });
    return;
  }

  const force = req.query.refresh === '1';
  try {
    const { fetchDriver } = getAppContext();
    const snapshot = await fetchDriver.fetch(descriptor, { force });
    res.json({ descriptor, snapshot, status: 'live' });
  } catch (err) {
    res.status(502).json({
      descriptor,
      snapshot: null,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
