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

  // ---- Database Health (025) ----
  async function drawDatabaseHealthPanel(pane) {
    const stats = await App.api.getAdminTableStats();
    App.utils.qs('#dbHealthTable', pane).innerHTML = `<thead><tr><th>Table</th><th>Rows</th><th>Size</th></tr></thead>
      <tbody>${stats.map((t) => `<tr ${t.estimated_rows === 0 ? 'style="color:var(--text3)"' : ''}>
        <td>${App.utils.escapeHtml(t.table_name)}</td>
        <td>${t.estimated_rows}${t.estimated_rows === 0 ? ' <span class="badge st-cancelled">empty</span>' : ''}</td>
        <td>${App.utils.escapeHtml(t.total_size_pretty)}</td>
      </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:20px">No stats available.</td></tr>'}</tbody>`;
    const btn = App.utils.qs('#refreshDbHealthBtn', pane);
    if (btn) btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Refreshing...';
      try { await drawDatabaseHealthPanel(pane); }
      catch (e) { App.utils.toast('Could not refresh: ' + (e.message || e), 'err'); }
      finally { if (App.utils.qs('#refreshDbHealthBtn', pane)) { App.utils.qs('#refreshDbHealthBtn', pane).disabled = false; App.utils.qs('#refreshDbHealthBtn', pane).innerHTML = '&#8635; Refresh Now'; } }
    };
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="chart-title">Database Health</div>
          <button class="btn btn-outline btn-sm" id="refreshDbHealthBtn">&#8635; Refresh Now</button>
        </div>
        <div class="hint" style="margin-bottom:10px">Row counts (estimated, not a full scan) and disk size per table - use this to decide what's worth archiving or clearing.</div>
        <div class="table-scroll" style="max-height:340px"><table class="data" id="dbHealthTable"></table></div>
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
