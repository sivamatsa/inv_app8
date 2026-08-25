/* Web Push subscribe/unsubscribe (023_web_push.sql) and Automatic Realtime Push Delivery.
   The public VAPID key is public (same status as the Supabase anon key) - the
   matching private key lives only in the send-web-push Edge Function's secrets. */
window.App = window.App || {};

App.push = (function () {
  const VAPID_PUBLIC_KEY = 'BOomucASX8r5R122VlqGSyB5QG5H3PlyqVgRQxOzgBRwi7Cggt0WzQyWZh8JWxqQ2bzlw2LpwxO_A4RSeMxKeR8';

  // Cache of recently displayed notifications to prevent duplicate alerts within a 15-second window
  const recentShown = new Map();
  let autoPushTimer = null;
  let isDispatching = false;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async function getSubscription() {
    if (!isSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      return reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  async function subscribe() {
    if (!isSupported()) throw new Error('Push notifications are not supported in this browser.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const raw = sub.toJSON();
    await App.api.savePushSubscription({ endpoint: raw.endpoint, p256dh: raw.keys.p256dh, authKey: raw.keys.auth });
    return sub;
  }

  async function unsubscribe() {
    const sub = await getSubscription();
    if (!sub) return;
    try { await App.api.deletePushSubscriptionByEndpoint(sub.endpoint); } catch (e) { /* row may already be gone */ }
    await sub.unsubscribe();
  }

  /**
   * Displays an immediate native browser/OS push notification on this device
   * when a notification event occurs, respecting Do Not Disturb and per-type preferences.
   */
  async function showNotification(notif) {
    if (!notif) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Respect Do Not Disturb (snooze)
    if (App.state && App.state.notificationsSnoozed) return;

    // Respect per-type push channel delivery preferences
    if (notif.type && App.notifPrefs && !App.notifPrefs.isEnabled(notif.type, 'push')) return;

    // Deduplication check: prevent duplicate popups within 15 seconds
    const dedupKey = notif.id ? `id_${notif.id}` : `title_${notif.title}_${notif.message}`;
    const now = Date.now();
    if (recentShown.has(dedupKey) && (now - recentShown.get(dedupKey)) < 15000) {
      return;
    }
    recentShown.set(dedupKey, now);

    // Clean old deduplication entries
    if (recentShown.size > 100) {
      for (const [k, time] of recentShown.entries()) {
        if (now - time > 60000) recentShown.delete(k);
      }
    }

    const title = notif.title || 'Investment OS';
    const options = {
      body: notif.message || notif.body || 'You have a new portfolio notification.',
      icon: 'icons/icon-192.png',
      badge: 'icons/favicon-32.png',
      tag: `notif-${notif.id || Date.now()}`,
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: './',
        id: notif.id,
        type: notif.type,
      },
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return;
        }
      }
    } catch (swErr) {
      console.warn('[Push] ServiceWorker showNotification notice:', swErr);
    }

    // Fallback to Window Notification constructor if SW is not ready
    try {
      const nativeNotif = new Notification(title, options);
      nativeNotif.onclick = function () {
        window.focus();
        nativeNotif.close();
      };
    } catch (nErr) {
      console.warn('[Push] Native Notification fallback notice:', nErr);
    }
  }

  /**
   * Automatically dispatches pending web push notifications in the background
   * so all subscribed devices for the user receive the push message.
   * Debounced to batch rapid successive notifications together efficiently.
   */
  function triggerAutoPush(delayMs = 400) {
    if (autoPushTimer) clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(async () => {
      if (isDispatching) return;
      isDispatching = true;
      try {
        if (App.api && typeof App.api.sendPendingWebPush === 'function') {
          const res = await App.api.sendPendingWebPush();
          if (res && res.sent > 0) {
            console.log(`[Web Push Auto] Dispatched ${res.sent} push notification(s)`);
          }
        }
      } catch (err) {
        console.warn('[Web Push Auto] Notice:', err && err.message ? err.message : err);
      } finally {
        isDispatching = false;
      }
    }, delayMs);
  }

  return {
    isSupported,
    getSubscription,
    subscribe,
    unsubscribe,
    showNotification,
    triggerAutoPush,
  };
})();
