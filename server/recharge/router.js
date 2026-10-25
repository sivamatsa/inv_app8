// Recharge Intelligence Express router (Node only). Mounted by server.js at /api/recharge.
// Public, read-only tariff data (no personal data): GET /plans and GET /diagnostics.
import express from 'express';
import { createRechargeService } from './service.js';

export function createRechargeRouter({ dataDir, logger = console }) {
  const router = express.Router();
  const service = createRechargeService({ dataDir, logger });

  router.get('/plans', async (req, res) => {
    try {
      const payload = await service.getPayload({ refresh: req.query.refresh === 'true' });
      res.setHeader('Cache-Control', 'no-store');
      res.json(payload);
    } catch (err) {
      logger.error('[recharge] /plans failed:', err && err.message);
      res.status(500).json({ error: 'Could not load recharge plans.' });
    }
  });

  router.get('/diagnostics', async (req, res) => {
    try {
      const payload = await service.getPayload({ refresh: false });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ checked_at: payload.checked_at, mode: payload.mode, diagnostics: payload.diagnostics, sources: payload.sources });
    } catch (err) {
      logger.error('[recharge] /diagnostics failed:', err && err.message);
      res.status(500).json({ error: 'Could not load diagnostics.' });
    }
  });

  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}
