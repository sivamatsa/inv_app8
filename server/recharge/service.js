// Recharge Intelligence service (Node only).
// Reads the bundled tariff snapshots (server/data/*.json) and measures whether each operator portal responds.
// It does NOT fetch plan data from the operators: their portals are SPA / WAF gated (see OFFICIAL_SOURCES in core/engine.js),
// so plan data is whatever the bundled snapshots state, together with the date they state it was verified.
//
// Safety: ping targets are the fixed URLs in OFFICIAL_SOURCES (never user-supplied), results are cached for 5 minutes and
// a forced refresh is honoured at most once per minute, so this endpoint cannot be used to hammer the operators.
import fs from 'fs';
import path from 'path';
import { OFFICIAL_SOURCES, buildRechargePayload } from './core/engine.js';

const PING_TTL_MS = 5 * 60 * 1000;
const FORCE_MIN_INTERVAL_MS = 60 * 1000;
const PING_TIMEOUT_MS = 3500;
const USER_AGENT = 'InvestmentOS-RechargeCheck/1.0 (reachability only)';
const PROVIDER_KEYS = ['jio', 'airtel', 'vi', 'bsnl'];

async function pingOnce(url, method) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const headers = { 'User-Agent': USER_AGENT };
    if (method === 'GET') headers.Range = 'bytes=0-255';
    const res = await fetch(url, { method, headers, signal: controller.signal, redirect: 'follow' });
    return { status: res.status, latency: Date.now() - start };
  } catch (err) {
    return { status: err && err.name === 'AbortError' ? 408 : 0, latency: Date.now() - start, error: err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

// "Reachable" means the operator site answered with an HTTP response (even a 403 from bot protection).
async function checkSite(url) {
  let r = await pingOnce(url, 'HEAD');
  if (r.status === 405 || r.status === 501 || r.status === 0) {
    const g = await pingOnce(url, 'GET');
    if (g.status !== 0 || r.status === 0) r = g;
  }
  return { reachable: r.status > 0 && r.status < 500, status: r.status, latency: r.latency, error: r.error };
}

export function createRechargeService({ dataDir, logger = console } = {}) {
  if (!dataDir) throw new Error('createRechargeService: dataDir is required');
  let pingCache = { at: 0, pings: null };
  let lastForcedAt = 0;
  let inflight = null;

  async function loadSnapshots() {
    const snapshots = {};
    for (const key of PROVIDER_KEYS) {
      try {
        const raw = await fs.promises.readFile(path.join(dataDir, `${key}.json`), 'utf-8');
        const parsed = JSON.parse(raw);
        snapshots[key] = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        logger.warn(`[recharge] could not read ${key}.json:`, err && err.message);
        snapshots[key] = [];
      }
    }
    return snapshots;
  }

  async function runPings() {
    const pings = {};
    await Promise.all(OFFICIAL_SOURCES.map(async (src) => {
      pings[src.provider.toLowerCase()] = await checkSite(src.url);
    }));
    return pings;
  }

  async function getPayload({ refresh = false } = {}) {
    const now = Date.now();
    const force = refresh && now - lastForcedAt > FORCE_MIN_INTERVAL_MS;
    if (force) lastForcedAt = now;
    // Reachability results are refreshed in the background once they are older than the TTL (callers keep getting the
    // last result instead of waiting for slow operator sites); only the very first call and a forced refresh wait.
    const refreshPings = async () => {
      if (!inflight) inflight = runPings().finally(() => { inflight = null; });
      try {
        pingCache = { at: Date.now(), pings: await inflight };
      } catch (err) {
        logger.warn('[recharge] reachability check failed:', err && err.message);
      }
    };
    if (force || !pingCache.pings) await refreshPings();
    else if (now - pingCache.at > PING_TTL_MS) refreshPings();
    const snapshots = await loadSnapshots();
    const payload = buildRechargePayload({
      snapshots,
      pings: pingCache.pings,
      checkedAt: new Date(pingCache.at || Date.now()).toISOString(),
    });
    payload.refresh_throttled = !!refresh && !force;
    return payload;
  }

  return { getPayload };
}
