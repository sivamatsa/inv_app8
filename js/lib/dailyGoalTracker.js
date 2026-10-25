/* ============================================================================
   Daily Financial Goal & Habit Tracker Component (PIOS Dashboard)
   Empowers users to build systematic, actionable wealth-building habits:
   - Daily interactive checklist with instant progress bar
   - Streaks counter across consecutive active days
   - Custom habit creator with categories and emoji icons
   - Multi-device synchronization via Supabase & offline-resilient local cache
   ============================================================================ */
window.App = window.App || {};

App.dailyGoalTracker = (function () {
  'use strict';

  // State
  let habits = [];
  let completedHabitIds = new Set();
  let currentStreak = 0;
  let isInitialized = false;

  function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
  }

  function formatTodayHeader() {
    try {
      return new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (_) {
      return getTodayDateStr();
    }
  }

  // Load habit items and today's completion status
  async function loadTrackerData() {
    try {
      const todayStr = getTodayDateStr();
      const [habitList, logs, streak] = await Promise.all([
        App.api.listDailyHabits(),
        App.api.getDailyHabitLogs(todayStr),
        App.api.getDailyHabitStreak(),
      ]);

      habits = habitList || [];
      completedHabitIds = new Set((logs || []).map((l) => l.habit_id));
      currentStreak = streak || 0;
      isInitialized = true;
    } catch (err) {
      console.warn('[DailyTracker] Error loading data:', err);
    }
  }

  // Render tracker HTML into target container
  async function render(container) {
    if (!container) return;
    await loadTrackerData();
    draw(container);
  }

  function draw(container) {
    const totalCount = habits.length;
    const completedCount = habits.filter((h) => completedHabitIds.has(h.id)).length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const allDone = totalCount > 0 && completedCount === totalCount;

    container.innerHTML = `
      <div class="panel daily-habit-tracker-card" style="margin-bottom:16px;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)">
        <!-- Header Row -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:20px">⚡</span>
              <div class="chart-title" style="margin-bottom:0;font-size:15px;color:var(--text)">
                Daily Financial Habit &amp; Goal Tracker
              </div>
              <span class="badge" style="background:rgba(201,168,76,0.18);color:var(--gold);font-weight:700;font-size:11px">
                🔥 ${currentStreak} ${currentStreak === 1 ? 'Day Streak' : 'Days Streak'}
              </span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">
              Small actionable financial actions that compound over time &middot; <strong>${formatTodayHeader()}</strong>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button id="btnOpenAddHabitModal" class="btn btn-outline btn-sm" style="font-size:11.5px;padding:4px 10px">
              + Custom Habit
            </button>
            <div style="font-size:13px;font-weight:700;color:${allDone ? 'var(--teal)' : 'var(--gold)'}">
              ${completedCount}/${totalCount} Done (${percent}%)
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div style="width:100%;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-bottom:16px;border:1px solid var(--border2)">
          <div style="width:${percent}%;height:100%;background:${allDone ? 'linear-gradient(90deg,#16C9A3,#10B981)' : 'linear-gradient(90deg,#C9A84C,#E5C365)'};transition:width 0.3s ease;border-radius:4px"></div>
        </div>

        ${
          allDone
            ? `
          <div style="background:rgba(22,201,163,0.12);border:1px solid rgba(22,201,163,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--teal)">
            <span style="font-size:20px">🎉</span>
            <div><strong>Mastery Achieved!</strong> You have completed all actionable financial habits for today. Keep the streak going tomorrow!</div>
          </div>
        `
            : ''
        }

        <!-- Interactive Habit Checklist -->
        <div class="daily-habits-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:10px">
          ${habits
            .map((habit) => {
              const isChecked = completedHabitIds.has(habit.id);
              return `
              <div class="habit-check-item ${isChecked ? 'habit-completed' : ''}" data-habit-id="${habit.id}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:${isChecked ? 'rgba(22,201,163,0.06)' : 'var(--bg2)'};border:1px solid ${isChecked ? 'rgba(22,201,163,0.35)' : 'var(--border2)'};border-radius:8px;cursor:pointer;transition:all 0.15s ease;-webkit-tap-highlight-color:transparent">
                <div style="display:flex;align-items:center;gap:10px;min-width:0">
                  <input type="checkbox" class="habit-checkbox" data-habit-id="${habit.id}" ${isChecked ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
                  <span style="font-size:16px;flex-shrink:0">${habit.icon || '⚡'}</span>
                  <div style="min-width:0">
                    <div style="font-size:12.5px;font-weight:600;color:${isChecked ? 'var(--text2)' : 'var(--text)'};text-decoration:${isChecked ? 'line-through' : 'none'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.utils.escapeHtml(habit.title)}">
                      ${App.utils.escapeHtml(habit.title)}
                    </div>
                    <div style="font-size:10.5px;color:var(--text3);display:flex;align-items:center;gap:6px">
                      <span class="badge" style="font-size:9.5px;padding:0 4px;background:var(--fill-2)">${habit.category || 'FINANCIAL'}</span>
                      ${habit.is_custom ? `<span style="color:var(--gold)">&middot; Custom</span>` : ''}
                    </div>
                  </div>
                </div>

                ${
                  habit.is_custom
                    ? `
                  <button type="button" class="icon-btn btn-delete-custom-habit" data-habit-id="${habit.id}" title="Remove custom habit" style="font-size:11px;color:var(--red);opacity:0.6;padding:4px">
                    ✕
                  </button>
                `
                    : ''
                }
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;

    attachListeners(container);
  }

  function attachListeners(container) {
    const todayStr = getTodayDateStr();

    // Toggle checklist items
    container.querySelectorAll('.habit-check-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        // Prevent double trigger if clicking delete button
        if (e.target.closest('.btn-delete-custom-habit')) return;

        const habitId = item.dataset.habitId;
        const checkbox = item.querySelector('.habit-checkbox');
        // If clicking label, toggle checkbox state
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        const isCompleted = checkbox.checked;

        if (isCompleted) {
          completedHabitIds.add(habitId);
        } else {
          completedHabitIds.delete(habitId);
        }

        // Persist immediately
        App.api.toggleDailyHabitLog(habitId, todayStr, isCompleted);

        // Re-draw with updated counts & streak
        draw(container);

        if (isCompleted && completedHabitIds.size === habits.length) {
          App.utils.toast('🎉 All daily financial goals completed!', 'ok');
        }
      });
    });

    // Delete custom habit
    container.querySelectorAll('.btn-delete-custom-habit').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const habit = habits.find((h) => h.id === habitId);
        if (confirm(`Remove custom habit "${habit ? habit.title : ''}"?`)) {
          habits = habits.filter((h) => h.id !== habitId);
          completedHabitIds.delete(habitId);
          await App.api.deleteDailyHabit(habitId);
          draw(container);
          App.utils.toast('Custom habit removed.', 'ok');
        }
      });
    });

    // Open Add Custom Habit Modal
    container.querySelector('#btnOpenAddHabitModal')?.addEventListener('click', () => {
      openAddCustomHabitModal(container);
    });
  }

  // Modal to create custom daily financial habits
  function openAddCustomHabitModal(container) {
    App.ui.open({
      title: '⚡ Add Custom Daily Financial Habit',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:12px;color:var(--text2);background:var(--bg2);padding:8px 12px;border-radius:6px;border:1px solid var(--border2)">
            Define small, actionable daily financial tasks to track your daily discipline and build high-conviction streaks.
          </div>

          <div class="field">
            <label>Habit Title / Task <span style="color:var(--red)">*</span></label>
            <input type="text" id="mHabitTitle" class="form-input" placeholder="e.g. Logged credit card expenses, Audited FD returns, Read financial briefing" maxlength="80">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Icon / Emoji</label>
              <select id="mHabitIcon" class="form-input">
                <option value="📝">📝 Note / Log</option>
                <option value="🪙">🪙 Gold / Bullion</option>
                <option value="💼">💼 Deals &amp; Capital</option>
                <option value="📊">📊 Analysis &amp; Reports</option>
                <option value="🔐">🔐 Security &amp; Vault</option>
                <option value="💳">💳 Card &amp; Payment</option>
                <option value="📈">📈 Market &amp; Stocks</option>
                <option value="🎯">🎯 Target &amp; Milestone</option>
                <option value="☕">☕ No-Spend Action</option>
                <option value="📚">📚 Financial Reading</option>
              </select>
            </div>
            <div class="field">
              <label>Category</label>
              <select id="mHabitCategory" class="form-input">
                <option value="FINANCIAL">Financial Discipline</option>
                <option value="EXPENSES">Expenses &amp; Budget</option>
                <option value="PORTFOLIO">Portfolio &amp; Yield</option>
                <option value="SECURITY">Security &amp; Accounts</option>
                <option value="GOLD">Gold &amp; Bullion</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label style="font-size:12px;color:var(--text3)">Quick Suggestions (Click to fill):</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              <button type="button" class="btn btn-outline btn-xs btn-habit-suggest" data-title="Logged UPI &amp; cash transactions" data-icon="💳" data-cat="EXPENSES">💳 Log UPI / Cash</button>
              <button type="button" class="btn btn-outline btn-xs btn-habit-suggest" data-title="Verified emergency fund balance" data-icon="🎯" data-cat="FINANCIAL">🎯 Emergency Fund</button>
              <button type="button" class="btn btn-outline btn-xs btn-habit-suggest" data-title="Checked bank FD interest accruals" data-icon="📈" data-cat="PORTFOLIO">📈 Check FD Interest</button>
              <button type="button" class="btn btn-outline btn-xs btn-habit-suggest" data-title="Zero discretionary spending day" data-icon="☕" data-cat="EXPENSES">☕ Zero Discretionary Day</button>
            </div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', onClick: () => App.ui.close() },
        {
          label: 'Add Daily Habit',
          primary: true,
          onClick: async () => {
            const title = (document.querySelector('#mHabitTitle')?.value || '').trim();
            const icon = document.querySelector('#mHabitIcon')?.value || '⚡';
            const category = document.querySelector('#mHabitCategory')?.value || 'FINANCIAL';

            if (!title) {
              App.utils.toast('Please enter a habit title.', 'err');
              return;
            }

            const newHabit = await App.api.createDailyHabit({
              title,
              icon,
              category,
              display_order: habits.length + 1,
            });

            habits.push(newHabit);
            App.ui.close();
            draw(container);
            App.utils.toast(`Added habit: "${title}"`, 'ok');
          },
        },
      ],
    });

    // Wire suggestion buttons
    document.querySelectorAll('.btn-habit-suggest').forEach((btn) => {
      btn.addEventListener('click', () => {
        const titleEl = document.querySelector('#mHabitTitle');
        const iconEl = document.querySelector('#mHabitIcon');
        const catEl = document.querySelector('#mHabitCategory');
        if (titleEl) titleEl.value = btn.dataset.title;
        if (iconEl) iconEl.value = btn.dataset.icon;
        if (catEl) catEl.value = btn.dataset.cat;
      });
    });
  }

  return {
    render,
    loadTrackerData,
  };
})();
