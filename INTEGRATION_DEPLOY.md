# Deploy & rollback checklist: Job Intelligence, Recharge Intelligence, Direct P2P

Scope: the three integrated modules plus the Notes redesign. No database migrations, no schema or RLS changes.
The modules were run end to end on Node 22 with the project's real `express` / `ws` / `@supabase/supabase-js` packages, against a local stand-in for the Supabase auth endpoints (not your real Supabase project, real two-device/NAT networks, or a production proxy), so treat the first deploy as a staging deploy.

## 0. Before you start
- [ ] Back up the **currently deployed** version (code + the persistent volume, if any). The pre-integration source copy is `Downloads\investment-os-backup-pre-integration`.
- [ ] Deploy to a **staging** host first if you have one.
- [ ] Decide who the Jobs owner is (see step 2). Without it, Jobs is closed to everyone except `profiles.is_admin` users.

## 1. Install
- [ ] `npm install` (or `bun install`). `ws` is a new direct dependency; `bun.lock` already lists it (it was already installed transitively as `ws@8.21.3`), so the lockfile change is only the workspace entry.
- [ ] Use the same Node version you already run `server.js` with (the new code uses ES modules and top-level `await` like the existing file; it was tested on Node 22).

## 2. Configuration (all optional, names only; never commit values)
| Variable | Purpose |
|---|---|
| `JOBINTEL_OWNER_EMAILS`, `JOBINTEL_OWNER_USER_IDS` | Comma-separated owners allowed to use Job Intelligence. Without them only `profiles.is_admin` users qualify. |
| `JOBINTEL_DATA_DIR` | Where Jobs data (JSON) is stored. Default `<project>/.data/jobintel`. **Use a persistent volume in production**, or the data is lost on each redeploy. |
| `JOBINTEL_GEMINI_MODEL` | Override the Gemini model for Jobs AI features. |
| `P2P_ALLOWED_ORIGINS` | Extra origins allowed to open the `/p2p-ws` WebSocket (same origin is always allowed). |
| `P2P_NEARBY_DISCOVERY` | `1` to enable same-IP "nearby devices" (off by default; leave off unless needed). |

- [ ] Existing secrets (Supabase, Gemini, etc.) are unchanged. Do not put any key in frontend files.

## 3. Hosting / proxy
- [ ] The platform and any reverse proxy / CDN must allow **WebSocket upgrades** on `/p2p-ws` (pass `Upgrade` and `Connection` headers; no short idle timeout, 60 s+).
- [ ] If the proxy rewrites `Host`, set `X-Forwarded-Host` correctly or add the public origin to `P2P_ALLOWED_ORIGINS`.
- [ ] `/.data` must not be served statically (the server returns 404 for it; confirm in step 5).
- [ ] `sw.js` and `version.json` are unchanged. The service worker serves app files network-first (2.5 s timeout, then cache), so users get the new files on their next online load; on a very slow connection a stale cached page can appear once, and a hard refresh fixes it. Bump `APP_VERSION` / `version.json` only if you want to force it.

## 4. Deploy
- [ ] Deploy the code. Start the server and read the startup log: each of the guarded modules (Job Intelligence, Recharge, P2P signaling) should mount; if one logs a failure, only that feature is disabled and the rest of the app still works.

## 5. Smoke tests (staging, then production)
Signed in as a normal user unless noted.
- [ ] App loads; Dashboard, Deals, Documents, Backup, Notes open without console errors.
- [ ] `GET /.data/jobintel/anything` returns 404.
- [ ] **Recharge** (`#recharge`): plans list, filters, compare; the "bundled snapshot, not live" notice shows the 2026-10-12 date. `GET /api/recharge/plans` returns JSON.
- [ ] **Jobs** (`#jobintel`) as an owner/admin: page loads, you can add a test job and move it in the pipeline. As a non-owner: the API refuses (403) and the page says so. Use test data, never real personal data.
- [ ] **P2P** (`#p2p`): demo mode shows the sign-in message. On two real signed-in devices (ideally different networks): create a room on A, join from B with the code, send a small and a large file both ways, check the received file opens and matches, test chat, "Leave room".
- [ ] P2P across two networks that fail (strict firewall / mobile carrier): the failure message is shown and nothing is sent via the server (expected; there is no TURN).
- [ ] Confirm in browser dev tools that the WebSocket connects to `/p2p-ws` and that no file bytes appear in server logs or network traffic to the server.
- [ ] Mobile browser pass (iOS Safari, Android Chrome) for the new pages and the Notes page.
- [ ] Not covered by the build-time tests: your real Supabase sign-in (the tests used a stand-in auth server), Gemini-backed AI features in Jobs (no key was configured, so the built-in fallbacks ran), and your production proxy/WebSocket path.

## 6. Rollback
The change is code-only, so rollback is a redeploy of the previous version.
1. Redeploy the backup taken in step 0 (or `investment-os-backup-pre-integration`).
2. No database action is needed. Optional leftovers: the `.data/jobintel` folder (Jobs data; keep or delete as you wish) and the `ws` entry in `package.json` / `bun.lock` (harmless; `@google/genai` already depends on `ws`).
3. Users who opened the new version once may need a hard refresh to drop cached files.

Partial rollback without redeploying:
- Disable only P2P: remove the guarded `./server/p2p/ws.js` block at the end of `server.js` (the page then shows a connection error instead of working).
- Disable only Jobs or Recharge: remove its guarded mount (`/api/jobintel`, `/api/recharge`) in `server.js`.
- Hide a page from the sidebar: remove its item from `NAV_STRUCTURE` in `js/app.js`.

## 7. Known limitations to communicate
- P2P needs both devices signed in, a working signaling connection, and direct reachability (no TURN relay). Google STUN servers see the devices' public IPs, never file data.
- A P2P room code is the only secret; the other device's identity is not verified.
- Recharge prices are a bundled snapshot; update `server/data/{jio,airtel,vi,bsnl}.json` (keeping `verifiedAt` honest) to refresh.
- QR codes load a small library from a CDN; if blocked, the page shows the link and code instead.

## 8. Where each feature runs (read this if something "does not work")
| Feature | Needs the Node server? | What you see without it |
|---|---|---|
| Recharge Intelligence | No (optional) | Works from the bundled `server/data/*.json` files read in the browser; operator-site reachability shows "not checked". The site must publish the `server/` folder. |
| Job Intelligence | **Yes** (`/api/jobintel`, storage, connectors) | "Not available on this server" with setup hints. Also needs a real signed-in account that is the owner (see below). |
| Direct P2P File Transfer | **Yes** (`/p2p-ws` signaling, `ws` installed) | "Could not reach the signaling server". Needs a real signed-in account on both devices. |

- **Demo mode ("Try with Sample Data")** cannot use Jobs or P2P by design (they need a real account); Recharge works.
- **Statically hosted site + separate Node backend:** open Settings -> Cloud Backend URL and enter the backend's address (for example `https://api.example.com`). Jobs, Recharge and P2P then talk to that backend (P2P over `wss://` to the same host). On the backend set `P2P_ALLOWED_ORIGINS=https://your-static-site.example` so the WebSocket accepts your site's origin.
- **Job Intelligence owner:** only `profiles.is_admin` accounts, or the accounts in `JOBINTEL_OWNER_USER_IDS` / `JOBINTEL_OWNER_EMAILS`, may use it. If you are signed in but refused, the page shows your account id and the exact setting to add; set it on the server and restart.
- **Same-origin Node deployment** (`node server.js`, the normal way): nothing to configure for Recharge or P2P; Jobs only needs the owner setting above.
