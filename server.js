import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllPlans, diagnosticsRegistry } from './server/adapters/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// In-memory cache for plan data (TTL: 5 minutes)
let planCache = {
  data: null,
  cachedAt: null,
  ttlMs: 5 * 60 * 1000
};

// CORS and Preflight middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Primary route: Serve Investment OS
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Get verified recharge plans with filtering and metrics
app.get('/api/plans', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();

    if (!forceRefresh && planCache.data && planCache.cachedAt && (now - planCache.cachedAt < planCache.ttlMs)) {
      return res.json({
        success: true,
        source: 'cache',
        cachedAt: new Date(planCache.cachedAt).toISOString(),
        expiresInSeconds: Math.round((planCache.ttlMs - (now - planCache.cachedAt)) / 1000),
        count: planCache.data.length,
        plans: planCache.data
      });
    }

    const plans = await getAllPlans(forceRefresh);
    planCache.data = plans;
    planCache.cachedAt = now;

    res.json({
      success: true,
      source: forceRefresh ? 'fresh_verified' : 'live_refreshed',
      cachedAt: new Date(now).toISOString(),
      expiresInSeconds: Math.round(planCache.ttlMs / 1000),
      count: plans.length,
      plans
    });
  } catch (err) {
    console.error('API /api/plans error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve plans',
      message: err.message
    });
  }
});

// API: Manual Refresh endpoint
app.post('/api/refresh', async (req, res) => {
  try {
    const plans = await getAllPlans(true);
    const now = Date.now();
    planCache.data = plans;
    planCache.cachedAt = now;

    res.json({
      success: true,
      refreshedAt: new Date(now).toISOString(),
      count: plans.length,
      diagnostics: diagnosticsRegistry
    });
  } catch (err) {
    console.error('API /api/refresh error:', err);
    res.status(500).json({
      success: false,
      error: 'Refresh failed',
      message: err.message
    });
  }
});

// API: Provider Diagnostics & Health endpoint
app.get('/api/diagnostics', (req, res) => {
  const providers = Object.keys(diagnosticsRegistry).map(key => ({
    key,
    ...diagnosticsRegistry[key]
  }));

  res.json({
    timestamp: new Date().toISOString(),
    cacheState: {
      hasData: Boolean(planCache.data),
      cachedAt: planCache.cachedAt ? new Date(planCache.cachedAt).toISOString() : null,
      totalPlansCached: planCache.data ? planCache.data.length : 0,
      ttlMinutes: 5
    },
    providers
  });
});

// Route: Standalone Recharge Intelligence Tool
app.get('/recharge', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'recharge.html'));
});

// Primary route & SPA fallback: Send Investment OS index.html
app.get('*', (req, res) => {
  if (req.path === '/recharge' || req.path.startsWith('/recharge/')) {
    return res.sendFile(path.join(__dirname, 'public', 'recharge.html'));
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ Investment OS & Recharge Intelligence server running on http://localhost:${PORT}`);
});

