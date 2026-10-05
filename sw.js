/* Service Worker: Personal Investment OS
   Version: v2.4.0
   PWA Shell + Push Notifications + Dynamic Cache Invalidation
*/

const APP_VERSION = 'v2.4.2';
const CACHE_NAME = `investment-os-shell-${APP_VERSION}`;

self.addEventListener('install', (event) => {
  // Activate immediately when a new service worker is installed
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log(`[SW ${APP_VERSION}] Purging stale cache:`, k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Notify all active clients that new version is ready
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_VERSION_ACTIVE', version: APP_VERSION });
        });
      });
    })
  );
});

// Allow client pages to force activation
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// Web Push Notifications
self.addEventListener('push', (event) => {
  let payload = { title: 'Personal Investment OS', body: 'You have a portfolio update.' };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (e) {
    // Keep default payload
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: payload.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Fetch Strategy: Network-First with Cache Fallback for Local Assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Cross-Origin (Supabase, CDNs, external APIs): Always live network
  if (url.origin !== self.location.origin) return;

  // 2. Version metadata & API routes: NEVER cache via ServiceWorker
  if (url.pathname.includes('/version.json') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
    return;
  }

  // 3. Same-origin navigation & shell assets: Network-First with 2.5s timeout, cache fallback
  event.respondWith(
    new Promise((resolve) => {
      let didRespond = false;
      const timeoutId = setTimeout(() => {
        if (!didRespond) {
          caches.match(req).then((cached) => {
            if (cached) {
              didRespond = true;
              resolve(cached);
            }
          });
        }
      }, 2500);

      fetch(req)
        .then((res) => {
          clearTimeout(timeoutId);
          if (!didRespond) {
            didRespond = true;
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            resolve(res);
          }
        })
        .catch(() => {
          clearTimeout(timeoutId);
          if (!didRespond) {
            didRespond = true;
            caches.match(req).then((cached) => {
              if (cached) {
                resolve(cached);
              } else if (req.mode === 'navigate') {
                resolve(caches.match('./index.html'));
              } else {
                resolve(new Response('Offline content unavailable', { status: 503 }));
              }
            });
          }
        });
    })
  );
});
