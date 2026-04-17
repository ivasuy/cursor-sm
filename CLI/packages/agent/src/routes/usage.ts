import { Router } from 'express';
import { loadAll, hasLivePlan, probeAvailability } from '../providers/_shared/registry.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const ctx = getAppContext();
    const all = await loadAll();
    const withPlan = all.filter((d) => hasLivePlan(d));
    const live: typeof withPlan = [];
    for (const d of withPlan) {
      if (await probeAvailability(d, ctx.hosts)) live.push(d);
    }
    const force = req.query.refresh === '1';
    const { fetchDriver } = ctx;

    const providers = await Promise.all(live.map(async (descriptor) => {
      try {
        const snapshot = await fetchDriver.fetch(descriptor, { force });
        return { id: descriptor.id, status: 'ok' as const, snapshot };
      } catch (err) {
        return {
          id: descriptor.id,
          status: 'error' as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }));

    res.json({
      fetchedAt: Date.now(),
      providers,
    });
  } catch (err) {
    res.status(502).json({
      fetchedAt: Date.now(),
      providers: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
