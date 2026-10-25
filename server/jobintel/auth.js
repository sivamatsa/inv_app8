// Job Intelligence access control (Node only).
//
// The original standalone app had NO authentication and a single global data file. Inside Investment OS
// every /api/jobintel request must carry a valid Supabase access token AND belong to the data owner:
//   1. If JOBINTEL_OWNER_USER_IDS and/or JOBINTEL_OWNER_EMAILS (comma separated) are set, only those
//      accounts are allowed (email match requires a confirmed email).
//   2. Otherwise only accounts whose profiles.is_admin is true are allowed. is_admin is the one profile
//      column protected from self-edit (supabase/migrations/013_admin_role.sql). role / is_developer are
//      deliberately NOT trusted here because a user can edit them on their own profile row.
// The Supabase service-role key is never used here: token verification and the profile lookup both run
// with the public anon key (the lookup under the caller's own token, i.e. under RLS).
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX = 200;

function parseList(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function createJobIntelAuth({ supabaseUrl, supabaseKey, env = process.env, logger = console } = {}) {
  const ownerIds = parseList(env.JOBINTEL_OWNER_USER_IDS);
  const ownerEmails = parseList(env.JOBINTEL_OWNER_EMAILS).map((e) => e.toLowerCase());
  const explicitOwners = ownerIds.length > 0 || ownerEmails.length > 0;
  const cache = new Map();

  const baseOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

  function bearerToken(req) {
    const header = req.headers && req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
  }

  async function resolve(token) {
    const key = crypto.createHash('sha256').update(token).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;

    const anon = createClient(supabaseUrl, supabaseKey, baseOptions);
    const { data, error } = await anon.auth.getUser(token);
    let value;
    if (error || !data || !data.user) {
      value = { ok: false, status: 401, error: 'Invalid or expired session' };
    } else {
      const user = data.user;
      let allowed = false;
      if (explicitOwners) {
        const email = String(user.email || '').toLowerCase();
        allowed = ownerIds.includes(user.id) || (!!email && !!user.email_confirmed_at && ownerEmails.includes(email));
      } else {
        const asUser = createClient(supabaseUrl, supabaseKey, {
          ...baseOptions,
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: profile } = await asUser.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
        allowed = !!(profile && profile.is_admin === true);
      }
      value = allowed
        ? { ok: true, userId: user.id }
        : { ok: false, status: 403, error: 'Job Intelligence is private to the account owner.', account: { id: user.id, email: user.email || '' } };
    }

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { exp: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  // Express middleware
  async function middleware(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    try {
      const result = await resolve(token);
      if (!result.ok) return res.status(result.status).json(result.account ? { error: result.error, account: result.account } : { error: result.error });
      req.jobIntelUserId = result.userId;
      return next();
    } catch (err) {
      logger.error('[jobintel] auth check failed:', err && err.message);
      return res.status(503).json({ error: 'Could not verify your session. Try again shortly.' });
    }
  }

  return { middleware, explicitOwners };
}
