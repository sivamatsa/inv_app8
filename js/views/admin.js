/* Admin (spec Section 2 "Admin/Family/Friend Portfolio Management"). Only
   reachable if profiles.is_admin is true for the signed-in user - enforced
   server-side by RLS (013_admin_role.sql), not just by hiding the nav link.

   Originally entirely read-only. That's no longer true as of the User
   Management / Shared Portfolios addendum: this page can now deactivate,
   reactivate, create, and (with a strong confirmation) permanently delete
   user accounts, and manage who's a Viewer on whose shared portfolio -
   all through admin-user-management (an Edge Function; the service-role
   key it needs never touches the browser) and RLS-respecting writes to
   shared_portfolios/portfolio_members. Every other panel here (the users
   table's own portfolio numbers, Database Health, Visits & Logins) stays
   read-only, same as before. */
window.App = window.App || {};

(function () {
  async function openUserDetailModal(user) {
    const [deals, summary] = await Promise.all([
      App.api.listDeals({ eq: { user_id: user.id } }),
      App.api.getPortfolioSummary(user.id),
    ]);
    const s = summary || {};

    const bodyHtml = `
      <div class="grid-2" style="margin-bottom:14px">
        <div>
          <div class="stat-line"><span>Total Invested</span><span class="v">${App.utils.fmtMoney(s.total_invested)}</span></div>
          <div class="stat-line"><span>Outstanding Principal</span><span class="v">${App.utils.fmtMoney(s.current_outstanding_principal)}</span></div>
          <div class="stat-line"><span>Interest Earned</span><span class="v">${App.utils.fmtMoney(s.interest_earned)}</span></div>
        </div>
        <div>
          <div class="stat-line"><span>Active Deals</span><span class="v">${s.active_deals_count ?? 0}</span></div>
          <div class="stat-line"><span>Closed Deals</span><span class="v">${s.closed_deals_count ?? 0}</span></div>
          <div class="stat-line"><span>Realized ROI</span><span class="v">${App.utils.fmtPct(s.realized_roi)}</span></div>
        </div>
      </div>
      <div class="table-scroll" style="max-height:320px">
        <table class="data"><thead><tr><th>Deal</th><th>Type</th><th>Invested</th><th>ROI</th><th>Status</th><th>Maturity</th></tr></thead>
        <tbody>${deals.map((d) => `<tr>
          <td>${App.utils.escapeHtml(d.deal_name)}</td>
          <td>${App.utils.escapeHtml(d.investment_type)}</td>
          <td>${App.utils.fmtMoney(d.invested_amount)}</td>
          <td>${App.utils.fmtPct(d.annual_roi)}</td>
          <td><span class="badge ${App.utils.statusBadgeClass(d.status)}">${d.status}</span></td>
          <td>${App.utils.fmtDate(d.maturity_date)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">No deals yet.</td></tr>'}</tbody></table>
      </div>
      <div class="hint">Read-only - this modal never edits another user's data.</div>`;

    App.ui.open({
      title: `${user.full_name || user.email} - Portfolio`,
      bodyHtml,
      actions: [{ label: 'Close', className: 'btn-gold', onClick: App.ui.close }],
    });
  }

  // ---- Add User (Direct DB RPC + Edge Function Fallback) ----
  function openAddUserModal(onDone) {
    App.ui.open({
      title: 'Add User Account',
      bodyHtml: `
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field span2"><label>Email Address *</label><input id="newUserEmail" type="email" placeholder="user@example.com"></div>
          <div class="field span2"><label>Full Name</label><input id="newUserName" type="text" placeholder="e.g. John Doe"></div>
          <div class="field"><label>Role</label>
            <select id="newUserRole">
              <option value="false">Regular User</option>
              <option value="true">Administrator</option>
            </select>
          </div>
          <div class="field"><label>Password (leave blank to auto-generate)</label><input id="newUserPassword" type="text" placeholder="Min 6 chars or blank"></div>
        </div>
        <div class="hint">The user can immediately log in to the portfolio using these credentials.</div>
        <div id="newUserResult"></div>
        <div class="auth-error" id="newUserError" style="margin-top:8px"></div>`,
      actions: [
        { label: 'Create Account', className: 'btn-gold', onClick: async () => {
          const email = App.utils.qs('#newUserEmail').value.trim();
          const fullName = App.utils.qs('#newUserName').value.trim();
          const password = App.utils.qs('#newUserPassword').value.trim();
          const isAdmin = App.utils.qs('#newUserRole').value === 'true';

          if (!email) {
            App.utils.qs('#newUserError').textContent = 'Email address is required.';
            return;
          }

          const createBtn = App.utils.qs('.modal-footer .btn-gold');
          if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating...'; }

          try {
            const result = await App.api.adminCreateUser(email, fullName, password, isAdmin);
            App.utils.qs('#newUserError').textContent = '';
            App.utils.qs('#newUserResult').innerHTML = `
              <div class="panel" style="margin-top:12px;background:var(--fill-2);border:1px solid var(--border)">
                <div style="font-weight:600;color:var(--text);margin-bottom:6px">Account Created Successfully!</div>
                <div style="font-size:12.5px;color:var(--text2);margin-bottom:8px">Share these login credentials with the user:</div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:12px;color:var(--text3);width:70px">Email:</span>
                    <code style="font-size:13px;padding:4px 8px;background:var(--bg2);border-radius:4px;color:var(--text)">${App.utils.escapeHtml(result.email)}</code>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:12px;color:var(--text3);width:70px">Password:</span>
                    <code id="tempPasswordText" style="font-size:13px;padding:4px 8px;background:var(--bg2);border-radius:4px;color:var(--gold);font-weight:600">${App.utils.escapeHtml(result.tempPassword)}</code>
                    <button class="btn btn-outline btn-sm" id="copyTempPasswordBtn" style="padding:2px 8px">Copy</button>
                  </div>
                </div>
              </div>`;
            const copyBtn = App.utils.qs('#copyTempPasswordBtn');
            if (copyBtn) {
              copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.tempPassword}`).then(() => App.utils.toast('Login credentials copied to clipboard'));
              });
            }
            if (onDone) onDone();
          } catch (e) {
            App.utils.qs('#newUserError').textContent = 'Could not create account: ' + (e.message || e);
            if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Account'; }
          }
        } },
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  // ---- Edit User Profile Modal ----
  function openEditUserModal(user, onDone) {
    const isActive = user.is_active !== false;
    App.ui.open({
      title: `Edit User - ${user.full_name || user.email}`,
      bodyHtml: `
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field"><label>Full Name</label><input id="editUserFullName" type="text" value="${App.utils.escapeHtml(user.full_name || '')}"></div>
          <div class="field"><label>Email Address</label><input id="editUserEmail" type="email" value="${App.utils.escapeHtml(user.email || '')}"></div>
          <div class="field"><label>Mobile / Phone</label><input id="editUserMobile" type="text" value="${App.utils.escapeHtml(user.mobile || '')}"></div>
          <div class="field"><label>Role</label>
            <select id="editUserRole">
              <option value="false" ${!user.is_admin ? 'selected' : ''}>Regular User</option>
              <option value="true" ${user.is_admin ? 'selected' : ''}>Administrator</option>
            </select>
          </div>
          <div class="field"><label>Account Status</label>
            <select id="editUserStatus">
              <option value="true" ${isActive ? 'selected' : ''}>Active (Can sign in)</option>
              <option value="false" ${!isActive ? 'selected' : ''}>Deactivated (Sign-in blocked)</option>
            </select>
          </div>
          <div class="field"><label>Set New Password (optional)</label><input id="editUserNewPassword" type="password" placeholder="Leave blank to keep existing"></div>
        </div>
        <div class="auth-error" id="editUserError"></div>`,
      actions: [
        { label: 'Save Changes', className: 'btn-gold', onClick: async () => {
          const fullName = App.utils.qs('#editUserFullName').value.trim();
          const email = App.utils.qs('#editUserEmail').value.trim();
          const mobile = App.utils.qs('#editUserMobile').value.trim();
          const isAdmin = App.utils.qs('#editUserRole').value === 'true';
          const newActive = App.utils.qs('#editUserStatus').value === 'true';
          const newPassword = App.utils.qs('#editUserNewPassword').value.trim();

          const saveBtn = App.utils.qs('.modal-footer .btn-gold');
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

          try {
            await App.api.adminUpdateUser(user.id, {
              fullName: fullName || null,
              email: email || null,
              mobile: mobile || null,
              isAdmin,
              isActive: newActive,
              newPassword: newPassword || null,
            });
            App.utils.toast('User updated successfully');
            App.ui.close();
            if (onDone) onDone();
          } catch (e) {
            App.utils.qs('#editUserError').textContent = 'Could not update: ' + (e.message || e);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
          }
        } },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  function openDeleteUserModal(user, onDone) {
    App.ui.open({
      title: 'Delete User Permanently',
      bodyHtml: `
        <div class="hint" style="color:var(--red,#e5484d);margin-bottom:10px">This permanently deletes <strong>${App.utils.escapeHtml(user.email || user.full_name)}</strong>'s account and every deal, payment, and record associated with it. There is no undo. Deactivating instead is fully reversible.</div>
        <div class="field span2"><label>Type their email to confirm deletion: <code>${App.utils.escapeHtml(user.email)}</code></label><input id="confirmDeleteEmail" type="text" placeholder="${App.utils.escapeHtml(user.email)}"></div>
        <div class="auth-error" id="deleteUserError" style="margin-top:8px"></div>`,
      actions: [
        { label: 'Delete Permanently', className: 'btn-outline', onClick: async () => {
          const confirmEmail = App.utils.qs('#confirmDeleteEmail').value.trim();
          if (!confirmEmail) {
            App.utils.qs('#deleteUserError').textContent = 'Please type the email to confirm deletion.';
            return;
          }
          try {
            await App.api.adminDeleteUser(user.id, confirmEmail);
            App.utils.toast('User deleted successfully');
            App.ui.close();
            if (onDone) onDone();
          } catch (e) { App.utils.qs('#deleteUserError').textContent = e.message || String(e); }
        } },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  // ---- Support & User Queries (034_help_support_suggestions.sql) - the
  // real admin queue: category/priority/assignment editors and an
  // admin-only Internal Note panel, none of which the shared "My Requests"
  // customer view (support.js) exposes. ----
  const TICKET_STATUS_OPTIONS = ['New', 'Acknowledged', 'In Progress', 'Waiting for User', 'Waiting for Admin', 'Resolved', 'Closed', 'Rejected', 'Reopened'];
  const TICKET_CATEGORY_OPTIONS = [
    'Cannot Create Account', 'Forgot Password', 'Email Verification Issue', 'Account Locked', 'Cannot Log In',
    'Other Account Issue', 'Investment/Deal Issue', 'Dashboard Issue', 'Excel/Import Issue',
    'Notification/Reminder Issue', 'Gold Intelligence Issue', 'Document Issue', 'Chat/Contact Issue',
    'Report a Problem', 'Security Report', 'General Question', 'Contact Administrator',
  ];

  async function openAdminTicketDetail(ticket, admins, onDone) {
    const [messages, notes] = await Promise.all([
      App.api.listTicketMessages(ticket.id),
      App.api.listTicketInternalNotes(ticket.id),
    ]);
    const requester = ticket.user_id
      ? (await App.api.getDisplayNames([ticket.user_id]).catch(() => ({})))[ticket.user_id] || 'User'
      : `${ticket.guest_name || 'Guest'} (${ticket.guest_email || 'no email'}) - not a registered user`;

    function messageHtml(m) {
      return `<div style="margin-bottom:10px;text-align:${m.is_admin_reply ? 'right' : 'left'}">
        <div style="font-size:10.5px;color:var(--text3);margin-bottom:2px">${m.is_admin_reply ? 'You (Admin)' : App.utils.escapeHtml(requester)} &middot; ${App.utils.fmtDateTime(m.created_at)}</div>
        <div style="display:inline-block;max-width:75%;padding:8px 12px;border-radius:10px;font-size:12.5px;text-align:left;
          background:${m.is_admin_reply ? 'rgba(76,155,232,0.15)' : 'rgba(201,168,76,0.15)'};border:1px solid var(--border2)">${App.utils.escapeHtml(m.message)}</div>
      </div>`;
    }

    const bodyHtml = `
      <div class="hint" style="margin-bottom:10px">From: ${App.utils.escapeHtml(requester)} &middot; opened ${App.utils.fmtDateTime(ticket.created_at)}</div>
      <div class="form-grid" style="margin-bottom:12px">
        <div class="field"><label>Category</label><select id="adminTicketCategory">${TICKET_CATEGORY_OPTIONS.map((c) => `<option ${c === ticket.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Priority</label><select id="adminTicketPriority">${['Critical', 'High', 'Medium', 'Low'].map((p) => `<option ${p === ticket.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select id="adminTicketStatus">${TICKET_STATUS_OPTIONS.map((s) => `<option ${s === ticket.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Assigned To</label><select id="adminTicketAssignee"><option value="">Unassigned</option>${admins.map((a) => `<option value="${a.id}" ${a.id === ticket.assigned_to ? 'selected' : ''}>${App.utils.escapeHtml(a.full_name || a.email)}</option>`).join('')}</select></div>
      </div>
      ${ticket.user_id ? `<div id="ticketThread" style="height:260px;overflow-y:auto;padding:8px;margin-bottom:12px;border:1px solid var(--border2);border-radius:10px">
        ${messages.map(messageHtml).join('') || '<div class="empty-note">No messages yet.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input class="search-input" id="ticketReplyInput" placeholder="Reply to the requester..." style="flex:1">
        <button class="btn btn-gold" id="ticketReplyBtn">Reply</button>
      </div>` : `<div class="hint" style="margin-bottom:14px">This is a guest request - there's no account to reply to in-app. Contact them directly at ${App.utils.escapeHtml(ticket.guest_email || '(no email given)')}.</div>
      <div class="panel" style="margin-bottom:14px"><div class="hint" style="font-weight:600;margin-bottom:4px">Original message</div>${App.utils.escapeHtml(ticket.guest_message || '')}</div>`}
      <div style="padding-top:12px;border-top:1px solid var(--border2)">
        <div class="hint" style="font-weight:600;margin-bottom:6px">Internal Notes <span style="color:var(--text3);font-weight:400">(admin only - never shown to the requester)</span></div>
        <div id="internalNotesList" style="margin-bottom:8px">${notes.map((n) => `<div class="hint" style="margin-bottom:4px">${App.utils.fmtDateTime(n.created_at)}: ${App.utils.escapeHtml(n.note)}</div>`).join('') || '<div class="empty-note">No internal notes yet.</div>'}</div>
        <div style="display:flex;gap:8px">
          <input class="search-input" id="internalNoteInput" placeholder="Add an internal note..." style="flex:1">
          <button class="btn btn-outline btn-sm" id="addInternalNoteBtn">Add Note</button>
        </div>
      </div>`;

    let channel = null;
    App.ui.open({
      title: ticket.ticket_number,
      bodyHtml,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: () => { if (channel) App.api.unsubscribe(channel); App.ui.close(); if (onDone) onDone(); } }],
      onMount: (body) => {
        const thread = App.utils.qs('#ticketThread', body);
        if (thread) thread.scrollTop = thread.scrollHeight;

        App.utils.qs('#adminTicketCategory', body).addEventListener('change', async (e) => {
          try { await App.api.updateTicketCategory(ticket.id, e.target.value); App.utils.toast('Category updated'); } catch (e2) { App.utils.toast('Could not update: ' + (e2.message || e2), 'err'); }
        });
        App.utils.qs('#adminTicketPriority', body).addEventListener('change', async (e) => {
          try { await App.api.updateTicketPriority(ticket.id, e.target.value); App.utils.toast('Priority updated'); } catch (e2) { App.utils.toast('Could not update: ' + (e2.message || e2), 'err'); }
        });
        App.utils.qs('#adminTicketStatus', body).addEventListener('change', async (e) => {
          try { await App.api.updateTicketStatus(ticket.id, e.target.value); App.utils.toast('Status updated'); } catch (e2) { App.utils.toast('Could not update: ' + (e2.message || e2), 'err'); }
        });
        App.utils.qs('#adminTicketAssignee', body).addEventListener('change', async (e) => {
          try { await App.api.updateTicketAssignment(ticket.id, e.target.value || null); App.utils.toast('Assignment updated'); } catch (e2) { App.utils.toast('Could not update: ' + (e2.message || e2), 'err'); }
        });

        const replyBtn = App.utils.qs('#ticketReplyBtn', body);
        if (replyBtn) {
          async function reply() {
            const input = App.utils.qs('#ticketReplyInput', body);
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            try { await App.api.postTicketMessage(ticket.id, text, true); }
            catch (e2) { App.utils.toast('Could not send reply: ' + (e2.message || e2), 'err'); }
          }
          replyBtn.addEventListener('click', reply);
          App.utils.qs('#ticketReplyInput', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') reply(); });
          channel = App.api.subscribeToTicketMessages(ticket.id, (row) => {
            App.utils.qs('#ticketThread', body).insertAdjacentHTML('beforeend', messageHtml(row));
            App.utils.qs('#ticketThread', body).scrollTop = thread.scrollHeight;
          });
          App.router.onLeave(() => { if (channel) App.api.unsubscribe(channel); });
        }

        App.utils.qs('#addInternalNoteBtn', body).addEventListener('click', async () => {
          const input = App.utils.qs('#internalNoteInput', body);
          const text = input.value.trim();
          if (!text) return;
          try {
            await App.api.createTicketInternalNote(ticket.id, text);
            input.value = '';
            const fresh = await App.api.listTicketInternalNotes(ticket.id);
            App.utils.qs('#internalNotesList', body).innerHTML = fresh.map((n) => `<div class="hint" style="margin-bottom:4px">${App.utils.fmtDateTime(n.created_at)}: ${App.utils.escapeHtml(n.note)}</div>`).join('');
          } catch (e2) { App.utils.toast('Could not add note: ' + (e2.message || e2), 'err'); }
        });
      },
    });
  }

  async function drawTicketsPanel(pane) {
    const [tickets, allUsers] = await Promise.all([App.api.listTickets({ allUsers: true }), App.api.listAllProfiles()]);
    const admins = allUsers.filter((u) => u.is_admin);
    const myId = App.auth.getUser().id;

    const counts = {};
    tickets.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
    const priorityCounts = {};
    tickets.forEach((t) => { priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1; });
    const withResponse = tickets.filter((t) => t.first_response_at);
    const avgFirstResponseHrs = withResponse.length
      ? (withResponse.reduce((a, t) => a + (new Date(t.first_response_at) - new Date(t.created_at)), 0) / withResponse.length / 3600000).toFixed(1)
      : null;

    App.utils.qs('#ticketStatsCards', pane).innerHTML = `<div class="grid-4">
      <div class="kpi c-gold"><div class="kpi-label">New</div><div class="kpi-value">${counts['New'] || 0}</div></div>
      <div class="kpi c-blue"><div class="kpi-label">In Progress</div><div class="kpi-value">${(counts['In Progress'] || 0) + (counts['Acknowledged'] || 0)}</div></div>
      <div class="kpi c-teal"><div class="kpi-label">Resolved</div><div class="kpi-value">${counts['Resolved'] || 0}</div></div>
      <div class="kpi c-purple"><div class="kpi-label">Avg First Response</div><div class="kpi-value" style="font-size:18px">${avgFirstResponseHrs ? avgFirstResponseHrs + ' hrs' : '—'}</div></div>
    </div>
    <div class="hint" style="margin-top:8px">🔴 ${priorityCounts['Critical'] || 0} Critical &nbsp; 🟠 ${priorityCounts['High'] || 0} High &nbsp; 🟡 ${priorityCounts['Medium'] || 0} Medium &nbsp; 🟢 ${priorityCounts['Low'] || 0} Low</div>`;

    let filter = 'All';
    async function draw() {
      let filtered = tickets;
      if (filter === 'Unassigned') filtered = tickets.filter((t) => !t.assigned_to);
      else if (filter === 'Assigned to Me') filtered = tickets.filter((t) => t.assigned_to === myId);

      App.utils.qs('#adminTicketsTable', pane).innerHTML = `<thead><tr><th>Ticket</th><th>Category</th><th>From</th><th>Priority</th><th>Assigned</th><th>Status</th><th></th></tr></thead>
        <tbody>${filtered.map((t) => `<tr>
          <td>${t.ticket_number}</td>
          <td>${App.utils.escapeHtml(t.category || '—')}</td>
          <td>${t.user_id ? 'Registered user' : `Guest: ${App.utils.escapeHtml(t.guest_name || '—')}`}</td>
          <td>${t.priority}</td>
          <td>${t.assigned_to ? App.utils.escapeHtml((admins.find((a) => a.id === t.assigned_to) || {}).full_name || 'Admin') : '—'}</td>
          <td><span class="badge ${App.utils.statusBadgeClass(t.status)}">${t.status}</span></td>
          <td><button class="btn btn-sm btn-outline" data-open-admin-ticket="${t.id}">Open</button></td>
        </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No tickets.</td></tr>'}</tbody>`;

      App.utils.qsa('[data-open-admin-ticket]', pane).forEach((b) => b.addEventListener('click', () => {
        openAdminTicketDetail(filtered.find((t) => t.id === Number(b.dataset.openAdminTicket)), admins, () => drawTicketsPanel(pane));
      }));
    }

    App.utils.qsa('[data-ticket-admin-filter]', pane).forEach((chip) => chip.addEventListener('click', () => {
      filter = chip.dataset.ticketAdminFilter;
      App.utils.qsa('[data-ticket-admin-filter]', pane).forEach((c) => c.classList.toggle('active', c === chip));
      draw();
    }));

    await draw();
  }

  // ---- Suggestions & Ideas ----
  const SUGGESTION_STATUS_OPTIONS = ['Submitted', 'Under Review', 'Accepted', 'Planned', 'In Development', 'Testing', 'Released', 'Rejected', 'Duplicate', 'Archived'];

  async function openAdminSuggestionDetail(suggestion, onDone) {
    const notes = await App.api.listSuggestionInternalNotes(suggestion.id);
    App.ui.open({
      title: suggestion.suggestion_number,
      bodyHtml: `
        <div class="hint" style="margin-bottom:10px">${App.utils.escapeHtml(suggestion.title)} (${suggestion.category})</div>
        ${suggestion.description ? `<div class="hint" style="margin-bottom:10px">${App.utils.escapeHtml(suggestion.description)}</div>` : ''}
        <div class="field" style="max-width:240px;margin-bottom:14px"><label>Status</label><select id="adminSuggStatus">${SUGGESTION_STATUS_OPTIONS.map((s) => `<option ${s === suggestion.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div style="padding-top:12px;border-top:1px solid var(--border2)">
          <div class="hint" style="font-weight:600;margin-bottom:6px">Internal Notes <span style="color:var(--text3);font-weight:400">(admin only)</span></div>
          <div id="suggNotesList" style="margin-bottom:8px">${notes.map((n) => `<div class="hint" style="margin-bottom:4px">${App.utils.fmtDateTime(n.created_at)}: ${App.utils.escapeHtml(n.note)}</div>`).join('') || '<div class="empty-note">No internal notes yet.</div>'}</div>
          <div style="display:flex;gap:8px">
            <input class="search-input" id="suggNoteInput" placeholder="Add an internal note..." style="flex:1">
            <button class="btn btn-outline btn-sm" id="addSuggNoteBtn">Add Note</button>
          </div>
        </div>`,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: () => { App.ui.close(); if (onDone) onDone(); } }],
      onMount: (body) => {
        App.utils.qs('#adminSuggStatus', body).addEventListener('change', async (e) => {
          try { await App.api.updateFeatureSuggestion(suggestion.id, { status: e.target.value }); App.utils.toast('Status updated'); }
          catch (e2) { App.utils.toast('Could not update: ' + (e2.message || e2), 'err'); }
        });
        App.utils.qs('#addSuggNoteBtn', body).addEventListener('click', async () => {
          const input = App.utils.qs('#suggNoteInput', body);
          const text = input.value.trim();
          if (!text) return;
          try {
            await App.api.createSuggestionInternalNote(suggestion.id, text);
            input.value = '';
            const fresh = await App.api.listSuggestionInternalNotes(suggestion.id);
            App.utils.qs('#suggNotesList', body).innerHTML = fresh.map((n) => `<div class="hint" style="margin-bottom:4px">${App.utils.fmtDateTime(n.created_at)}: ${App.utils.escapeHtml(n.note)}</div>`).join('');
          } catch (e2) { App.utils.toast('Could not add note: ' + (e2.message || e2), 'err'); }
        });
      },
    });
  }

  async function drawSuggestionsPanel(pane) {
    const [suggestions, voteCounts] = await Promise.all([App.api.listFeatureSuggestions(), App.api.listSuggestionVoteCounts()]);
    const votesBySuggestion = {}; voteCounts.forEach((v) => { votesBySuggestion[v.suggestion_id] = v.vote_count; });

    const counts = {};
    suggestions.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
    App.utils.qs('#suggestionStatsCards', pane).innerHTML = `<div class="grid-4">
      <div class="kpi c-gold"><div class="kpi-label">New Ideas</div><div class="kpi-value">${counts['Submitted'] || 0}</div></div>
      <div class="kpi c-blue"><div class="kpi-label">Under Review</div><div class="kpi-value">${counts['Under Review'] || 0}</div></div>
      <div class="kpi c-teal"><div class="kpi-label">Planned/In Dev</div><div class="kpi-value">${(counts['Planned'] || 0) + (counts['In Development'] || 0)}</div></div>
      <div class="kpi c-purple"><div class="kpi-label">Released</div><div class="kpi-value">${counts['Released'] || 0}</div></div>
    </div>`;

    const sorted = suggestions.slice().sort((a, b) => (votesBySuggestion[b.id] || 0) - (votesBySuggestion[a.id] || 0));
    App.utils.qs('#adminSuggestionsTable', pane).innerHTML = `<thead><tr><th>Suggestion</th><th>Title</th><th>Category</th><th>Votes</th><th>Status</th><th></th></tr></thead>
      <tbody>${sorted.map((s) => `<tr>
        <td>${s.suggestion_number}</td>
        <td>${App.utils.escapeHtml(s.title)}</td>
        <td>${App.utils.escapeHtml(s.category)}</td>
        <td>${votesBySuggestion[s.id] || 0}</td>
        <td><span class="badge ${App.utils.statusBadgeClass(s.status)}">${s.status}</span></td>
        <td><button class="btn btn-sm btn-outline" data-open-admin-sugg="${s.id}">Open</button></td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">No suggestions yet.</td></tr>'}</tbody>`;

    App.utils.qsa('[data-open-admin-sugg]', pane).forEach((b) => b.addEventListener('click', () => {
      openAdminSuggestionDetail(sorted.find((s) => s.id === Number(b.dataset.openAdminSugg)), () => drawSuggestionsPanel(pane));
    }));
  }

  async function drawUsersPanel(pane) {
    const [users, allDeals] = await Promise.all([App.api.listAllProfiles(), App.api.listDeals({ allUsers: true })]);
    const dealsByUser = {};
    allDeals.forEach((d) => { (dealsByUser[d.user_id] = dealsByUser[d.user_id] || []).push(d); });

    App.utils.qs('#adminUsersTable', pane).innerHTML = `<thead><tr><th>User</th><th>Email</th><th>Joined</th><th>Active Deals</th><th>Total Invested</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${users.map((u) => {
        const userDeals = dealsByUser[u.id] || [];
        const activeCount = userDeals.filter((d) => d.status === 'ACTIVE').length;
        const totalInvested = userDeals.reduce((a, d) => a + (d.invested_amount || 0), 0);
        const isActive = u.is_active !== false;
        const isSelf = App.state.profile && App.state.profile.id === u.id;
        return `<tr>
          <td><strong>${App.utils.escapeHtml(u.full_name || '—')}</strong>${isSelf ? ' <span style="font-size:11px;color:var(--text3)">(You)</span>' : ''}</td>
          <td>${App.utils.escapeHtml(u.email || '—')}</td>
          <td>${App.utils.fmtDate(u.created_at)}</td>
          <td>${activeCount}</td>
          <td>${App.utils.fmtMoney(totalInvested)}</td>
          <td>${u.is_admin ? '<span class="badge st-active">Admin</span>' : 'User'}</td>
          <td><span class="badge ${isActive ? 'st-active' : 'st-cancelled'}">${isActive ? 'Active' : 'Deactivated'}</span></td>
          <td style="white-space:nowrap;display:flex;gap:4px;align-items:center">
            <button class="btn btn-sm btn-outline" data-view-user="${u.id}">View</button>
            <button class="btn btn-sm btn-outline" data-edit-user="${u.id}">Edit</button>
            ${isSelf ? '' : `<button class="btn btn-sm btn-outline" data-toggle-active="${u.id}" data-active="${isActive}">${isActive ? 'Deactivate' : 'Reactivate'}</button>
            <button class="icon-btn del" data-delete-user="${u.id}" title="Delete Permanently">&#128465;</button>`}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">No users found.</td></tr>'}</tbody>`;

    App.utils.qsa('[data-view-user]', pane).forEach((b) => b.addEventListener('click', () => {
      const user = users.find((u) => u.id === b.dataset.viewUser);
      openUserDetailModal(user);
    }));
    App.utils.qsa('[data-edit-user]', pane).forEach((b) => b.addEventListener('click', () => {
      const user = users.find((u) => u.id === b.dataset.editUser);
      if (user) openEditUserModal(user, () => drawUsersPanel(pane));
    }));
    App.utils.qsa('[data-toggle-active]', pane).forEach((b) => b.addEventListener('click', async () => {
      const wasActive = b.dataset.active === 'true';
      b.disabled = true;
      try {
        await App.api.adminSetUserActive(b.dataset.toggleActive, !wasActive);
        App.utils.toast(wasActive ? 'User deactivated' : 'User reactivated');
        drawUsersPanel(pane);
      } catch (e) {
        App.utils.toast('Could not update: ' + (e.message || e), 'err');
        b.disabled = false;
      }
    }));
    App.utils.qsa('[data-delete-user]', pane).forEach((b) => b.addEventListener('click', () => {
      const user = users.find((u) => u.id === b.dataset.deleteUser);
      if (user) openDeleteUserModal(user, () => drawUsersPanel(pane));
    }));
  }

  // ---- Shared Portfolios (024) ----
  function openManageMembersModal(portfolio, allUsers, onDone) {
    async function draw() {
      const members = await App.api.listPortfolioMembers(portfolio.id);
      const memberIds = new Set(members.map((m) => m.member_user_id));
      const candidates = allUsers.filter((u) => u.id !== portfolio.owner_user_id && !memberIds.has(u.id));
      App.ui.open({
        title: `Members - ${portfolio.name}`,
        bodyHtml: `
          <div class="table-scroll" style="max-height:220px;margin-bottom:14px">
            <table class="data"><thead><tr><th>Member</th><th>Role</th><th></th></tr></thead>
            <tbody>${members.map((m) => {
              const u = allUsers.find((x) => x.id === m.member_user_id) || {};
              return `<tr><td>${App.utils.escapeHtml(u.full_name || u.email || m.member_user_id)}</td><td>${m.role}</td>
                <td><button class="icon-btn del" data-remove-member="${m.id}">&#128465;</button></td></tr>`;
            }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:14px">No members yet.</td></tr>'}</tbody></table>
          </div>
          <div class="field span2" style="margin-bottom:10px"><label>Add Member</label>
            <select id="newMemberUser"><option value="">— Select a user —</option>${candidates.map((u) => `<option value="${u.id}">${App.utils.escapeHtml(u.full_name || u.email)}</option>`).join('')}</select>
          </div>`,
        actions: [
          { label: '+ Add as Viewer', className: 'btn-gold', onClick: async () => {
            const userId = App.utils.qs('#newMemberUser').value;
            if (!userId) return;
            try { await App.api.addPortfolioMember({ portfolio_id: portfolio.id, member_user_id: userId, role: 'Viewer', accepted_at: new Date().toISOString() }); await draw(); if (onDone) onDone(); }
            catch (e) { App.utils.toast('Could not add member: ' + (e.message || e), 'err'); }
          } },
          { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
        ],
        onMount: (body) => {
          App.utils.qsa('[data-remove-member]', body).forEach((b) => b.addEventListener('click', async () => {
            try { await App.api.removePortfolioMember(Number(b.dataset.removeMember)); await draw(); if (onDone) onDone(); }
            catch (e) { App.utils.toast('Could not remove member: ' + (e.message || e), 'err'); }
          }));
        },
      });
    }
    draw();
  }

  async function drawSharedPortfoliosPanel(pane, allUsers) {
    const portfolios = await App.api.listSharedPortfolios();
    App.utils.qs('#sharedPortfoliosTable', pane).innerHTML = `<thead><tr><th>Owner</th><th>Name</th><th>Members</th><th>Sharing</th><th>Actions</th></tr></thead>
      <tbody>${(await Promise.all(portfolios.map(async (p) => {
        const owner = allUsers.find((u) => u.id === p.owner_user_id) || {};
        const members = await App.api.listPortfolioMembers(p.id);
        return `<tr>
          <td>${App.utils.escapeHtml(owner.full_name || owner.email || p.owner_user_id)}</td>
          <td>${App.utils.escapeHtml(p.name)}</td>
          <td>${members.length} viewer${members.length === 1 ? '' : 's'}</td>
          <td><span class="badge ${p.is_active ? 'st-active' : 'st-cancelled'}">${p.is_active ? 'On' : 'Off'}</span></td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-outline" data-manage-members="${p.id}">Members</button>
            <button class="btn btn-sm btn-outline" data-toggle-sharing="${p.id}" data-active="${p.is_active}">${p.is_active ? 'Turn Off' : 'Turn On'}</button>
          </td>
        </tr>`;
      }))).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">No shared portfolios yet.</td></tr>'}</tbody>`;

    App.utils.qsa('[data-manage-members]', pane).forEach((b) => b.addEventListener('click', () => {
      const p = portfolios.find((x) => x.id === Number(b.dataset.manageMembers));
      openManageMembersModal(p, allUsers, () => drawSharedPortfoliosPanel(pane, allUsers));
    }));
    App.utils.qsa('[data-toggle-sharing]', pane).forEach((b) => b.addEventListener('click', async () => {
      const wasActive = b.dataset.active === 'true';
      try { await App.api.updateSharedPortfolio(Number(b.dataset.toggleSharing), { is_active: !wasActive }); drawSharedPortfoliosPanel(pane, allUsers); }
      catch (e) { App.utils.toast('Could not update: ' + (e.message || e), 'err'); }
    }));
  }

  async function ensureSharedPortfolioForOwner(ownerId, allUsers) {
    const existing = (await App.api.listSharedPortfolios()).find((p) => p.owner_user_id === ownerId);
    if (existing) return existing;
    return App.api.createSharedPortfolio({ owner_user_id: ownerId, name: `${(allUsers.find((u) => u.id === ownerId) || {}).full_name || 'User'}'s Portfolio` });
  }

  // ---- Database Health & Maintenance (025 & 043) ----
  const TABLE_CATEGORIES = {
    deals: 'Core & Deals', platforms: 'Core & Deals', payment_schedule: 'Core & Deals', payments: 'Core & Deals',
    reinvestments: 'Core & Deals', bank_transactions: 'Core & Deals', payment_matches: 'Core & Deals',
    cash_transactions: 'Core & Deals', portfolio_goals: 'Core & Deals', tax_records: 'Core & Deals',
    accounts: 'Core & Deals', liabilities: 'Core & Deals', net_worth_snapshots: 'Core & Deals',
    gold_purchases: 'Core & Deals', gold_alerts: 'Core & Deals', gold_price_observations: 'Core & Deals',
    gold_providers: 'Core & Deals', gold_settings: 'Core & Deals',
    recurring_items: 'Recurring', recurring_occurrences: 'Recurring', recurring_amount_history: 'Recurring',
    recurring_schedule_history: 'Recurring', recurring_pauses: 'Recurring',
    expense_projects: 'Expenses', expense_categories: 'Expenses', expense_vendors: 'Expenses',
    expense_advances: 'Expenses', expense_transactions: 'Expenses', expense_recurring_templates: 'Expenses',
    expense_project_custom_fields: 'Expenses', expense_transaction_custom_values: 'Expenses',
    contacts: 'CRM & Contacts', contact_phones: 'CRM & Contacts', contact_emails: 'CRM & Contacts',
    contact_addresses: 'CRM & Contacts', contact_groups: 'CRM & Contacts', contact_group_members: 'CRM & Contacts',
    contact_important_dates: 'CRM & Contacts', contact_notes: 'CRM & Contacts', contact_reminders: 'CRM & Contacts',
    conversations: 'Chat & Calls', conversation_members: 'Chat & Calls', messages: 'Chat & Calls',
    message_attachments: 'Chat & Calls', message_reactions: 'Chat & Calls', message_edits: 'Chat & Calls',
    message_reads: 'Chat & Calls', message_hidden_for_me: 'Chat & Calls', shared_message_batches: 'Chat & Calls',
    shared_message_items: 'Chat & Calls', calls: 'Chat & Calls',
    support_tickets: 'Support', ticket_messages: 'Support', ticket_internal_notes: 'Support',
    feature_suggestions: 'Ideas & Roadmap', suggestion_internal_notes: 'Ideas & Roadmap', suggestion_votes: 'Ideas & Roadmap',
    blog_posts: 'Community & Blog', blog_comments: 'Community & Blog', community_messages: 'Community & Blog',
    audit_logs: 'Logs & Telemetry', login_events: 'Logs & Telemetry', copilot_usage: 'Logs & Telemetry',
    notifications: 'Notifications', notification_preferences: 'Notifications', notification_type_preferences: 'Notifications',
    push_subscriptions: 'Notifications',
    imports: 'System', documents: 'System', notes: 'System', calendar_events: 'System', app_settings: 'System',
    user_privacy_settings: 'System', blocked_users: 'System', reported_users: 'System',
    shared_portfolios: 'System', portfolio_members: 'System', automation_rules: 'System',
    ai_insights: 'System', scenario_simulations: 'System', integration_configs: 'System',
    ai_providers: 'System', ai_settings: 'System', benchmark_observations: 'System',
    profiles: 'Users & Auth',
  };

  let dbHealthSearch = '';
  let dbHealthCategory = 'All';

  function exportTableRowsToCsv(tableName, rows) {
    if (!rows || !rows.length) {
      App.utils.toast('No rows to export for ' + tableName, 'warn');
      return;
    }
    const clean = rows.map((r) => {
      const out = {};
      Object.entries(r).forEach(([k, v]) => {
        out[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
      });
      return out;
    });
    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(clean);
      XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 31));
      XLSX.writeFile(wb, `${tableName}_export_${new Date().toISOString().slice(0, 10)}.csv`);
    } else {
      const keys = Object.keys(clean[0] || {});
      const csv = [keys.join(',')].concat(clean.map((row) => keys.map((k) => JSON.stringify(row[k] ?? '')).join(','))).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    App.utils.toast(`Exported ${rows.length} rows from ${tableName}`);
  }

  function openClearTableModal(tableName, estimatedRows, onDone) {
    App.ui.open({
      title: `Clear Table: ${tableName}`,
      bodyHtml: `
        <div class="hint" style="color:var(--red,#e5484d);margin-bottom:12px">
          This will permanently delete all records (approx. <b>${estimatedRows}</b> rows) from <code>public.${App.utils.escapeHtml(tableName)}</code>.
          ${['deals', 'recurring_items', 'expense_projects', 'contacts', 'conversations', 'support_tickets'].includes(tableName) ? '<br><br><b>Note:</b> Dependent child records (e.g. schedules, payments, notes, messages) will also be cascade-cleared to maintain referential integrity.' : ''}
        </div>
        <div class="field span2">
          <label>Type <b>CLEAR</b> to confirm</label>
          <input id="confirmClearTableInput" type="text" placeholder="Type CLEAR" autocomplete="off">
        </div>
        <div class="auth-error" id="clearTableError" style="margin-top:8px"></div>`,
      actions: [
        {
          label: 'Permanently Clear Table',
          className: 'btn-outline',
          onClick: async () => {
            const typed = (App.utils.qs('#confirmClearTableInput') || {}).value || '';
            if (typed.trim() !== 'CLEAR') {
              App.utils.qs('#clearTableError').textContent = 'Please type CLEAR in all caps to confirm.';
              return;
            }
            try {
              const res = await App.api.adminClearTable(tableName);
              App.utils.toast(res.message || `Table ${tableName} was cleared successfully.`);
              App.ui.close();
              if (onDone) onDone();
            } catch (e) {
              App.utils.qs('#clearTableError').textContent = e.message || String(e);
            }
          },
        },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  function openPurgeOldLogsModal(onDone) {
    App.ui.open({
      title: 'Purge Old Logs & Telemetry',
      bodyHtml: `
        <div class="hint" style="margin-bottom:12px">
          Clean up historical audit logs, customer login events, AI Copilot query logs, and read notifications to optimize database performance and save storage space. Core deals, accounts, and contacts are untouched.
        </div>
        <div class="field span2">
          <label>Retention Window</label>
          <select id="purgeDaysSelect" class="search-input" style="width:100%">
            <option value="7">Purge older than 7 days</option>
            <option value="15">Purge older than 15 days</option>
            <option value="30" selected>Purge older than 30 days (Recommended)</option>
            <option value="60">Purge older than 60 days</option>
            <option value="90">Purge older than 90 days</option>
          </select>
        </div>
        <div style="font-size:12.5px;color:var(--text2);margin-top:10px;padding:10px;background:var(--fill-1);border-radius:6px;border:1px solid var(--border)">
          <b>Target Tables:</b> <code>audit_logs</code>, <code>login_events</code>, <code>copilot_usage</code>, <code>notifications (read only)</code>.
        </div>
        <div class="auth-error" id="purgeLogsError" style="margin-top:8px"></div>`,
      actions: [
        {
          label: 'Purge Old Logs Now',
          className: 'btn-gold',
          onClick: async () => {
            const days = parseInt(App.utils.qs('#purgeDaysSelect').value, 10) || 30;
            try {
              const res = await App.api.adminPurgeOldLogs(days);
              const purged = res && res.total_purged !== undefined ? res.total_purged : 'Historical';
              App.utils.toast(`Log cleanup complete: ${purged} old records removed`);
              App.ui.close();
              if (onDone) onDone();
            } catch (e) {
              App.utils.qs('#purgeLogsError').textContent = e.message || String(e);
            }
          },
        },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  async function openTableDataModal(tableName) {
    App.ui.open({
      title: `Inspect Table: public.${tableName}`,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:220px">
            <input id="inspectTableSearch" type="text" class="search-input" placeholder="Search rows..." style="width:100%">
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" id="inspectExportCsvBtn">&#128229; Export CSV</button>
            <button class="btn btn-outline btn-sm" id="inspectClearTableBtn" style="color:var(--red,#e5484d);border-color:var(--red,#e5484d)">&#128465; Clear Table</button>
            <button class="btn btn-outline btn-sm" id="inspectRefreshBtn">&#8635; Refresh</button>
          </div>
        </div>
        <div id="inspectTableCount" style="font-size:12px;color:var(--text2);margin-bottom:8px">Loading rows...</div>
        <div class="table-scroll" style="max-height:420px;border:1px solid var(--border2);border-radius:8px">
          <table class="data" id="inspectDataTable"></table>
        </div>`,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    let currentRows = [];
    async function loadInspectData() {
      try {
        App.utils.qs('#inspectTableCount').textContent = 'Fetching records from database...';
        const res = await App.api.adminGetTableRows(tableName, { limit: 150 });
        currentRows = res.rows || [];
        renderInspectTable(currentRows);
      } catch (e) {
        App.utils.qs('#inspectTableCount').innerHTML = `<span style="color:var(--red,#e5484d)">Could not load records: ${App.utils.escapeHtml(e.message || e)}</span>`;
      }
    }

    function renderInspectTable(rows) {
      const q = (App.utils.qs('#inspectTableSearch') ? App.utils.qs('#inspectTableSearch').value : '').toLowerCase().trim();
      const filtered = q
        ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
        : rows;

      App.utils.qs('#inspectTableCount').innerHTML = `Showing <b>${filtered.length}</b> of <b>${rows.length}</b> loaded rows (max 150 shown)`;
      const table = App.utils.qs('#inspectDataTable');
      if (!table) return;

      if (!filtered.length) {
        table.innerHTML = `<tbody><tr><td style="text-align:center;padding:24px;color:var(--text3)">${rows.length === 0 ? 'No records in this table (table is clean/empty).' : 'No matching records found for search filter.'}</td></tr></tbody>`;
        return;
      }

      const allKeys = Array.from(new Set(filtered.flatMap((r) => Object.keys(r))));
      const priorityKeys = ['id', 'name', 'title', 'email', 'user_id', 'amount', 'status', 'created_at'].filter((k) => allKeys.includes(k));
      const remainingKeys = allKeys.filter((k) => !priorityKeys.includes(k));
      const displayKeys = priorityKeys.concat(remainingKeys).slice(0, 8);

      const thead = `<thead><tr>
        ${displayKeys.map((k) => `<th>${App.utils.escapeHtml(k)}</th>`).join('')}
        <th style="text-align:right">Actions</th>
      </tr></thead>`;

      const tbody = `<tbody>${filtered.map((row, idx) => `
        <tr data-row-idx="${idx}">
          ${displayKeys.map((k) => {
            const val = row[k];
            let formatted = '—';
            if (val !== null && val !== undefined) {
              if (typeof val === 'object') formatted = `<code style="font-size:11px;padding:2px 4px;background:var(--fill-1);border-radius:3px">${App.utils.escapeHtml(JSON.stringify(val).slice(0, 30))}${JSON.stringify(val).length > 30 ? '...' : ''}</code>`;
              else if (typeof val === 'boolean') formatted = val ? '<span class="badge st-active">true</span>' : '<span class="badge st-cancelled">false</span>';
              else if (typeof val === 'number') formatted = App.utils.escapeHtml(String(val));
              else if (String(val).length > 40) formatted = App.utils.escapeHtml(String(val).slice(0, 40)) + '...';
              else formatted = App.utils.escapeHtml(String(val));
            }
            return `<td>${formatted}</td>`;
          }).join('')}
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-outline btn-sm inspect-row-json" data-row-idx="${idx}" style="padding:2px 6px;font-size:11px" title="View Full Record Details">&#128065;</button>
            <button class="btn btn-outline btn-sm inspect-row-del" data-row-id="${row.id || row.table_name || idx}" data-row-idx="${idx}" style="padding:2px 6px;font-size:11px;color:var(--red,#e5484d);border-color:var(--red,#e5484d)" title="Delete This Entry">&#128465;</button>
          </td>
        </tr>`).join('')}</tbody>`;

      table.innerHTML = thead + tbody;

      App.utils.qsa('.inspect-row-json', table).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rIdx = Number(btn.dataset.rowIdx);
          const r = filtered[rIdx];
          if (!r) return;
          App.ui.open({
            title: `Record Details: ${tableName} #${r.id || rIdx + 1}`,
            bodyHtml: `<pre style="max-height:400px;overflow:auto;background:var(--bg2);padding:12px;border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--text);white-space:pre-wrap;word-break:break-all">${App.utils.escapeHtml(JSON.stringify(r, null, 2))}</pre>`,
            actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
          });
        });
      });

      App.utils.qsa('.inspect-row-del', table).forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const rIdx = Number(btn.dataset.rowIdx);
          const r = filtered[rIdx];
          if (!r) return;
          const rowId = r.id;
          if (rowId === undefined || rowId === null) {
            App.utils.toast('This table entry does not have a standard primary key id column to delete individually.', 'warn');
            return;
          }
          if (!confirm(`Delete record #${rowId} from ${tableName}?`)) return;
          try {
            await App.api.adminDeleteTableRow(tableName, rowId);
            currentRows = currentRows.filter((item) => item.id !== rowId);
            App.utils.toast(`Record #${rowId} deleted from ${tableName}`);
            renderInspectTable(currentRows);
          } catch (err) {
            App.utils.toast('Could not delete record: ' + (err.message || err), 'err');
          }
        });
      });
    }

    const searchInput = App.utils.qs('#inspectTableSearch');
    if (searchInput) searchInput.addEventListener('input', () => renderInspectTable(currentRows));

    const exportBtn = App.utils.qs('#inspectExportCsvBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => exportTableRowsToCsv(tableName, currentRows));

    const refreshBtn = App.utils.qs('#inspectRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadInspectData);

    const clearBtn = App.utils.qs('#inspectClearTableBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      openClearTableModal(tableName, currentRows.length, loadInspectData);
    });

    await loadInspectData();
  }

  async function drawDatabaseHealthPanel(pane) {
    const stats = await App.api.getAdminTableStats();
    const tableContainer = App.utils.qs('#dbHealthTableContainer', pane) || App.utils.qs('#dbHealthTable', pane);
    if (!tableContainer) return;

    const totalTables = stats.length;
    const tablesWithData = stats.filter((t) => (t.estimated_rows || 0) > 0).length;
    const emptyTables = stats.filter((t) => (t.estimated_rows || 0) === 0).length;
    const totalRows = stats.reduce((acc, t) => acc + Number(t.estimated_rows || 0), 0);
    const totalBytes = stats.reduce((acc, t) => acc + Number(t.total_size_bytes || 0), 0);
    const prettyTotalBytes = totalBytes > 1048576 ? (totalBytes / 1048576).toFixed(2) + ' MB' : (totalBytes / 1024).toFixed(0) + ' kB';

    const kpiHost = App.utils.qs('#dbHealthKpis', pane);
    if (kpiHost) {
      kpiHost.innerHTML = `
        <div class="grid-4" style="margin-bottom:12px">
          <div class="kpi"><div class="kpi-label">Total Tables</div><div class="kpi-value">${totalTables}</div><div class="kpi-desc">Schema: public</div></div>
          <div class="kpi"><div class="kpi-label">Estimated Records</div><div class="kpi-value">${totalRows.toLocaleString()}</div><div class="kpi-desc">Live Postgres Tuples</div></div>
          <div class="kpi"><div class="kpi-label">Database Disk Size</div><div class="kpi-value">${prettyTotalBytes}</div><div class="kpi-desc">Relations + Indexes</div></div>
          <div class="kpi"><div class="kpi-label">Populated Tables</div><div class="kpi-value">${tablesWithData} <span style="font-size:14px;color:var(--text3)">/ ${totalTables}</span></div><div class="kpi-desc">${emptyTables} clean/empty</div></div>
        </div>`;
    }

    function renderFilteredStats() {
      const q = (dbHealthSearch || '').toLowerCase().trim();
      const filtered = stats.filter((t) => {
        const cat = TABLE_CATEGORIES[t.table_name] || 'System';
        if (dbHealthCategory === 'With Data' && (t.estimated_rows || 0) === 0) return false;
        if (dbHealthCategory === 'Empty' && (t.estimated_rows || 0) > 0) return false;
        if (dbHealthCategory !== 'All' && dbHealthCategory !== 'With Data' && dbHealthCategory !== 'Empty' && cat !== dbHealthCategory) return false;
        if (q && !t.table_name.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) return false;
        return true;
      });

      const tableEl = App.utils.qs('#dbHealthTable', pane);
      if (!tableEl) return;

      tableEl.innerHTML = `
        <thead>
          <tr>
            <th>Table Name</th>
            <th>Category</th>
            <th>Estimated Rows</th>
            <th>Disk Size</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((t) => {
            const rows = Number(t.estimated_rows || 0);
            const cat = TABLE_CATEGORIES[t.table_name] || 'System';
            const isProtected = t.table_name === 'profiles';
            return `
              <tr ${rows === 0 ? 'style="color:var(--text3)"' : ''}>
                <td>
                  <span style="font-weight:600;font-family:monospace;font-size:13px;color:var(--text)">${App.utils.escapeHtml(t.table_name)}</span>
                </td>
                <td>
                  <span class="badge" style="font-size:10px;background:var(--fill-2);border:1px solid var(--border2);color:var(--text2)">${App.utils.escapeHtml(cat)}</span>
                </td>
                <td>
                  ${rows === 0 ? '<span class="badge st-cancelled">0 (empty)</span>' : `<span style="font-weight:600;color:var(--text)">${rows.toLocaleString()}</span>`}
                </td>
                <td>${App.utils.escapeHtml(t.total_size_pretty || '8 kB')}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-outline btn-sm btn-inspect-db-table" data-table="${App.utils.escapeHtml(t.table_name)}" style="padding:3px 8px;font-size:11.5px" title="View / Inspect Data">&#128065; View</button>
                  <button class="btn btn-outline btn-sm btn-export-db-table" data-table="${App.utils.escapeHtml(t.table_name)}" style="padding:3px 8px;font-size:11.5px" title="Export CSV">&#128229; CSV</button>
                  ${!isProtected ? `<button class="btn btn-outline btn-sm btn-clear-db-table" data-table="${App.utils.escapeHtml(t.table_name)}" data-rows="${rows}" style="padding:3px 8px;font-size:11.5px;color:var(--red,#e5484d);border-color:var(--red,#e5484d)" title="Purge / Clean Table">&#128465; Clean</button>` : ''}
                </td>
              </tr>`;
          }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">No tables match your filter.</td></tr>'}
        </tbody>`;

      App.utils.qsa('.btn-inspect-db-table', tableEl).forEach((btn) => {
        btn.addEventListener('click', () => openTableDataModal(btn.dataset.table));
      });

      App.utils.qsa('.btn-export-db-table', tableEl).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tName = btn.dataset.table;
          btn.disabled = true;
          btn.textContent = 'Exporting...';
          try {
            const res = await App.api.adminGetTableRows(tName, { limit: 10000 });
            exportTableRowsToCsv(tName, res.rows || []);
          } catch (e) {
            App.utils.toast('Could not export table: ' + (e.message || e), 'err');
          } finally {
            btn.disabled = false;
            btn.innerHTML = '&#128229; CSV';
          }
        });
      });

      App.utils.qsa('.btn-clear-db-table', tableEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          const tName = btn.dataset.table;
          const rows = Number(btn.dataset.rows || 0);
          openClearTableModal(tName, rows, () => drawDatabaseHealthPanel(pane));
        });
      });
    }

    const searchInput = App.utils.qs('#dbHealthSearchInput', pane);
    if (searchInput) {
      searchInput.value = dbHealthSearch;
      searchInput.oninput = (e) => {
        dbHealthSearch = e.target.value;
        renderFilteredStats();
      };
    }

    App.utils.qsa('[data-db-cat-filter]', pane).forEach((chip) => {
      chip.onclick = () => {
        App.utils.qsa('[data-db-cat-filter]', pane).forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        dbHealthCategory = chip.dataset.dbCatFilter;
        renderFilteredStats();
      };
    });

    const refreshBtn = App.utils.qs('#refreshDbHealthBtn', pane);
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        try {
          await drawDatabaseHealthPanel(pane);
          App.utils.toast('Database health statistics refreshed');
        } catch (e) {
          App.utils.toast('Could not refresh: ' + (e.message || e), 'err');
        } finally {
          if (App.utils.qs('#refreshDbHealthBtn', pane)) {
            App.utils.qs('#refreshDbHealthBtn', pane).disabled = false;
            App.utils.qs('#refreshDbHealthBtn', pane).innerHTML = '&#8635; Refresh Now';
          }
        }
      };
    }

    const purgeLogsBtn = App.utils.qs('#purgeOldLogsBtn', pane);
    if (purgeLogsBtn) {
      purgeLogsBtn.onclick = () => openPurgeOldLogsModal(() => drawDatabaseHealthPanel(pane));
    }

    const exportAllBtn = App.utils.qs('#exportAllDbBtn', pane);
    if (exportAllBtn) {
      exportAllBtn.onclick = async () => {
        if (typeof App.exportData !== 'undefined' && App.exportData.exportFullPortfolio) {
          await App.exportData.exportFullPortfolio();
        } else {
          App.utils.toast('Starting full database export...');
        }
      };
    }

    renderFilteredStats();
  }

  // ---- Visits & Customer Logins (027 & 040) ----
  let visitsFilter = 'All';
  let visitsSearch = '';

  async function drawVisitsPanel(pane) {
    const [events, allUsers] = await Promise.all([
      App.api.listLoginEvents({ limit: 300 }).catch(() => []),
      App.api.listAllProfiles().catch(() => []),
    ]);

    const userMap = new Map((allUsers || []).map((u) => [u.id, u]));
    const today = App.utils.todayISO();
    const weekAgo = new Date(Date.now() - 7 * 86400000);

    const loginsToday = events.filter((e) => (e.occurred_at || '').slice(0, 10) === today).length;
    const loginsThisWeek = events.filter((e) => new Date(e.occurred_at) >= weekAgo).length;
    const totalLogins = events.length;
    const uniqueUsers = new Set(events.map((e) => e.user_id)).size;

    const mobileCount = events.filter((e) => (e.device_type || '').toLowerCase() === 'mobile').length;
    const desktopCount = events.filter((e) => (e.device_type || '').toLowerCase() === 'desktop').length;
    const tabletCount = events.filter((e) => (e.device_type || '').toLowerCase() === 'tablet').length;

    const browserCounts = {};
    const countryCounts = {};
    events.forEach((e) => {
      if (e.browser) browserCounts[e.browser] = (browserCounts[e.browser] || 0) + 1;
      const country = e.country || (e.city ? `${e.city}, ${e.country || ''}` : '');
      if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;
    });

    const topBrowser = Object.entries(browserCounts).sort((a, b) => b[1] - a[1])[0];
    const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0];

    App.utils.qs('#visitsStats', pane).innerHTML = `
      <div class="grid-4" style="margin-bottom:12px">
        <div class="kpi"><div class="kpi-label">Logins Today</div><div class="kpi-value">${loginsToday}</div></div>
        <div class="kpi"><div class="kpi-label">Logins This Week</div><div class="kpi-value">${loginsThisWeek}</div></div>
        <div class="kpi"><div class="kpi-label">Unique Customers</div><div class="kpi-value">${uniqueUsers}</div></div>
        <div class="kpi"><div class="kpi-label">Total Recorded</div><div class="kpi-value">${totalLogins}</div></div>
      </div>
      <div class="grid-3" style="margin-bottom:14px">
        <div class="kpi" style="padding:10px 14px">
          <div class="kpi-label">Device Breakdown</div>
          <div style="font-size:13.5px;font-weight:600;margin-top:4px">
            📱 Mobile: <span style="color:var(--gold)">${mobileCount}</span> &middot; 💻 Desktop: <span style="color:var(--blue)">${desktopCount}</span>${tabletCount ? ` &middot; 📟 Tablet: ${tabletCount}` : ''}
          </div>
        </div>
        <div class="kpi" style="padding:10px 14px">
          <div class="kpi-label">Top Location</div>
          <div style="font-size:13.5px;font-weight:600;margin-top:4px;color:var(--text)">
            📍 ${topCountry ? App.utils.escapeHtml(topCountry[0]) : 'No location data yet'}
          </div>
        </div>
        <div class="kpi" style="padding:10px 14px">
          <div class="kpi-label">Top Browser / Platform</div>
          <div style="font-size:13.5px;font-weight:600;margin-top:4px;color:var(--text)">
            🌐 ${topBrowser ? `${App.utils.escapeHtml(topBrowser[0])} (${topBrowser[1]})` : '—'}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <input id="visitsSearchInput" class="search-input" placeholder="Search by customer name, email, IP, city, or browser..." value="${App.utils.escapeHtml(visitsSearch)}" style="flex:1;min-width:240px">
        <div class="chip-row" id="visitsFilterChips" style="margin:0">
          ${['All', 'Mobile', 'Desktop', 'Tablet', 'Today'].map((f) => `<div class="chip ${f === visitsFilter ? 'active' : ''}" data-visit-filter="${f}">${f}</div>`).join('')}
        </div>
        <button class="btn btn-outline btn-sm" id="refreshVisitsBtn">&#8635; Refresh</button>
      </div>`;

    // Filter events
    const q = visitsSearch.trim().toLowerCase();
    const filtered = events.filter((e) => {
      const u = userMap.get(e.user_id) || {};
      const userText = `${u.full_name || ''} ${u.email || ''}`.toLowerCase();
      const locText = `${e.city || ''} ${e.region || ''} ${e.country || ''} ${e.ip_address || ''}`.toLowerCase();
      const devText = `${e.browser || ''} ${e.os || ''} ${e.device_type || ''} ${e.screen_resolution || ''}`.toLowerCase();

      if (q && !userText.includes(q) && !locText.includes(q) && !devText.includes(q)) {
        return false;
      }

      if (visitsFilter === 'Mobile') return (e.device_type || '').toLowerCase() === 'mobile';
      if (visitsFilter === 'Desktop') return (e.device_type || '').toLowerCase() === 'desktop';
      if (visitsFilter === 'Tablet') return (e.device_type || '').toLowerCase() === 'tablet';
      if (visitsFilter === 'Today') return (e.occurred_at || '').slice(0, 10) === today;
      return true;
    });

    App.utils.qs('#visitsTable', pane).innerHTML = `
      <thead>
        <tr>
          <th>Customer / User</th>
          <th>Date &amp; Time</th>
          <th>Location</th>
          <th>IP Address</th>
          <th>Device &amp; Screen</th>
          <th>Browser &amp; OS</th>
        </tr>
      </thead>
      <tbody>${filtered.map((e) => {
        const u = userMap.get(e.user_id) || {};
        const userName = u.full_name || (u.email ? u.email.split('@')[0] : 'User');
        const userEmail = u.email || e.user_id;
        const locParts = [e.city, e.region, e.country].filter(Boolean);
        const locStr = locParts.length ? locParts.join(', ') : 'Location unavailable';

        const deviceType = e.device_type || 'Desktop';
        const isMob = deviceType.toLowerCase() === 'mobile';
        const isTab = deviceType.toLowerCase() === 'tablet';
        const devBadgeCls = isMob ? 'st-active' : (isTab ? 'st-pending' : 'st-closed');
        const devIcon = isMob ? '📱' : (isTab ? '📟' : '💻');

        return `<tr>
          <td>
            <div style="font-weight:600;color:var(--text)">${App.utils.escapeHtml(userName)}</div>
            <div style="font-size:11px;color:var(--text3)">${App.utils.escapeHtml(userEmail)}</div>
          </td>
          <td>
            <div style="font-size:12.5px;font-weight:500">${App.utils.fmtDateTime(e.occurred_at)}</div>
            <div style="font-size:11px;color:var(--text3)">${e.timezone ? App.utils.escapeHtml(e.timezone) : ''}</div>
          </td>
          <td>
            <div style="font-weight:500;color:var(--text)">📍 ${App.utils.escapeHtml(locStr)}</div>
            ${e.language ? `<div style="font-size:11px;color:var(--text3)">Lang: ${App.utils.escapeHtml(e.language)}</div>` : ''}
          </td>
          <td>
            <code style="font-size:11.5px;background:var(--bg3);padding:2px 6px;border-radius:4px;color:var(--text)">${App.utils.escapeHtml(e.ip_address || '—')}</code>
          </td>
          <td>
            <span class="badge ${devBadgeCls}" style="font-size:11px">${devIcon} ${App.utils.escapeHtml(deviceType)}</span>
            ${e.screen_resolution ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${App.utils.escapeHtml(e.screen_resolution)}</div>` : ''}
          </td>
          <td>
            <div style="font-weight:500">${App.utils.escapeHtml(e.browser || '—')}</div>
            <div style="font-size:11px;color:var(--text3)">${App.utils.escapeHtml(e.os || '—')}</div>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">
        ${!events.length
          ? 'No login activity recorded yet. As customers log in, their locations, devices, browsers, and timestamps will appear here automatically.'
          : 'No login events match the current filter.'}
      </td></tr>`}</tbody>`;

    // Wire search and filters
    const searchInput = App.utils.qs('#visitsSearchInput', pane);
    if (searchInput) {
      searchInput.addEventListener('input', (ev) => {
        visitsSearch = ev.target.value;
        drawVisitsPanel(pane);
      });
    }

    App.utils.qsa('[data-visit-filter]', pane).forEach((chip) => {
      chip.addEventListener('click', () => {
        visitsFilter = chip.dataset.visitFilter;
        drawVisitsPanel(pane);
      });
    });

    const refreshBtn = App.utils.qs('#refreshVisitsBtn', pane);
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        try {
          await drawVisitsPanel(pane);
          App.utils.toast('Visits & Logins refreshed');
        } catch (e) {
          App.utils.toast('Could not refresh: ' + (e.message || e), 'err');
        }
      });
    }
  }

  async function renderAdminView() {
    // A non-admin session never renders the admin nav item or its pane div
    // at all (see app.js's currentNavStructure()) - but a stale bookmark or
    // a manually-typed #admin URL can still reach this function directly.
    // The real boundary is RLS/the Edge Function's own admin check either
    // way, so this is a UX nicety, not a security check - just bounce back
    // to the dashboard instead of erroring on a pane that doesn't exist in
    // this session's DOM.
    if (!App.state.profile || !App.state.profile.is_admin) {
      App.utils.toast('That section is only visible to admin accounts.', 'err');
      App.router.navigate('dashboard');
      return;
    }
    const pane = App.utils.qs('#pane-admin');

    pane.innerHTML = `
      <div class="section-title">Admin <div class="line"></div><small>manage users, sharing, and database health</small></div>
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div class="hint" style="margin:0">Reminders/status checks run automatically every 15 minutes. Force an immediate run instead of waiting:</div>
          <button class="btn btn-outline btn-sm" id="runAutomationBtn">Run Automation Now</button>
        </div>
      </div>
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div class="chart-title">Manage Users</div>
          <button class="btn btn-gold btn-sm" id="addUserBtn">+ Add User</button>
        </div>
        <div class="table-scroll"><table class="data" id="adminUsersTable"></table></div>
      </div>
      <div class="panel">
        <div class="chart-title" style="margin-bottom:4px">Support &amp; User Queries</div>
        <div class="hint" style="margin-bottom:10px">Every ticket, across every user - "My Requests" (Help &amp; Support) only ever shows a user's own.</div>
        <div id="ticketStatsCards" style="margin-bottom:12px"></div>
        <div class="chip-row" id="ticketAdminFilter" style="margin-bottom:10px">
          ${['All', 'Unassigned', 'Assigned to Me'].map((f) => `<div class="chip ${f === 'All' ? 'active' : ''}" data-ticket-admin-filter="${f}">${f}</div>`).join('')}
        </div>
        <div class="table-scroll"><table class="data" id="adminTicketsTable"></table></div>
      </div>
      <div class="panel">
        <div class="chart-title" style="margin-bottom:4px">Suggestions &amp; Ideas</div>
        <div class="hint" style="margin-bottom:10px">Every suggestion submitted through Help &amp; Support - the Roadmap tab there shows the same list to every user, sorted by votes.</div>
        <div id="suggestionStatsCards" style="margin-bottom:12px"></div>
        <div class="table-scroll"><table class="data" id="adminSuggestionsTable"></table></div>
      </div>
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="chart-title">Shared Portfolios</div>
          <select id="createSharedPortfolioOwner" class="search-input" style="width:auto"></select>
        </div>
        <div class="hint" style="margin-bottom:10px">Lets a specific other user (e.g. a spouse) see - never edit - one person's portfolio. Viewer access is read-only, wired through the same RLS every other read in this app uses.</div>
        <div class="table-scroll"><table class="data" id="sharedPortfoliosTable"></table></div>
      </div>
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title" style="margin-bottom:2px">Database Health &amp; Storage Maintenance</div>
            <div class="hint">Inspect records, download table CSVs, purge historical logs, or clear specific tables to keep your database clean and performant.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="purgeOldLogsBtn" title="Clean historical logs, events, and notifications">&#129529; Purge Old Logs</button>
            <button class="btn btn-outline btn-sm" id="exportAllDbBtn" title="Export entire portfolio data to Excel">&#128230; Full Export</button>
            <button class="btn btn-outline btn-sm" id="refreshDbHealthBtn">&#8635; Refresh Now</button>
          </div>
        </div>
        <div id="dbHealthKpis" style="margin-top:12px"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <input id="dbHealthSearchInput" type="text" class="search-input" placeholder="Search tables by name or category..." style="width:240px">
          <div class="chip-row" id="dbHealthCatFilters" style="margin-bottom:0">
            ${['All', 'With Data', 'Empty', 'Core & Deals', 'Expenses', 'CRM & Contacts', 'Chat & Calls', 'Support', 'Logs & Telemetry', 'System'].map((c) => `<div class="chip ${c === 'All' ? 'active' : ''}" data-db-cat-filter="${c}">${c}</div>`).join('')}
          </div>
        </div>
        <div class="table-scroll" style="max-height:460px;border:1px solid var(--border2);border-radius:8px"><table class="data" id="dbHealthTable"></table></div>
      </div>
      <div class="panel">
        <div class="chart-title" style="margin-bottom:4px">Visits &amp; Customer Logins</div>
        <div class="hint" style="margin-bottom:10px">Real-time visitor and login telemetry tracking customer location, device (Mobile / Desktop / Tablet), browser, operating system, IP address, and screen size.</div>
        <div id="visitsStats" style="margin-bottom:14px"></div>
        <div class="table-scroll" style="max-height:400px"><table class="data" id="visitsTable"></table></div>
      </div>
      <div class="panel">
        <div class="chart-title" style="margin-bottom:6px;color:var(--red,#e5484d)">Danger Zone</div>
        <div class="hint" style="margin-bottom:10px">Permanently deletes every deal, payment, recurring item, gold purchase, expense, contact, note, and document for <b>every user on this project</b>, not just yours. Community, Blog, Support Tickets, Chat, and Shared Portfolio memberships are untouched. No account is deleted - only data. There is no undo.</div>
        <button class="btn btn-outline" id="adminClearAllDataBtn" style="border-color:var(--red,#e5484d);color:var(--red,#e5484d)">Clear Entire Portfolio Data</button>
      </div>`;

    App.utils.qs('#adminClearAllDataBtn', pane).addEventListener('click', () => {
      App.ui.open({
        title: 'Clear Entire Portfolio Data',
        bodyHtml: `
          <div class="hint" style="color:var(--red,#e5484d);margin-bottom:10px">This permanently deletes every deal, payment, recurring item, gold purchase, expense, contact, note, and document for EVERY USER on this project. Community, Blog, Support Tickets, Chat, and Shared Portfolio memberships are untouched. No account is deleted - only data. There is no undo.</div>
          <div class="field span2"><label>Type DELETE ALL PORTFOLIO DATA to confirm</label><input id="confirmClearAllData" type="text"></div>
          <div class="auth-error" id="clearAllDataError"></div>`,
        actions: [
          { label: 'Clear Entire Portfolio Data', className: 'btn-outline', onClick: async () => {
            const typed = App.utils.qs('#confirmClearAllData').value.trim();
            if (typed !== 'DELETE ALL PORTFOLIO DATA') { App.utils.qs('#clearAllDataError').textContent = 'Phrase does not match - nothing was deleted.'; return; }
            try {
              await App.api.adminClearAllData();
              App.utils.toast('Every user\'s portfolio data has been cleared');
              App.ui.close();
              App.router.refreshCurrent();
            } catch (e) { App.utils.qs('#clearAllDataError').textContent = e.message || String(e); }
          } },
          { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        ],
      });
    });

    App.utils.qs('#runAutomationBtn', pane).addEventListener('click', async () => {
      try { await App.api.runAutomationNow(); App.utils.toast('Automation ran - status checks and reminders refreshed'); }
      catch (e) { App.utils.toast('Could not run automation: ' + (e.message || e), 'err'); }
    });
    App.utils.qs('#addUserBtn', pane).addEventListener('click', () => openAddUserModal(() => drawUsersPanel(pane)));

    // Each panel below is independent - one panel's query failing (e.g. a
    // permissions/RLS error on a table this admin build is newer than)
    // must never silently prevent every panel AFTER it from ever loading,
    // which is exactly what happened when the shared_portfolios RLS
    // recursion bug (see 029_fix_shared_portfolios_recursion.sql) threw
    // partway through this function and Database Health/Visits & Logins
    // below it never even ran.
    async function safely(label, fn) {
      try { await fn(); }
      catch (e) { App.utils.toast(`Could not load ${label}: ` + (e.message || e), 'err'); }
    }

    await safely('Manage Users', () => drawUsersPanel(pane));
    await safely('Support & User Queries', () => drawTicketsPanel(pane));
    await safely('Suggestions & Ideas', () => drawSuggestionsPanel(pane));

    const allUsers = await App.api.listAllProfiles();
    App.utils.qs('#createSharedPortfolioOwner', pane).innerHTML = `<option value="">+ Start sharing for...</option>${allUsers.map((u) => `<option value="${u.id}">${App.utils.escapeHtml(u.full_name || u.email)}</option>`).join('')}`;
    App.utils.qs('#createSharedPortfolioOwner', pane).addEventListener('change', async (e) => {
      const ownerId = e.target.value;
      if (!ownerId) return;
      try { await ensureSharedPortfolioForOwner(ownerId, allUsers); await drawSharedPortfoliosPanel(pane, allUsers); }
      catch (err) { App.utils.toast('Could not start sharing: ' + (err.message || err), 'err'); }
      e.target.value = '';
    });
    await safely('Shared Portfolios', () => drawSharedPortfoliosPanel(pane, allUsers));
    await safely('Database Health', () => drawDatabaseHealthPanel(pane));
    await safely('Visits & Logins', () => drawVisitsPanel(pane));
  }

  App.adminView = { openUserDetailModal };
  App.router.register('admin', renderAdminView);
})();
