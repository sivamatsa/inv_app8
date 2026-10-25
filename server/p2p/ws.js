// Direct P2P File Transfer - WebSocket signaling endpoint (Node only; needs the `ws` package).
// Attaches to the app's existing HTTP server on ONE path (/p2p-ws). Any other upgrade request is refused, so this cannot
// hijack other sockets (the standalone app attached to every path of its server).
//
// Security model: the browser connects, then sends {type:'auth', token} as its FIRST message (a bearer token in the URL would
// leak into logs). The hub checks the token with Supabase (public anon key only) before doing anything else. Only signaling
// JSON (SDP / ICE / room events) passes through this server - never file contents.
//
// Environment (names only): P2P_ALLOWED_ORIGINS (comma separated extra origins; same-origin is always allowed),
// P2P_NEARBY_DISCOVERY=1 to enable the IP-based "nearby devices" feature (off by default, see core/signaling.js).
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { SignalingHub } from './core/signaling.js';

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_CONNECTIONS_PER_IP = 20;

function parseList(v) { return String(v || '').split(',').map((s) => s.trim()).filter(Boolean); }

export function attachP2PSignaling(httpServer, { supabaseUrl, supabaseKey, env = process.env, logger = console, path = '/p2p-ws' } = {}) {
  const extraOrigins = new Set(parseList(env.P2P_ALLOWED_ORIGINS).map((o) => o.toLowerCase()));

  async function verifyToken(token) {
    const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return { userId: data.user.id };
  }

  const hub = new SignalingHub({
    verifyToken,
    randomBytes: (n) => new Uint8Array(crypto.randomBytes(n)),
    config: { nearby: env.P2P_NEARBY_DISCOVERY === '1' },
    logger,
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const perIp = new Map();

  function originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // non-browser clients cannot be forged from another website
    let host;
    try { host = new URL(origin).host.toLowerCase(); } catch (_) { return false; }
    const fwd = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase();
    const own = String(req.headers.host || '').toLowerCase();
    return host === own || (fwd && host === fwd) || extraOrigins.has(origin.toLowerCase());
  }

  function refuse(socket, status, text) {
    try { socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch (_) { /* ignore */ }
    socket.destroy();
  }

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (_) { socket.destroy(); return; }
    if (pathname !== path) { socket.destroy(); return; }
    if (!originAllowed(req)) { refuse(socket, 403, 'Forbidden'); return; }

    const ip = (req.socket && req.socket.remoteAddress) || 'unknown';
    const count = perIp.get(ip) || 0;
    if (count >= MAX_CONNECTIONS_PER_IP) { refuse(socket, 429, 'Too Many Requests'); return; }
    perIp.set(ip, count + 1);

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      const session = hub.attach({
        send: (s) => ws.send(s),
        close: (code, reason) => ws.close(code, reason),
        meta: { networkKey: ip },
      });
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        session.onMessage(data.toString()).catch((err) => logger.warn('[p2p] message handler failed:', err && err.message));
      });
      ws.on('close', () => {
        perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
        if (perIp.get(ip) === 0) perIp.delete(ip);
        session.onClose();
      });
      ws.on('error', () => { /* socket errors are handled by the close event */ });
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) { /* ignore */ }
    });
  }, 30000);
  const sweeper = setInterval(() => hub.sweep(), 60000);
  heartbeat.unref();
  sweeper.unref();

  logger.log(`[p2p] signaling ready on ${path}${hub.config.nearby ? ' (nearby discovery ON)' : ''}`);
  return { hub, wss, close() { clearInterval(heartbeat); clearInterval(sweeper); wss.close(); } };
}
