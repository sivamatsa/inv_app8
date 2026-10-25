// Job Intelligence Express router (Node only). Mounted by server.js at /api/jobintel.
// All business logic lives in core/ (portable, storage- and framework-agnostic); this file only adds
// authentication, rate limiting, the file persistence adapter and the Express <-> handlers bridge.
import express from 'express';
import path from 'path';
import { JobIntelStore } from './core/store.js';
import { matchRoute, dispatch } from './core/handlers.js';
import { configureGemini } from './core/gemini.js';
import { createFilePersistence } from './storage-node.js';
import { createJobIntelAuth } from './auth.js';

// Requests allowed per user per window, by route class (route.auth hint from core/handlers.js).
const LIMITS = {
  ai: { max: 20, windowMs: 60 * 1000 },
  discovery: { max: 5, windowMs: 10 * 60 * 1000 },
  default: { max: 400, windowMs: 60 * 1000 },
};

function createRateLimiter() {
  const hits = new Map(); // `${userId}:${class}` -> timestamps[]
  return function check(userId, cls) {
    const rule = LIMITS[cls] || LIMITS.default;
    const key = `${userId}:${LIMITS[cls] ? cls : 'default'}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < rule.windowMs);
    if (recent.length >= rule.max) {
      hits.set(key, recent);
      return Math.ceil((rule.windowMs - (now - recent[0])) / 1000);
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 2000) hits.clear();
    return 0;
  };
}

/**
 * @param {object} deps
 * @param {string} deps.supabaseUrl
 * @param {string} deps.supabaseKey   public anon key (never the service-role key)
 * @param {string} deps.dataDir       absolute directory for job_intelligence.json (outside static root)
 * @param {() => any} deps.getAiClient  returns a @google/genai client (may throw when no key is configured)
 * @param {string} [deps.model]
 */
export function createJobIntelRouter({ supabaseUrl, supabaseKey, dataDir, getAiClient, model, env = process.env, logger = console }) {
  const router = express.Router();
  const auth = createJobIntelAuth({ supabaseUrl, supabaseKey, env, logger });
  const limiter = createRateLimiter();

  configureGemini({
    getClient: () => {
      try { return getAiClient ? getAiClient() : null; } catch (_) { return null; }
    },
    model: model || env.JOBINTEL_GEMINI_MODEL || 'gemini-3.5-flash-lite',
  });

  // Lazily create and initialise the store on first authenticated request; retry after a failure.
  let storePromise = null;
  function getStore() {
    if (!storePromise) {
      const persistence = createFilePersistence({ dir: path.resolve(dataDir), logger });
      const store = new JobIntelStore({ persistence });
      storePromise = store.init().then(() => store).catch((err) => {
        storePromise = null;
        throw err;
      });
    }
    return storePromise;
  }

  router.use(express.json({ limit: '5mb' }));
  router.use(auth.middleware);

  router.use(async (req, res) => {
    const pathname = req.path || '/';
    const match = matchRoute(req.method, pathname);
    if (!match) return res.status(404).json({ error: 'Not found' });

    const retryAfter = limiter(req.jobIntelUserId, match.route.auth);
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Too many requests. Try again in ${retryAfter}s.` });
    }

    let store;
    try {
      store = await getStore();
    } catch (err) {
      logger.error('[jobintel] store init failed:', err && err.message);
      return res.status(503).json({ error: 'Job Intelligence storage is unavailable.' });
    }

    try {
      const result = await dispatch({ store, method: req.method, pathname, query: req.query || {}, body: req.body });
      if (result.headers) for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
      return res.status(result.status || 200).json(result.body === undefined ? {} : result.body);
    } catch (err) {
      logger.error('[jobintel] request failed:', err && err.message);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // Malformed JSON bodies etc. must not leak stack traces or fall through to the SPA HTML fallback.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    res.status(err && err.status ? err.status : 400).json({ error: 'Invalid request' });
  });

  return router;
}
