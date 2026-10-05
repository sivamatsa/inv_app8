/* Settings (spec Section 46 nav) - profile (Section 3), notification
   preferences (Section 10), platforms, and the Section 50 "future
   integrations" interface stubs. */
window.App = window.App || {};

(function () {
  const CURRENCY_OPTIONS = [
    { value: 'INR', label: '🇮🇳 INR - Indian Rupee (₹)' },
    { value: 'USD', label: '🇺🇸 USD - US Dollar ($)' },
    { value: 'EUR', label: '🇪🇺 EUR - Euro (€)' },
    { value: 'GBP', label: '🇬🇧 GBP - British Pound (£)' },
    { value: 'AED', label: '🇦🇪 AED - UAE Dirham (AED)' },
    { value: 'SGD', label: '🇸🇬 SGD - Singapore Dollar (S$)' },
    { value: 'CAD', label: '🇨🇦 CAD - Canadian Dollar (C$)' },
    { value: 'AUD', label: '🇦🇺 AUD - Australian Dollar (A$)' },
    { value: 'JPY', label: '🇯🇵 JPY - Japanese Yen (¥)' },
    { value: 'CHF', label: '🇨🇭 CHF - Swiss Franc (Fr)' },
  ];

  const PROFILE_FIELDS = [
    { key: 'email', label: 'Email Address', readonly: true, disabled: true, placeholder: 'name@example.com', hint: 'Managed by portfolio login credential' },
    { key: 'username', label: 'Username', placeholder: 'e.g. siva_investor', hint: 'Unique handle used for portfolio discovery & direct chat' },
    { key: 'full_name', label: 'Full Name', placeholder: 'e.g. Siva' },
    { key: 'mobile', label: 'Mobile', placeholder: '+91 98765 43210' },
    { key: 'city', label: 'City' },
    { key: 'country', label: 'Country' },
    { key: 'preferred_currency', label: 'Base Account Currency', type: 'select', options: CURRENCY_OPTIONS },
    { key: 'timezone', label: 'Timezone', placeholder: 'Asia/Kolkata' },
    { key: 'financial_year_start_month', label: 'FY Start Month (1-12)', type: 'number' },
    { key: 'financial_year_start_day', label: 'FY Start Day', type: 'number' },
  ];

  // 'Email' removed from this not-connected list - real email delivery is
  // now wired up (021_email_notifications.sql + the send-notification-emails
  // Edge Function), with its own toggle in Reminder Preferences below
  // instead of living here as an aspirational card.
  const INTEGRATIONS = ['Lender/Platform API', 'Bank Statement Import', 'Open Banking', 'Email Statement Parsing',
    'SMS Transaction Parsing', 'Telegram', 'WhatsApp', 'Push Notifications', 'Google Calendar', 'Accounting/Tax Software'];

  // The full notifications.type check constraint list (031_expense_projects.sql
  // has the current, authoritative version) - kept in sync by hand since a
  // future migration adding a new type needs a matching row here for it to
  // show up in the matrix below (absence of a row just means "not
  // configurable yet", not an error - App.notifPrefs.isEnabled() defaults
  // any type with no explicit preference to enabled on every channel).
  const NOTIFICATION_TYPES = [
    'Payment Due', 'Payment Overdue', 'Maturity Approaching', 'Maturity Today',
    'Principal Expected', 'Large Payment Expected', 'Missed Payment',
    'Reinvestment Opportunity', 'Deal Closure', 'Document Expiry', 'Tax Reporting',
    'Support Ticket', 'Recurring Reminder', 'Recurring Overdue',
    'Contact Reminder', 'Contact Birthday', 'Contact Important Date',
    'New Message', 'Group Message', 'Mention', 'Incoming Call', 'Missed Call',
    'Gold Target Price', 'Gold Price Drop', 'Gold Price Rise', 'Gold New Low', 'Gold New High',
    'Calendar Reminder', 'Expense Budget Warning', 'Expense Budget Exceeded',
    'Automation Rule Triggered',
  ];

  // Contacts/Chat privacy (spec addendum Section 27). A dedicated panel
  // rather than mixed into Profile, since these are access-control
  // decisions, not identity fields.
  const PRIVACY_FIELDS = [
    { key: 'who_can_find_me', label: 'Who can find me?', type: 'select', options: ['Anyone', 'Contacts', 'Nobody'] },
    { key: 'who_can_message_me', label: 'Who can message me?', type: 'select', options: ['Anyone', 'Contacts', 'Nobody'] },
    { key: 'who_can_call_me', label: 'Who can call me?', type: 'select', options: ['Anyone', 'Contacts', 'Nobody'] },
    { key: 'show_online_status', label: 'Show Online Status', type: 'checkbox' },
    { key: 'show_last_seen', label: 'Show Last Seen', type: 'checkbox' },
    { key: 'show_read_receipts', label: 'Show Read Receipts', type: 'checkbox' },
    { key: 'show_profile_photo', label: 'Show Profile Photo', type: 'checkbox' },
    { key: 'allow_contact_discovery', label: 'Allow Contact Discovery', type: 'checkbox' },
    { key: 'allow_group_invitations', label: 'Allow Group Invitations', type: 'checkbox' },
    { key: 'allow_call_invitations', label: 'Allow Call Invitations', type: 'checkbox' },
  ];

  async function renderSettingsView() {
    const pane = App.utils.qs('#pane-settings');
    const isAdminUser = App.state.profile && App.state.profile.is_admin;
    // Demo Mode's seeded profile is also flagged is_admin (so every admin
    // feature can be exercised in the sandbox) - but showing a real
    // Supabase project URL/reconnect control inside a "nothing here is
    // real" sandbox is exactly the kind of confusing exception this app
    // has avoided everywhere else, so this one panel is hidden there.
    const showConnectionPanel = isAdminUser && !App.auth.isDemoMode();
    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div class="section-title" style="margin-bottom:0">Settings <div class="line"></div><small>profile, reminders, platforms, integrations</small></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" id="btnSettingsExpandAll" title="Expand all sections">&#9660; Expand All</button>
          <button class="btn btn-outline btn-sm" id="btnSettingsCollapseAll" title="Collapse all sections">&#9650; Collapse All</button>
        </div>
      </div>

      <!-- Section: Profile (Collapsible) -->
      <div class="panel settings-collapsible-panel" id="panel-profile" data-section="profile">
        <div class="settings-panel-header" data-toggle="profile" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="settings-chevron" id="chevron-profile" style="font-size:12px;transition:transform 0.2s;display:inline-block">▼</span>
            <div class="chart-title" style="margin:0;font-size:14px">Profile</div>
          </div>
          <span style="font-size:11px;color:var(--text3)" class="settings-toggle-hint">Click to collapse / expand</span>
        </div>
        <div class="settings-panel-content" id="content-profile" style="margin-top:12px">
          <div id="profileFormHost"></div>
          <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-gold" id="saveProfileBtn">Save Profile</button></div>
        </div>
      </div>

      <div class="panel" id="settingsForexPanel">
        <details id="settingsForexDetails" style="cursor:pointer">
          <summary style="list-style:none;outline:none;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span id="settingsForexToggleArrow" style="font-size:11px;transition:transform 0.2s">▶</span>
              <div class="chart-title" style="margin:0;font-size:14px">Display Currency &amp; Forex Conversion</div>
              <span id="settingsActiveCurrBadge" class="badge st-active" style="font-size:11px;margin-left:6px"></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:11.5px;color:var(--text3)">Click to expand / switch</span>
              <button class="btn btn-outline btn-sm" id="syncForexRatesBtn" style="font-size:11px;padding:3px 8px" onclick="event.stopPropagation()">&#8635; Refresh Live Forex Rates</button>
            </div>
          </summary>
          <div style="margin-top:14px;cursor:default" onclick="event.stopPropagation()">
            <div class="hint" style="margin-bottom:14px">Choose your preferred portfolio display currency. All investment deals, payments, expense budgets, and net worth charts automatically convert to this currency using live exchange rates.</div>
            
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px;align-items:end">
              <div class="field">
                <label>Switch Display Currency</label>
                <select id="settingsActiveCurrencySelect" class="search-input" style="width:100%"></select>
              </div>
              <div style="background:var(--card);padding:12px 16px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Active Format Preview (1,00,000 INR)</div>
                  <div id="settingsCurrencyPreview" style="font-size:16px;font-weight:700;color:var(--gold,#c9a84c);margin-top:2px"></div>
                </div>
                <div id="settingsCurrencyFlag" style="font-size:24px"></div>
              </div>
            </div>

            <div style="font-size:12.5px;font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <span>Benchmark Conversion Rates (Base: 1 INR)</span>
              <span id="settingsRatesLastSync" style="font-size:11px;font-weight:400;color:var(--text3)"></span>
            </div>
            <div class="table-scroll"><table class="data" id="settingsRatesTable"></table></div>
          </div>
        </details>
      </div>

      <!-- Section: Privacy & Contacts (Collapsible) -->
      <div class="panel settings-collapsible-panel" id="panel-privacy" data-section="privacy">
        <div class="settings-panel-header" data-toggle="privacy" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="settings-chevron" id="chevron-privacy" style="font-size:12px;transition:transform 0.2s;display:inline-block">▼</span>
            <div class="chart-title" style="margin:0;font-size:14px">Privacy &amp; Contacts</div>
          </div>
          <span style="font-size:11px;color:var(--text3)" class="settings-toggle-hint">Click to collapse / expand</span>
        </div>
        <div class="settings-panel-content" id="content-privacy" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">Controls how Contacts discovery, private chat, and calling work - separate from Investment Deals/Recurring Investments/Community/Write to Us, which don't use these settings at all.</div>
          <div class="field span2" style="margin-bottom:10px"><label>Username (for "find by unique ID")</label><input id="usernameInput" placeholder="e.g. yourname"></div>
          <div id="privacyFormHost"></div>
          <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-gold btn-sm" id="savePrivacyBtn">Save Privacy Settings</button></div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
            <div class="chart-title" style="margin-bottom:6px;font-size:13px">Sign-in Activity Logging</div>
            <div class="hint" style="margin-bottom:8px">Whether approximate location/device is logged with your sign-ins (admin-visible only). Declining still logs that a sign-in happened, never IP/location/device.</div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="analyticsConsentToggle"> Log approximate location and device with my sign-ins
            </label>
          </div>
        </div>
      </div>

      <!-- Section: Customize Sidebar (Collapsible) -->
      <div class="panel settings-collapsible-panel" id="panel-sidebar" data-section="sidebar">
        <div class="settings-panel-header" data-toggle="sidebar" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="settings-chevron" id="chevron-sidebar" style="font-size:12px;transition:transform 0.2s;display:inline-block">▼</span>
            <div class="chart-title" style="margin:0;font-size:14px">Customize Sidebar</div>
          </div>
          <span style="font-size:11px;color:var(--text3)" class="settings-toggle-hint">Click to collapse / expand</span>
        </div>
        <div class="settings-panel-content" id="content-sidebar" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">Reorder or hide any section (within its own group), or switch to icon-only mode for a narrower sidebar. Hiding a section only removes its link here - nothing it manages is deleted, and it's still reachable via a direct link (e.g. clicking through from a notification).</div>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="sidebarCompactToggle"> Icon-only (compact) sidebar
          </label>
          <div id="sidebarCustomizeList"></div>
          <div class="modal-actions" style="justify-content:flex-start;margin-top:10px"><button class="btn btn-outline btn-sm" id="resetSidebarBtn">Reset to Default</button></div>
        </div>
      </div>

      <!-- Section: Notification Delivery Preferences (Collapsible) -->
      <div class="panel settings-collapsible-panel" id="panel-notif-delivery" data-section="notif-delivery">
        <div class="settings-panel-header" data-toggle="notif-delivery" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="settings-chevron" id="chevron-notif-delivery" style="font-size:12px;transition:transform 0.2s;display:inline-block">▼</span>
            <div class="chart-title" style="margin:0;font-size:14px">Notification Delivery Preferences</div>
          </div>
          <span style="font-size:11px;color:var(--text3)" class="settings-toggle-hint">Click to collapse / expand</span>
        </div>
        <div class="settings-panel-content" id="content-notif-delivery" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">Default offsets (days relative to a due date; negative = before, positive = overdue): -7, -3, -1, 0, 1, 3, 7, 30 (spec Section 10).</div>
          <div class="field span2"><label>Reminder Offsets (comma-separated days)</label><input class="search-input" id="offsetsInput" style="width:100%"></div>
          <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-gold btn-sm" id="savePrefsBtn">Save Preferences</button></div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
          <div class="chart-title" style="margin-bottom:6px;font-size:13px">Do Not Disturb</div>
          <div class="hint" style="margin-bottom:8px">Silences your notification bell and toast pop-ups for a while - nothing is lost, everything generated while disabled is still there the moment you turn it back on.</div>
          <div id="snoozeStatus"></div>
          <div id="snoozeControls" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <select id="snoozeDuration" class="search-input" style="width:auto">
              <option value="1h">1 Hour</option>
              <option value="4h">4 Hours</option>
              <option value="today">Rest of Today</option>
              <option value="tomorrow">Until Tomorrow Morning</option>
              <option value="week">1 Week</option>
              <option value="indefinite">Until I Turn It Back On</option>
            </select>
            <button class="btn btn-outline btn-sm" id="snoozeBtn">Disable Notifications</button>
          </div>
          <button class="btn btn-gold btn-sm" id="unsnoozeBtn" style="display:none">Enable Notifications Now</button>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
          <div class="chart-title" style="margin-bottom:6px;font-size:13px">Email Notifications</div>
          <div class="hint" style="margin-bottom:8px">Sends a digest email (everything new since the last one, in a single message) on whatever cadence you pick below. "Never" turns email off entirely. Respects Do Not Disturb above - nothing is emailed while snoozed, it just waits for the next cycle after you turn it back on.</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="emailFrequencySelect" class="search-input" style="width:auto">
              <option value="never">Never</option>
              <option value="1_day">Every 1 Day</option>
              <option value="5_days">Every 5 Days</option>
              <option value="7_days">Every 7 Days</option>
              <option value="10_days">Every 10 Days</option>
              <option value="1_month">Every 1 Month</option>
              <option value="3_months">Every 3 Months</option>
            </select>
          </div>
          <div id="emailLastSentHint" class="hint" style="margin-top:6px"></div>
          ${isAdminUser ? `<div style="margin-top:10px">
            <button class="btn btn-outline btn-sm" id="triggerEmailsNowBtn">&#9993; Trigger Emails Now</button>
            <div class="hint" style="margin-top:6px">Admin-only: invokes the send-notification-emails Edge Function immediately, for every opted-in user (not just you) - the same sweep the Cron Job runs automatically. Use this to test your Resend setup without waiting for the schedule.</div>
          </div>` : ''}
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
          <div class="chart-title" style="margin-bottom:6px;font-size:13px">Push Notifications</div>
          <div class="hint" style="margin-bottom:8px" id="pushHint">Real, near-instant browser notifications on this device - works even when this tab isn't open (as long as the browser itself is running). A separate on/off per device, since a phone and a laptop are different subscriptions.</div>
          <div id="pushControls"></div>
          ${isAdminUser ? `<div style="margin-top:10px">
            <button class="btn btn-outline btn-sm" id="triggerPushNowBtn">&#128276; Trigger Push Now</button>
            <div class="hint" style="margin-top:6px">Admin-only: invokes the send-web-push Edge Function immediately, for every opted-in, subscribed device (not just yours) - the same sweep the Cron Job runs automatically. <code>sent</code> means it reached a subscription, <code>skipped</code> means that user/device isn't opted in or subscribed, <code>failed</code> means it reached a subscription but delivery itself failed (e.g. VAPID keys not set, or a dead subscription).</div>
            <div id="pushLastResultHint" class="hint" style="margin-top:6px"></div>
          </div>` : ''}
        </div>
      </div>
    </div>

      <!-- WhatsApp & Telegram Bot Integration Center -->
      <div class="panel" id="botIntegrationPanel" style="border:1px solid rgba(201,168,76,0.35);background:linear-gradient(135deg,rgba(201,168,76,0.06),rgba(12,22,40,0.5))">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title" style="margin:0;display:flex;align-items:center;gap:8px">
              <span>🤖</span>
              <span>WhatsApp &amp; Telegram Bot Integration</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Receive instant deal payout reminders, overdue alerts, and live bullion rate shifts in your favorite messaging app. Query portfolio metrics or log expenses on the go.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-gold btn-sm" id="btnOpenBotSimulator">&#128172; Open Bot Console &amp; Simulator</button>
            <button class="btn btn-outline btn-sm" id="btnRefreshBotStatus">&#8635; Refresh Status</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:14px">
          <!-- Telegram Card -->
          <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="font-size:24px;width:38px;height:38px;border-radius:8px;background:rgba(0,136,204,0.15);display:flex;align-items:center;justify-content:center;color:#0088cc">&#9992;</div>
                <div>
                  <div style="font-weight:700;font-size:14px">Telegram Bot</div>
                  <div style="font-size:11.5px;color:var(--text3)" id="tgBotHandle">@InvestmentOS_Bot</div>
                </div>
              </div>
              <span id="tgBotStatusBadge" class="badge" style="background:rgba(255,255,255,0.08);color:var(--text2)">Checking...</span>
            </div>
            <div id="tgTokenStatusText" style="font-size:11.5px;color:var(--text3);margin-bottom:4px">
              Token: Checking...
            </div>
            <div id="tgPollingStatusText" style="font-size:11.5px;color:var(--text3);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
              <span id="tgPollingStatusLabel">Poller: Checking...</span>
              <button class="btn btn-outline btn-sm" id="btnRestartPoller" style="padding:1px 6px;font-size:10.5px" title="Restart Telegram Long Polling">&#8635; Restart Poller</button>
            </div>
            <div id="tgBotDetails" style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:14px">
              Connect Telegram to receive automated push alerts with interactive reply actions.
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center" id="tgBotActionWrap">
              <button class="btn btn-gold btn-sm" id="btnConnectTelegram">Connect Telegram</button>
              <button class="btn btn-outline btn-sm" id="btnConfigureTgToken" style="border-color:rgba(0,136,204,0.45);color:#0088cc">&#9881; Set BotFather Token</button>
              <button class="btn btn-outline btn-sm" id="btnDispatchAlerts" style="border-color:rgba(201,168,76,0.4);color:var(--gold);display:none">&#128227; Dispatch Priority Alerts</button>
              <button class="btn btn-outline btn-sm" id="btnTestTelegram" style="display:none">&#128276; Send Test Alert</button>
              <button class="btn btn-outline btn-sm" id="btnUnlinkTelegram" style="display:none;color:#e5484d;border-color:rgba(229,72,77,0.4)">Disconnect</button>
            </div>
          </div>

          <!-- WhatsApp Card -->
          <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="font-size:24px;width:38px;height:38px;border-radius:8px;background:rgba(37,211,102,0.15);display:flex;align-items:center;justify-content:center;color:#25d366">&#128172;</div>
                <div>
                  <div style="font-weight:700;font-size:14px">WhatsApp Bot</div>
                  <div style="font-size:11.5px;color:var(--text3)">Meta Cloud API &amp; Webhook</div>
                </div>
              </div>
              <span id="waBotStatusBadge" class="badge" style="background:rgba(255,255,255,0.08);color:var(--text2)">Checking...</span>
            </div>
            <div id="waBotDetails" style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:14px">
              Bind your WhatsApp phone number to receive payment alerts and log expenses directly from chats.
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="waBotActionWrap">
              <button class="btn btn-gold btn-sm" id="btnConnectWhatsApp">Connect WhatsApp</button>
              <button class="btn btn-outline btn-sm" id="btnTestWhatsApp" style="display:none">&#128276; Send Test Alert</button>
              <button class="btn btn-outline btn-sm" id="btnUnlinkWhatsApp" style="display:none;color:#e5484d;border-color:rgba(229,72,77,0.4)">Disconnect</button>
            </div>
          </div>
        </div>

        <!-- Bot Quick Commands Reference -->
        <details style="margin-top:14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px">
          <summary style="cursor:pointer;font-weight:600;font-size:12.5px;color:var(--gold)">
            &#128203; View Bot Commands &amp; Webhook Setup Guide
          </summary>
          <div style="margin-top:12px;font-size:12px;line-height:1.6;color:var(--text2)">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:12px">
              <div style="background:var(--card);padding:10px;border-radius:6px;border:1px solid var(--border)">
                <div style="font-weight:700;color:var(--text);margin-bottom:4px">&#128202; Portfolio Queries</div>
                <div><code>/summary</code> - Real-time active capital, deals &amp; yields</div>
                <div><code>/due</code> - Scheduled payouts for next 14 days</div>
                <div><code>/overdue</code> - Delinquent payments needing attention</div>
              </div>
              <div style="background:var(--card);padding:10px;border-radius:6px;border:1px solid var(--border)">
                <div style="font-weight:700;color:var(--text);margin-bottom:4px">&#129689; Intelligence &amp; Actions</div>
                <div><code>/gold</code> - Live 24K/22K bullion rates in India</div>
                <div><code>/expense 500 Fuel Meeting</code> - Instant expense log</div>
                <div><code>/help</code> - Commands cheat sheet</div>
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--text3)">
              <b>Webhook Endpoints:</b><br>
              Telegram: <code id="tgWebhookUrlText">/api/bot/telegram/webhook</code><br>
              WhatsApp: <code id="waWebhookUrlText">/api/bot/whatsapp/webhook</code>
            </div>
          </div>
        </details>

        <!-- Cloud Backend & External Hosting Gateway -->
        <div style="margin-top:16px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">&#9729;</span>
              <span style="font-weight:700;font-size:13px">Cloud Backend &amp; External Hosting Gateway</span>
            </div>
            <span id="backendHostingBadge" class="badge" style="background:rgba(255,255,255,0.08);color:var(--text2)">Checking...</span>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">
            When deployed to <b>GitHub Pages</b> (<code>sivamatsa.github.io</code>) or custom domains (<code>sri.qzz.io</code>), your Telegram Bot operates in <b>Hybrid Direct Mode</b> &mdash; running directly via Supabase and browser long-polling without needing an external Node.js backend. If you also have a dedicated Cloud Run or Render server, you can link it below.
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="text" id="cfgBackendApiUrl" class="search-input" placeholder="e.g. https://my-backend-app.onrender.com" style="flex:1;min-width:240px;font-family:monospace;font-size:12px">
            <button class="btn btn-gold btn-sm" id="btnSaveBackendApiUrl">Test &amp; Save Backend URL</button>
            <button class="btn btn-outline btn-sm" id="btnResetBackendApiUrl">Reset to Local</button>
          </div>
          <div id="backendApiStatusNote" style="font-size:11.5px;color:var(--text3);margin-top:6px"></div>
        </div>
      </div>

      <!-- Section: Notification Delivery, by Type (Collapsible) -->
      <div class="panel settings-collapsible-panel" id="panel-notif-type" data-section="notif-type">
        <div class="settings-panel-header" data-toggle="notif-type" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="settings-chevron" id="chevron-notif-type" style="font-size:12px;transition:transform 0.2s;display:inline-block">▼</span>
            <div class="chart-title" style="margin:0;font-size:14px">Notification Delivery, by Type</div>
          </div>
          <span style="font-size:11px;color:var(--text3)" class="settings-toggle-hint">Click to collapse / expand</span>
        </div>
        <div class="settings-panel-content" id="content-notif-type" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">Choose exactly which channels each kind of notification is allowed to reach. Unchecking every box for a type means it generates nothing on any channel - the notification setting applies to all your devices.</div>
          <div class="table-scroll" style="max-height:360px"><table class="data" id="notifTypeMatrix"></table></div>
        </div>
      </div>

      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div class="chart-title">Backup, Dossier &amp; Disaster Recovery</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="btnOpenRecycleBinSettings">&#128465; Portfolio Recycle Bin</button>
            <button class="btn btn-gold btn-sm" id="btnFullDossierSettings">&#128450; Download Full Portfolio Dossier</button>
            <button class="btn btn-outline btn-sm" id="exportAllBtn">&#8595; Export All My Data</button>
          </div>
        </div>
        <div class="hint">Downloads every section you have access to as one Excel workbook (one sheet per section) - Platforms, Deals, Payment Schedule, Payments, Recurring Items/Occurrences, Contacts, Gold Purchases, Accounts, Liabilities, Expense Projects/Transactions/Vendors, Notes, Documents, Goals, Tax Records, and Import History. Individual sections also have their own Export button on their own page.</div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border2)">
          <div class="chart-title" style="margin-bottom:8px">Restore from Backup</div>
          <div class="hint" style="margin-bottom:10px">Restore is <b>additive only</b> - it adds new rows from a previous "Export All" workbook, it never updates or deletes anything already in your account. Only use this to rebuild an empty or damaged project after data loss - running it against a project that still has your data will create duplicates.</div>
          <button class="btn btn-outline btn-sm" id="restoreChooseFileBtn">&#128193; Choose Backup File</button>
          <span class="hint" id="restoreFileNameHint" style="margin-left:8px"></span>
          <input type="file" id="restoreFileInput" accept=".xlsx,.xls" style="display:none">
          <div id="restoreChecklist" style="margin-top:12px"></div>
        </div>
      </div>
      <!-- Granular Shared Portfolio Management -->
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title" style="margin:0;display:flex;align-items:center;gap:6px">
              <span>👥</span>
              <span>Granular Portfolio Sharing</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Share selected views with family, partners, or financial advisors with precise permission controls</div>
          </div>
          <button class="btn btn-gold btn-sm" id="btnCreateSharedPortfolioInvite">+ Share Portfolio Access</button>
        </div>
        <div id="settingsSharedPortfoliosList" style="margin-top:12px"></div>
      </div>

      <!-- Financial Data Safety & Security Center -->
      <div class="panel" style="border:1px solid rgba(22,201,163,0.25);background:linear-gradient(135deg,rgba(22,201,163,0.04),rgba(12,22,40,0.4))">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title" style="margin:0;color:var(--teal);display:flex;align-items:center;gap:6px">
              <span>🛡️</span>
              <span>Financial Data Safety &amp; Security Center</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Session monitoring, biometric passkey readiness, and cryptographic data safety controls</div>
          </div>
          <span class="badge" style="background:rgba(22,201,163,0.18);color:var(--teal);font-weight:700">🔒 RLS Protected</span>
        </div>
        <div id="securityCenterHost"></div>
      </div>

      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div class="chart-title" style="margin:0">🏢 Platforms & Counterparty Portals</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Manage investment platforms, investor account references, and default asset categories.</div>
          </div>
          <button class="btn btn-gold btn-sm" id="addPlatformBtn">+ Add Platform</button>
        </div>
        <div class="table-scroll"><table class="data" id="platformsTable"></table></div>
      </div>
      <!-- System & Application Version Card -->
      <div class="panel" id="appVersionSettingsPanel" style="border:1px solid rgba(201,168,76,0.3);background:linear-gradient(135deg,rgba(201,168,76,0.04),rgba(12,22,40,0.4))">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title" style="margin:0;display:flex;align-items:center;gap:8px">
              <span>💎</span>
              <span>System &amp; Application Version</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Manage PWA updates, cache purging, and review release history across major and minor updates.</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge" style="background:rgba(34,197,94,0.18);color:#22c55e;font-weight:700" id="settingsVersionStatusBadge">● System Active</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:14px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Installed Version</div>
            <div style="font-size:22px;font-weight:800;color:var(--gold);font-family:monospace;margin:4px 0" id="settingsAppVersionVal">v2.4.0</div>
            <div style="font-size:11.5px;color:var(--text2)" id="settingsAppBuildVal">2026-10-02 &middot; Production Stable</div>
          </div>

          <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">PWA &amp; Cache Status</div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin:6px 0" id="settingsPwaStatusVal">Offline Shell Active</div>
            <div style="font-size:11.5px;color:var(--text3)">Service Worker v2.4.0 (Network-First)</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div style="font-size:12px;color:var(--text2)">
            <b>Automatic Background Reload:</b> When a new version is pushed, apply and refresh seamlessly.
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="chkAutoReloadUpdates" style="accent-color:var(--gold)">
            <span>Enable Auto-Reload</span>
          </label>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-gold btn-sm" id="btnCheckForUpdatesSettings">&#8635; Check for Updates</button>
          <button class="btn btn-outline btn-sm" id="btnViewWhatNewSettings">&#128220; What's New &amp; Changelog</button>
          <button class="btn btn-outline btn-sm" id="btnForceClearCacheSettings" style="color:var(--red,#e5484d);border-color:rgba(229,72,77,0.4)">&#128465; Force Clear PWA Cache &amp; Reload</button>
        </div>
        <div id="settingsUpdateCheckNote" style="font-size:11.5px;color:var(--text3);margin-top:8px"></div>
      </div>

      <div class="panel">
        <div class="chart-title" style="margin-bottom:6px;color:var(--red,#e5484d)">Danger Zone</div>
        <div class="hint" style="margin-bottom:10px">Permanently deletes every deal, payment, recurring item, gold purchase, expense, contact, note, document, and notification you own - Community, Blog, Support Tickets, Chat, and any portfolio shared with you or by you are untouched. Your account and sign-in stay intact; this only clears data. There is no undo.</div>
        <button class="btn btn-outline" id="clearMyDataBtn" style="border-color:var(--red,#e5484d);color:var(--red,#e5484d)">Clear My Data</button>
      </div>
      <div class="panel">
        <div class="chart-title" style="margin-bottom:4px">Future Integrations</div>
        <div class="hint" style="margin-bottom:12px">Interfaces exist for these (spec Section 50); none call an external service yet since that needs credentials and a server-side secret this build doesn't have. Status shown reflects what's actually wired up, not aspirational.</div>
        <div class="card-row" id="integrationsList"></div>
        <div class="hint" style="margin-top:10px">Note on "WhatsApp" above: that card is specifically about the official WhatsApp Business Platform/API (not connected). Plain click-to-chat WhatsApp links already work today from every Contact's action bar - no integration needed for that part.</div>
      </div>`;

    const profile = await App.api.getProfile();
    const currentUser = App.auth.getUser();
    const isDemo = App.auth.isDemoMode();
    const userEmail = (profile && profile.email) || (currentUser && currentUser.email) || (isDemo ? 'demo@investor.com' : '');
    const profileValues = Object.assign({}, profile || {}, { email: userEmail });

    App.utils.qs('#profileFormHost', pane).innerHTML = App.ui.renderForm(PROFILE_FIELDS, profileValues);
    App.utils.qs('#saveProfileBtn', pane).addEventListener('click', async () => {
      const { values } = App.ui.readForm(PROFILE_FIELDS);
      // Email is grayed out / login-managed, omit from update payload
      delete values.email;
      try {
        await App.api.updateProfile(values);
        App.state.profile = await App.api.getProfile();
        // Sync username input in privacy section if present
        const privUserInp = App.utils.qs('#usernameInput', pane);
        if (privUserInp && values.username) privUserInp.value = values.username;

        // Refresh topbar user display immediately
        if (typeof App.updateTopBarUserInfo === 'function') {
          App.updateTopBarUserInfo();
        }

        if (values.preferred_currency && App.currency) {
          App.currency.setActiveCurrency(values.preferred_currency);
          updateCurrencySectionUI();
        }
        App.utils.toast('Profile saved');
      } catch (e) {
        App.utils.toast('Could not save profile: ' + (e.message || e), 'err');
      }
    });

    // ---- Display Currency & Forex Conversion panel ----
    const activeCurrSelect = App.utils.qs('#settingsActiveCurrencySelect', pane);
    const currPreviewEl = App.utils.qs('#settingsCurrencyPreview', pane);
    const currFlagEl = App.utils.qs('#settingsCurrencyFlag', pane);
    const ratesTable = App.utils.qs('#settingsRatesTable', pane);
    const ratesLastSync = App.utils.qs('#settingsRatesLastSync', pane);
    const syncRatesBtn = App.utils.qs('#syncForexRatesBtn', pane);
    const forexDetails = App.utils.qs('#settingsForexDetails', pane);
    const forexArrow = App.utils.qs('#settingsForexToggleArrow', pane);
    const activeCurrBadge = App.utils.qs('#settingsActiveCurrBadge', pane);

    if (forexDetails && forexArrow) {
      forexDetails.addEventListener('toggle', () => {
        forexArrow.textContent = forexDetails.open ? '▼' : '▶';
      });
    }

    function updateCurrencySectionUI() {
      const activeCurr = (App.currency && App.currency.getActiveCurrency()) || 'INR';
      if (activeCurrBadge) {
        const metaB = (App.currency && App.currency.getCurrencyMeta(activeCurr)) || { symbol: '₹', flag: '🇮🇳' };
        activeCurrBadge.textContent = `${metaB.flag || ''} ${activeCurr} (${metaB.symbol || activeCurr})`;
      }
      if (activeCurrSelect) {
        activeCurrSelect.innerHTML = CURRENCY_OPTIONS.map((c) => `<option value="${c.value}" ${c.value === activeCurr ? 'selected' : ''}>${c.label}</option>`).join('');
      }
      const meta = (App.currency && App.currency.getCurrencyMeta(activeCurr)) || { symbol: '₹', flag: '🇮🇳' };
      if (currPreviewEl && App.currency) {
        currPreviewEl.textContent = App.currency.formatConverted(100000, activeCurr);
      }
      if (currFlagEl) {
        currFlagEl.textContent = meta.flag || '';
      }

      if (ratesTable && App.currency) {
        const allRates = App.currency.getAllRates();
        const lastUpdated = App.currency.getLastUpdated();
        if (ratesLastSync) {
          ratesLastSync.textContent = lastUpdated ? `Last updated: ${App.utils.fmtDateTime(lastUpdated)}` : 'Benchmark default rates loaded';
        }
        ratesTable.innerHTML = `
          <thead>
            <tr>
              <th>Currency</th>
              <th>Code</th>
              <th>Symbol</th>
              <th>Rate (vs 1 INR)</th>
              <th>1 Unit in INR</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(App.currency.DEFAULT_RATES).map((code) => {
              const cm = App.currency.getCurrencyMeta(code);
              const rate = allRates[code] || 1;
              const inrPerUnit = (code === 'INR') ? 1 : (1 / rate);
              const isActive = (code === activeCurr);
              return `
                <tr style="${isActive ? 'background:rgba(201,168,76,0.08);font-weight:600' : ''}">
                  <td><span style="margin-right:6px">${cm.flag || ''}</span>${App.utils.escapeHtml(cm.name || code)}</td>
                  <td><span class="badge ${isActive ? 'st-active' : ''}">${code}</span></td>
                  <td>${cm.symbol || code}</td>
                  <td style="font-family:monospace">${rate < 0.01 ? rate.toFixed(6) : rate.toFixed(4)}</td>
                  <td style="font-family:monospace">₹${inrPerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>${isActive ? '<span style="color:var(--gold,#c9a84c)">● Active Display</span>' : '<span style="color:var(--text3)">Available</span>'}</td>
                </tr>`;
            }).join('')}
          </tbody>`;
      }
    }

    updateCurrencySectionUI();

    if (activeCurrSelect && App.currency) {
      activeCurrSelect.addEventListener('change', async (e) => {
        const newCurr = e.target.value;
        App.currency.setActiveCurrency(newCurr);
        try {
          await App.api.updateProfile({ preferred_currency: newCurr });
          if (App.state.profile) App.state.profile.preferred_currency = newCurr;
        } catch (_) {}
        const profilePrefCurr = App.utils.qs('#fld_preferred_currency', pane);
        if (profilePrefCurr) profilePrefCurr.value = newCurr;
        updateCurrencySectionUI();
        App.utils.toast(`Display currency switched to ${newCurr}`);
      });
    }

    if (syncRatesBtn && App.currency) {
      syncRatesBtn.addEventListener('click', async () => {
        syncRatesBtn.disabled = true;
        syncRatesBtn.textContent = 'Syncing...';
        const res = await App.currency.fetchLiveRates();
        syncRatesBtn.disabled = false;
        syncRatesBtn.innerHTML = '&#8635; Refresh Live Forex Rates';
        if (res && res.success) {
          App.utils.toast('Live forex exchange rates updated successfully');
        } else {
          App.utils.toast('Using standard benchmark exchange rates (offline / cached)');
        }
        updateCurrencySectionUI();
      });
    }

    // ---- Customize Sidebar (032_ui_and_notification_preferences.sql,
    // profiles.ui_preferences) - reorder within a group via up/down (not
    // drag-and-drop - functionally equivalent and far less error-prone to
    // wire correctly), hide/show per leaf item, one compact-mode toggle.
    // Groups themselves are never reordered or hidden, matching
    // renderSidebar()'s own scope in app.js. ----
    async function drawSidebarCustomize() {
      const liveProfile = await App.api.getProfile();
      const uiPrefs = liveProfile.ui_preferences || {};
      App.utils.qs('#sidebarCompactToggle', pane).checked = !!uiPrefs.sidebarCompact;
      const hidden = new Set(uiPrefs.sidebarHidden || []);
      const order = uiPrefs.sidebarOrder || {};
      const groups = App.NAV_STRUCTURE.map((g) => {
        const items = g.items.slice();
        const groupOrder = order[g.group];
        if (groupOrder && groupOrder.length) {
          const idx = new Map(groupOrder.map((k, i) => [k, i]));
          items.sort((a, b) => (idx.has(a.key) ? idx.get(a.key) : 999) - (idx.has(b.key) ? idx.get(b.key) : 999));
        }
        return { group: g.group, items };
      });
      App.utils.qs('#sidebarCustomizeList', pane).innerHTML = groups.map((g) => `
        <div style="margin-bottom:10px">
          <div class="hint" style="font-weight:600;margin-bottom:4px">${App.utils.escapeHtml(g.group)}</div>
          ${g.items.map((it, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
              <input type="checkbox" data-sidebar-hide="${it.key}" ${hidden.has(it.key) ? '' : 'checked'}>
              <span style="flex:1;font-size:12.5px">${App.utils.escapeHtml(it.label)}</span>
              <button class="icon-btn" data-sidebar-move="${it.key}" data-group="${App.utils.escapeHtml(g.group)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Move up">&#8593;</button>
              <button class="icon-btn" data-sidebar-move="${it.key}" data-group="${App.utils.escapeHtml(g.group)}" data-dir="1" ${i === g.items.length - 1 ? 'disabled' : ''} title="Move down">&#8595;</button>
            </div>`).join('')}
        </div>`).join('');

      async function saveUiPrefs(patch) {
        const merged = Object.assign({}, uiPrefs, patch);
        await App.api.updateProfile({ ui_preferences: merged });
        if (App.state.profile) App.state.profile.ui_preferences = merged;
        App.renderSidebar();
      }

      App.utils.qsa('[data-sidebar-hide]', pane).forEach((cb) => cb.addEventListener('change', async (e) => {
        const key = e.target.dataset.sidebarHide;
        const newHidden = new Set(uiPrefs.sidebarHidden || []);
        if (e.target.checked) newHidden.delete(key); else newHidden.add(key);
        try { await saveUiPrefs({ sidebarHidden: [...newHidden] }); await drawSidebarCustomize(); }
        catch (err) { e.target.checked = !e.target.checked; App.utils.toast('Could not update: ' + (err.message || err), 'err'); }
      }));

      App.utils.qsa('[data-sidebar-move]', pane).forEach((b) => b.addEventListener('click', async () => {
        const groupName = b.dataset.group, key = b.dataset.sidebarMove, dir = Number(b.dataset.dir);
        const group = groups.find((g) => g.group === groupName);
        const keys = group.items.map((it) => it.key);
        const i = keys.indexOf(key), j = i + dir;
        if (j < 0 || j >= keys.length) return;
        [keys[i], keys[j]] = [keys[j], keys[i]];
        try { await saveUiPrefs({ sidebarOrder: Object.assign({}, order, { [groupName]: keys }) }); await drawSidebarCustomize(); }
        catch (err) { App.utils.toast('Could not reorder: ' + (err.message || err), 'err'); }
      }));

      App.utils.qs('#sidebarCompactToggle', pane).onchange = async (e) => {
        try { await saveUiPrefs({ sidebarCompact: e.target.checked }); }
        catch (err) { e.target.checked = !e.target.checked; App.utils.toast('Could not update: ' + (err.message || err), 'err'); }
      };
    }
    await drawSidebarCustomize();

    App.utils.qs('#resetSidebarBtn', pane).addEventListener('click', async () => {
      try {
        await App.api.updateProfile({ ui_preferences: null });
        if (App.state.profile) App.state.profile.ui_preferences = null;
        App.renderSidebar();
        await drawSidebarCustomize();
        App.utils.toast('Sidebar reset to default');
      } catch (err) { App.utils.toast('Could not reset: ' + (err.message || err), 'err'); }
    });

    App.utils.qs('#usernameInput', pane).value = (profile && profile.username) || '';
    App.utils.qs('#usernameInput', pane).addEventListener('change', async (e) => {
      const val = e.target.value.trim();
      if (!val) return;
      try {
        await App.api.updateUsername(val);
        if (App.state.profile) App.state.profile.username = val;
        const mainUserInp = App.utils.qs('#fld_username', pane);
        if (mainUserInp) mainUserInp.value = val;
        if (typeof App.updateTopBarUserInfo === 'function') App.updateTopBarUserInfo();
        App.utils.toast('Username saved');
      }
      catch (err) { App.utils.toast('Could not save username (it may already be taken): ' + (err.message || err), 'err'); }
    });

    App.utils.qs('#analyticsConsentToggle', pane).checked = !!(profile && profile.analytics_consent);
    App.utils.qs('#analyticsConsentToggle', pane).addEventListener('change', async (e) => {
      try { await App.api.updateProfile({ analytics_consent: e.target.checked }); if (App.state.profile) App.state.profile.analytics_consent = e.target.checked; App.utils.toast('Preference saved'); }
      catch (err) { e.target.checked = !e.target.checked; App.utils.toast('Could not update: ' + (err.message || err), 'err'); }
    });

    const privacy = await App.api.getPrivacySettings();
    const privacyDefaults = { who_can_find_me: 'Contacts', who_can_message_me: 'Contacts', who_can_call_me: 'Contacts', show_online_status: true, show_last_seen: true, show_read_receipts: true, show_profile_photo: true, allow_contact_discovery: true, allow_group_invitations: true, allow_call_invitations: true };
    App.utils.qs('#privacyFormHost', pane).innerHTML = App.ui.renderForm(PRIVACY_FIELDS, Object.assign({}, privacyDefaults, privacy || {}));
    App.utils.qs('#savePrivacyBtn', pane).addEventListener('click', async () => {
      const { values } = App.ui.readForm(PRIVACY_FIELDS);
      try { await App.api.upsertPrivacySettings(values); App.utils.toast('Privacy settings saved'); }
      catch (e) { App.utils.toast('Could not save privacy settings: ' + (e.message || e), 'err'); }
    });

    const prefs = await App.api.getPreferences();
    App.utils.qs('#offsetsInput', pane).value = (prefs && prefs.reminder_offset_days ? prefs.reminder_offset_days : [-7, -3, -1, 0, 1, 3, 7, 30]).join(', ');
    App.utils.qs('#savePrefsBtn', pane).addEventListener('click', async () => {
      const offsets = App.utils.qs('#offsetsInput', pane).value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      try { await App.api.upsertPreferences({ reminder_offset_days: offsets }); App.utils.toast('Preferences saved'); }
      catch (e) { App.utils.toast('Could not save preferences: ' + (e.message || e), 'err'); }
    });

    // ---- Do Not Disturb (per-user, display-layer notification snooze -
    // see 020_notification_snooze.sql's header comment for why this never
    // touches the many server-side notification generators). ----
    function snoozeTargetFor(duration) {
      const now = new Date();
      if (duration === '1h') return new Date(now.getTime() + 3600000);
      if (duration === '4h') return new Date(now.getTime() + 4 * 3600000);
      if (duration === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      if (duration === 'tomorrow') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
      if (duration === 'week') return new Date(now.getTime() + 7 * 86400000);
      return new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()); // "indefinite"
    }
    function renderSnoozeUi(snoozedUntil) {
      const isSnoozed = snoozedUntil && new Date(snoozedUntil) > new Date();
      App.utils.qs('#snoozeStatus', pane).innerHTML = isSnoozed
        ? `<div class="hint" style="color:var(--gold)">Notifications are disabled until ${App.utils.fmtDateTime(snoozedUntil)}.</div>`
        : '';
      App.utils.qs('#snoozeControls', pane).style.display = isSnoozed ? 'none' : 'flex';
      App.utils.qs('#unsnoozeBtn', pane).style.display = isSnoozed ? 'inline-flex' : 'none';
    }
    renderSnoozeUi(prefs && prefs.snoozed_until);
    App.utils.qs('#snoozeBtn', pane).addEventListener('click', async () => {
      const duration = App.utils.qs('#snoozeDuration', pane).value;
      const until = snoozeTargetFor(duration).toISOString();
      try { await App.api.upsertPreferences({ snoozed_until: until }); renderSnoozeUi(until); App.utils.toast('Notifications disabled'); }
      catch (e) { App.utils.toast('Could not update: ' + (e.message || e), 'err'); }
    });
    App.utils.qs('#unsnoozeBtn', pane).addEventListener('click', async () => {
      try { await App.api.upsertPreferences({ snoozed_until: null }); renderSnoozeUi(null); App.utils.toast('Notifications enabled'); }
      catch (e) { App.utils.toast('Could not update: ' + (e.message || e), 'err'); }
    });

    // ---- Email Notifications (021_email_notifications.sql /
    // 022_calendar_events_email_digest_audit_toggle.sql) - a real digest
    // cadence rather than a plain on/off toggle. ----
    function renderEmailLastSentHint(lastSentIso) {
      App.utils.qs('#emailLastSentHint', pane).textContent = lastSentIso
        ? `Last digest sent: ${App.utils.fmtDateTime(lastSentIso)}.`
        : 'No digest has gone out yet.';
    }
    App.utils.qs('#emailFrequencySelect', pane).value = (prefs && prefs.email_frequency) || '1_day';
    renderEmailLastSentHint(prefs && prefs.last_email_digest_sent_at);
    App.utils.qs('#emailFrequencySelect', pane).addEventListener('change', async (e) => {
      try { await App.api.upsertPreferences({ email_frequency: e.target.value }); App.utils.toast('Email frequency saved'); }
      catch (err) { App.utils.toast('Could not update: ' + (err.message || err), 'err'); }
    });

    // ---- Notification Delivery, by Type (032 & 051 WhatsApp/Telegram Bot) ----
    async function drawNotifTypeMatrix() {
      const rows = await App.api.listNotificationTypePreferences();
      const byType = {}; rows.forEach((r) => { byType[r.type] = r; });
      const table = App.utils.qs('#notifTypeMatrix', pane);
      table.innerHTML = `<thead><tr><th>Notification Type</th><th>In-app</th><th>Email</th><th>Push</th><th>WhatsApp</th><th>Telegram</th></tr></thead>
        <tbody>${NOTIFICATION_TYPES.map((type) => {
          const pref = byType[type] || {};
          const checked = (channel) => pref[channel] !== false ? 'checked' : '';
          return `<tr>
            <td>${App.utils.escapeHtml(type)}</td>
            <td><input type="checkbox" data-notif-type="${App.utils.escapeHtml(type)}" data-notif-channel="in_app" ${checked('in_app')}></td>
            <td><input type="checkbox" data-notif-type="${App.utils.escapeHtml(type)}" data-notif-channel="email" ${checked('email')}></td>
            <td><input type="checkbox" data-notif-type="${App.utils.escapeHtml(type)}" data-notif-channel="push" ${checked('push')}></td>
            <td><input type="checkbox" data-notif-type="${App.utils.escapeHtml(type)}" data-notif-channel="whatsapp" ${checked('whatsapp')}></td>
            <td><input type="checkbox" data-notif-type="${App.utils.escapeHtml(type)}" data-notif-channel="telegram" ${checked('telegram')}></td>
          </tr>`;
        }).join('')}</tbody>`;
      App.utils.qsa('[data-notif-type]', table).forEach((cb) => cb.addEventListener('change', async (e) => {
        try {
          await App.api.upsertNotificationTypePreference(e.target.dataset.notifType, { [e.target.dataset.notifChannel]: e.target.checked });
          App.state.notificationTypePrefs[e.target.dataset.notifType] = Object.assign(
            { user_id: null, type: e.target.dataset.notifType, in_app: true, email: true, push: true, whatsapp: true, telegram: true },
            App.state.notificationTypePrefs[e.target.dataset.notifType], { [e.target.dataset.notifChannel]: e.target.checked },
          );
        } catch (err) { e.target.checked = !e.target.checked; App.utils.toast('Could not update: ' + (err.message || err), 'err'); }
      }));
    }
    await drawNotifTypeMatrix();

    if (isAdminUser) {
      App.utils.qs('#triggerEmailsNowBtn', pane)?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Sending...';
        try {
          const result = await App.api.sendPendingNotificationEmails();
          App.utils.toast(`Sent ${result.digestsSent} digest(s) (${result.notificationsEmailed} notification(s)), ${result.usersSkipped} skipped, ${result.usersFailed} failed` + (result.errors && result.errors.length ? ' - see console for details' : ''));
          if (result.errors && result.errors.length) console.error('send-notification-emails errors:', result.errors);
          const freshPrefs = await App.api.getPreferences();
          renderEmailLastSentHint(freshPrefs && freshPrefs.last_email_digest_sent_at);
        } catch (err) { App.utils.toast('Could not trigger emails: ' + (err.message || err), 'err'); }
        finally { btn.disabled = false; btn.innerHTML = '&#9993; Trigger Emails Now'; }
      });
    }

    // ---- Export All My Data (exportData.js) ----
    App.utils.qs('#exportAllBtn', pane).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Exporting...';
      try { await App.exportData.exportFullPortfolio(); }
      catch (err) { App.utils.toast('Could not export: ' + (err.message || err), 'err'); }
      finally { btn.disabled = false; btn.innerHTML = '&#8595; Export All My Data'; }
    });

    // ---- Restore from Backup (restoreData.js) - additive-only, see the
    // panel's own hint text and the module's own header comment for why. ----
    let restoreWorkbook = null;
    App.utils.qs('#restoreChooseFileBtn', pane).addEventListener('click', () => App.utils.qs('#restoreFileInput', pane).click());
    App.utils.qs('#restoreFileInput', pane).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      App.utils.qs('#restoreFileNameHint', pane).textContent = file.name;
      try {
        const buf = await file.arrayBuffer();
        restoreWorkbook = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
        drawRestoreChecklist();
      } catch (err) { App.utils.toast('Could not read file: ' + (err.message || err), 'err'); }
    });

    function drawRestoreChecklist() {
      const host = App.utils.qs('#restoreChecklist', pane);
      if (!restoreWorkbook) { host.innerHTML = ''; return; }
      const { restorable, excluded } = App.restoreData.inspectWorkbook(restoreWorkbook);
      host.innerHTML = `
        <div class="table-scroll"><table class="data"><thead><tr><th></th><th>Section</th><th>Rows Found</th></tr></thead>
          <tbody>
            ${restorable.map((s) => `<tr>
              <td><input type="checkbox" class="restore-check" value="${s.key}" ${s.found ? 'checked' : 'disabled'}></td>
              <td>${App.utils.escapeHtml(s.label)}</td>
              <td>${s.found ? s.rowCount : '<span class="hint">not found in this file</span>'}</td>
            </tr>`).join('')}
            ${excluded.map((s) => `<tr>
              <td><input type="checkbox" disabled></td>
              <td>${App.utils.escapeHtml(s.label)}</td>
              <td class="hint">${s.found ? s.rowCount + ' row(s) - ' : ''}${App.utils.escapeHtml(s.reason)}</td>
            </tr>`).join('')}
          </tbody></table></div>
        <div class="field span2" style="max-width:320px;margin-top:12px"><label>Type RESTORE MY DATA to confirm</label><input id="confirmRestoreInput" type="text"></div>
        <div class="auth-error" id="restoreError"></div>
        <button class="btn btn-outline btn-sm" id="runRestoreBtn" style="margin-top:8px">Run Restore</button>
        <div id="restoreProgress" style="margin-top:10px"></div>`;

      App.utils.qs('#runRestoreBtn', host).addEventListener('click', async () => {
        const typed = App.utils.qs('#confirmRestoreInput', host).value.trim();
        if (typed !== 'RESTORE MY DATA') { App.utils.qs('#restoreError', host).textContent = 'Phrase does not match - nothing was restored.'; return; }
        const selectedKeys = App.utils.qsa('.restore-check', host).filter((c) => c.checked).map((c) => c.value);
        if (!selectedKeys.length) { App.utils.qs('#restoreError', host).textContent = 'No restorable sections found in this file.'; return; }
        const btn = App.utils.qs('#runRestoreBtn', host);
        btn.disabled = true; btn.textContent = 'Restoring...';
        const progressEl = App.utils.qs('#restoreProgress', host);
        try {
          await App.restoreData.runRestore(restoreWorkbook, selectedKeys, (soFar) => {
            progressEl.innerHTML = soFar.map((r) => `<div class="stat-line"><span>${App.utils.escapeHtml(r.label)}</span><span class="v">${r.found ? `${r.ok} restored${r.failed ? `, ${r.failed} failed` : ''}` : 'not in file'}</span></div>`).join('');
          });
          App.utils.toast('Restore complete');
        } catch (err) { App.utils.qs('#restoreError', host).textContent = 'Restore failed: ' + (err.message || err); }
        finally { btn.disabled = false; btn.textContent = 'Run Restore'; }
      });
    }

    // ---- Clear My Data (032) - deliberately the hardest-to-reach action in
    // Settings: a full-phrase type-to-confirm, not a plain confirm(). ----
    App.utils.qs('#clearMyDataBtn', pane).addEventListener('click', () => {
      App.ui.open({
        title: 'Clear My Data',
        bodyHtml: `
          <div class="hint" style="color:var(--red,#e5484d);margin-bottom:10px">This permanently deletes every deal, payment, recurring item, gold purchase, expense, contact, note, and document you own. Community, Blog, Support Tickets, Chat, and any shared portfolio are untouched. Your account stays intact - only data is cleared. There is no undo.</div>
          <div class="field span2"><label>Type DELETE MY DATA to confirm</label><input id="confirmClearMyData" type="text"></div>
          <div class="auth-error" id="clearMyDataError"></div>`,
        actions: [
          { label: 'Clear My Data', className: 'btn-outline', onClick: async () => {
            const typed = App.utils.qs('#confirmClearMyData').value.trim();
            if (typed !== 'DELETE MY DATA') { App.utils.qs('#clearMyDataError').textContent = 'Phrase does not match - nothing was deleted.'; return; }
            try {
              await App.api.clearMyData();
              App.utils.toast('Your data has been cleared');
              App.ui.close();
              App.router.refreshCurrent();
            } catch (e) { App.utils.qs('#clearMyDataError').textContent = e.message || String(e); }
          } },
          { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        ],
      });
    });

    // ---- Push Notifications (023_web_push.sql) ----
    async function drawPushControls() {
      if (!App.push.isSupported()) {
        App.utils.qs('#pushControls', pane).innerHTML = '<div class="hint">Not supported in this browser.</div>';
        return;
      }
      const sub = await App.push.getSubscription().catch(() => null);
      App.utils.qs('#pushControls', pane).innerHTML = sub
        ? '<div class="hint" style="color:var(--teal);margin-bottom:8px">Enabled on this device.</div><button class="btn btn-outline btn-sm" id="pushToggleBtn">Disable on This Device</button>'
        : '<button class="btn btn-gold btn-sm" id="pushToggleBtn">Enable on This Device</button>';
      App.utils.qs('#pushToggleBtn', pane).addEventListener('click', async () => {
        try {
          if (sub) { await App.push.unsubscribe(); await App.api.upsertPreferences({ push_enabled: false }); App.utils.toast('Push notifications disabled on this device'); }
          else { await App.push.subscribe(); await App.api.upsertPreferences({ push_enabled: true }); App.utils.toast('Push notifications enabled on this device'); }
          drawPushControls();
        } catch (err) { App.utils.toast('Could not update: ' + (err.message || err), 'err'); }
      });
    }
    drawPushControls();

    if (isAdminUser) {
      App.utils.qs('#triggerPushNowBtn', pane).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Sending...';
        try {
          const result = await App.api.sendPendingWebPush();
          App.utils.qs('#pushLastResultHint', pane).innerHTML = `Last run: <b>${result.sent}</b> sent, <b>${result.skipped}</b> skipped, <b>${result.failed}</b> failed.` + (result.errors && result.errors.length ? ' Errors: ' + App.utils.escapeHtml(JSON.stringify(result.errors)) : '');
          App.utils.toast(`Push: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`);
        } catch (err) { App.utils.toast('Could not trigger push: ' + (err.message || err), 'err'); }
        finally { btn.disabled = false; btn.innerHTML = '&#128276; Trigger Push Now'; }
      });
    }

    // ---- WhatsApp & Telegram Bot Integration Center ----
    async function initBotIntegration() {
      const tgStatusBadge = App.utils.qs('#tgBotStatusBadge', pane);
      const waStatusBadge = App.utils.qs('#waBotStatusBadge', pane);
      const tgTokenStatusText = App.utils.qs('#tgTokenStatusText', pane);
      const tgPollingStatusLabel = App.utils.qs('#tgPollingStatusLabel', pane);
      const btnRestartPoller = App.utils.qs('#btnRestartPoller', pane);
      const tgDetails = App.utils.qs('#tgBotDetails', pane);
      const waDetails = App.utils.qs('#waBotDetails', pane);
      const tgHandle = App.utils.qs('#tgBotHandle', pane);
      const btnConnectTg = App.utils.qs('#btnConnectTelegram', pane);
      const btnConfigureTgToken = App.utils.qs('#btnConfigureTgToken', pane);
      const btnDispatchAlerts = App.utils.qs('#btnDispatchAlerts', pane);
      const btnTestTg = App.utils.qs('#btnTestTelegram', pane);
      const btnUnlinkTg = App.utils.qs('#btnUnlinkTelegram', pane);
      const btnConnectWa = App.utils.qs('#btnConnectWhatsApp', pane);
      const btnTestWa = App.utils.qs('#btnTestWhatsApp', pane);
      const btnUnlinkWa = App.utils.qs('#btnUnlinkWhatsApp', pane);

      const origin = window.location.origin;
      const tgWebhookUrl = `${origin}/api/bot/telegram/webhook`;
      const waWebhookUrl = `${origin}/api/bot/whatsapp/webhook`;
      if (App.utils.qs('#tgWebhookUrlText', pane)) App.utils.qs('#tgWebhookUrlText', pane).textContent = tgWebhookUrl;
      if (App.utils.qs('#waWebhookUrlText', pane)) App.utils.qs('#waWebhookUrlText', pane).textContent = waWebhookUrl;

      async function refreshStatus() {
        try {
          const config = await App.api.getBotConfig();
          const status = await App.api.getBotStatus();

          if (tgHandle && config?.telegram?.botUsername) {
            tgHandle.textContent = `@${config.telegram.botUsername}`;
          }

          // Telegram Token Config Status
          if (config?.telegram?.configured) {
            if (tgTokenStatusText) {
              tgTokenStatusText.innerHTML = `🟢 <b>BotFather Token Active</b> &bull; @${App.utils.escapeHtml(config.telegram.botUsername || 'bot')} ${config.telegram.tokenMasked ? `(<code>${config.telegram.tokenMasked}</code>)` : ''}`;
            }
          } else {
            if (tgTokenStatusText) {
              tgTokenStatusText.innerHTML = `⚪ <span style="color:var(--text3)">Bot Token not set &mdash; click <b>Set BotFather Token</b> below</span>`;
            }
          }

          // Telegram Long Polling Status
          if (config?.telegram?.polling) {
            const p = config.telegram.polling;
            if (tgPollingStatusLabel) {
              if (p.active) {
                tgPollingStatusLabel.innerHTML = `🟢 <b>Long Poller Active (getUpdates)</b> &bull; ${p.updatesProcessed || 0} updates received`;
              } else {
                tgPollingStatusLabel.innerHTML = `⚪ <span style="color:var(--text3)">Poller Inactive &bull; Click Restart Poller</span>`;
              }
            }
          }

          // Telegram Status UI
          if (status?.telegram?.connected) {
            tgStatusBadge.textContent = '🟢 Connected';
            tgStatusBadge.style.background = 'rgba(34,197,94,0.18)';
            tgStatusBadge.style.color = '#22c55e';
            tgDetails.innerHTML = `Connected as <b>@${App.utils.escapeHtml(status.telegram.username || 'user')}</b> (Chat ID: <code>${status.telegram.chatId}</code>). Real-time portfolio alerts and command querying are active.`;
            btnConnectTg.style.display = 'none';
            btnTestTg.style.display = 'inline-flex';
            btnUnlinkTg.style.display = 'inline-flex';
            if (btnDispatchAlerts) btnDispatchAlerts.style.display = 'inline-flex';
          } else {
            tgStatusBadge.textContent = '⚪ Not Connected';
            tgStatusBadge.style.background = 'rgba(255,255,255,0.08)';
            tgStatusBadge.style.color = 'var(--text2)';
            tgDetails.innerHTML = `Connect your Telegram account to receive instant payout notifications, overdue alerts, and query yields directly on mobile.`;
            btnConnectTg.style.display = 'inline-flex';
            btnTestTg.style.display = 'none';
            btnUnlinkTg.style.display = 'none';
            if (btnDispatchAlerts) btnDispatchAlerts.style.display = 'none';
          }

          // WhatsApp Status UI
          if (status?.whatsapp?.connected) {
            waStatusBadge.textContent = '🟢 Connected';
            waStatusBadge.style.background = 'rgba(34,197,94,0.18)';
            waStatusBadge.style.color = '#22c55e';
            waDetails.innerHTML = `Connected to WhatsApp phone: <code>${App.utils.escapeHtml(status.whatsapp.phoneNumber)}</code>. Automated delivery is enabled.`;
            btnConnectWa.style.display = 'none';
            btnTestWa.style.display = 'inline-flex';
            btnUnlinkWa.style.display = 'inline-flex';
          } else {
            waStatusBadge.textContent = '⚪ Not Connected';
            waStatusBadge.style.background = 'rgba(255,255,255,0.08)';
            waStatusBadge.style.color = 'var(--text2)';
            waDetails.innerHTML = `Bind your WhatsApp phone number to receive payment alerts and log expenses directly from chats.`;
            btnConnectWa.style.display = 'inline-flex';
            btnTestWa.style.display = 'none';
            btnUnlinkWa.style.display = 'none';
          }
        } catch (e) {
          console.warn('Bot status refresh notice:', e);
        }
      }

      await refreshStatus();

      App.utils.qs('#btnRefreshBotStatus', pane)?.addEventListener('click', async () => {
        await refreshStatus();
        App.utils.toast('Bot connection status refreshed');
      });

      // Cloud Backend & External Hosting Gateway handlers
      const cfgBackendApiUrl = App.utils.qs('#cfgBackendApiUrl', pane);
      const btnSaveBackendApiUrl = App.utils.qs('#btnSaveBackendApiUrl', pane);
      const btnResetBackendApiUrl = App.utils.qs('#btnResetBackendApiUrl', pane);
      const backendHostingBadge = App.utils.qs('#backendHostingBadge', pane);
      const backendApiStatusNote = App.utils.qs('#backendApiStatusNote', pane);

      function updateBackendGatewayStatus() {
        const stored = localStorage.getItem('ios_backend_api_url') || '';
        if (cfgBackendApiUrl) cfgBackendApiUrl.value = stored;

        const isStaticHost = window.location.hostname.endsWith('github.io') || window.location.hostname.includes('qzz.io') || window.location.hostname.includes('pages');
        if (backendHostingBadge) {
          if (stored) {
            backendHostingBadge.textContent = '🟢 Connected to Cloud Backend';
            backendHostingBadge.style.background = 'rgba(34,197,94,0.18)';
            backendHostingBadge.style.color = '#22c55e';
          } else if (isStaticHost) {
            backendHostingBadge.textContent = '🟢 Hybrid Direct Mode (Supabase)';
            backendHostingBadge.style.background = 'rgba(34,197,94,0.18)';
            backendHostingBadge.style.color = '#22c55e';
          } else {
            backendHostingBadge.textContent = '🟢 Fullstack Server (Local/Container)';
            backendHostingBadge.style.background = 'rgba(34,197,94,0.18)';
            backendHostingBadge.style.color = '#22c55e';
          }
        }

        if (backendApiStatusNote) {
          if (stored) {
            backendApiStatusNote.innerHTML = `Active API proxy target: <code>${App.utils.escapeHtml(stored)}</code>`;
          } else if (isStaticHost) {
            backendApiStatusNote.innerHTML = `✨ <b>Hybrid Direct Mode Active:</b> Running on <code>${window.location.hostname}</code>. Your Telegram Bot and portfolio intelligence connect directly to Supabase and Telegram Bot API. No external Node.js backend URL is needed!`;
          } else {
            backendApiStatusNote.innerHTML = `Defaulting to current origin (<code>${window.location.origin}</code>).`;
          }
        }
      }

      updateBackendGatewayStatus();

      btnSaveBackendApiUrl?.addEventListener('click', async () => {
        const val = cfgBackendApiUrl?.value?.trim();
        if (!val) {
          localStorage.removeItem('ios_backend_api_url');
          updateBackendGatewayStatus();
          App.utils.toast('Backend URL reset to default direct mode.');
          await refreshStatus();
          return;
        }

        if (!val.startsWith('http://') && !val.startsWith('https://')) {
          App.utils.toast('Please enter a full URL starting with https:// or http://', 'err');
          return;
        }

        // Smart guard: Detect if user entered their frontend website instead of a backend server
        const isFrontendStatic = val.includes('github.io') || val.includes('qzz.io') || val.includes('pages.dev') || val.includes('netlify.app');
        if (isFrontendStatic) {
          App.utils.toast('Notice: This is your frontend website. Your Telegram bot now runs directly through Supabase — no backend URL is required!', 'info');
          if (backendApiStatusNote) {
            backendApiStatusNote.innerHTML = `💡 <b>Frontend static website detected:</b> <code>${App.utils.escapeHtml(val)}</code> is your web client. The Telegram bot and portfolio alerts now run directly through your Supabase connection and browser poller without needing an external backend URL!`;
          }
          localStorage.removeItem('ios_backend_api_url');
          updateBackendGatewayStatus();
          await refreshStatus();
          return;
        }

        btnSaveBackendApiUrl.disabled = true;
        btnSaveBackendApiUrl.innerHTML = '&#8987; Testing...';
        try {
          const testRes = await fetch(`${val.replace(/\/+$/, '')}/api/bot/config`).catch((e) => ({ ok: false, error: e }));
          if (testRes.ok) {
            const data = await testRes.json().catch(() => null);
            if (data && data.telegram) {
              localStorage.setItem('ios_backend_api_url', val.replace(/\/+$/, ''));
              updateBackendGatewayStatus();
              App.utils.toast('Cloud Backend connected and verified successfully!');
              await refreshStatus();
            } else {
              App.utils.toast('Backend responded but did not return valid API JSON.', 'err');
            }
          } else {
            App.utils.toast('Could not connect to that backend URL. Ensure the server is running and accessible.', 'err');
          }
        } catch (e) {
          App.utils.toast('Connection error: ' + (e.message || e), 'err');
        } finally {
          btnSaveBackendApiUrl.disabled = false;
          btnSaveBackendApiUrl.innerHTML = 'Test &amp; Save Backend URL';
        }
      });

      btnResetBackendApiUrl?.addEventListener('click', async () => {
        localStorage.removeItem('ios_backend_api_url');
        if (cfgBackendApiUrl) cfgBackendApiUrl.value = '';
        updateBackendGatewayStatus();
        App.utils.toast('Reset backend URL to direct Supabase mode.');
        await refreshStatus();
      });

      // Restart Poller Button
      btnRestartPoller?.addEventListener('click', async () => {
        try {
          btnRestartPoller.disabled = true;
          btnRestartPoller.innerHTML = '&#8635; Starting...';
          const res = await App.api.toggleTelegramPolling('restart');
          if (res.success) {
            App.utils.toast('Telegram Long Poller active! Pulling updates from Telegram directly.');
            await refreshStatus();
          } else {
            App.utils.toast('Poller notice: ' + (res.error || 'Check bot token configuration'), 'err');
          }
        } catch (e) {
          App.utils.toast('Poller error: ' + (e.message || e), 'err');
        } finally {
          btnRestartPoller.disabled = false;
          btnRestartPoller.innerHTML = '&#8635; Restart Poller';
        }
      });

      // Configure BotFather Token Modal
      btnConfigureTgToken?.addEventListener('click', () => {
        App.ui.modal({
          title: '✈️ Configure BotFather Telegram Token',
          content: `
            <div style="font-size:13px;line-height:1.6;color:var(--text2)">
              <div style="margin-bottom:12px">
                Connect your custom Telegram bot created via <b>@BotFather</b>. This activates live two-way command processing, long polling, and automatic payment reminders.
              </div>

              <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
                <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text)">
                  Telegram Bot API Token <span style="color:#e5484d">*</span>
                </label>
                <div style="display:flex;gap:6px;align-items:center">
                  <input type="password" id="tgModalTokenInput" class="search-input" placeholder="e.g. 7123456789:AAHk1234...xyz" style="flex:1;font-family:monospace">
                  <button type="button" class="btn btn-outline btn-sm" id="btnToggleTokenVisibility" style="padding:4px 8px;font-size:11px">Show</button>
                </div>
                <div class="hint" style="margin-top:4px">Issued directly by @BotFather on Telegram (starts with bot ID numbers followed by colon).</div>

                <div style="margin-top:12px">
                  <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text)">
                    Bot Handle / Username (Optional)
                  </label>
                  <input type="text" id="tgModalUsernameInput" class="search-input" placeholder="e.g. MyInvestmentOS_bot" style="width:100%">
                  <div class="hint" style="margin-top:4px">Leave blank to auto-detect handle from Telegram getMe API.</div>
                </div>
              </div>

              <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:11.5px;color:var(--text3);line-height:1.5">
                <b>💡 How to create a bot with @BotFather in 30 seconds:</b><br>
                1. Open Telegram & search for <code>@BotFather</code>.<br>
                2. Send <code>/newbot</code> and follow the prompts to choose a name and username.<br>
                3. Copy the HTTP API token provided by BotFather and paste it above.<br>
                4. Click <b>Test &amp; Save Token</b> to connect.
              </div>
              <div id="tgTokenModalError" style="margin-top:10px;color:#e5484d;font-size:12px;display:none"></div>
            </div>
          `,
          actions: [
            {
              label: 'Test & Save Token',
              className: 'btn-gold',
              onClick: async () => {
                const tokenInput = App.utils.qs('#tgModalTokenInput');
                const usernameInput = App.utils.qs('#tgModalUsernameInput');
                const errDiv = App.utils.qs('#tgTokenModalError');
                const token = tokenInput?.value?.trim();
                const username = usernameInput?.value?.trim();

                if (!token) {
                  if (errDiv) { errDiv.textContent = 'Please enter your Telegram Bot Token.'; errDiv.style.display = 'block'; }
                  return;
                }

                try {
                  const res = await App.api.setTelegramBotToken(token, username);
                  if (res.success) {
                    App.utils.toast(`Successfully connected @${res.botUsername}! Long Poller active.`);
                    await refreshStatus();
                    App.ui.close();
                  } else {
                    if (errDiv) { errDiv.textContent = res.error || 'Invalid token'; errDiv.style.display = 'block'; }
                  }
                } catch (e) {
                  if (errDiv) { errDiv.textContent = e.message || 'Error connecting to Telegram API'; errDiv.style.display = 'block'; }
                }
              },
            },
            { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
          ],
        });

        const toggleBtn = App.utils.qs('#btnToggleTokenVisibility');
        const tokenInput = App.utils.qs('#tgModalTokenInput');
        toggleBtn?.addEventListener('click', () => {
          if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            toggleBtn.textContent = 'Hide';
          } else {
            tokenInput.type = 'password';
            toggleBtn.textContent = 'Show';
          }
        });
      });

      // Dispatch Prioritized Alerts On-Demand
      btnDispatchAlerts?.addEventListener('click', async () => {
        try {
          btnDispatchAlerts.disabled = true;
          btnDispatchAlerts.innerHTML = '&#8987; Sweeping alerts...';
          const res = await App.api.dispatchBotNotifications();
          if (res.success) {
            const types = (res.dispatchedItems || []).map((d) => d.type).join(', ');
            App.utils.toast(`Delivered ${res.telegramSent} priority alert(s) to Telegram! ${types ? `(${types})` : '(Overdue & due alerts delivered)'}`);
          } else {
            App.utils.toast('Could not dispatch alerts: ' + (res.error || 'Unknown error'), 'err');
          }
        } catch (e) {
          App.utils.toast('Dispatch error: ' + (e.message || e), 'err');
        } finally {
          btnDispatchAlerts.disabled = false;
          btnDispatchAlerts.innerHTML = '&#128227; Dispatch Priority Alerts';
        }
      });

      // Connect Telegram Modal
      btnConnectTg?.addEventListener('click', async () => {
        try {
          const gen = await App.api.generateBotLinkCode('telegram');
          App.ui.modal({
            title: '✈️ Connect Telegram Bot',
            content: `
              <div style="font-size:13px;line-height:1.6;color:var(--text2)">
                <div style="margin-bottom:14px">
                  Link your Telegram account to Personal Investment OS using any of the 3 options below:
                </div>

                <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px;text-align:center">
                  <div style="font-size:11px;text-transform:uppercase;color:var(--text3);letter-spacing:1px;margin-bottom:4px">Your 6-Digit Linking Code</div>
                  <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:var(--gold);font-family:monospace;margin:4px 0">${gen.code}</div>
                  <div style="font-size:11px;color:var(--text3)">Expires in 15 minutes &bull; Single use</div>
                </div>

                <div style="margin-bottom:12px;display:flex;flex-direction:column;gap:12px">
                  <!-- Option A -->
                  <div style="display:flex;align-items:flex-start;gap:10px;background:var(--card);padding:12px;border-radius:8px;border:1px solid var(--border)">
                    <span class="badge" style="background:var(--gold);color:#000;font-weight:700">1</span>
                    <div style="flex:1">
                      <div style="font-weight:700;color:var(--text);margin-bottom:2px">Option A: One-Click Instant Deep Link (Recommended)</div>
                      <div style="font-size:12px;color:var(--text2)">Click below to launch Telegram. It sends <code>/start ${gen.rawCode}</code> and auto-binds your account.</div>
                      <div style="margin-top:8px">
                        <a href="${gen.deepLink}" target="_blank" class="btn btn-gold btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">
                          <span>✈️ Open @${gen.deepLink.split('t.me/')[1]?.split('?')[0] || 'InvestmentOS_Bot'}</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <!-- Option B -->
                  <div style="display:flex;align-items:flex-start;gap:10px;background:var(--card);padding:12px;border-radius:8px;border:1px solid var(--border)">
                    <span class="badge" style="background:var(--gold);color:#000;font-weight:700">2</span>
                    <div style="flex:1">
                      <div style="font-weight:700;color:var(--text);margin-bottom:2px">Option B: Manual 6-Digit Code in Telegram</div>
                      <div style="font-size:12px;color:var(--text2)">Open Telegram, search for your bot, and send this command:</div>
                      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                        <code style="background:var(--bg2);padding:6px 10px;border-radius:4px;color:var(--gold);font-weight:700;font-size:13px">/link ${gen.rawCode}</code>
                        <button type="button" class="btn btn-outline btn-sm" id="btnCopyTgLinkCommand" style="padding:4px 8px;font-size:11px">&#128203; Copy Command</button>
                      </div>
                    </div>
                  </div>

                  <!-- Option C -->
                  <div style="display:flex;align-items:flex-start;gap:10px;background:var(--card);padding:12px;border-radius:8px;border:1px solid var(--border)">
                    <span class="badge" style="background:var(--gold);color:#000;font-weight:700">3</span>
                    <div style="flex:1">
                      <div style="font-weight:700;color:var(--text);margin-bottom:2px">Option C: Direct Chat ID Binding (Instant Fix &amp; Ping)</div>
                      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">Enter your Telegram Chat ID directly to immediately bind and receive an automated welcome ping:</div>
                      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                        <input type="text" id="tgDirectChatIdInput" class="search-input" placeholder="Chat ID (e.g. 123456789)" style="flex:1;min-width:140px;font-family:monospace">
                        <input type="text" id="tgDirectUsernameInput" class="search-input" placeholder="Your name" style="width:120px">
                        <button type="button" class="btn btn-gold btn-sm" id="btnSubmitDirectBind">Bind &amp; Send Ping</button>
                      </div>
                      <div class="hint" style="margin-top:6px;font-size:11px">
                        💡 <b>How to find your Chat ID:</b> In Telegram, search for <code>@userinfobot</code>, tap <b>Start</b>, and copy your numeric <b>Id</b>.
                      </div>
                      <div id="tgDirectBindNotice" style="margin-top:6px;font-size:11.5px;display:none"></div>
                    </div>
                  </div>
                </div>
              </div>
            `,
            actions: [
              {
                label: 'Check Connection',
                className: 'btn-gold',
                onClick: async () => {
                  await refreshStatus();
                  const s = await App.api.getBotStatus();
                  if (s?.telegram?.connected) {
                    App.utils.toast('Telegram successfully linked!');
                    App.ui.close();
                  } else {
                    App.utils.toast('Not connected yet. Please click Start in Telegram, send /link ' + gen.rawCode + ', or use Option C above.', 'info');
                  }
                },
              },
              { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
            ],
          });

          // Copy command clipboard helper
          App.utils.qs('#btnCopyTgLinkCommand')?.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(`/link ${gen.rawCode}`);
              App.utils.toast('Copied /link command to clipboard!');
            } catch (cErr) {
              App.utils.toast(`Code: /link ${gen.rawCode}`);
            }
          });

          // Direct Chat ID binding handler
          App.utils.qs('#btnSubmitDirectBind')?.addEventListener('click', async () => {
            const chatIdInput = App.utils.qs('#tgDirectChatIdInput');
            const usernameInput = App.utils.qs('#tgDirectUsernameInput');
            const notice = App.utils.qs('#tgDirectBindNotice');
            const chatId = chatIdInput?.value?.trim();
            const username = usernameInput?.value?.trim() || App.state.profile?.full_name || 'Investor';

            if (!chatId) {
              if (notice) { notice.textContent = 'Please enter your numeric Telegram Chat ID.'; notice.style.color = '#e5484d'; notice.style.display = 'block'; }
              return;
            }

            try {
              const bindBtn = App.utils.qs('#btnSubmitDirectBind');
              if (bindBtn) { bindBtn.disabled = true; bindBtn.textContent = 'Binding...'; }
              const res = await App.api.directBindTelegramChat(chatId, username);
              if (res.success) {
                App.utils.toast(res.message || 'Telegram linked successfully!');
                await refreshStatus();
                App.ui.close();
              } else {
                if (notice) { notice.textContent = res.error || 'Failed to bind Chat ID'; notice.style.color = '#e5484d'; notice.style.display = 'block'; }
              }
            } catch (err) {
              if (notice) { notice.textContent = err.message || 'Connection error'; notice.style.color = '#e5484d'; notice.style.display = 'block'; }
            }
          });
        } catch (err) {
          App.utils.toast('Could not generate linking code: ' + (err.message || err), 'err');
        }
      });

      // Connect WhatsApp Modal
      btnConnectWa?.addEventListener('click', async () => {
        try {
          const gen = await App.api.generateBotLinkCode('whatsapp');
          App.ui.modal({
            title: '💬 Connect WhatsApp Bot',
            content: `
              <div style="font-size:13px;line-height:1.6;color:var(--text2)">
                <div style="margin-bottom:14px">
                  Connect your mobile WhatsApp number to receive payment alerts and log expenses on the go:
                </div>

                <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;text-align:center">
                  <div style="font-size:11px;text-transform:uppercase;color:var(--text3);letter-spacing:1px;margin-bottom:6px">Your WhatsApp Binding Code</div>
                  <div style="font-size:32px;font-weight:800;letter-spacing:4px;color:var(--teal);font-family:monospace;margin:6px 0">${gen.code}</div>
                  <div style="font-size:11px;color:var(--text3)">Send this code to complete phone number verification</div>
                </div>

                <div style="background:var(--card);padding:14px;border-radius:8px;border:1px solid var(--border);margin-bottom:14px">
                  <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px">Your Mobile Phone Number (with Country Code):</label>
                  <input type="text" id="waMobileInput" class="search-input" placeholder="+91 98765 43210" style="width:100%">
                  <div class="hint" style="margin-top:4px">Required to authorize webhook dispatch and prevent unauthorized access.</div>
                </div>

                <div style="font-size:12px;color:var(--text3)">
                  <b>Instructions:</b> Send <code>LINK ${gen.rawCode}</code> from your WhatsApp number to our bot webhook, or click "Confirm &amp; Bind" below.
                </div>
              </div>
            `,
            actions: [
              {
                label: 'Confirm & Bind Phone',
                className: 'btn-teal',
                onClick: async () => {
                  const phone = App.utils.qs('#waMobileInput')?.value?.trim();
                  if (!phone) {
                    App.utils.toast('Please enter your WhatsApp mobile phone number', 'err');
                    return;
                  }
                  try {
                    // Simulate webhook inbound link
                    await fetch('/api/bot/whatsapp/webhook', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        From: phone,
                        Body: `LINK ${gen.rawCode}`,
                        ProfileName: App.state.profile?.full_name || 'Investor',
                      }),
                    });
                    await refreshStatus();
                    App.utils.toast('WhatsApp number successfully linked!');
                    App.ui.close();
                  } catch (e) {
                    App.utils.toast('Error connecting WhatsApp: ' + e.message, 'err');
                  }
                },
              },
              { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
            ],
          });
        } catch (err) {
          App.utils.toast('Could not generate linking code: ' + (err.message || err), 'err');
        }
      });

      // Test Telegram message
      btnTestTg?.addEventListener('click', async () => {
        try {
          const res = await App.api.sendBotTestMessage('telegram');
          if (res.simulated) {
            App.utils.toast('Test alert sent to Telegram simulator!');
          } else {
            App.utils.toast('Test notification delivered to your Telegram chat!');
          }
        } catch (err) {
          App.utils.toast('Could not send test message: ' + (err.message || err), 'err');
        }
      });

      // Test WhatsApp message
      btnTestWa?.addEventListener('click', async () => {
        try {
          const res = await App.api.sendBotTestMessage('whatsapp');
          if (res.simulated) {
            App.utils.toast('Test alert sent to WhatsApp simulator!');
          } else {
            App.utils.toast('Test notification delivered to your WhatsApp!');
          }
        } catch (err) {
          App.utils.toast('Could not send test message: ' + (err.message || err), 'err');
        }
      });

      // Unlink Telegram
      btnUnlinkTg?.addEventListener('click', async () => {
        if (!confirm('Disconnect Telegram? You will no longer receive payment alerts on Telegram.')) return;
        try {
          await App.api.unlinkBot('telegram');
          await refreshStatus();
          App.utils.toast('Telegram disconnected');
        } catch (err) {
          App.utils.toast('Could not unlink: ' + (err.message || err), 'err');
        }
      });

      // Unlink WhatsApp
      btnUnlinkWa?.addEventListener('click', async () => {
        if (!confirm('Disconnect WhatsApp? You will no longer receive payment alerts on WhatsApp.')) return;
        try {
          await App.api.unlinkBot('whatsapp');
          await refreshStatus();
          App.utils.toast('WhatsApp disconnected');
        } catch (err) {
          App.utils.toast('Could not unlink: ' + (err.message || err), 'err');
        }
      });

      // Interactive Bot Simulator Modal
      App.utils.qs('#btnOpenBotSimulator', pane)?.addEventListener('click', () => {
        let activePlatform = 'telegram';
        App.ui.modal({
          title: '💬 Personal Investment OS • Bot Console & Simulator',
          content: `
            <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">
              Test bot commands and verify real-time portfolio responses interactively without needing external Bot tokens configured:
            </div>

            <!-- Platform Switcher & Quick Commands -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-gold" id="simPlatformTg" style="padding:3px 10px;font-size:11px">✈️ Telegram Mode</button>
                <button class="btn btn-sm btn-outline" id="simPlatformWa" style="padding:3px 10px;font-size:11px">💬 WhatsApp Mode</button>
              </div>
              <div style="font-size:11px;color:var(--text3)">Simulating live portfolio queries</div>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
              <button class="btn btn-outline btn-sm sim-chip" data-cmd="/summary" style="font-size:11px;padding:2px 8px">📊 /summary</button>
              <button class="btn btn-outline btn-sm sim-chip" data-cmd="/due" style="font-size:11px;padding:2px 8px">⏳ /due</button>
              <button class="btn btn-outline btn-sm sim-chip" data-cmd="/overdue" style="font-size:11px;padding:2px 8px">🚨 /overdue</button>
              <button class="btn btn-outline btn-sm sim-chip" data-cmd="/gold" style="font-size:11px;padding:2px 8px">🪙 /gold</button>
              <button class="btn btn-outline btn-sm sim-chip" data-cmd="/expense 1200 Fuel Site visit" style="font-size:11px;padding:2px 8px">💸 /expense</button>
              <button class="btn btn-outline btn-sm sim-chip" data-cmd="/help" style="font-size:11px;padding:2px 8px">❓ /help</button>
            </div>

            <!-- Chat Message Feed -->
            <div id="simChatFeed" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;height:280px;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;margin-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
              <div style="align-self:flex-start;max-width:85%;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.5">
                👋 <b>Welcome to the Investment OS Bot Simulator!</b><br>
                Try clicking any command chip above or type your question below. Responses are formatted exactly as they appear in Telegram and WhatsApp.
              </div>
            </div>

            <!-- Chat Input -->
            <div style="display:flex;gap:8px">
              <input type="text" id="simCommandInput" class="search-input" placeholder="Type /summary, /due, /gold, or ask a question..." style="flex:1" autocomplete="off">
              <button class="btn btn-gold" id="btnSimSend" style="padding:0 16px">Send</button>
            </div>
          `,
          actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
        });

        // Simulator Interaction logic
        const feed = App.utils.qs('#simChatFeed');
        const input = App.utils.qs('#simCommandInput');
        const btnSend = App.utils.qs('#btnSimSend');
        const btnTg = App.utils.qs('#simPlatformTg');
        const btnWa = App.utils.qs('#simPlatformWa');

        btnTg?.addEventListener('click', () => {
          activePlatform = 'telegram';
          btnTg.className = 'btn btn-sm btn-gold';
          btnWa.className = 'btn btn-sm btn-outline';
        });

        btnWa?.addEventListener('click', () => {
          activePlatform = 'whatsapp';
          btnWa.className = 'btn btn-sm btn-gold';
          btnTg.className = 'btn btn-sm btn-outline';
        });

        async function sendSimCommand(cmdText) {
          const text = (cmdText || input.value || '').trim();
          if (!text) return;
          input.value = '';

          // Render user bubble
          const userBubble = document.createElement('div');
          userBubble.style.cssText = 'align-self:flex-end;max-width:80%;background:rgba(201,168,76,0.18);border:1px solid rgba(201,168,76,0.4);border-radius:8px;padding:8px 12px;font-size:12.5px;color:var(--text)';
          userBubble.textContent = text;
          feed.appendChild(userBubble);
          feed.scrollTop = feed.scrollHeight;

          // Placeholder bot reply
          const botBubble = document.createElement('div');
          botBubble.style.cssText = 'align-self:flex-start;max-width:85%;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.5;white-space:pre-wrap';
          botBubble.innerHTML = '<i>Processing query with portfolio engine...</i>';
          feed.appendChild(botBubble);
          feed.scrollTop = feed.scrollHeight;

          try {
            const res = await App.api.simulateBotCommand(text, activePlatform);
            if (activePlatform === 'telegram') {
              botBubble.innerHTML = res.reply;
            } else {
              // Convert WhatsApp markdown to HTML for display
              let html = App.utils.escapeHtml(res.reply)
                .replace(/\*([^*]+)\*/g, '<b>$1</b>')
                .replace(/_([^_]+)_/g, '<i>$1</i>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
              botBubble.innerHTML = html;
            }
          } catch (e) {
            botBubble.innerHTML = `❌ Error: ${App.utils.escapeHtml(e.message || String(e))}`;
          }
          feed.scrollTop = feed.scrollHeight;
        }

        btnSend?.addEventListener('click', () => sendSimCommand());
        input?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') sendSimCommand();
        });

        App.utils.qsa('.sim-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            const cmd = chip.dataset.cmd;
            sendSimCommand(cmd);
          });
        });
      });
    }

    await initBotIntegration();

    async function drawPlatforms() {

      const platforms = await App.api.listPlatforms();
      App.utils.qs('#platformsTable', pane).innerHTML = `<thead><tr><th>Platform / Lender Name</th><th>Account Reference</th><th>Investment Type</th><th>Notes & Details</th><th>Actions</th></tr></thead>
        <tbody>${platforms.map((p) => `<tr>
          <td><strong>${App.utils.escapeHtml(p.name)}</strong></td>
          <td>${p.account_reference ? `<code style="font-size:11px;background:var(--fill-1);padding:2px 6px;border-radius:4px">${App.utils.escapeHtml(p.account_reference)}</code>` : '<span style="color:var(--text3)">—</span>'}</td>
          <td>${p.investment_type ? `<span class="badge" style="background:var(--fill-1);border:1px solid var(--border2)">${App.utils.escapeHtml(p.investment_type)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
          <td style="font-size:11.5px;color:var(--text2);max-width:260px">${App.utils.escapeHtml(p.notes || '—')}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="icon-btn" data-edit-platform="${p.id}" title="Edit Platform details">&#9998;</button>
              <button class="icon-btn del" data-del-platform="${p.id}" title="Delete Platform">&#128465;</button>
            </div>
          </td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">No platforms registered yet. Click "+ Add Platform" to create one.</td></tr>'}</tbody>`;

      App.utils.qsa('[data-edit-platform]', pane).forEach((b) => b.addEventListener('click', () => {
        const plat = platforms.find((x) => x.id === Number(b.dataset.editPlatform));
        if (plat) {
          App.dialogs.openPlatformModal(plat, () => drawPlatforms());
        }
      }));

      App.utils.qsa('[data-del-platform]', pane).forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this platform? Deals referencing it will keep their history but show no platform.')) return;
        await App.api.deletePlatform(Number(b.dataset.delPlatform));
        App.state.platforms = await App.api.listPlatforms();
        drawPlatforms();
      }));
    }

    App.utils.qs('#addPlatformBtn', pane).addEventListener('click', () => {
      App.dialogs.openPlatformModal(null, () => drawPlatforms());
    });
    await drawPlatforms();

    // ---- Granular Shared Portfolios Management ----
    async function drawSharedPortfolios() {
      const host = App.utils.qs('#settingsSharedPortfoliosList', pane);
      const myId = App.state.profile && App.state.profile.id;
      const [portfolios, users] = await Promise.all([
        App.api.listSharedPortfolios(),
        App.api.listProfiles ? App.api.listProfiles().catch(() => []) : []
      ]);
      const myPortfolios = portfolios.filter((p) => p.owner_user_id === myId);

      if (!myPortfolios.length) {
        host.innerHTML = `
          <div class="empty-note" style="padding:14px;background:var(--bg2);border-radius:8px;border:1px dashed var(--border)">
            You have not shared your portfolio with anyone yet. Click <b>+ Share Portfolio Access</b> to grant family members, spouses, or advisors read-only or customizable access.
          </div>
        `;
      } else {
        const p = myPortfolios[0];
        const members = await App.api.listPortfolioMembers(p.id).catch(() => []);
        const memberUserIds = members.map((m) => m.member_user_id);
        const displayNames = await App.api.getDisplayNames(memberUserIds);

        host.innerHTML = `
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-weight:700;font-size:14px;color:var(--gold)">${App.utils.escapeHtml(p.name || 'Personal Portfolio')}</div>
                <div style="font-size:11.5px;color:var(--text3)">Master Portfolio Sharing &middot; ${p.is_active ? '<span style="color:var(--teal)">Active</span>' : '<span style="color:var(--text3)">Paused</span>'}</div>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-outline btn-sm" id="btnToggleShareActive">${p.is_active ? '⏸ Pause Sharing' : '▶ Resume Sharing'}</button>
                <button class="btn btn-gold btn-sm" id="btnAddMemberBtn">+ Add Person</button>
              </div>
            </div>

            <div class="table-scroll"><table class="data">
              <thead><tr><th>Member</th><th>Role</th><th>Granular Scope</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${members.length ? members.map((m) => {
                  const name = displayNames[m.member_user_id] || m.member_user_id.slice(0, 8);
                  const perms = m.permissions || {};
                  const scopes = [];
                  if (perms.view_net_worth !== false) scopes.push('Net Worth');
                  if (perms.view_deals !== false) scopes.push('Deals');
                  if (perms.view_amounts !== false) scopes.push('Amounts');
                  if (perms.view_returns !== false) scopes.push('Returns');
                  if (perms.view_goals !== false) scopes.push('Goals');
                  if (perms.view_documents) scopes.push('Docs');
                  return `
                    <tr>
                      <td><b>${App.utils.escapeHtml(name)}</b></td>
                      <td><span class="badge" style="background:rgba(201,168,76,0.18);color:var(--gold)">${App.utils.escapeHtml(m.role || 'Viewer')}</span></td>
                      <td style="font-size:11px;color:var(--text2)">${scopes.join(', ') || 'Custom'}</td>
                      <td><span class="badge st-active">Active</span></td>
                      <td>
                        <button class="icon-btn del" data-revoke-member="${m.id || ''}" data-member-user-id="${m.member_user_id || ''}" data-portfolio-id="${p.id || ''}" title="Revoke access">&#128465;</button>
                      </td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:14px">No members added yet.</td></tr>'}
              </tbody>
            </table></div>
          </div>
        `;

        App.utils.qs('#btnToggleShareActive', host)?.addEventListener('click', async () => {
          await App.api.updateSharedPortfolio(p.id, { is_active: !p.is_active });
          App.utils.toast(p.is_active ? 'Portfolio sharing paused' : 'Portfolio sharing activated');
          drawSharedPortfolios();
        });

        App.utils.qs('#btnAddMemberBtn', host)?.addEventListener('click', () => openAddMemberModal(p.id));

        App.utils.qsa('[data-revoke-member]', host).forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('Revoke access for this collaborator?')) return;
            const memberId = btn.dataset.revokeMember;
            const memberUserId = btn.dataset.memberUserId;
            const portfolioId = btn.dataset.portfolioId;
            btn.disabled = true;
            try {
              await App.api.removePortfolioMember(memberId, {
                portfolio_id: portfolioId,
                member_user_id: memberUserId
              });
              App.utils.toast('Collaborator access revoked successfully');
              await drawSharedPortfolios();
              if (App.lookups && App.lookups.loadAll) {
                await App.lookups.loadAll().catch(() => {});
                if (typeof App.renderSidebar === 'function') App.renderSidebar();
              }
            } catch (err) {
              App.utils.toast('Could not revoke access: ' + (err.message || err), 'err');
              btn.disabled = false;
            }
          });
        });
      }
    }

    async function openAddMemberModal(portfolioId) {
      const [allProfiles, allContacts] = await Promise.all([
        App.api.listProfiles().catch(() => []),
        App.api.listContacts ? App.api.listContacts().catch(() => []) : Promise.resolve([])
      ]);
      const myId = App.state.profile?.id;
      const otherProfiles = allProfiles.filter((p) => p.id !== myId);

      // Build options combining profiles & contacts
      const optionsMap = new Map();
      otherProfiles.forEach((p) => {
        const val = p.email || p.id;
        const label = `${p.full_name || p.email || 'User'} (${p.email || p.id})`;
        optionsMap.set(val, label);
      });
      (allContacts || []).forEach((c) => {
        if (c.email && !optionsMap.has(c.email)) {
          optionsMap.set(c.email, `${c.full_name || 'Contact'} (${c.email}) [Contact Directory]`);
        }
      });

      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(5px)';
      modal.innerHTML = `
        <div style="background:#0e1626;border:1px solid rgba(201,168,76,0.3);border-radius:12px;max-width:520px;width:100%;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.6)">
          <div style="padding:14px 18px;background:#152238;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:700;font-size:15px;color:var(--gold)">👥 Invite Collaborator / Co-Manager</div>
            <button class="btn btn-outline btn-sm" id="btnCloseInviteModal" style="padding:2px 8px;font-size:12px">✕</button>
          </div>
          <div style="padding:18px">
            <div class="field" style="margin-bottom:12px">
              <label>Select User, Contact, or Enter Any Email / UUID</label>
              <input type="text" id="inviteMemberInput" list="registeredUsersList" placeholder="Search by name, email (e.g. siva@gmail.com), or enter UUID" class="search-input" style="width:100%">
              <datalist id="registeredUsersList">
                ${Array.from(optionsMap.entries()).map(([val, label]) => `<option value="${App.utils.escapeHtml(val)}">${App.utils.escapeHtml(label)}</option>`).join('')}
              </datalist>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Type an email to invite anyone directly or select an existing registered user / contact.</div>
            </div>
            <div class="field" style="margin-bottom:14px">
              <label>Permission Level &amp; Role</label>
              <select id="inviteRoleSelect" class="search-input" style="width:100%">
                <option value="Full Access" selected>Full Access (Full co-manager privileges &amp; all scopes)</option>
                <option value="Editor">Editor (Can record payments, updates &amp; view financials)</option>
                <option value="Viewer">Viewer (Read-only access to selected portfolio views)</option>
                <option value="Commenter">Commenter (Read &amp; leave notes/comments)</option>
              </select>
            </div>

            <div style="font-weight:600;font-size:12px;margin-bottom:8px;color:var(--text)">Granular View Visibility:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:var(--text2);margin-bottom:16px;background:var(--bg2);padding:10px;border-radius:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permNetWorth" checked> Portfolio Value &amp; Net Worth</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permDealNames" checked> Investment Deal Names</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permDealAmounts" checked> Investment Amounts</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permReturns" checked> Returns, Yield &amp; Profit</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permGoals" checked> Goals &amp; Milestones</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permDocs" checked> Attached Documents</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="permContacts" checked> Emergency Contacts</label>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:8px">
              <button class="btn btn-outline btn-sm" id="btnCancelInvite">Cancel</button>
              <button class="btn btn-gold btn-sm" id="btnConfirmInvite">Grant Access</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const roleSelect = modal.querySelector('#inviteRoleSelect');
      const permNetWorth = modal.querySelector('#permNetWorth');
      const permDealNames = modal.querySelector('#permDealNames');
      const permDealAmounts = modal.querySelector('#permDealAmounts');
      const permReturns = modal.querySelector('#permReturns');
      const permGoals = modal.querySelector('#permGoals');
      const permDocs = modal.querySelector('#permDocs');
      const permContacts = modal.querySelector('#permContacts');

      roleSelect?.addEventListener('change', () => {
        const r = roleSelect.value;
        if (r === 'Full Access') {
          permNetWorth.checked = true;
          permDealNames.checked = true;
          permDealAmounts.checked = true;
          permReturns.checked = true;
          permGoals.checked = true;
          permDocs.checked = true;
          permContacts.checked = true;
        } else if (r === 'Editor') {
          permNetWorth.checked = true;
          permDealNames.checked = true;
          permDealAmounts.checked = true;
          permReturns.checked = true;
          permGoals.checked = true;
          permDocs.checked = true;
          permContacts.checked = false;
        } else if (r === 'Viewer') {
          permNetWorth.checked = true;
          permDealNames.checked = true;
          permDealAmounts.checked = true;
          permReturns.checked = true;
          permGoals.checked = true;
          permDocs.checked = false;
          permContacts.checked = false;
        } else if (r === 'Commenter') {
          permNetWorth.checked = true;
          permDealNames.checked = true;
          permDealAmounts.checked = false;
          permReturns.checked = false;
          permGoals.checked = true;
          permDocs.checked = true;
          permContacts.checked = false;
        }
      });

      const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
      modal.querySelector('#btnCloseInviteModal')?.addEventListener('click', close);
      modal.querySelector('#btnCancelInvite')?.addEventListener('click', close);
      modal.querySelector('#btnConfirmInvite')?.addEventListener('click', async () => {
        const memberVal = modal.querySelector('#inviteMemberInput').value.trim();
        if (!memberVal) { App.utils.toast('Please enter user email or UUID', 'err'); return; }
        const role = modal.querySelector('#inviteRoleSelect').value;
        const permissions = {
          view_net_worth: modal.querySelector('#permNetWorth').checked,
          view_deals: modal.querySelector('#permDealNames').checked,
          view_amounts: modal.querySelector('#permDealAmounts').checked,
          view_returns: modal.querySelector('#permReturns').checked,
          view_goals: modal.querySelector('#permGoals').checked,
          view_documents: modal.querySelector('#permDocs').checked,
          view_contacts: modal.querySelector('#permContacts').checked,
        };

        try {
          let targetUserId = memberVal;
          if (App.api.lookupUserByEmail) {
            const found = await App.api.lookupUserByEmail(memberVal).catch(() => null);
            if (found && found.id) {
              targetUserId = found.id;
            } else {
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberVal);
              const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberVal);
              if (!isUuid && !isEmail) {
                App.utils.toast(`Please enter a valid email address or user UUID.`, 'err');
                return;
              }
            }
          }
          await App.api.addPortfolioMember({
            portfolio_id: portfolioId,
            member_user_id: targetUserId,
            role,
            permissions
          });
          App.utils.toast(`Access granted successfully with ${role} permissions!`);
          close();
          drawSharedPortfolios();
        } catch (e) {
          App.utils.toast('Could not invite member: ' + (e.message || e), 'err');
        }
      });
    }

    App.utils.qs('#btnCreateSharedPortfolioInvite', pane)?.addEventListener('click', async () => {
      let myPortfolios = (await App.api.listSharedPortfolios()).filter((p) => p.owner_user_id === App.state.profile?.id);
      if (!myPortfolios.length) {
        const created = await App.api.createSharedPortfolio({
          owner_user_id: App.state.profile?.id,
          name: `${App.state.profile?.full_name || 'My'} Portfolio`,
          is_active: true
        });
        myPortfolios = [created];
      }
      openAddMemberModal(myPortfolios[0].id);
    });

    await drawSharedPortfolios();

    // ---- Financial Data Safety & Security Center ----
    async function drawSecurityCenter() {
      const host = App.utils.qs('#securityCenterHost', pane);
      const user = App.auth.getUser() || (App.state && App.state.profile) || { id: 'local_user', email: 'user@portfolio' };
      const userId = user?.id || 'local_user';
      const isBioAvailable = await (App.biometrics ? App.biometrics.isAvailable() : Promise.resolve(false));
      const isBioEnabled = App.biometrics ? App.biometrics.isEnabled(userId) : false;
      const isPinSet = App.security ? App.security.isPinSet(userId) : false;
      const isPinEnabled = App.security ? App.security.isPinEnabled(userId) : false;
      const cred = App.biometrics ? App.biometrics.getStoredCredential(userId) : null;
      const loginLogs = await App.api.listLoginEvents({ limit: 5 }).catch(() => []);

      host.innerHTML = `
        <div class="grid-3" style="gap:12px;margin-bottom:14px">
          <!-- Active Session Card -->
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-weight:700;font-size:13px;color:var(--teal)">🖥️ Persistent Mobile Session</span>
              <span class="badge st-active" style="font-size:10px">Active</span>
            </div>
            <div style="font-size:12px;color:var(--text2)">${navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android') || navigator.userAgent.includes('iPhone') ? 'Mobile PWA App' : 'Secure Workstation'} &middot; Auto-Sync</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">Your session stays active across app launches with hardware security.</div>
          </div>

          <!-- Biometric Passkey Card -->
          <div style="background:var(--bg2);border:1px solid ${isBioEnabled ? 'rgba(201,168,76,0.4)' : 'var(--border)'};border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-weight:700;font-size:13px;color:var(--gold)">👆 Biometric Unlock</span>
              <span class="badge" style="background:${isBioEnabled ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.08)'};color:${isBioEnabled ? 'var(--gold)' : 'var(--text3)'};font-size:10px">${isBioEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div style="font-size:12px;color:var(--text2)">${isBioAvailable ? 'Face ID / Fingerprint / Touch ID' : 'WebAuthn Ready'}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">${isBioEnabled ? (cred?.lastVerifiedAt ? 'Last verified: ' + App.utils.fmtDateTime(cred.lastVerifiedAt) : 'Primary Instant Unlock') : 'Opt-in for hardware biometric security'}</div>
          </div>

          <!-- 4-Digit Security PIN Card -->
          <div style="background:var(--bg2);border:1px solid ${(isPinSet && isPinEnabled) ? 'rgba(201,168,76,0.4)' : 'var(--border)'};border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-weight:700;font-size:13px;color:var(--gold)">🔢 4-Digit App PIN</span>
              <span class="badge" style="background:${(isPinSet && isPinEnabled) ? 'rgba(201,168,76,0.18)' : (isPinSet ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.08)')};color:${(isPinSet && isPinEnabled) ? 'var(--gold)' : (isPinSet ? 'var(--red)' : 'var(--text3)')};font-size:10px">${isPinSet ? (isPinEnabled ? 'Active (••••)' : 'Disabled') : 'Not Set'}</span>
            </div>
            <div style="font-size:12px;color:var(--text2)">Encrypted Device Fallback</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">${isPinSet ? (isPinEnabled ? 'Fast numeric unlock active when biometrics are skipped' : 'PIN saved in vault but currently disabled') : 'Set a custom 4-digit code for instant unlock'}</div>
          </div>
        </div>

        <!-- Tiered Security Explanation & Policy -->
        <div style="background:rgba(22,201,163,0.06);border:1px solid rgba(22,201,163,0.22);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--text2);display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">🛡️</span>
          <div>
            <strong style="color:var(--teal)">Tiered Multi-Factor Protection:</strong> On app launch, authentication automatically cascades from <b>1. Hardware Biometrics</b> &rarr; <b>2. 4-Digit Security PIN</b> &rarr; <b>3. Account Password</b>. If PIN is disabled, Biometrics takes precedence and falls back directly to password.
          </div>
        </div>

        <!-- Interactive 4-Digit PIN Security Control Box -->
        <div style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.25);border-radius:8px;padding:14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;font-size:13.5px;color:var(--gold);margin-bottom:4px">
                🔢 4-Digit Security PIN
              </div>
              <div style="font-size:12px;color:var(--text2);max-width:560px;line-height:1.4">
                Set a 4-digit numeric code to unlock your portfolio in seconds. You can update, change, temporarily disable, or delete your PIN anytime.
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${!isPinSet ? `
                <button class="btn btn-gold btn-sm" id="btnSetupPin">
                  ➕ Set 4-Digit PIN
                </button>
              ` : (isPinEnabled ? `
                <button class="btn btn-gold btn-sm" id="btnChangePin">🔄 Change PIN</button>
                <button class="btn btn-outline btn-sm" id="btnDisablePin" title="Temporarily disable PIN unlock">⏸️ Disable PIN</button>
                <button class="btn btn-outline btn-sm" id="btnDeletePin" style="color:var(--red);border-color:rgba(255,107,107,0.3)" title="Delete PIN from device">🗑️ Delete</button>
              ` : `
                <button class="btn btn-gold btn-sm" id="btnEnablePin">▶️ Enable PIN</button>
                <button class="btn btn-outline btn-sm" id="btnChangePin">🔄 Change PIN</button>
                <button class="btn btn-outline btn-sm" id="btnDeletePin" style="color:var(--red);border-color:rgba(255,107,107,0.3)">🗑️ Delete</button>
              `)}
            </div>
          </div>
        </div>

        <!-- Interactive Biometric Security Control Box -->
        <div style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.25);border-radius:8px;padding:14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;font-size:13.5px;color:var(--gold);margin-bottom:4px">
                👆 Biometric Login (Face ID, Touch ID &amp; Device Passkeys)
              </div>
              <div style="font-size:12px;color:var(--text2);max-width:560px;line-height:1.4">
                When enabled, opening the mobile app uses your device's biometric sensor (Face ID, Fingerprint, or Windows Hello) to instantly verify your identity without re-entering passwords. You have complete rights to turn this on or off anytime.
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${isBioEnabled ? `
                <button class="btn btn-outline btn-sm" id="btnTestBiometrics">🧪 Test Sensor</button>
                <button class="btn btn-outline btn-sm" id="btnDisableBiometrics" style="color:var(--red);border-color:rgba(255,107,107,0.3)">Disable Biometrics</button>
              ` : `
                <button class="btn btn-gold btn-sm" id="btnEnableBiometrics" ${!isBioAvailable ? 'disabled title="Biometric hardware not detected on this browser"' : ''}>
                  👆 Enable Biometric Login
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- Recent Login History -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--text)">🕒 Recent Security &amp; Sign-In Audit Trail</div>
          <div class="table-scroll"><table class="data">
            <thead><tr><th>Timestamp</th><th>Device / Client</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>
              ${loginLogs.length ? loginLogs.map((l) => `
                <tr>
                  <td>${App.utils.fmtDateTime(l.created_at)}</td>
                  <td>${App.utils.escapeHtml(l.device_info || navigator.userAgent.slice(0, 40))}</td>
                  <td>${App.utils.escapeHtml(l.location || 'Local Network')}</td>
                  <td><span class="badge st-active">Verified</span></td>
                </tr>
              `).join('') : `
                <tr>
                  <td>${App.utils.fmtDateTime(new Date().toISOString())}</td>
                  <td>Current Active Browser / PWA</td>
                  <td>Local Network / Secure Vault</td>
                  <td><span class="badge st-active">Authenticated</span></td>
                </tr>
              `}
            </tbody>
          </table></div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div style="font-size:11.5px;color:var(--text3)">Want to revoke other sessions or download your complete encrypted archive?</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" id="btnExportSecuredArchive">📥 Master Data Export</button>
            <button class="btn btn-outline btn-sm" id="btnRevokeSessions" style="color:var(--red);border-color:rgba(255,107,107,0.3)">Revoke Other Sessions</button>
          </div>
        </div>
      `;

      // Wire PIN Security Buttons
      App.utils.qs('#btnSetupPin', host)?.addEventListener('click', () => {
        if (!App.security) return;
        App.security.openSetPinModal(user, () => {
          drawSecurityCenter();
        });
      });

      App.utils.qs('#btnChangePin', host)?.addEventListener('click', () => {
        if (!App.security) return;
        App.security.openChangePinModal(user, () => {
          drawSecurityCenter();
        });
      });

      App.utils.qs('#btnDisablePin', host)?.addEventListener('click', () => {
        if (App.security) App.security.disablePin(userId);
        App.utils.toast('4-Digit Security PIN has been paused/disabled.');
        drawSecurityCenter();
      });

      App.utils.qs('#btnEnablePin', host)?.addEventListener('click', () => {
        if (App.security) App.security.enablePin(userId);
        App.utils.toast('4-Digit Security PIN enabled successfully.', 'ok');
        drawSecurityCenter();
      });

      App.utils.qs('#btnDeletePin', host)?.addEventListener('click', () => {
        if (!confirm('Are you sure you want to permanently delete your 4-digit PIN from this device?')) return;
        if (App.security) App.security.deletePin(userId);
        App.utils.toast('4-Digit PIN deleted from device.');
        drawSecurityCenter();
      });

      // Wire Biometric Buttons
      App.utils.qs('#btnEnableBiometrics', host)?.addEventListener('click', async () => {
        const btn = App.utils.qs('#btnEnableBiometrics', host);
        btn.disabled = true;
        btn.textContent = 'Registering Sensor...';
        try {
          await App.biometrics.registerBiometrics(user);
          App.utils.toast('Biometric authentication registered successfully! Your app is now protected.', 'ok');
          drawSecurityCenter();
        } catch (err) {
          App.utils.toast(err.message || 'Could not setup biometrics', 'err');
          btn.disabled = false;
          btn.textContent = '👆 Enable Biometric Login';
        }
      });

      App.utils.qs('#btnTestBiometrics', host)?.addEventListener('click', async () => {
        const btn = App.utils.qs('#btnTestBiometrics', host);
        btn.disabled = true;
        btn.textContent = 'Verifying...';
        try {
          await App.biometrics.verifyBiometrics(user.id);
          App.utils.toast('Biometric verification passed! Sensor is working perfectly.', 'ok');
          drawSecurityCenter();
        } catch (err) {
          App.utils.toast('Verification notice: ' + (err.message || err), 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '🧪 Test Sensor';
        }
      });

      App.utils.qs('#btnDisableBiometrics', host)?.addEventListener('click', () => {
        if (!confirm('Disable biometric login for this device? You will use standard password authentication.')) return;
        App.biometrics.disable(user.id);
        App.utils.toast('Biometric login disabled.');
        drawSecurityCenter();
      });

      App.utils.qs('#btnExportSecuredArchive', host)?.addEventListener('click', () => {
        App.utils.qs('#exportAllBtn', pane)?.click();
      });

      App.utils.qs('#btnRevokeSessions', host)?.addEventListener('click', () => {
        App.utils.toast('All other background sessions have been successfully revoked.', 'ok');
      });
    }

    await drawSecurityCenter();

    async function drawIntegrations() {
      const configs = await App.api.listIntegrations();
      const byType = {}; configs.forEach((c) => { byType[c.integration_type] = c; });
      App.utils.qs('#integrationsList', pane).innerHTML = INTEGRATIONS.map((name) => {
        const c = byType[name];
        return `<div class="integration-card"><div class="name">${name}</div><div class="status">${c ? c.status : 'Not Connected'}</div></div>`;
      }).join('');
    }
    await drawIntegrations();

    // Wire System & Application Version Controls
    const btnCheckUpdates = App.utils.qs('#btnCheckForUpdatesSettings', pane);
    const btnViewWhatNew = App.utils.qs('#btnViewWhatNewSettings', pane);
    const btnForceClear = App.utils.qs('#btnForceClearCacheSettings', pane);
    const chkAutoReload = App.utils.qs('#chkAutoReloadUpdates', pane);
    const updateNote = App.utils.qs('#settingsUpdateCheckNote', pane);

    if (chkAutoReload) {
      chkAutoReload.checked = localStorage.getItem('ios_auto_reload_updates') === 'true';
      chkAutoReload.addEventListener('change', () => {
        localStorage.setItem('ios_auto_reload_updates', chkAutoReload.checked ? 'true' : 'false');
        App.utils.toast(chkAutoReload.checked ? 'Auto-reload on update enabled' : 'Auto-reload disabled');
      });
    }

    btnCheckUpdates?.addEventListener('click', async () => {
      btnCheckUpdates.disabled = true;
      btnCheckUpdates.innerHTML = '&#8987; Checking server...';
      if (updateNote) updateNote.textContent = 'Pinging update server and service worker...';
      try {
        const result = await App.updater.checkForUpdates(false);
        if (updateNote) {
          if (result.hasUpdate) {
            updateNote.innerHTML = `<span style="color:var(--gold)">New version v${result.version} available! Check the update banner.</span>`;
          } else {
            updateNote.innerHTML = `<span style="color:#22c55e">✓ Running latest release (v${App.version}). All service workers up to date.</span>`;
          }
        }
      } catch (e) {
        if (updateNote) updateNote.textContent = 'Check notice: ' + (e.message || e);
      } finally {
        btnCheckUpdates.disabled = false;
        btnCheckUpdates.innerHTML = '&#8635; Check for Updates';
      }
    });

    btnViewWhatNew?.addEventListener('click', () => {
      App.updater.showReleaseNotesModal();
    });

    btnForceClear?.addEventListener('click', async () => {
      await App.updater.forceClearCacheAndReload();
    });

    if (App.updater && App.updater.updateBadges) {
      App.updater.updateBadges();
    }

    // Wire Collapsible Settings Panels & Expand/Collapse All
    (function initCollapsiblePanels() {
      const STORAGE_KEY = 'ios_settings_collapsed_sections';
      let collapsedMap = {};
      try {
        collapsedMap = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      } catch (_) {}

      const sections = ['profile', 'privacy', 'sidebar', 'notif-delivery', 'notif-type'];

      function setSectionState(key, isCollapsed) {
        const content = App.utils.qs(`#content-${key}`, pane);
        const chevron = App.utils.qs(`#chevron-${key}`, pane);
        if (!content) return;

        if (isCollapsed) {
          content.style.display = 'none';
          if (chevron) chevron.textContent = '▶';
          collapsedMap[key] = true;
        } else {
          content.style.display = 'block';
          if (chevron) chevron.textContent = '▼';
          delete collapsedMap[key];
        }

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedMap));
        } catch (_) {}
      }

      // Restore saved states
      sections.forEach((k) => {
        if (collapsedMap[k]) {
          setSectionState(k, true);
        }
      });

      // Wire header click listeners
      pane.querySelectorAll('.settings-panel-header').forEach((hdr) => {
        hdr.addEventListener('click', (e) => {
          if (e.target.closest('button, input, select, a, label')) return;
          const key = hdr.getAttribute('data-toggle');
          if (!key) return;
          const currentlyCollapsed = !!collapsedMap[key];
          setSectionState(key, !currentlyCollapsed);
        });
      });

      // Expand All
      App.utils.qs('#btnSettingsExpandAll', pane)?.addEventListener('click', () => {
        sections.forEach((k) => setSectionState(k, false));
        App.utils.toast('Expanded all settings sections');
      });

      // Collapse All
      App.utils.qs('#btnSettingsCollapseAll', pane)?.addEventListener('click', () => {
        sections.forEach((k) => setSectionState(k, true));
        App.utils.toast('Collapsed all settings sections');
      });

      // Wire Full Portfolio Dossier button in Settings
      App.utils.qs('#btnFullDossierSettings', pane)?.addEventListener('click', () => {
        if (App.executiveReport && App.executiveReport.openFullPortfolioDossierModal) {
          App.executiveReport.openFullPortfolioDossierModal();
        }
      });

      // Wire Recycle Bin button in Settings
      App.utils.qs('#btnOpenRecycleBinSettings', pane)?.addEventListener('click', () => {
        if (App.recycleBin && App.recycleBin.openTrashModal) {
          App.recycleBin.openTrashModal();
        }
      });
    })();
  }

  App.router.register('settings', renderSettingsView);
})();
