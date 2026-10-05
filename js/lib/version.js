/* ==========================================================================
   Personal Investment OS - Version Management & Update Engine
   Version: 2.4.0
   Handles semantic versioning, PWA cache invalidation, and release notes
   ========================================================================== */

(function () {
  'use strict';

  window.App = window.App || {};

  const CURRENT_VERSION = '2.4.2';
  const BUILD_DATE = '2026-10-05';
  const BUILD_CHANNEL = 'Stable';
  const BUILD_ID = '20261005.1';

  App.version = CURRENT_VERSION;
  App.buildInfo = {
    version: CURRENT_VERSION,
    releaseDate: BUILD_DATE,
    channel: BUILD_CHANNEL,
    build: BUILD_ID,
  };

  // Compare semantic versions: returns 1 if a > b, -1 if a < b, 0 if equal
  function compareSemVer(a, b) {
    if (!a || !b) return 0;
    const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  // Fallback release notes if offline / disconnected
  const FALLBACK_RELEASES = [
    {
      version: '2.4.0',
      type: 'major',
      date: '2026-10-02',
      title: 'Telegram Hybrid AI Financial Copilot & Live Portfolio Grounding',
      highlights: [
        'Hybrid Telegram AI Copilot powered by Gemini with institutional financial reasoning',
        'Direct live portfolio grounding: 18 active deals, ₹13.30L deployed capital, ₹23.4K monthly yield',
        'Static hosting HTML parsing guard (safeApiFetch) preventing JSON crashes on external deployments',
        'Cloud Backend Gateway setting with 1-click Test & Save connection in Settings',
        'Comprehensive App Versioning, PWA Update Engine, and Release Changelog'
      ]
    },
    {
      version: '2.3.0',
      type: 'minor',
      date: '2026-09-28',
      title: 'Realtime Bullion Grounding & Regional Gold Valuation',
      highlights: [
        'Live Indian 24K and 22K gold rates grounded via real-time search',
        'Hyderabad and regional bullion market benchmark pricing',
        'Physical gold vault tracking with real-time portfolio market appraisal'
      ]
    },
    {
      version: '2.2.0',
      type: 'minor',
      date: '2026-09-20',
      title: 'Automated Multi-Device Web Push & Direct Peer Chat',
      highlights: [
        'Multi-device Web Push notifications for upcoming deal payouts and overdue schedules',
        'P2P WebRTC direct secure chat with contacts and borrower counter-parties',
        'Granular notification delivery preferences by category'
      ]
    },
    {
      version: '2.1.0',
      type: 'minor',
      date: '2026-09-10',
      title: 'Institutional Cash Flow Forecaster & Amortization Yield Engine',
      highlights: [
        'Dynamic 360-day cash flow projection calendar with scheduled principal/interest splits',
        'What-if reinvestment scenario planner and maturity distribution visualizer',
        'Automated reconciliation of received payments against schedules'
      ]
    },
    {
      version: '2.0.0',
      type: 'major',
      date: '2026-09-01',
      title: 'Supabase Vault Migration & Bank-Grade Security Architecture',
      highlights: [
        'Full migration from local storage to Supabase PostgreSQL database',
        'Row-Level Security (RLS) and granular role-based portfolio sharing',
        'Bank-grade encrypted vault architecture with instant biometric quick-unlock'
      ]
    }
  ];

  let swRegistration = null;
  let updateBannerEl = null;
  let isChecking = false;
  let lastCheckedTime = null;

  App.updater = {
    currentVersion: CURRENT_VERSION,

    setRegistration: function (reg) {
      swRegistration = reg;
      if (!reg) return;

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version installed in background and waiting
            App.updater.showUpdateNotification('A new version of Personal Investment OS has been downloaded.');
          }
        });
      });
    },

    // Check server for new version
    checkForUpdates: async function (silent = false) {
      if (isChecking) return;
      isChecking = true;
      lastCheckedTime = new Date();

      try {
        // Query version.json with cache buster
        const ts = Date.now();
        let res = await fetch(`version.json?_t=${ts}`, { cache: 'no-store' }).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`/api/version?_t=${ts}`, { cache: 'no-store' }).catch(() => null);
        }

        if (res && res.ok) {
          const data = await res.json();
          const remoteVersion = data.version;

          if (compareSemVer(remoteVersion, CURRENT_VERSION) > 0) {
            // Newer version found on server!
            App.updater.showUpdateNotification(
              `Version v${remoteVersion} is now available!`,
              data
            );

            // Trigger service worker update
            if (swRegistration) {
              swRegistration.update().catch(() => {});
            }

            // Check auto-reload preference with infinite loop circuit breaker
            const autoReload = localStorage.getItem('ios_auto_reload_updates') === 'true';
            const reloadKey = `ios_auto_reload_attempt_${remoteVersion}`;
            const lastAttempt = Number(sessionStorage.getItem(reloadKey) || 0);
            const now = Date.now();
            const alreadyAttempted = (now - lastAttempt) < 60000; // 60s cooldown per version

            if (autoReload && !alreadyAttempted) {
              sessionStorage.setItem(reloadKey, String(now));
              App.utils.toast?.(`Auto-updating to v${remoteVersion}...`);
              setTimeout(() => {
                App.updater.applyUpdate();
              }, 2500);
            } else if (autoReload && alreadyAttempted) {
              console.warn(`[Updater] Auto-reload already attempted for v${remoteVersion}. Suppressing reload loop.`);
            }

            return { hasUpdate: true, version: remoteVersion, data };
          } else {
            // Version is already current; clear any lingering attempt markers
            try {
              sessionStorage.removeItem(`ios_auto_reload_attempt_${remoteVersion}`);
            } catch (_) {}
          }
        }

        // Also ping service worker update check
        if (swRegistration) {
          await swRegistration.update().catch(() => {});
        }

        if (!silent) {
          if (App.utils && App.utils.toast) {
            App.utils.toast(`Personal Investment OS is up to date (v${CURRENT_VERSION}) 🎉`);
          }
        }

        return { hasUpdate: false, version: CURRENT_VERSION };
      } catch (err) {
        console.warn('[Updater] Check notice:', err.message);
        if (!silent && App.utils && App.utils.toast) {
          App.utils.toast('Could not connect to update server. Check your network.', 'err');
        }
        return { hasUpdate: false, error: err.message };
      } finally {
        isChecking = false;
        App.updater.updateBadges();
      }
    },

    // Show floating in-app update notification banner
    showUpdateNotification: function (message, versionData = null) {
      if (updateBannerEl) updateBannerEl.remove();

      const newVer = versionData?.version || 'new';
      updateBannerEl = document.createElement('div');
      updateBannerEl.id = 'pwaUpdateBanner';
      updateBannerEl.className = 'pwa-update-banner';
      updateBannerEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <span style="font-size:18px">🚀</span>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--text)">Update Available</div>
            <div style="font-size:11.5px;color:var(--text2)">${App.utils ? App.utils.escapeHtml(message) : message}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-gold btn-sm" id="btnApplyUpdateNow" style="padding:4px 12px;font-size:12px">Update Now</button>
          <button class="btn btn-outline btn-sm" id="btnViewWhatNewUpdate" style="padding:4px 10px;font-size:11px">What's New</button>
          <button class="icon-btn" id="btnCloseUpdateBanner" style="width:24px;height:24px;font-size:12px" title="Dismiss">✕</button>
        </div>
      `;

      document.body.appendChild(updateBannerEl);

      App.utils?.qs('#btnApplyUpdateNow', updateBannerEl)?.addEventListener('click', () => {
        App.updater.applyUpdate();
      });

      App.utils?.qs('#btnViewWhatNewUpdate', updateBannerEl)?.addEventListener('click', () => {
        App.updater.showReleaseNotesModal(newVer);
      });

      App.utils?.qs('#btnCloseUpdateBanner', updateBannerEl)?.addEventListener('click', () => {
        updateBannerEl?.remove();
      });
    },

    // Apply update: postMessage to SW, flush cache, and clean reload
    applyUpdate: async function () {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.includes('investment-os')).map((k) => caches.delete(k)));
        }
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }
      } catch (_) {}

      setTimeout(() => {
        const cleanUrl = window.location.href.replace(/([?&])_t=[^&]+/, '');
        const sep = cleanUrl.includes('?') ? '&' : '?';
        window.location.replace(cleanUrl + sep + '_t=' + Date.now());
      }, 300);
    },

    // Nuclear cache flush: wipes CacheStorage and ServiceWorker registrations
    forceClearCacheAndReload: async function () {
      if (!confirm('This will wipe all cached web application files and reload fresh from the server. Your portfolio database stored in Supabase will NOT be touched. Continue?')) {
        return;
      }

      if (App.utils && App.utils.toast) {
        App.utils.toast('Purging PWA cache and reload...');
      }

      try {
        // 1. Delete all CacheStorage entries
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }

        // 2. Unregister all service workers
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
        }

        // 3. Clear temporary session cache
        try {
          sessionStorage.clear();
        } catch (_) {}

        // 4. Force reload
        setTimeout(() => {
          window.location.href = window.location.origin + window.location.pathname + '?_hard_reload=' + Date.now();
        }, 500);
      } catch (err) {
        console.error('Error purging cache:', err);
        window.location.reload();
      }
    },

    // Show What's New & Release Notes modal
    showReleaseNotesModal: async function (highlightVersion = null) {
      let releases = FALLBACK_RELEASES;

      try {
        const res = await fetch(`version.json?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.releases) {
            releases = data.releases;
          }
        }
      } catch (_) {}

      const releaseCards = releases.map((rel) => {
        const isCurrent = rel.version === CURRENT_VERSION;
        const isMajor = rel.type === 'major';
        const typeBadge = isMajor
          ? `<span class="badge" style="background:rgba(201,168,76,0.2);color:var(--gold);font-weight:700">MAJOR RELEASE</span>`
          : `<span class="badge" style="background:rgba(22,201,163,0.15);color:var(--teal)">MINOR UPDATE</span>`;
        const currentBadge = isCurrent
          ? `<span class="badge" style="background:rgba(34,197,94,0.18);color:#22c55e;font-weight:700">● CURRENT RUNNING VERSION</span>`
          : '';

        const highlights = (rel.highlights || []).map((h) => `<li style="margin-bottom:5px">${App.utils ? App.utils.escapeHtml(h) : h}</li>`).join('');

        return `
          <div style="background:var(--card);border:1px solid ${isCurrent ? 'var(--gold)' : 'var(--border)'};border-radius:10px;padding:14px;margin-bottom:12px;position:relative">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">
              <div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span style="font-size:16px;font-weight:800;font-family:monospace;color:var(--gold)">v${rel.version}</span>
                  ${typeBadge}
                  ${currentBadge}
                </div>
                <div style="font-weight:700;font-size:13.5px;color:var(--text);margin-top:4px">${App.utils ? App.utils.escapeHtml(rel.title) : rel.title}</div>
              </div>
              <span style="font-size:11px;color:var(--text3);font-family:monospace">${rel.date}</span>
            </div>
            <ul style="margin:8px 0 0 16px;padding:0;font-size:12.5px;color:var(--text2);line-height:1.5">
              ${highlights}
            </ul>
          </div>
        `;
      }).join('');

      if (App.ui && App.ui.modal) {
        App.ui.modal({
          title: `Personal Investment OS • Release Notes & What's New`,
          content: `
            <div style="font-size:12.5px;color:var(--text2);margin-bottom:14px">
              Track major architectural milestones, AI feature releases, and minor system improvements:
            </div>
            <div style="max-height:60vh;overflow-y:auto;padding-right:4px">
              ${releaseCards}
            </div>
          `,
          actions: [
            {
              label: 'Check for Updates Now',
              className: 'btn-gold',
              onClick: async () => {
                await App.updater.checkForUpdates(false);
              },
            },
            {
              label: 'Close',
              className: 'btn-outline',
              onClick: App.ui.close,
            },
          ],
        });
      }
    },

    // Refresh version text and indicators in topbar, sidebar, and settings
    updateBadges: function () {
      const topbarBadge = document.getElementById('topbarVersionBadge');
      if (topbarBadge) {
        topbarBadge.textContent = `v${CURRENT_VERSION}`;
      }

      const sidebarBtn = document.getElementById('sidebarVersionBtn');
      if (sidebarBtn) {
        const lbl = sidebarBtn.querySelector('.version-label');
        if (lbl) lbl.textContent = `v${CURRENT_VERSION} · ${BUILD_CHANNEL}`;
      }

      const settingsVersionEl = document.getElementById('settingsAppVersionVal');
      if (settingsVersionEl) {
        settingsVersionEl.textContent = `v${CURRENT_VERSION}`;
      }

      const settingsBuildEl = document.getElementById('settingsAppBuildVal');
      if (settingsBuildEl) {
        settingsBuildEl.textContent = `${BUILD_DATE} · ${BUILD_CHANNEL} (${BUILD_ID})`;
      }
    },

    // Initialize lifecycle hooks
    init: function () {
      // 1. Initial badges update
      App.updater.updateBadges();

      // 2. Wire reload on SW controller change
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[Updater] Controller changed, activating new version.');
          window.location.reload();
        });
      }

      // 3. Check for updates on startup (after 2s delay)
      setTimeout(() => {
        App.updater.checkForUpdates(true);
      }, 2000);

      // 4. Check when tab becomes visible (user returns to PWA)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // If more than 5 minutes since last check, recheck
          if (!lastCheckedTime || Date.now() - lastCheckedTime.getTime() > 5 * 60 * 1000) {
            App.updater.checkForUpdates(true);
          }
        }
      });

      // 5. Check when device comes back online
      window.addEventListener('online', () => {
        App.updater.checkForUpdates(true);
      });

      // 6. Background interval check every 10 minutes
      setInterval(() => {
        App.updater.checkForUpdates(true);
      }, 10 * 60 * 1000);

      // 7. Wire global clicks on topbar and sidebar version badges
      document.addEventListener('click', (e) => {
        const badgeHit = e.target && (e.target.closest('#topbarVersionBadge') || e.target.closest('#sidebarVersionBtn'));
        if (badgeHit) {
          e.preventDefault();
          // If the sidebar is currently open (mobile drawer), close it immediately so the modal is foregrounded
          if (typeof App.closeMobileSidebar === 'function') {
            App.closeMobileSidebar();
          }
          App.updater.showReleaseNotesModal();
        }
      });
    },
  };

  // Run initializer when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.updater.init);
  } else {
    App.updater.init();
  }

})();
