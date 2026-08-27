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
  async function openUserDetailModal(user, permissions = null) {
    if (App.sharedWithMeView && App.sharedWithMeView.openSharedWorkspaceModal) {
      const perms = permissions || {
        role: 'Full Access',
        view_net_worth: true,
        view_deals: true,
        view_amounts: true,
        view_returns: true,
        view_goals: true,
        view_documents: true,
        view_contacts: true
      };
      App.sharedWithMeView.openSharedWorkspaceModal(
        { id: user.id, name: `${user.full_name || user.email || 'User'}'s Portfolio` },
        user,
        perms
      );
      return;
    }

    const [deals, summary, docs, contacts] = await Promise.all([
      App.api.listDeals({ eq: { user_id: user.id } }).catch(() => []),
      App.api.getPortfolioSummary(user.id).catch(() => ({})),
      permissions && permissions.view_documents ? App.api.listDocuments({ eq: { user_id: user.id } }).catch(() => []) : Promise.resolve([]),
      permissions && permissions.view_contacts ? App.api.listContacts ? App.api.listContacts().catch(() => []) : Promise.resolve([]) : Promise.resolve([]),
    ]);
    const s = summary || {};
    const perms = permissions || {
      view_net_worth: true,
      view_deals: true,
      view_amounts: true,
      view_returns: true,
      view_goals: true,
      view_documents: true,
      view_contacts: true
    };

    const showAmount = (val) => (perms.view_amounts !== false ? App.utils.fmtMoney(val) : '••••••');
    const showRoi = (val) => (perms.view_returns !== false ? App.utils.fmtPct(val) : '••%');
    const showDealName = (name, i) => (perms.view_deals !== false ? App.utils.escapeHtml(name) : `Protected Asset ${i + 1}`);

    const hasDocs = perms.view_documents && docs && docs.length > 0;
    const hasContacts = perms.view_contacts && contacts && contacts.length > 0;

    const bodyHtml = `
      <div class="grid-2" style="margin-bottom:14px">
        <div>
          <div class="stat-line"><span>Total Invested</span><span class="v">${perms.view_net_worth !== false ? showAmount(s.total_invested) : 'Protected'}</span></div>
          <div class="stat-line"><span>Outstanding Principal</span><span class="v">${perms.view_net_worth !== false ? showAmount(s.current_outstanding_principal) : 'Protected'}</span></div>
          <div class="stat-line"><span>Interest Earned</span><span class="v">${perms.view_net_worth !== false ? showAmount(s.interest_earned) : 'Protected'}</span></div>
        </div>
        <div>
          <div class="stat-line"><span>Active Deals</span><span class="v">${s.active_deals_count ?? 0}</span></div>
          <div class="stat-line"><span>Closed Deals</span><span class="v">${s.closed_deals_count ?? 0}</span></div>
          <div class="stat-line"><span>Realized ROI</span><span class="v">${showRoi(s.realized_roi)}</span></div>
        </div>
      </div>
      <div class="table-scroll" style="max-height:300px;margin-bottom:10px">
        <table class="data"><thead><tr><th>Deal</th><th>Type</th><th>Invested</th><th>ROI</th><th>Status</th><th>Maturity</th></tr></thead>
        <tbody>${deals.map((d, idx) => `<tr>
          <td>${showDealName(d.deal_name, idx)}</td>
          <td>${App.utils.escapeHtml(d.investment_type)}</td>
          <td>${showAmount(d.invested_amount)}</td>
          <td>${showRoi(d.annual_roi)}</td>
          <td><span class="badge ${App.utils.statusBadgeClass(d.status)}">${d.status}</span></td>
          <td>${App.utils.fmtDate(d.maturity_date)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">No deals yet.</td></tr>'}</tbody></table>
      </div>
      ${hasDocs ? `
        <div style="margin-top:10px;padding:8px 12px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">&#128196; Attached Documents (${docs.length})</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${docs.map((dc) => `<div style="font-size:11.5px;color:var(--text2)">${App.utils.escapeHtml(dc.file_name || dc.title || 'Document')} &middot; <span style="color:var(--text3)">${App.utils.escapeHtml(dc.category || 'General')}</span></div>`).join('')}
          </div>
        </div>` : ''}
      <div class="hint" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
        <span>Read-only collaborator view &middot; Protected with granular access permissions</span>
        ${perms.role ? `<span class="badge" style="background:rgba(201,168,76,0.18);color:var(--gold)">Role: ${App.utils.escapeHtml(perms.role)}</span>` : ''}
      </div>`;

    App.ui.open({
      title: `${user.full_name || user.email} - Shared Portfolio`,
      bodyHtml,
      actions: [{ label: 'Close', className: 'btn-gold', onClick: App.ui.close }],
    });
  }

  // ---- Add User (Direct DB RPC + Edge Function + Backup Database Fallback) ----
  function openAddUserModal(onDone) {
    App.ui.open({
      title: 'Add User Profile',
      bodyHtml: `
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field span2"><label>Email Address *</label><input id="newUserEmail" type="email" placeholder="user@example.com"></div>
          <div class="field span2"><label>Full Name</label><input id="newUserName" type="text" placeholder="e.g. John Doe"></div>
          <div class="field"><label>Role / Access Level</label>
            <select id="newUserRole">
              <option value="user">Regular User</option>
              <option value="admin">Administrator</option>
              <option value="dev">Developer (Full Admin &amp; Dev Access)</option>
            </select>
          </div>
          <div class="field"><label>Storage Destination</label>
            <select id="newUserStorage">
              <option value="dual_sync">Dual-Synced (Primary + Backup Store)</option>
              <option value="backup_only">Backup Database Store (Instant)</option>
            </select>
          </div>
          <div class="field span2"><label>Password (leave blank to auto-generate secure temporary key)</label><input id="newUserPassword" type="text" placeholder="Min 6 chars or blank for random"></div>
        </div>
        <div class="hint">The profile will be created immediately with zero sign-up friction, backed up locally and synced to the cloud.</div>
        <div id="newUserResult"></div>
        <div class="auth-error" id="newUserError" style="margin-top:8px"></div>`,
      actions: [
        { label: 'Create Account', className: 'btn-gold', onClick: async () => {
          const email = App.utils.qs('#newUserEmail').value.trim();
          const fullName = App.utils.qs('#newUserName').value.trim();
          const password = App.utils.qs('#newUserPassword').value.trim();
          const roleVal = App.utils.qs('#newUserRole').value;
          const isDev = roleVal === 'dev';
          const isAdmin = roleVal === 'admin' || isDev;
          const targetStorage = App.utils.qs('#newUserStorage').value;

          if (!email) {
            App.utils.qs('#newUserError').textContent = 'Email address is required.';
            return;
          }

          const createBtn = App.utils.qs('.modal-footer .btn-gold');
          if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating...'; }

          try {
            const result = await App.api.adminCreateUser(email, fullName, password, isAdmin, isDev, targetStorage);
            App.utils.qs('#newUserError').textContent = '';
            App.utils.qs('#newUserResult').innerHTML = `
              <div class="panel" style="margin-top:12px;background:var(--fill-2);border:1px solid var(--border)">
                <div style="font-weight:600;color:var(--text);margin-bottom:6px">Account Created Successfully!</div>
                <div style="font-size:12.5px;color:var(--text2);margin-bottom:8px">Role: <b>${App.utils.escapeHtml(result.role || 'User')}</b> &middot; Storage: <span class="badge st-active">${result.source === 'backup_db' ? 'Backup Database Store' : 'Dual-Synced'}</span></div>
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
    const isDev = user.is_developer === true || user.role === 'Developer';
    const isAdmin = user.is_admin === true || isDev;
    const sourceLabel = user.source === 'backup_db' ? 'Backup Database Store' : (user.source === 'dual_synced' ? 'Dual-Synced Store' : 'Supabase Cloud');

    App.ui.open({
      title: `Edit Profile - ${user.full_name || user.email}`,
      bodyHtml: `
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text3)">Storage Layer:</span>
          <span class="badge ${user.source === 'backup_db' ? 'st-pending' : 'st-active'}">${sourceLabel}</span>
          <code style="font-size:11px;color:var(--text3)">ID: ${user.id}</code>
        </div>
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field"><label>Full Name</label><input id="editUserFullName" type="text" value="${App.utils.escapeHtml(user.full_name || '')}"></div>
          <div class="field"><label>Email Address</label><input id="editUserEmail" type="email" value="${App.utils.escapeHtml(user.email || '')}"></div>
          <div class="field"><label>Mobile / Phone</label><input id="editUserMobile" type="text" value="${App.utils.escapeHtml(user.mobile || '')}"></div>
          <div class="field"><label>Role / Access Level</label>
            <select id="editUserRole">
              <option value="user" ${!isAdmin && !isDev ? 'selected' : ''}>Regular User</option>
              <option value="admin" ${isAdmin && !isDev ? 'selected' : ''}>Administrator</option>
              <option value="dev" ${isDev ? 'selected' : ''}>Developer (Admin &amp; Dev Access)</option>
            </select>
          </div>
          <div class="field"><label>Account Status</label>
            <select id="editUserStatus">
              <option value="true" ${isActive ? 'selected' : ''}>Active (Can sign in &amp; use all features)</option>
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
          const roleVal = App.utils.qs('#editUserRole').value;
          const newIsDev = roleVal === 'dev';
          const newIsAdmin = roleVal === 'admin' || newIsDev;
          const newRole = newIsDev ? 'Developer' : (newIsAdmin ? 'Administrator' : 'User');
          const newActive = App.utils.qs('#editUserStatus').value === 'true';
          const newPassword = App.utils.qs('#editUserNewPassword').value.trim();

          const saveBtn = App.utils.qs('.modal-footer .btn-gold');
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

          try {
            await App.api.adminUpdateUser(user.id, {
              fullName: fullName || null,
              email: email || null,
              mobile: mobile || null,
              isAdmin: newIsAdmin,
              isDeveloper: newIsDev,
              role: newRole,
              isActive: newActive,
              newPassword: newPassword || null,
            });
            App.utils.toast('User profile updated successfully across all database stores');
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

  let usersSearch = '';
  let usersRoleFilter = 'All';

  async function drawUsersPanel(pane) {
    const [users, allDeals] = await Promise.all([App.api.listAllProfiles(), App.api.listDeals({ allUsers: true })]);
    const dealsByUser = {};
    allDeals.forEach((d) => { (dealsByUser[d.user_id] = dealsByUser[d.user_id] || []).push(d); });

    const q = usersSearch.trim().toLowerCase();
    const filtered = users.filter((u) => {
      const isDev = u.is_developer === true || u.role === 'Developer';
      const isAdmin = (u.is_admin === true || isDev) && !isDev;
      const isUser = !u.is_admin && !isDev;
      const isBackup = u.source === 'backup_db';

      if (usersRoleFilter === 'Developers' && !isDev) return false;
      if (usersRoleFilter === 'Administrators' && !isAdmin) return false;
      if (usersRoleFilter === 'Regular Users' && !isUser) return false;
      if (usersRoleFilter === 'Backup DB Store' && !isBackup) return false;

      if (q) {
        const hay = `${u.full_name || ''} ${u.email || ''} ${u.mobile || ''} ${u.role || ''} ${u.id || ''} ${u.source || ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });

    const devCount = users.filter((u) => u.is_developer === true || u.role === 'Developer').length;
    const adminCount = users.filter((u) => u.is_admin && !(u.is_developer === true || u.role === 'Developer')).length;
    const regularCount = users.filter((u) => !u.is_admin && !(u.is_developer === true || u.role === 'Developer')).length;
    const backupCount = users.filter((u) => u.source === 'backup_db').length;

    // Render Stats
    const statsContainer = App.utils.qs('#userStatsRow', pane);
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="grid-4" style="margin-bottom:12px">
          <div class="kpi c-purple"><div class="kpi-label">&#128187; Developers</div><div class="kpi-value">${devCount}</div></div>
          <div class="kpi c-gold"><div class="kpi-label">&#128081; Administrators</div><div class="kpi-value">${adminCount}</div></div>
          <div class="kpi c-blue"><div class="kpi-label">&#128100; Regular Users</div><div class="kpi-value">${regularCount}</div></div>
          <div class="kpi c-teal"><div class="kpi-label">&#128190; Total Profiles</div><div class="kpi-value">${users.length} <small style="font-size:11px;font-weight:400;color:var(--text3)">(${backupCount} Backup DB)</small></div></div>
        </div>`;
    }

    App.utils.qs('#adminUsersTable', pane).innerHTML = `<thead>
      <tr>
        <th>User Profile</th>
        <th>Email &amp; Mobile</th>
        <th>Role / Access</th>
        <th>Storage Source</th>
        <th>Active Deals</th>
        <th>Total Invested</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${filtered.map((u) => {
      const userDeals = dealsByUser[u.id] || [];
      const activeCount = userDeals.filter((d) => d.status === 'ACTIVE').length;
      const totalInvested = userDeals.reduce((a, d) => a + (d.invested_amount || 0), 0);
      const isActive = u.is_active !== false;
      const isSelf = App.state.profile && App.state.profile.id === u.id;
      const isDev = u.is_developer === true || u.role === 'Developer';
      const isAdmin = u.is_admin === true || isDev;

      let roleBadge = '<span class="badge" style="background:rgba(107,114,128,0.12);color:var(--text2)">User</span>';
      if (isDev) {
        roleBadge = '<span class="badge" style="background:rgba(147,51,234,0.15);color:#a855f7;border:1px solid rgba(147,51,234,0.3);font-weight:600">&#128187; Developer</span>';
      } else if (isAdmin) {
        roleBadge = '<span class="badge st-active" style="font-weight:600">&#128081; Admin</span>';
      }

      let sourceBadge = '<span class="badge" style="font-size:10.5px;background:rgba(13,148,136,0.12);color:#0d9488;border:1px solid rgba(13,148,136,0.25)">Dual-Synced</span>';
      if (u.source === 'backup_db') {
        sourceBadge = '<span class="badge" style="font-size:10.5px;background:rgba(234,179,8,0.15);color:#ca8a04;border:1px solid rgba(234,179,8,0.3)">Backup DB</span>';
      } else if (u.source === 'supabase') {
        sourceBadge = '<span class="badge" style="font-size:10.5px;background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25)">Cloud DB</span>';
      }

      return `<tr>
        <td>
          <div style="font-weight:600;color:var(--text)">${App.utils.escapeHtml(u.full_name || '—')}${isSelf ? ' <span style="font-size:11px;color:var(--text3);font-weight:400">(You)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--text3)">Joined ${App.utils.fmtDate(u.created_at)}</div>
        </td>
        <td>
          <div style="font-weight:500">${App.utils.escapeHtml(u.email || '—')}</div>
          ${u.mobile ? `<div style="font-size:11px;color:var(--text3)">&#128222; ${App.utils.escapeHtml(u.mobile)}</div>` : ''}
        </td>
        <td>${roleBadge}</td>
        <td>${sourceBadge}</td>
        <td><b style="color:var(--text)">${activeCount}</b> <small style="color:var(--text3)">deal${activeCount === 1 ? '' : 's'}</small></td>
        <td><b>${App.utils.fmtMoney(totalInvested)}</b></td>
        <td><span class="badge ${isActive ? 'st-active' : 'st-cancelled'}">${isActive ? 'Active' : 'Deactivated'}</span></td>
        <td style="white-space:nowrap">
          <div style="display:inline-flex;gap:4px;align-items:center">
            <button class="btn btn-sm btn-outline" data-view-user="${u.id}" title="View user portfolio">View</button>
            <button class="btn btn-sm btn-outline" data-edit-user="${u.id}" title="Edit profile, role, password">Edit</button>
            ${isSelf ? '' : `<button class="btn btn-sm btn-outline" data-toggle-active="${u.id}" data-active="${isActive}">${isActive ? 'Deactivate' : 'Reactivate'}</button>
            <button class="icon-btn del" data-delete-user="${u.id}" title="Delete account permanently">&#128465;</button>`}
          </div>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No profiles match the filter criteria.</td></tr>`}</tbody>`;

    App.utils.qsa('[data-view-user]', pane).forEach((b) => b.addEventListener('click', () => {
      const user = users.find((u) => u.id === b.dataset.viewUser);
      if (user) openUserDetailModal(user);
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
        App.utils.toast(wasActive ? 'User deactivated across all database stores' : 'User reactivated across all database stores');
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
                <td><button class="icon-btn del" data-remove-member="${m.id || ''}" data-member-user-id="${m.member_user_id || ''}" data-portfolio-id="${portfolio.id || ''}">&#128465;</button></td></tr>`;
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
            try {
              await App.api.removePortfolioMember(b.dataset.removeMember, {
                portfolio_id: b.dataset.portfolioId,
                member_user_id: b.dataset.memberUserId
              });
              await draw();
              if (onDone) onDone();
            } catch (e) { App.utils.toast('Could not remove member: ' + (e.message || e), 'err'); }
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

  let activeDbEngineTab = 'primary';
  let dbHealthSearch = '';
  let dbHealthCategory = 'All';
  let secondaryDbSearch = '';
  let secondaryDbFilter = 'All';
  let portfolioExplorerUser = 'CURRENT';
  let portfolioExplorerDataset = 'deals';
  let portfolioExplorerSearch = '';
  let cachedPortfolioData = null;
  let cachedIntegrityAudit = null;

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

  function exportDataAsJson(filename, data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
    App.utils.toast(`Downloaded ${filename}`);
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
      openClearTableModal(tableName, currentRows.length, async () => {
        await loadInspectData();
        const adminPane = App.utils.qs('#pane-admin');
        if (adminPane) drawDatabaseHealthPanel(adminPane);
      });
    });

    await loadInspectData();
  }

  // ---- SECONDARY DATABASE (IndexedDB & Browser Storage) MODALS & ACTIONS ----

  async function openSecondaryStoreDataModal(storeName, onRefresh) {
    App.ui.open({
      title: `Inspect Secondary Store: ${storeName}`,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:220px">
            <input id="inspectSecStoreSearch" type="text" class="search-input" placeholder="Search records by key or content..." style="width:100%">
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="inspectSecAddRecordBtn">&#43; Add Record</button>
            <button class="btn btn-outline btn-sm" id="inspectSecExportCsvBtn">&#128229; CSV</button>
            <button class="btn btn-outline btn-sm" id="inspectSecExportJsonBtn">&#128230; JSON</button>
            <button class="btn btn-outline btn-sm" id="inspectSecClearBtn" style="color:var(--red,#e5484d);border-color:var(--red,#e5484d)">&#128465; Clear Store</button>
            <button class="btn btn-outline btn-sm" id="inspectSecRefreshBtn">&#8635; Refresh</button>
          </div>
        </div>
        <div id="inspectSecStoreCount" style="font-size:12px;color:var(--text2);margin-bottom:8px">Loading records...</div>
        <div class="table-scroll" style="max-height:420px;border:1px solid var(--border2);border-radius:8px">
          <table class="data" id="inspectSecDataTable"></table>
        </div>`,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    let currentRows = [];
    async function loadSecondaryData() {
      try {
        App.utils.qs('#inspectSecStoreCount').textContent = 'Fetching store records from local storage...';
        currentRows = await App.api.getSecondaryDatabaseRows(storeName);
        renderSecondaryInspectTable(currentRows);
      } catch (e) {
        App.utils.qs('#inspectSecStoreCount').innerHTML = `<span style="color:var(--red,#e5484d)">Could not load store records: ${App.utils.escapeHtml(e.message || e)}</span>`;
      }
    }

    function renderSecondaryInspectTable(rows) {
      const q = (App.utils.qs('#inspectSecStoreSearch') ? App.utils.qs('#inspectSecStoreSearch').value : '').toLowerCase().trim();
      const filtered = q
        ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
        : rows;

      App.utils.qs('#inspectSecStoreCount').innerHTML = `Store <b>${App.utils.escapeHtml(storeName)}</b> contains <b>${filtered.length}</b> matching records (${rows.length} total)`;
      const table = App.utils.qs('#inspectSecDataTable');
      if (!table) return;

      if (!filtered.length) {
        table.innerHTML = `<tbody><tr><td style="text-align:center;padding:24px;color:var(--text3)">${rows.length === 0 ? 'No records in this secondary store (clean/empty).' : 'No records match your search filter.'}</td></tr></tbody>`;
        return;
      }

      const allKeys = Array.from(new Set(filtered.flatMap((r) => Object.keys(r))));
      const priorityKeys = ['id', 'key', 'email', 'name', 'username', 'role', 'timestamp', 'updated_at', 'created_at'].filter((k) => allKeys.includes(k));
      const remainingKeys = allKeys.filter((k) => !priorityKeys.includes(k));
      const displayKeys = priorityKeys.concat(remainingKeys).slice(0, 7);

      const thead = `<thead><tr>
        ${displayKeys.map((k) => `<th>${App.utils.escapeHtml(k)}</th>`).join('')}
        <th style="text-align:right">Actions</th>
      </tr></thead>`;

      const tbody = `<tbody>${filtered.map((row, idx) => {
        const rowKey = row.id !== undefined ? row.id : (row.key !== undefined ? row.key : idx);
        return `
        <tr data-row-idx="${idx}">
          ${displayKeys.map((k) => {
            const val = row[k];
            let formatted = '—';
            if (val !== null && val !== undefined) {
              if (typeof val === 'object') formatted = `<code style="font-size:11px;padding:2px 4px;background:var(--fill-1);border-radius:3px">${App.utils.escapeHtml(JSON.stringify(val).slice(0, 32))}${JSON.stringify(val).length > 32 ? '...' : ''}</code>`;
              else if (typeof val === 'boolean') formatted = val ? '<span class="badge st-active">true</span>' : '<span class="badge st-cancelled">false</span>';
              else if (String(val).length > 40) formatted = App.utils.escapeHtml(String(val).slice(0, 40)) + '...';
              else formatted = App.utils.escapeHtml(String(val));
            }
            return `<td>${formatted}</td>`;
          }).join('')}
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-outline btn-sm inspect-sec-row-json" data-row-idx="${idx}" style="padding:2px 6px;font-size:11px" title="View Full Record JSON">&#128065;</button>
            <button class="btn btn-outline btn-sm inspect-sec-row-del" data-row-key="${App.utils.escapeHtml(String(rowKey))}" data-row-idx="${idx}" style="padding:2px 6px;font-size:11px;color:var(--red,#e5484d);border-color:var(--red,#e5484d)" title="Delete This Entry">&#128465;</button>
          </td>
        </tr>`;
      }).join('')}</tbody>`;

      table.innerHTML = thead + tbody;

      App.utils.qsa('.inspect-sec-row-json', table).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rIdx = Number(btn.dataset.rowIdx);
          const r = filtered[rIdx];
          if (!r) return;
          openSecondaryRecordDetailModal(storeName, r, () => loadSecondaryData());
        });
      });

      App.utils.qsa('.inspect-sec-row-del', table).forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const keyToDelete = btn.dataset.rowKey;
          if (!confirm(`Delete record '${keyToDelete}' from store '${storeName}'?`)) return;
          try {
            await App.api.deleteSecondaryDatabaseRow(storeName, keyToDelete);
            App.utils.toast(`Record '${keyToDelete}' deleted from ${storeName}`);
            await loadSecondaryData();
            if (onRefresh) onRefresh();
          } catch (err) {
            App.utils.toast('Could not delete record: ' + (err.message || err), 'err');
          }
        });
      });
    }

    const searchInput = App.utils.qs('#inspectSecStoreSearch');
    if (searchInput) searchInput.addEventListener('input', () => renderSecondaryInspectTable(currentRows));

    const addBtn = App.utils.qs('#inspectSecAddRecordBtn');
    if (addBtn) addBtn.addEventListener('click', () => {
      openSecondaryStoreAddEditModal(storeName, null, async () => {
        await loadSecondaryData();
        if (onRefresh) onRefresh();
      });
    });

    const exportCsvBtn = App.utils.qs('#inspectSecExportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportTableRowsToCsv(storeName, currentRows));

    const exportJsonBtn = App.utils.qs('#inspectSecExportJsonBtn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => exportDataAsJson(`${storeName}_backup.json`, currentRows));

    const refreshBtn = App.utils.qs('#inspectSecRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadSecondaryData);

    const clearBtn = App.utils.qs('#inspectSecClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      openClearSecondaryStoreModal(storeName, currentRows.length, async () => {
        await loadSecondaryData();
        if (onRefresh) onRefresh();
      });
    });

    await loadSecondaryData();
  }

  function openSecondaryRecordDetailModal(storeName, record, onSaved) {
    App.ui.open({
      title: `Store Record: ${storeName} [${record.id || record.key || 'Item'}]`,
      bodyHtml: `
        <div style="margin-bottom:10px;font-size:12px;color:var(--text2)">
          Inspect or modify this record's raw attributes.
        </div>
        <textarea id="secRecordJsonEditor" style="width:100%;height:260px;font-family:monospace;font-size:12px;padding:10px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical">${App.utils.escapeHtml(JSON.stringify(record, null, 2))}</textarea>
        <div class="auth-error" id="secRecordEditError" style="margin-top:6px"></div>`,
      actions: [
        {
          label: 'Save Changes',
          className: 'btn-gold',
          onClick: async () => {
            try {
              const text = App.utils.qs('#secRecordJsonEditor').value;
              const parsed = JSON.parse(text);
              if (storeName.startsWith('localStorage:')) {
                const k = parsed.key || record.key;
                if (!k) throw new Error('Record must have a "key" attribute');
                localStorage.setItem(k, typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value));
              } else if (App.backupProfileDb && App.backupProfileDb.saveStoreRecord) {
                await App.backupProfileDb.saveStoreRecord(storeName, parsed);
              }
              App.utils.toast(`Record updated in ${storeName}`);
              App.ui.close();
              if (onSaved) onSaved();
            } catch (e) {
              App.utils.qs('#secRecordEditError').textContent = e.message || String(e);
            }
          },
        },
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  function openSecondaryStoreAddEditModal(storeName, initialRecord, onSaved) {
    const template = initialRecord || (storeName === 'profiles' ? {
      id: App.utils.uuid ? App.utils.uuid() : 'usr_' + Math.random().toString(36).slice(2, 9),
      email: 'user@example.com',
      name: 'Sample User',
      username: 'sample_user',
      role: 'investor',
      is_active: true,
      created_at: new Date().toISOString(),
    } : (storeName === 'sessions' ? {
      token: 'sess_' + Math.random().toString(36).slice(2, 10),
      userId: 'usr_admin',
      email: 'admin@investmentos.com',
      created_at: new Date().toISOString(),
    } : {
      key: 'custom_key_' + Math.random().toString(36).slice(2, 6),
      value: { note: 'Custom local data entry', updated_at: new Date().toISOString() },
    }));

    App.ui.open({
      title: `Add Record to: ${storeName}`,
      bodyHtml: `
        <div style="margin-bottom:10px;font-size:12px;color:var(--text2)">
          Enter JSON data for the new entry in <b>${App.utils.escapeHtml(storeName)}</b>:
        </div>
        <textarea id="secRecordAddEditor" style="width:100%;height:240px;font-family:monospace;font-size:12px;padding:10px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical">${App.utils.escapeHtml(JSON.stringify(template, null, 2))}</textarea>
        <div class="auth-error" id="secRecordAddError" style="margin-top:6px"></div>`,
      actions: [
        {
          label: 'Insert Record',
          className: 'btn-gold',
          onClick: async () => {
            try {
              const text = App.utils.qs('#secRecordAddEditor').value;
              const parsed = JSON.parse(text);
              if (storeName.startsWith('localStorage:')) {
                const k = parsed.key;
                if (!k) throw new Error('Record must include a "key" field');
                localStorage.setItem(k, typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value));
              } else if (App.backupProfileDb && App.backupProfileDb.saveStoreRecord) {
                await App.backupProfileDb.saveStoreRecord(storeName, parsed);
              }
              App.utils.toast(`New record inserted into ${storeName}`);
              App.ui.close();
              if (onSaved) onSaved();
            } catch (e) {
              App.utils.qs('#secRecordAddError').textContent = e.message || String(e);
            }
          },
        },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  function openClearSecondaryStoreModal(storeName, rowCount, onDone) {
    App.ui.open({
      title: `Clear Secondary Store: ${storeName}`,
      bodyHtml: `
        <div class="hint" style="color:var(--red,#e5484d);margin-bottom:12px">
          This will permanently purge all <b>${rowCount}</b> records in the local browser store <code>${App.utils.escapeHtml(storeName)}</code>.
        </div>
        <div class="field span2">
          <label>Type <b>CLEAR</b> to confirm</label>
          <input id="confirmClearSecStoreInput" type="text" placeholder="Type CLEAR" autocomplete="off">
        </div>
        <div class="auth-error" id="clearSecStoreError" style="margin-top:8px"></div>`,
      actions: [
        {
          label: 'Purge Local Store',
          className: 'btn-outline',
          onClick: async () => {
            const typed = (App.utils.qs('#confirmClearSecStoreInput') || {}).value || '';
            if (typed.trim() !== 'CLEAR') {
              App.utils.qs('#clearSecStoreError').textContent = 'Please type CLEAR in all caps to confirm.';
              return;
            }
            try {
              await App.api.clearSecondaryDatabaseStore(storeName);
              App.utils.toast(`Secondary store '${storeName}' was cleared.`);
              App.ui.close();
              if (onDone) onDone();
            } catch (e) {
              App.utils.qs('#clearSecStoreError').textContent = e.message || String(e);
            }
          },
        },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  function openPortfolioRecordModal(title, record) {
    App.ui.open({
      title: title || 'Record Details',
      bodyHtml: `
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
          <button class="btn btn-outline btn-sm" id="copyRecordJsonBtn">&#128203; Copy Raw JSON</button>
        </div>
        <pre style="max-height:400px;overflow:auto;background:var(--bg2);padding:12px;border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--text);white-space:pre-wrap;word-break:break-all">${App.utils.escapeHtml(JSON.stringify(record, null, 2))}</pre>`,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    const copyBtn = App.utils.qs('#copyRecordJsonBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(record, null, 2));
        App.utils.toast('Record JSON copied to clipboard');
      });
    }
  }

  // ---- PANEL RENDERERS: PRIMARY, SECONDARY, AND DEVELOPER PORTFOLIO ----

  async function drawPrimaryDbPanel(pane) {
    const stats = await App.api.getAdminTableStats();
    const tableContainer = App.utils.qs('#dbHealthTable', pane);
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
          <div class="kpi"><div class="kpi-label">PostgreSQL Tables</div><div class="kpi-value">${totalTables}</div><div class="kpi-desc">Schema: public</div></div>
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
          openClearTableModal(tName, rows, () => drawPrimaryDbPanel(pane));
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

    renderFilteredStats();
  }

  async function drawSecondaryDbPanel(pane) {
    const secOverview = await App.api.getSecondaryDatabaseStats();
    const stores = secOverview.stores || [];

    const totalStores = stores.length;
    const totalRecords = stores.reduce((acc, s) => acc + (s.record_count || 0), 0);
    const totalBytes = stores.reduce((acc, s) => acc + (s.estimated_bytes || 0), 0);
    const prettyBytes = totalBytes > 1048576 ? (totalBytes / 1048576).toFixed(2) + ' MB' : (totalBytes / 1024).toFixed(1) + ' kB';

    const kpiHost = App.utils.qs('#secondaryDbKpis', pane);
    if (kpiHost) {
      kpiHost.innerHTML = `
        <div class="grid-4" style="margin-bottom:12px">
          <div class="kpi"><div class="kpi-label">Storage Engines</div><div class="kpi-value">${secOverview.engine || 'IndexedDB + Web Storage'}</div><div class="kpi-desc">Database: ${App.utils.escapeHtml(secOverview.dbName || 'InvestmentOS_BackupDB')}</div></div>
          <div class="kpi"><div class="kpi-label">Active Stores</div><div class="kpi-value">${totalStores}</div><div class="kpi-desc">Object Stores &amp; Key-Value</div></div>
          <div class="kpi"><div class="kpi-label">Local Records</div><div class="kpi-value">${totalRecords.toLocaleString()}</div><div class="kpi-desc">Offline Profiles &amp; Cache</div></div>
          <div class="kpi"><div class="kpi-label">Memory Footprint</div><div class="kpi-value">${prettyBytes}</div><div class="kpi-desc">Status: <span style="color:var(--green,#22c55e);font-weight:600">Online &amp; Synced</span></div></div>
        </div>`;
    }

    function renderFilteredSecondary() {
      const q = (secondaryDbSearch || '').toLowerCase().trim();
      const filtered = stores.filter((s) => {
        if (secondaryDbFilter === 'IndexedDB' && s.type !== 'IndexedDB ObjectStore') return false;
        if (secondaryDbFilter === 'WebStorage' && !s.type.includes('LocalStorage')) return false;
        if (secondaryDbFilter === 'WithData' && (s.record_count || 0) === 0) return false;
        if (q && !s.store_name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
        return true;
      });

      const tableEl = App.utils.qs('#secondaryDbTable', pane);
      if (!tableEl) return;

      tableEl.innerHTML = `
        <thead>
          <tr>
            <th>Store / Table Name</th>
            <th>Storage Architecture</th>
            <th>Description &amp; Key Path</th>
            <th>Record Count</th>
            <th>Memory Size</th>
            <th>Status</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((s) => {
            const count = Number(s.record_count || 0);
            return `
              <tr ${count === 0 ? 'style="color:var(--text3)"' : ''}>
                <td>
                  <span style="font-weight:600;font-family:monospace;font-size:13px;color:var(--text)">${App.utils.escapeHtml(s.store_name)}</span>
                </td>
                <td>
                  <span class="badge" style="font-size:10px;background:var(--fill-2);border:1px solid var(--border2);color:var(--text2)">${App.utils.escapeHtml(s.type)}</span>
                </td>
                <td>
                  <div style="font-size:12px;color:var(--text)">${App.utils.escapeHtml(s.description)}</div>
                  <code style="font-size:10.5px;color:var(--text3)">key: ${App.utils.escapeHtml(s.key_path || 'key')}</code>
                </td>
                <td>
                  ${count === 0 ? '<span class="badge st-cancelled">0 (empty)</span>' : `<span style="font-weight:600;color:var(--text)">${count.toLocaleString()}</span>`}
                </td>
                <td>${App.utils.escapeHtml(s.estimated_size_pretty || '1 kB')}</td>
                <td>
                  <span class="badge ${s.status === 'Ready' || s.status === 'Configured' ? 'st-active' : 'st-pending'}">${App.utils.escapeHtml(s.status || 'Ready')}</span>
                </td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-outline btn-sm btn-inspect-sec-store" data-store="${App.utils.escapeHtml(s.store_name)}" style="padding:3px 8px;font-size:11.5px" title="Inspect Store Records">&#128065; View</button>
                  <button class="btn btn-outline btn-sm btn-add-sec-store-row" data-store="${App.utils.escapeHtml(s.store_name)}" style="padding:3px 8px;font-size:11.5px" title="Insert / Upsert Record">&#43; Add</button>
                  <button class="btn btn-outline btn-sm btn-export-sec-store" data-store="${App.utils.escapeHtml(s.store_name)}" style="padding:3px 8px;font-size:11.5px" title="Export CSV">&#128229; CSV</button>
                  <button class="btn btn-outline btn-sm btn-clear-sec-store" data-store="${App.utils.escapeHtml(s.store_name)}" data-count="${count}" style="padding:3px 8px;font-size:11.5px;color:var(--red,#e5484d);border-color:var(--red,#e5484d)" title="Purge Store">&#128465; Reset</button>
                </td>
              </tr>`;
          }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">No secondary stores match your search.</td></tr>'}
        </tbody>`;

      App.utils.qsa('.btn-inspect-sec-store', tableEl).forEach((btn) => {
        btn.addEventListener('click', () => openSecondaryStoreDataModal(btn.dataset.store, () => drawSecondaryDbPanel(pane)));
      });

      App.utils.qsa('.btn-add-sec-store-row', tableEl).forEach((btn) => {
        btn.addEventListener('click', () => openSecondaryStoreAddEditModal(btn.dataset.store, null, () => drawSecondaryDbPanel(pane)));
      });

      App.utils.qsa('.btn-export-sec-store', tableEl).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const sName = btn.dataset.store;
          btn.disabled = true;
          try {
            const rows = await App.api.getSecondaryDatabaseRows(sName);
            exportTableRowsToCsv(sName, rows);
          } catch (e) {
            App.utils.toast('Could not export: ' + (e.message || e), 'err');
          } finally {
            btn.disabled = false;
          }
        });
      });

      App.utils.qsa('.btn-clear-sec-store', tableEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          const sName = btn.dataset.store;
          const count = Number(btn.dataset.count || 0);
          openClearSecondaryStoreModal(sName, count, () => drawSecondaryDbPanel(pane));
        });
      });
    }

    const secSearch = App.utils.qs('#secondaryDbSearchInput', pane);
    if (secSearch) {
      secSearch.value = secondaryDbSearch;
      secSearch.oninput = (e) => {
        secondaryDbSearch = e.target.value;
        renderFilteredSecondary();
      };
    }

    App.utils.qsa('#secondaryDbFilterRow [data-sec-filter]', pane).forEach((chip) => {
      chip.onclick = () => {
        App.utils.qsa('#secondaryDbFilterRow [data-sec-filter]', pane).forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        secondaryDbFilter = chip.dataset.secFilter;
        renderFilteredSecondary();
      };
    });

    const reconcileBtn = App.utils.qs('#secDbSyncReconcileBtn', pane);
    if (reconcileBtn) {
      reconcileBtn.onclick = async () => {
        reconcileBtn.disabled = true;
        reconcileBtn.textContent = 'Reconciling...';
        try {
          const res = await App.api.adminReconcileProfiles();
          App.utils.toast(res.message || 'Secondary and Supabase profiles successfully reconciled.');
          await drawSecondaryDbPanel(pane);
        } catch (e) {
          App.utils.toast('Reconciliation failed: ' + (e.message || e), 'err');
        } finally {
          reconcileBtn.disabled = false;
          reconcileBtn.innerHTML = '&#8644; Reconcile with Supabase';
        }
      };
    }

    const exportAllSecBtn = App.utils.qs('#secDbExportAllBtn', pane);
    if (exportAllSecBtn) {
      exportAllSecBtn.onclick = async () => {
        try {
          const exportData = await App.api.exportSecondaryDatabase();
          exportDataAsJson('InvestmentOS_SecondaryDB_Backup.json', exportData);
        } catch (e) {
          App.utils.toast('Backup export failed: ' + (e.message || e), 'err');
        }
      };
    }

    const purgeCacheBtn = App.utils.qs('#secDbPurgeCacheBtn', pane);
    if (purgeCacheBtn) {
      purgeCacheBtn.onclick = async () => {
        if (!confirm('Purge offline cache stores (audit_cache, portfolio_cache)? Active accounts and profiles will be preserved.')) return;
        try {
          await App.api.clearSecondaryDatabaseStore('audit_cache');
          await App.api.clearSecondaryDatabaseStore('portfolio_cache');
          App.utils.toast('Offline cache purged successfully.');
          await drawSecondaryDbPanel(pane);
        } catch (e) {
          App.utils.toast('Could not purge cache: ' + (e.message || e), 'err');
        }
      };
    }

    renderFilteredSecondary();
  }

  // ---- DEVELOPER PORTFOLIO DEEP DATA EXPLORER ----

  async function drawDeveloperPortfolioExplorer(pane) {
    const userSelect = App.utils.qs('#portfolioExplorerUserSelect', pane);
    if (userSelect && userSelect.children.length <= 2) {
      try {
        const profiles = await App.api.listAllProfiles().catch(() => []);
        profiles.forEach((p) => {
          if (!p.id) return;
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `User: ${p.name || p.email || p.username || p.id} (${p.role || 'investor'})`;
          userSelect.appendChild(opt);
        });
      } catch (_) {}
    }

    const targetUserId = userSelect ? userSelect.value : portfolioExplorerUser;

    App.utils.qs('#portfolioDatasetCount', pane).textContent = 'Aggregating complete portfolio datasets across relational tables...';

    const [dataset, audit] = await Promise.all([
      App.api.getDeveloperPortfolioDataset({ targetUserId }).catch((e) => {
        console.error(e);
        return null;
      }),
      App.api.runPortfolioDataIntegrityAudit({ targetUserId }).catch(() => null),
    ]);

    cachedPortfolioData = dataset;
    cachedIntegrityAudit = audit;

    if (!dataset) {
      App.utils.qs('#portfolioDatasetCount', pane).innerHTML = `<span style="color:var(--red,#e5484d)">Failed to retrieve portfolio dataset.</span>`;
      return;
    }

    const s = dataset.summary || {};
    const kpiHost = App.utils.qs('#portfolioExplorerKpis', pane);
    if (kpiHost) {
      kpiHost.innerHTML = `
        <div class="grid-4" style="margin-bottom:12px">
          <div class="kpi">
            <div class="kpi-label">Active Capital Invested</div>
            <div class="kpi-value">${App.utils.formatCurrency(s.active_invested || 0)}</div>
            <div class="kpi-desc">${s.total_deals || 0} Total Deals &bull; ${s.active_deals || 0} Active</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Total Realized Returns</div>
            <div class="kpi-value">${App.utils.formatCurrency(s.total_payments_received || 0)}</div>
            <div class="kpi-desc">Interest: ${App.utils.formatCurrency(s.total_interest_received || 0)} &bull; ${s.total_reinvested ? 'Reinv: ' + App.utils.formatCurrency(s.total_reinvested) : '0 Reinv'}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Gold Holdings &amp; Spot Value</div>
            <div class="kpi-value">${App.utils.formatCurrency(s.gold_spot_value || 0)}</div>
            <div class="kpi-desc">${(s.gold_grams || 0).toFixed(2)} g &bull; Spot: ₹${Number(s.current_gold_price || 0).toLocaleString()}/g</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Calculated Net Worth</div>
            <div class="kpi-value">${App.utils.formatCurrency(s.net_worth || 0)}</div>
            <div class="kpi-desc">Liquid: ${App.utils.formatCurrency(s.liquid_cash || 0)} &bull; Debt: ${App.utils.formatCurrency(s.total_debt || 0)}</div>
          </div>
        </div>`;
    }

    function renderActiveDataset() {
      const q = (portfolioExplorerSearch || '').toLowerCase().trim();
      const countEl = App.utils.qs('#portfolioDatasetCount', pane);
      const tableEl = App.utils.qs('#portfolioExplorerTable', pane);
      if (!tableEl) return;

      if (portfolioExplorerDataset === 'diagnostics') {
        const rep = cachedIntegrityAudit || { integrity_score: 100, status: 'Pristine', anomalies: [] };
        const scoreColor = rep.integrity_score >= 90 ? 'var(--green,#22c55e)' : (rep.integrity_score >= 70 ? 'var(--amber,#f59e0b)' : 'var(--red,#e5484d)');
        
        countEl.innerHTML = `Integrity Health Score: <b style="color:${scoreColor}">${rep.integrity_score}/100</b> (${rep.status})`;

        tableEl.innerHTML = `
          <thead>
            <tr>
              <th>Diagnostic Rule</th>
              <th>Severity</th>
              <th>Affected Table &amp; Relational Scope</th>
              <th>Anomaly Description</th>
              <th>Recommendation &amp; Developer Action</th>
            </tr>
          </thead>
          <tbody>
            ${(rep.anomalies && rep.anomalies.length) ? rep.anomalies.map((a) => {
              const sevBadge = a.severity === 'error' ? '<span class="badge st-cancelled">Error</span>' : (a.severity === 'warning' ? '<span class="badge st-pending">Warning</span>' : '<span class="badge st-active">Info</span>');
              return `
                <tr>
                  <td><span style="font-weight:600;font-size:13px;color:var(--text)">${App.utils.escapeHtml(a.rule || 'Diagnostic Rule')}</span></td>
                  <td>${sevBadge}</td>
                  <td><code style="font-size:11px;color:var(--text2)">${App.utils.escapeHtml(a.table || 'portfolio')}</code></td>
                  <td style="font-size:12.5px;color:var(--text)">${App.utils.escapeHtml(a.description || '')}</td>
                  <td style="font-size:12px;color:var(--text2)">${App.utils.escapeHtml(a.recommendation || 'No action needed')}</td>
                </tr>`;
            }).join('') : `
              <tr>
                <td colspan="5" style="text-align:center;padding:32px;color:var(--green,#22c55e);font-size:14px">
                  &#10004; <b>All portfolio relationships and calculations are 100% healthy.</b><br>
                  <span style="font-size:12px;color:var(--text2)">No orphaned records, date anomalies, or arithmetic contradictions detected.</span>
                </td>
              </tr>`}
          </tbody>`;
        return;
      }

      // Map dataset tabs to records
      let records = [];
      let datasetName = 'Deals';
      if (portfolioExplorerDataset === 'deals') {
        datasetName = 'Deals & Investments';
        records = (dataset.deals || []).map((d) => ({
          id: d.id,
          title: d.title || d.name,
          platform: d.platform_name || d.platform || '—',
          invested: d.amount || d.invested_amount || 0,
          expected_return: d.expected_return || d.total_returns || 0,
          yield_rate: d.yield_rate || d.interest_rate || '—',
          status: d.status || 'active',
          start_date: d.start_date || d.investment_date || '—',
          mature_date: d.mature_date || d.maturity_date || '—',
          _raw: d,
        }));
      } else if (portfolioExplorerDataset === 'recurring') {
        datasetName = 'Recurring SIPs & Occurrences';
        records = (dataset.recurring_items || []).map((r) => ({
          id: r.id,
          name: r.name || r.title,
          frequency: r.frequency || 'monthly',
          amount: r.amount || 0,
          type: r.type || 'sip',
          status: r.status || (r.is_paused ? 'paused' : 'active'),
          next_date: r.next_occurrence_date || r.start_date || '—',
          occurrences_count: (dataset.recurring_occurrences || []).filter((o) => o.recurring_item_id === r.id).length,
          _raw: r,
        }));
      } else if (portfolioExplorerDataset === 'gold') {
        datasetName = 'Gold Holdings & Purchases';
        records = (dataset.gold_purchases || []).map((g) => ({
          id: g.id,
          provider: g.provider_name || g.provider || '—',
          grams: g.grams || g.weight_grams || 0,
          purchase_price_per_gram: g.buy_price_per_gram || g.rate_per_gram || 0,
          total_invested: g.total_amount || g.amount || 0,
          current_value: ((g.grams || 0) * (s.current_gold_price || 7200)),
          purchase_date: g.purchase_date || g.created_at || '—',
          _raw: g,
        }));
      } else if (portfolioExplorerDataset === 'accounts') {
        datasetName = 'Accounts & Liabilities';
        const accts = (dataset.accounts || []).map((a) => ({
          id: a.id,
          name: a.name || a.account_name,
          category: 'Asset / Bank',
          type: a.account_type || a.type || 'Savings',
          balance: a.balance || a.current_balance || 0,
          institution: a.institution || a.bank_name || '—',
          updated_at: a.updated_at || a.created_at || '—',
          _raw: a,
        }));
        const liabs = (dataset.liabilities || []).map((l) => ({
          id: l.id,
          name: l.name || l.title,
          category: 'Liability / Debt',
          type: l.liability_type || l.type || 'Loan',
          balance: -(l.outstanding_amount || l.amount || 0),
          institution: l.lender || l.bank || '—',
          updated_at: l.updated_at || l.created_at || '—',
          _raw: l,
        }));
        records = accts.concat(liabs);
      } else if (portfolioExplorerDataset === 'expenses') {
        datasetName = 'Expenses & Projects';
        records = (dataset.expense_transactions || []).map((e) => ({
          id: e.id,
          description: e.description || e.title || 'Expense',
          project: e.project_name || e.project_id || 'General',
          amount: e.amount || 0,
          category: e.category_name || e.category || 'General',
          vendor: e.vendor_name || '—',
          date: e.transaction_date || e.created_at || '—',
          _raw: e,
        }));
      } else if (portfolioExplorerDataset === 'tax_notes') {
        datasetName = 'Tax, Documents & Contacts';
        const taxes = (dataset.tax_records || []).map((t) => ({
          id: t.id,
          type: 'Tax Record',
          title: `FY ${t.financial_year || '2024-25'} (${t.assessment_year || ''})`,
          amount_or_size: t.tax_paid || t.total_tax || 0,
          status_or_meta: t.filing_status || 'Filed',
          created_at: t.created_at || '—',
          _raw: t,
        }));
        const docs = (dataset.documents || []).map((d) => ({
          id: d.id,
          type: 'Document',
          title: d.title || d.file_name || 'Doc',
          amount_or_size: d.file_size_bytes ? (d.file_size_bytes / 1024).toFixed(0) + ' kB' : 'File',
          status_or_meta: d.category || 'Attachment',
          created_at: d.created_at || '—',
          _raw: d,
        }));
        const notes = (dataset.notes || []).map((n) => ({
          id: n.id,
          type: 'Portfolio Note',
          title: (n.title || n.content || '').slice(0, 40),
          amount_or_size: '—',
          status_or_meta: n.category || 'General',
          created_at: n.created_at || '—',
          _raw: n,
        }));
        records = taxes.concat(docs).concat(notes);
      }

      const filtered = q
        ? records.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
        : records;

      countEl.innerHTML = `Showing <b>${filtered.length}</b> of <b>${records.length}</b> records in <b>${datasetName}</b>`;

      if (!filtered.length) {
        tableEl.innerHTML = `<tbody><tr><td style="text-align:center;padding:28px;color:var(--text3)">${records.length === 0 ? `No records found in ${datasetName} for this portfolio scope.` : 'No matching rows for search query.'}</td></tr></tbody>`;
        return;
      }

      const keys = Object.keys(filtered[0] || {}).filter((k) => k !== '_raw');
      const thead = `<thead><tr>
        ${keys.map((k) => `<th>${App.utils.escapeHtml(k.replace(/_/g, ' ').toUpperCase())}</th>`).join('')}
        <th style="text-align:right">Inspect</th>
      </tr></thead>`;

      const tbody = `<tbody>${filtered.map((row, idx) => `
        <tr>
          ${keys.map((k) => {
            const val = row[k];
            let formatted = '—';
            if (val !== null && val !== undefined) {
              if (k.includes('amount') || k.includes('invested') || k.includes('return') || k.includes('balance') || k.includes('value')) {
                if (typeof val === 'number') formatted = `<span style="font-weight:600;color:${val < 0 ? 'var(--red,#e5484d)' : 'var(--text)'}">${App.utils.formatCurrency(val)}</span>`;
                else formatted = App.utils.escapeHtml(String(val));
              } else if (k === 'status') {
                formatted = `<span class="badge ${val === 'active' || val === 'completed' ? 'st-active' : (val === 'paused' ? 'st-pending' : 'st-cancelled')}">${App.utils.escapeHtml(String(val))}</span>`;
              } else if (typeof val === 'object') {
                formatted = `<code style="font-size:11px">${App.utils.escapeHtml(JSON.stringify(val).slice(0, 30))}</code>`;
              } else {
                formatted = App.utils.escapeHtml(String(val));
              }
            }
            return `<td>${formatted}</td>`;
          }).join('')}
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-outline btn-sm inspect-portfolio-row-btn" data-row-idx="${idx}" style="padding:2px 8px;font-size:11px" title="Inspect Full Object Details">&#128065; Raw Data</button>
          </td>
        </tr>`).join('')}</tbody>`;

      tableEl.innerHTML = thead + tbody;

      App.utils.qsa('.inspect-portfolio-row-btn', tableEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          const rIdx = Number(btn.dataset.rowIdx);
          const r = filtered[rIdx];
          if (!r) return;
          openPortfolioRecordModal(`Portfolio Data: ${datasetName} #${r.id || rIdx + 1}`, r._raw || r);
        });
      });
    }

    const searchInput = App.utils.qs('#portfolioExplorerSearchInput', pane);
    if (searchInput) {
      searchInput.value = portfolioExplorerSearch;
      searchInput.oninput = (e) => {
        portfolioExplorerSearch = e.target.value;
        renderActiveDataset();
      };
    }

    App.utils.qsa('#portfolioDatasetTabs [data-dataset]', pane).forEach((chip) => {
      chip.onclick = () => {
        App.utils.qsa('#portfolioDatasetTabs [data-dataset]', pane).forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        portfolioExplorerDataset = chip.dataset.dataset;
        renderActiveDataset();
      };
    });

    const exportCsvBtn = App.utils.qs('#portfolioExportActiveCsvBtn', pane);
    if (exportCsvBtn) {
      exportCsvBtn.onclick = () => {
        if (!cachedPortfolioData) return;
        const activeArray = cachedPortfolioData[portfolioExplorerDataset] || cachedPortfolioData.deals || [];
        exportTableRowsToCsv(`Portfolio_${portfolioExplorerDataset}`, activeArray);
      };
    }

    const auditBtn = App.utils.qs('#portfolioRunIntegrityAuditBtn', pane);
    if (auditBtn) {
      auditBtn.onclick = async () => {
        App.utils.qsa('#portfolioDatasetTabs [data-dataset]', pane).forEach((c) => c.classList.remove('active'));
        const diagChip = App.utils.qs('#portfolioDatasetTabs [data-dataset="diagnostics"]', pane);
        if (diagChip) diagChip.classList.add('active');
        portfolioExplorerDataset = 'diagnostics';
        try {
          cachedIntegrityAudit = await App.api.runPortfolioDataIntegrityAudit({ targetUserId });
          App.utils.toast('Integrity audit refreshed');
        } catch (_) {}
        renderActiveDataset();
      };
    }

    renderActiveDataset();
  }

  // ---- MASTER DATABASE HEALTH PANEL (HANDLES SUBVIEWS & TAB SWITCHING) ----

  async function drawDatabaseHealthPanel(pane) {
    // Engine Tab Switching
    App.utils.qsa('#dbEngineSwitcherTabs [data-db-engine]', pane).forEach((tab) => {
      tab.onclick = async () => {
        App.utils.qsa('#dbEngineSwitcherTabs [data-db-engine]', pane).forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        activeDbEngineTab = tab.dataset.dbEngine;
        switchDbEngineView(pane);
      };
    });

    async function switchDbEngineView(hostPane) {
      const primaryView = App.utils.qs('#primaryDbSubView', hostPane);
      const secondaryView = App.utils.qs('#secondaryDbSubView', hostPane);
      const portfolioView = App.utils.qs('#portfolioExplorerSubView', hostPane);

      if (primaryView) primaryView.style.display = activeDbEngineTab === 'primary' ? 'block' : 'none';
      if (secondaryView) secondaryView.style.display = activeDbEngineTab === 'secondary' ? 'block' : 'none';
      if (portfolioView) portfolioView.style.display = activeDbEngineTab === 'portfolio_explorer' ? 'block' : 'none';

      if (activeDbEngineTab === 'primary') {
        await drawPrimaryDbPanel(hostPane);
      } else if (activeDbEngineTab === 'secondary') {
        await drawSecondaryDbPanel(hostPane);
      } else if (activeDbEngineTab === 'portfolio_explorer') {
        await drawDeveloperPortfolioExplorer(hostPane);
      }
    }

    const userSelect = App.utils.qs('#portfolioExplorerUserSelect', pane);
    if (userSelect) {
      userSelect.onchange = () => {
        portfolioExplorerUser = userSelect.value;
        drawDeveloperPortfolioExplorer(pane);
      };
    }

    const reloadPortBtn = App.utils.qs('#portfolioExplorerReloadBtn', pane);
    if (reloadPortBtn) {
      reloadPortBtn.onclick = () => drawDeveloperPortfolioExplorer(pane);
    }

    const refreshBtn = App.utils.qs('#refreshDbHealthBtn', pane);
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        try {
          await switchDbEngineView(pane);
          App.utils.toast('Database statistics and storage refreshed');
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
      purgeLogsBtn.onclick = () => openPurgeOldLogsModal(() => drawPrimaryDbPanel(pane));
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

    await switchDbEngineView(pane);
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

  // =========================================================================
  // AUDIT HISTORY & CHANGE LOGS PANEL
  // =========================================================================
  async function drawAdminAuditPanel(pane) {
    const statusEl = App.utils.qs('#adminAuditHistoryStatus', pane);
    const toggleBtn = App.utils.qs('#adminToggleAuditHistoryBtn', pane);
    const tableFilterEl = App.utils.qs('#adminAuditTableFilter', pane);
    const actionFilterEl = App.utils.qs('#adminAuditActionFilter', pane);
    const searchEl = App.utils.qs('#adminAuditSearch', pane);
    const tableEl = App.utils.qs('#adminAuditTable', pane);
    const refreshBtn = App.utils.qs('#adminAuditRefreshBtn', pane);

    if (!tableEl) return;

    async function drawToggle() {
      const appSettings = await App.api.getAppSettings();
      const enabled = !appSettings || appSettings.audit_history_enabled !== false;
      if (statusEl) {
        statusEl.innerHTML = enabled
          ? 'Logging Status: <span class="badge st-active" style="margin-left:4px">&#10003; Active / Enabled</span> &mdash; all mutations logged'
          : 'Logging Status: <span class="badge st-missed" style="margin-left:4px">&#9888; Paused / Disabled</span> &mdash; changes not being logged';
      }
      if (toggleBtn) {
        toggleBtn.textContent = enabled ? 'Disable Audit Logging' : 'Enable Audit Logging';
        toggleBtn.className = enabled ? 'btn btn-outline btn-sm' : 'btn btn-gold btn-sm';
        toggleBtn.onclick = async () => {
          try {
            await App.api.updateAppSettings({ audit_history_enabled: !enabled });
            App.utils.toast(enabled ? 'Audit History logging paused' : 'Audit History logging enabled');
            await drawToggle();
          } catch (err) {
            App.utils.toast('Could not update audit setting: ' + (err.message || err), 'err');
          }
        };
      }
    }

    async function drawLogs() {
      if (!tableEl) return;
      const tableFilter = tableFilterEl ? tableFilterEl.value : 'All';
      const actionFilter = actionFilterEl ? actionFilterEl.value : 'All';
      const search = (searchEl ? searchEl.value : '').toLowerCase().trim();
      const opts = {};
      if (tableFilter !== 'All') opts.eq = Object.assign({}, opts.eq, { table_name: tableFilter });
      if (actionFilter !== 'All') opts.eq = Object.assign({}, opts.eq, { action: actionFilter });

      let logs = [];
      try {
        logs = await App.api.listAuditLogs(opts);
      } catch (err) {
        console.warn('listAuditLogs error:', err);
      }

      if (search) {
        logs = logs.filter((l) =>
          (String(l.table_name || '') + ' ' + String(l.field_name || '') + ' ' + String(l.old_value || '') + ' ' + String(l.new_value || '') + ' ' + String(l.record_id || '')).toLowerCase().includes(search)
        );
      }

      tableEl.innerHTML = `
        <thead>
          <tr>
            <th>When</th>
            <th>Table</th>
            <th>Record</th>
            <th>Action</th>
            <th>Field</th>
            <th>Old Value</th>
            <th>New Value</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map((l) => `
            <tr>
              <td style="white-space:nowrap;font-size:11.5px">${App.utils.fmtDateTime(l.changed_at)}</td>
              <td><code>${App.utils.escapeHtml(l.table_name || '—')}</code></td>
              <td><span class="badge" style="font-size:10.5px">#${App.utils.escapeHtml(String(l.record_id || ''))}</span></td>
              <td><span class="badge ${l.action === 'INSERT' ? 'st-active' : l.action === 'DELETE' ? 'st-missed' : 'st-pending'}">${App.utils.escapeHtml(l.action)}</span></td>
              <td style="font-weight:600">${App.utils.escapeHtml(l.field_name || '—')}</td>
              <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;color:var(--text3)">${App.utils.escapeHtml((l.old_value || '').slice(0, 100))}</td>
              <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;color:var(--text)">${App.utils.escapeHtml((l.new_value || '').slice(0, 100))}</td>
              <td style="font-size:11px;color:var(--text3)">${App.utils.escapeHtml(l.source || 'app')}</td>
            </tr>
          `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No audit entries match the current filter.</td></tr>'}
        </tbody>
      `;
    }

    if (tableFilterEl) tableFilterEl.onchange = drawLogs;
    if (actionFilterEl) actionFilterEl.onchange = drawLogs;
    if (searchEl) searchEl.oninput = App.utils.debounce(drawLogs, 250);
    if (refreshBtn) refreshBtn.onclick = drawLogs;

    await Promise.all([drawToggle(), drawLogs()]);
  }

  // =========================================================================
  // AI MODEL PROVIDER PANEL
  // =========================================================================
  async function drawAdminAiProviders(pane) {
    const listEl = App.utils.qs('#adminAiProviderList', pane);
    if (!listEl) return;

    let settings = {};
    let providers = [];
    try {
      [settings, providers] = await Promise.all([App.api.getAiSettings(), App.api.listAiProviders()]);
    } catch (e) {
      console.warn('AI settings error:', e);
    }

    const activeKey = settings && settings.active_provider_key;
    listEl.innerHTML = (providers && providers.length) ? providers.map((p) => {
      const active = activeKey === p.key;
      const quota = p.requests_limit != null ? `~${p.requests_limit} req/day quota` : 'No fixed limit';
      const statusCls = p.last_status === 'ok' ? 'st-active' : p.last_status === 'error' ? 'st-overdue' : 'st-cancelled';
      return `<div class="stat-line" style="align-items:center;padding:8px 0;border-bottom:1px solid var(--border2)">
        <span style="display:flex;align-items:center;gap:6px">
          <input type="radio" name="adminAiActiveRadio" data-admin-ai-key="${p.key}" ${active ? 'checked' : ''} style="cursor:pointer">
          <strong style="color:var(--text)">${App.utils.escapeHtml(p.display_name)}</strong>
          <span style="color:var(--text3);font-weight:400;font-size:11.5px">(${App.utils.escapeHtml(p.model_id)})</span>
          ${active ? '<span class="badge st-active" style="font-size:10px">&#9733; Active</span>' : ''}
        </span>
        <span class="v" style="font-weight:400;font-size:11.5px;display:flex;align-items:center;gap:6px">
          <span class="badge ${statusCls}">${p.last_status || 'standby'}</span>
          <span style="color:var(--text3)">${quota}</span>
          ${p.last_used_at ? '<span style="color:var(--text3)">&bull; used ' + App.utils.fmtDateTime(p.last_used_at) + '</span>' : ''}
          <button class="btn btn-outline btn-xs" data-admin-edit-ai="${p.key}" style="font-size:11px;padding:2px 8px;margin-left:4px">&#9998; Edit</button>
          ${p.kind === 'custom' ? `<button class="btn btn-outline btn-xs del" data-admin-del-ai="${p.key}" data-name="${App.utils.escapeHtml(p.display_name)}" style="font-size:11px;padding:2px 6px;color:var(--red);border-color:var(--red)" title="Remove">&#128465;</button>` : ''}
        </span>
      </div>`;
    }).join('') : '<div class="hint" style="padding:16px 0">No AI providers configured.</div>';

    App.utils.qsa('[data-admin-ai-key]', pane).forEach((r) => {
      r.addEventListener('change', async () => {
        try {
          await App.api.updateAiSettings({ active_provider_key: r.dataset.adminAiKey });
          App.utils.toast('Active AI Copilot provider updated');
          await drawAdminAiProviders(pane);
        } catch (e) {
          App.utils.toast('Could not update active AI provider: ' + (e.message || e), 'err');
          drawAdminAiProviders(pane);
        }
      });
    });

    App.utils.qsa('[data-admin-edit-ai]', pane).forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.adminEditAi;
        const provider = providers.find((p) => p.key === key);
        if (provider) openAdminEditAiModal(provider, activeKey, () => drawAdminAiProviders(pane));
      });
    });

    App.utils.qsa('[data-admin-del-ai]', pane).forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.adminDelAi;
        const name = b.dataset.name || key;
        confirmAdminDeleteAi(key, name, () => drawAdminAiProviders(pane));
      });
    });

    const addBtn = App.utils.qs('#adminAddCustomAiBtn', pane);
    if (addBtn) addBtn.onclick = () => openAdminCustomAiModal(() => drawAdminAiProviders(pane));
  }

  function openAdminEditAiModal(p, activeKey, onDone) {
    const isCustom = p.kind === 'custom';
    const isGemini = p.kind === 'google_gemini';
    const isAnthropic = p.kind === 'anthropic';

    let presets = [];
    if (isGemini) {
      presets = [
        { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Recommended)' },
        { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (Deep Reasoning)' },
        { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
        { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
      ];
    } else if (isAnthropic) {
      presets = [
        { id: 'claude-3-7-sonnet-20250219', label: 'claude-3-7-sonnet-20250219 (Latest)' },
        { id: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet' },
        { id: 'claude-3-5-haiku-20241022', label: 'claude-3-5-haiku' },
      ];
    } else {
      presets = [
        { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
        { id: 'deepseek-chat', label: 'deepseek-chat' },
        { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      ];
    }

    const customCfg = p.custom_config || {};
    const isActive = activeKey === p.key;

    const bodyHtml = `
      <div style="background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:600;font-size:13.5px;color:var(--text)">${App.utils.escapeHtml(p.display_name)}</div>
          <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Key: <code>${App.utils.escapeHtml(p.key)}</code> &middot; Kind: <span class="badge st-active" style="font-size:10px">${App.utils.escapeHtml(p.kind)}</span></div>
        </div>
        ${isActive ? '<span class="badge st-active">&#9733; Current Active Provider</span>' : ''}
      </div>

      <div class="form-grid">
        <div class="field span2">
          <label>Provider Display Name <span class="req">*</span></label>
          <input type="text" id="adminEditAiDisplayName" value="${App.utils.escapeHtml(p.display_name || '')}" required>
        </div>

        <div class="field span2">
          <label>Model ID <span class="req">*</span></label>
          <input type="text" id="adminEditAiModelId" value="${App.utils.escapeHtml(p.model_id || '')}" required>
          <div style="margin-top:8px">
            <div style="font-size:11.5px;color:var(--text2);margin-bottom:6px;font-weight:500">Quick Presets:</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${presets.map((pr) => `
                <button type="button" class="btn btn-outline btn-xs admin-preset-btn ${p.model_id === pr.id ? 'btn-gold' : ''}" data-model="${App.utils.escapeHtml(pr.id)}" style="font-size:11px;padding:3px 8px;cursor:pointer">
                  ${App.utils.escapeHtml(pr.label)}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        ${isCustom ? `
          <div class="field span2">
            <label>API Base URL <span class="req">*</span></label>
            <input type="text" id="adminEditAiBaseUrl" value="${App.utils.escapeHtml(customCfg.base_url || '')}" placeholder="https://api.groq.com/openai/v1">
          </div>
          <div class="field span2">
            <label>Supabase Secret Name (must start with COPILOT_CUSTOM_)</label>
            <input type="text" id="adminEditAiSecretName" value="${App.utils.escapeHtml(customCfg.auth_secret_name || '')}" placeholder="COPILOT_CUSTOM_GROQ_API_KEY">
          </div>
        ` : ''}

        <div class="field">
          <label>Daily Request Quota (Reference)</label>
          <input type="number" id="adminEditAiLimit" value="${p.requests_limit != null ? p.requests_limit : ''}">
        </div>

        <div class="field" style="display:flex;flex-direction:column;justify-content:center">
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px">
            <input type="checkbox" id="adminEditAiSetActive" ${isActive ? 'checked' : ''}>
            <span style="font-weight:500">Set as active AI provider</span>
          </label>
        </div>
      </div>
    `;

    App.ui.open({
      title: `Edit AI Provider — ${p.display_name}`,
      bodyHtml,
      onMount: (modalBody) => {
        const input = App.utils.qs('#adminEditAiModelId', modalBody);
        App.utils.qsa('.admin-preset-btn', modalBody).forEach((btn) => {
          btn.onclick = () => {
            if (input) input.value = btn.dataset.model;
            App.utils.qsa('.admin-preset-btn', modalBody).forEach((b) => b.classList.remove('btn-gold'));
            btn.classList.add('btn-gold');
          };
        });
      },
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save Changes',
          className: 'btn-gold',
          onClick: async () => {
            const displayName = (App.utils.qs('#adminEditAiDisplayName')?.value || '').trim();
            const modelId = (App.utils.qs('#adminEditAiModelId')?.value || '').trim();
            const limitVal = App.utils.qs('#adminEditAiLimit')?.value;
            const requestsLimit = limitVal !== '' && limitVal != null ? parseInt(limitVal, 10) : null;
            const setActive = App.utils.qs('#adminEditAiSetActive')?.checked;

            if (!displayName || !modelId) {
              App.utils.toast('Provider Name and Model ID are required', 'err');
              return;
            }

            const patch = {
              display_name: displayName,
              model_id: modelId,
              requests_limit: isNaN(requestsLimit) ? null : requestsLimit,
            };

            if (isCustom) {
              const baseUrl = (App.utils.qs('#adminEditAiBaseUrl')?.value || '').trim();
              const secretName = (App.utils.qs('#adminEditAiSecretName')?.value || '').trim();
              if (!baseUrl) {
                App.utils.toast('API Base URL is required', 'err');
                return;
              }
              if (secretName && !secretName.startsWith('COPILOT_CUSTOM_')) {
                App.utils.toast('Secret name must start with COPILOT_CUSTOM_', 'err');
                return;
              }
              patch.custom_config = { base_url: baseUrl, auth_secret_name: secretName || null };
            }

            try {
              await App.api.updateAiProvider(p.key, patch);
              if (setActive) await App.api.updateAiSettings({ active_provider_key: p.key });
              App.ui.close();
              App.utils.toast(`AI Provider "${displayName}" updated`);
              if (onDone) onDone();
            } catch (e) {
              App.utils.toast('Could not save AI provider: ' + (e.message || e), 'err');
            }
          },
        },
      ],
    });
  }

  function confirmAdminDeleteAi(providerKey, displayName, onDone) {
    App.ui.open({
      small: true,
      title: 'Remove AI Provider',
      bodyHtml: `<div style="line-height:1.5;color:var(--text2)">Are you sure you want to remove custom AI provider <b>${App.utils.escapeHtml(displayName)}</b>?</div>`,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Remove Provider',
          className: 'btn-outline',
          onClick: async () => {
            try {
              await App.api.deleteAiProvider(providerKey);
              App.ui.close();
              App.utils.toast('Custom AI provider removed');
              if (onDone) onDone();
            } catch (e) {
              App.utils.toast('Could not remove: ' + (e.message || e), 'err');
            }
          },
        },
      ],
    });
  }

  function openAdminCustomAiModal(onDone) {
    const fields = [
      { key: 'display_name', label: 'Provider Name', required: true },
      { key: 'model_id', label: 'Model ID (e.g. llama-3.3-70b-versatile)', required: true },
      { key: 'base_url', label: 'API Base URL (no trailing /chat/completions)', required: true, span: 2, placeholder: 'https://api.groq.com/openai/v1' },
      { key: 'auth_secret_name', label: 'Supabase Secret Name (must start with COPILOT_CUSTOM_)', span: 2 },
    ];
    App.ui.open({
      title: 'Add Custom AI Provider',
      bodyHtml: `<div class="hint" style="margin-bottom:10px">Supports any OpenAI-compatible completions API (Groq, OpenRouter, Together, Ollama, etc.). Set the secret via the Supabase CLI (<code>supabase secrets set COPILOT_CUSTOM_...</code>).</div>${App.ui.renderForm(fields, {})}`,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save Provider',
          className: 'btn-gold',
          onClick: async () => {
            const { values, errors } = App.ui.readForm(fields);
            if (errors.length) { App.utils.toast('Fill in all required fields', 'err'); return; }
            if (values.auth_secret_name && !values.auth_secret_name.startsWith('COPILOT_CUSTOM_')) {
              App.utils.toast('Secret name must start with COPILOT_CUSTOM_', 'err');
              return;
            }
            const key = 'custom_' + values.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            try {
              await App.api.createAiProvider({
                key, kind: 'custom', display_name: values.display_name, model_id: values.model_id,
                custom_config: { base_url: values.base_url, auth_secret_name: values.auth_secret_name },
              });
              App.ui.close();
              App.utils.toast('Custom AI provider added');
              if (onDone) onDone();
            } catch (e) { App.utils.toast('Could not save provider: ' + (e.message || e), 'err'); }
          },
        },
      ],
    });
  }

  // =========================================================================
  // GOLD PRICE PROVIDER PANEL
  // =========================================================================
  async function drawAdminGoldProviders(pane) {
    const listEl = App.utils.qs('#adminGoldProviderList', pane);
    const refreshBtn = App.utils.qs('#adminGoldRefreshNowBtn', pane);
    const addBtn = App.utils.qs('#adminAddCustomGoldBtn', pane);
    if (!listEl) return;

    let settings = {};
    let providers = [];
    try {
      [settings, providers] = await Promise.all([App.api.getGoldSettings(), App.api.listGoldProviders()]);
    } catch (e) {
      console.warn('Gold provider fetch error:', e);
    }

    const activeKey = settings && settings.active_provider_key;
    listEl.innerHTML = (providers && providers.length) ? providers.map((p) => {
      const active = activeKey === p.key;
      const quota = p.requests_limit != null ? `${p.requests_used_this_period} / ${p.requests_limit} reqs` : 'No fixed limit';
      const statusCls = p.last_fetch_status === 'ok' ? 'st-active' : p.last_fetch_status === 'error' ? 'st-overdue' : 'st-cancelled';
      return `<div class="stat-line" style="align-items:center;padding:8px 0;border-bottom:1px solid var(--border2)">
        <span style="display:flex;align-items:center;gap:6px">
          <input type="radio" name="adminGoldActiveRadio" data-admin-gold-key="${p.key}" ${active ? 'checked' : ''} style="cursor:pointer">
          <strong style="color:var(--text)">${App.utils.escapeHtml(p.display_name)}</strong>
          ${active ? '<span class="badge st-active" style="font-size:10px">&#9733; Active Provider</span>' : ''}
        </span>
        <span class="v" style="font-weight:400;font-size:11.5px;display:flex;align-items:center;gap:6px">
          <span class="badge ${statusCls}">${p.last_fetch_status || 'standby'}</span>
          <span style="color:var(--text3)">&bull; ${quota}</span>
          ${p.last_fetch_at ? '<span style="color:var(--text3)">&bull; ' + App.utils.fmtDateTime(p.last_fetch_at) + '</span>' : ''}
          ${p.kind === 'custom' ? `<button class="btn btn-outline btn-xs del" data-admin-del-gold="${p.key}" style="font-size:11px;padding:2px 6px;color:var(--red);border-color:var(--red)" title="Remove">&#128465;</button>` : ''}
        </span>
      </div>`;
    }).join('') : '<div class="hint" style="padding:16px 0">No gold providers found.</div>';

    App.utils.qsa('[data-admin-gold-key]', pane).forEach((r) => {
      r.addEventListener('change', async () => {
        try {
          await App.api.updateGoldSettings({ active_provider_key: r.dataset.adminGoldKey });
          App.utils.toast('Active gold price provider updated');
          await drawAdminGoldProviders(pane);
        } catch (e) {
          App.utils.toast('Could not update active provider: ' + (e.message || e), 'err');
          drawAdminGoldProviders(pane);
        }
      });
    });

    App.utils.qsa('[data-admin-del-gold]', pane).forEach((b) => {
      b.addEventListener('click', () => {
        const providerKey = b.dataset.adminDelGold;
        App.ui.open({
          small: true,
          title: 'Remove Gold Provider',
          bodyHtml: `<div style="line-height:1.5;color:var(--text2)">Are you sure you want to remove custom gold provider <code>${App.utils.escapeHtml(providerKey)}</code>?</div>`,
          actions: [
            { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
            {
              label: 'Remove',
              className: 'btn-outline',
              onClick: async () => {
                try {
                  await App.api.deleteGoldProvider(providerKey);
                  App.ui.close();
                  App.utils.toast('Custom gold provider removed');
                  drawAdminGoldProviders(pane);
                } catch (e) {
                  App.utils.toast('Could not remove: ' + (e.message || e), 'err');
                }
              },
            },
          ],
        });
      });
    });

    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Fetching...';
        try {
          await App.api.refreshGoldPrice();
          App.utils.toast('Gold prices refreshed successfully');
          await drawAdminGoldProviders(pane);
        } catch (err) {
          App.utils.toast('Could not refresh gold prices: ' + (err.message || err), 'err');
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = '⟳ Refresh Spot Price';
        }
      };
    }

    if (addBtn) {
      addBtn.onclick = () => {
        const fields = [
          { key: 'display_name', label: 'Provider Name', required: true },
          { key: 'base_url', label: 'API Base URL (full endpoint)', required: true, span: 2 },
          { key: 'auth_style', label: 'Auth Style', type: 'select', options: ['header', 'query_param', 'bearer', 'none'], required: true },
          { key: 'auth_key_name', label: 'Header/Param Name (e.g. x-access-token, apikey)' },
          { key: 'auth_secret_name', label: 'Secret Name (must start with GOLD_CUSTOM_)' },
          { key: 'spot_path', label: 'Spot Price JSON Path (e.g. rates.INR)', required: true },
          { key: 'spot_unit', label: 'Spot Unit', type: 'select', options: [{ value: 'troy_oz', label: 'Troy Ounce' }, { value: 'gram', label: 'Gram' }], required: true },
          { key: 'currency', label: 'Currency', placeholder: 'INR' },
        ];
        App.ui.open({
          title: 'Add Custom Gold Price Provider',
          bodyHtml: `<div class="hint" style="margin-bottom:10px">Configure a custom endpoint for gold rates. Secrets should start with <code>GOLD_CUSTOM_</code>.</div>${App.ui.renderForm(fields, { auth_style: 'header', spot_unit: 'troy_oz', currency: 'INR' })}`,
          actions: [
            { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
            {
              label: 'Save Provider',
              className: 'btn-gold',
              onClick: async () => {
                const { values, errors } = App.ui.readForm(fields);
                if (errors.length) { App.utils.toast('Fill in all required fields', 'err'); return; }
                if (values.auth_secret_name && !values.auth_secret_name.startsWith('GOLD_CUSTOM_')) {
                  App.utils.toast('Secret name must start with GOLD_CUSTOM_', 'err'); return;
                }
                const key = 'custom_' + values.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                try {
                  await App.api.createGoldProvider({
                    key, kind: 'custom', display_name: values.display_name,
                    custom_config: { base_url: values.base_url, auth_style: values.auth_style, auth_key_name: values.auth_key_name, auth_secret_name: values.auth_secret_name, spot_path: values.spot_path, spot_unit: values.spot_unit, currency: values.currency || 'INR' },
                  });
                  App.ui.close();
                  App.utils.toast('Custom gold provider added');
                  drawAdminGoldProviders(pane);
                } catch (e) { App.utils.toast('Could not save: ' + (e.message || e), 'err'); }
              },
            },
          ],
        });
      };
    }
  }

  // =========================================================================
  // SUPABASE CONNECTION & BENCHMARK RATE PANEL
  // =========================================================================
  async function drawAdminSupabasePanel(pane) {
    const cfg = App.auth.getConfig();
    const currentUrlInput = App.utils.qs('#adminCurrentSupabaseUrl', pane);
    const resetBtn = App.utils.qs('#adminResetConnectionBtn', pane);
    const saveBtn = App.utils.qs('#adminSaveConnectionBtn', pane);
    const rateInput = App.utils.qs('#adminFdReferenceRateInput', pane);
    const saveRateBtn = App.utils.qs('#adminSaveFdRateBtn', pane);

    if (currentUrlInput) currentUrlInput.value = (cfg && cfg.url) || '';
    if (resetBtn) resetBtn.style.display = App.auth.hasCustomConfig() ? 'inline-flex' : 'none';

    if (saveBtn) {
      saveBtn.onclick = () => {
        const url = (App.utils.qs('#adminNewSupabaseUrl', pane)?.value || '').trim().replace(/\/$/, '');
        const key = (App.utils.qs('#adminNewSupabaseKey', pane)?.value || '').trim();
        const errEl = App.utils.qs('#adminConnectionError', pane);

        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) {
          if (errEl) errEl.textContent = 'Enter a valid Supabase Project URL (https://*.supabase.co) and anon/publishable key.';
          return;
        }
        if (errEl) errEl.textContent = '';
        if (!confirm('This reconnects THIS BROWSER to the specified Supabase project and signs out of current session. Continue?')) return;
        App.auth.saveConfig(url, key);
        location.reload();
      };
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        if (!confirm("Reset this browser back to the app's default built-in Supabase project?")) return;
        App.auth.clearConfig();
        location.reload();
      };
    }

    // Benchmark Reference Rate
    try {
      const appSettings = await App.api.getAppSettings();
      if (rateInput) rateInput.value = (appSettings && appSettings.fd_reference_rate != null) ? appSettings.fd_reference_rate : 7.0;
    } catch (e) {
      console.warn('getAppSettings error:', e);
    }

    if (saveRateBtn && rateInput) {
      saveRateBtn.onclick = async () => {
        const rate = App.utils.parseNum(rateInput.value);
        try {
          await App.api.updateAppSettings({ fd_reference_rate: rate });
          App.utils.toast('Benchmark reference rate saved');
        } catch (err) {
          App.utils.toast('Could not update rate: ' + (err.message || err), 'err');
        }
      };
    }
  }

  async function renderAdminView() {
    const pane = App.utils.qs('#pane-admin');
    const isDemo = App.auth && App.auth.isDemoMode && App.auth.isDemoMode();

    // -------------------------------------------------------------------------
    // 1. DEMO MODE LOCKOUT
    // -------------------------------------------------------------------------
    if (isDemo) {
      pane.innerHTML = `
        <div class="section-title">Admin &amp; Developer Portal <div class="line"></div><small>access locked in demo mode</small></div>
        <div class="panel" style="text-align:center;padding:52px 24px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.25);margin-top:12px">
          <div style="font-size:52px;margin-bottom:14px;line-height:1">&#128274;</div>
          <div class="chart-title" style="font-size:22px;margin-bottom:10px;color:var(--text)">Admin &amp; Developer Portal is Deactivated in Demo Mode</div>
          <div class="hint" style="max-width:580px;margin:0 auto 28px;font-size:13.5px;line-height:1.6;color:var(--text2)">
            This portal controls privileged infrastructure &mdash; including User Account Management across Primary &amp; Backup databases, Supabase Connection keys, AI Model Providers, Gold Intelligence APIs, System Audit History, and Database Maintenance. Access is strictly disabled in public demo mode to maintain system security.
          </div>
          <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">
            <a href="#dashboard" class="btn btn-gold btn-sm">&larr; Return to Dashboard</a>
            <button class="btn btn-outline btn-sm" id="adminDemoSignInBtn">&#128081; Sign In with Admin Account</button>
          </div>
        </div>
      `;

      App.utils.qs('#adminDemoSignInBtn', pane)?.addEventListener('click', () => {
        App.auth.signOut();
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 2. ROLE AUTHORIZATION CHECK
    // -------------------------------------------------------------------------
    if (!App.utils.isAdminOrDev(App.state.profile)) {
      App.utils.toast('That section is only visible to Admin and Developer accounts.', 'err');
      App.router.navigate('dashboard');
      return;
    }

    const isDev = App.utils.isDeveloper(App.state.profile);

    pane.innerHTML = `
      <div class="section-title">Admin &amp; Developer Portal <div class="line"></div><small>manage users across primary &amp; backup database stores, system configs, audit logs, and integrations</small></div>
      
      <!-- Session Bar & Jump Pills -->
      <div class="panel" style="padding:12px 16px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div class="hint" style="margin:0;display:flex;align-items:center;gap:8px">
            ${isDev ? '<span class="badge" style="background:rgba(147,51,234,0.15);color:#a855f7;border:1px solid rgba(147,51,234,0.3)">&#128187; Developer Session</span>' : '<span class="badge st-active">&#128081; Admin Session</span>'}
            <span>Reminders &amp; status checks run every 15 min.</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="runAutomationBtn">&#9881; Run Automation Now</button>
          </div>
        </div>
        <div class="admin-quick-jumps" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border2)">
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminUsersSection" style="cursor:pointer;font-size:11.5px">&#128101; Users &amp; Profiles</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminAuditSection" style="cursor:pointer;font-size:11.5px">&#128269; Audit History</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminAiSection" style="cursor:pointer;font-size:11.5px">&#129504; AI Model Provider</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminGoldSection" style="cursor:pointer;font-size:11.5px">&#129689; Gold Price Provider</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminSupabaseSection" style="cursor:pointer;font-size:11.5px">&#9889; Supabase &amp; System Config</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminTicketsSection" style="cursor:pointer;font-size:11.5px">&#129302; Support Tickets</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminDbHealthSection" style="cursor:pointer;font-size:11.5px">&#128295; DB Health</button>
          <button type="button" class="chip admin-jump-pill" data-jump-to="#adminVisitsSection" style="cursor:pointer;font-size:11.5px">&#128200; Visits Telemetry</button>
        </div>
      </div>

      <!-- 1. MANAGE USER PROFILES -->
      <div class="panel" id="adminUsersSection">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title">Manage User Profiles</div>
            <div class="hint">Create, update, deactivate, or delete user accounts across both Supabase Cloud and the high-speed Backup Database.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="syncProfilesBtn" title="Sync and reconcile profiles between cloud and local backup database">&#8644; Sync &amp; Reconcile Profiles</button>
            <button class="btn btn-gold btn-sm" id="addUserBtn">+ Add User</button>
          </div>
        </div>
        <div id="userStatsRow"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <input id="adminUsersSearchInput" type="text" class="search-input" placeholder="Search users by name, email, role, or ID..." style="width:260px">
          <div class="chip-row" id="adminUserRoleFilters" style="margin-bottom:0">
            ${['All', 'Developers', 'Administrators', 'Regular Users', 'Backup DB Store'].map((f) => `<div class="chip ${f === 'All' ? 'active' : ''}" data-user-filter="${f}">${f}</div>`).join('')}
          </div>
        </div>
        <div class="table-scroll"><table class="data" id="adminUsersTable"></table></div>
      </div>

      <!-- 2. AUDIT HISTORY & CHANGE LOGS -->
      <div class="panel" id="adminAuditSection">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title">&#128269; Audit History &amp; Mutation Logs</div>
            <div class="hint" id="adminAuditHistoryStatus" style="margin-top:2px">Every mutation across deals, payments, schedules and reinvestments is logged via database triggers.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="adminAuditRefreshBtn">&#8635; Refresh Logs</button>
            <button class="btn btn-outline btn-sm" id="adminToggleAuditHistoryBtn">Toggle Logging</button>
          </div>
        </div>
        <div class="filterbar" style="margin-bottom:12px">
          <div class="filter-group">
            <label>Table</label>
            <select class="search-input" id="adminAuditTableFilter">
              <option value="All">All Tables</option>
              <option value="deals">deals</option>
              <option value="payments">payments</option>
              <option value="payment_schedule">payment_schedule</option>
              <option value="reinvestments">reinvestments</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Action</label>
            <select class="search-input" id="adminAuditActionFilter">
              <option value="All">All Actions</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div class="filter-group" style="flex:1">
            <label>Search Field / Value / ID</label>
            <input class="search-input" id="adminAuditSearch" placeholder="Filter by field name, old/new value, or ID...">
          </div>
        </div>
        <div class="table-scroll" style="max-height:420px;border:1px solid var(--border2);border-radius:8px">
          <table class="data" id="adminAuditTable"></table>
        </div>
      </div>

      <!-- 3. AI MODEL PROVIDER -->
      <div class="panel" id="adminAiSection">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title">&#129504; AI Model Provider (Copilot &amp; Advisor)</div>
            <div class="hint">Switch the active AI engine powering the Portfolio Copilot &amp; Financial Advisor, or configure custom OpenAI-compatible endpoints.</div>
          </div>
          <button class="btn btn-outline btn-sm" id="adminAddCustomAiBtn">+ Add Custom AI Provider</button>
        </div>
        <div id="adminAiProviderList" style="margin-bottom:8px"></div>
        <div class="hint" style="font-size:11.5px;color:var(--text3);margin-top:6px">
          Selecting a provider instantly switches the conversational intelligence model for all Copilot and Advisor requests.
        </div>
      </div>

      <!-- 4. GOLD PRICE PROVIDER -->
      <div class="panel" id="adminGoldSection">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title">&#129689; Gold Price Provider (Gold Intelligence)</div>
            <div class="hint">Manage live spot price feeds, check API request quotas, and trigger instant price updates.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="adminAddCustomGoldBtn">+ Add Custom Provider</button>
            <button class="btn btn-gold btn-sm" id="adminGoldRefreshNowBtn">&#8635; Refresh Spot Price</button>
          </div>
        </div>
        <div id="adminGoldProviderList" style="margin-bottom:8px"></div>
      </div>

      <!-- 5. SUPABASE CONNECTION & SYSTEM CONFIG -->
      <div class="panel" id="adminSupabaseSection">
        <div class="chart-title" style="margin-bottom:4px">&#9889; Supabase Connection &amp; System Configuration</div>
        <div class="hint" style="margin-bottom:14px">Configure database endpoints for this browser session and set global portfolio reference benchmark rates.</div>
        
        <div class="grid-2" style="gap:16px;margin-bottom:14px">
          <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
            <div style="font-weight:600;font-size:13.5px;color:var(--text);margin-bottom:8px">Supabase Project Endpoint</div>
            <div class="field" style="margin-bottom:10px">
              <label style="font-size:11.5px">Active Project URL</label>
              <input type="text" id="adminCurrentSupabaseUrl" readonly style="background:var(--fill-1);color:var(--text2);font-size:12px">
            </div>
            <div class="field" style="margin-bottom:10px">
              <label style="font-size:11.5px">Connect to New Project URL</label>
              <input type="text" id="adminNewSupabaseUrl" placeholder="https://xyzcompany.supabase.co" style="font-size:12px">
            </div>
            <div class="field" style="margin-bottom:10px">
              <label style="font-size:11.5px">New Publishable / Anon Key</label>
              <input type="password" id="adminNewSupabaseKey" placeholder="eyJhbGciOi..." style="font-size:12px">
            </div>
            <div class="auth-error" id="adminConnectionError" style="margin-bottom:8px"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-gold btn-sm" id="adminSaveConnectionBtn">Save &amp; Reconnect This Browser</button>
              <button class="btn btn-outline btn-sm" id="adminResetConnectionBtn" style="display:none">Reset to Default</button>
            </div>
          </div>

          <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
            <div style="font-weight:600;font-size:13.5px;color:var(--text);margin-bottom:8px">Benchmark Reference Rate (FD Benchmark)</div>
            <div class="hint" style="margin-bottom:12px">The opportunity-cost benchmark rate used by Analytics and Deals views to compare high-yield returns against a fixed deposit baseline.</div>
            <div class="field" style="max-width:220px;margin-bottom:12px">
              <label style="font-size:11.5px">Reference Rate (% per year)</label>
              <input type="number" step="0.1" id="adminFdReferenceRateInput" placeholder="7.0">
            </div>
            <button class="btn btn-outline btn-sm" id="adminSaveFdRateBtn">Save Reference Rate</button>
          </div>
        </div>
      </div>

      <!-- 6. SUPPORT TICKETS -->
      <div class="panel" id="adminTicketsSection">
        <div class="chart-title" style="margin-bottom:4px">Support &amp; User Queries</div>
        <div class="hint" style="margin-bottom:10px">Every ticket across all users. Help &amp; Support shows only the signed-in user's own tickets.</div>
        <div id="ticketStatsCards" style="margin-bottom:12px"></div>
        <div class="chip-row" id="ticketAdminFilter" style="margin-bottom:10px">
          ${['All', 'Unassigned', 'Assigned to Me'].map((f) => `<div class="chip ${f === 'All' ? 'active' : ''}" data-ticket-admin-filter="${f}">${f}</div>`).join('')}
        </div>
        <div class="table-scroll"><table class="data" id="adminTicketsTable"></table></div>
      </div>

      <!-- 7. SUGGESTIONS & IDEAS -->
      <div class="panel">
        <div class="chart-title" style="margin-bottom:4px">Suggestions &amp; Ideas</div>
        <div class="hint" style="margin-bottom:10px">Every roadmap suggestion submitted by users.</div>
        <div id="suggestionStatsCards" style="margin-bottom:12px"></div>
        <div class="table-scroll"><table class="data" id="adminSuggestionsTable"></table></div>
      </div>

      <!-- 8. SHARED PORTFOLIOS -->
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="chart-title">Shared Portfolios</div>
          <select id="createSharedPortfolioOwner" class="search-input" style="width:auto"></select>
        </div>
        <div class="hint" style="margin-bottom:10px">Lets a specific other user (e.g. a spouse) see &mdash; never edit &mdash; one person's portfolio.</div>
        <div class="table-scroll"><table class="data" id="sharedPortfoliosTable"></table></div>
      </div>

      <!-- 9. DATABASE HEALTH & MULTI-STORE STORAGE MAINTENANCE -->
      <div class="panel" id="adminDbHealthSection">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <div>
            <div class="chart-title" style="margin-bottom:2px">&#128295; Database Health &amp; Storage Maintenance</div>
            <div class="hint">Comprehensive multi-database inspection: primary PostgreSQL cloud tables, secondary IndexedDB/LocalStorage stores, and portfolio deep-data explorer.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="dbHealthGlobalActions">
            <button class="btn btn-outline btn-sm" id="purgeOldLogsBtn" title="Clean historical logs, events, and notifications">&#129529; Purge Old Logs</button>
            <button class="btn btn-outline btn-sm" id="exportAllDbBtn" title="Export entire portfolio data to Excel/JSON">&#128230; Full Export</button>
            <button class="btn btn-outline btn-sm" id="refreshDbHealthBtn">&#8635; Refresh Now</button>
          </div>
        </div>

        <!-- Database Engine Switcher Tabs -->
        <div class="chip-row" id="dbEngineSwitcherTabs" style="margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
          <div class="chip active" data-db-engine="primary" style="cursor:pointer;font-weight:600">&#9729;&#65039; Primary Database (Supabase PostgreSQL)</div>
          <div class="chip" data-db-engine="secondary" style="cursor:pointer;font-weight:600">&#128190; Secondary Database (IndexedDB &amp; Browser Stores)</div>
          <div class="chip" data-db-engine="portfolio_explorer" style="cursor:pointer;font-weight:600">&#128202; Developer Portfolio Deep Data Explorer</div>
        </div>

        <!-- Subview 1: Primary Cloud Database -->
        <div id="primaryDbSubView" class="db-engine-subview">
          <div id="dbHealthKpis" style="margin-top:4px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <input id="dbHealthSearchInput" type="text" class="search-input" placeholder="Search tables by name or category..." style="width:240px">
            <div class="chip-row" id="dbHealthCatFilters" style="margin-bottom:0">
              ${['All', 'With Data', 'Empty', 'Core & Deals', 'Expenses', 'CRM & Contacts', 'Chat & Calls', 'Support', 'Logs & Telemetry', 'System'].map((c) => `<div class="chip ${c === 'All' ? 'active' : ''}" data-db-cat-filter="${c}">${c}</div>`).join('')}
            </div>
          </div>
          <div class="table-scroll" style="max-height:460px;border:1px solid var(--border2);border-radius:8px"><table class="data" id="dbHealthTable"></table></div>
        </div>

        <!-- Subview 2: Secondary Database & Storage Stores -->
        <div id="secondaryDbSubView" class="db-engine-subview" style="display:none">
          <div id="secondaryDbKpis" style="margin-top:4px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input id="secondaryDbSearchInput" type="text" class="search-input" placeholder="Search secondary stores..." style="width:220px">
              <div class="chip-row" id="secondaryDbFilterRow" style="margin-bottom:0">
                <div class="chip active" data-sec-filter="All">All Stores</div>
                <div class="chip" data-sec-filter="IndexedDB">IndexedDB</div>
                <div class="chip" data-sec-filter="WebStorage">Web Storage</div>
                <div class="chip" data-sec-filter="WithData">With Data</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" id="secDbSyncReconcileBtn" title="Sync and reconcile user profiles with Supabase">&#8644; Reconcile with Supabase</button>
              <button class="btn btn-outline btn-sm" id="secDbExportAllBtn" title="Export complete backup database as JSON">&#128229; Export Backup DB (.json)</button>
              <button class="btn btn-outline btn-sm" id="secDbPurgeCacheBtn" title="Clear temporary local cache stores" style="color:var(--amber,#f59e0b);border-color:var(--amber,#f59e0b)">&#129529; Purge Offline Cache</button>
            </div>
          </div>
          <div class="table-scroll" style="max-height:460px;border:1px solid var(--border2);border-radius:8px"><table class="data" id="secondaryDbTable"></table></div>
        </div>

        <!-- Subview 3: Developer Portfolio Deep Data Explorer -->
        <div id="portfolioExplorerSubView" class="db-engine-subview" style="display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;background:var(--bg3);padding:12px 14px;border-radius:8px;border:1px solid var(--border2)">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <label style="font-weight:600;font-size:12.5px;color:var(--text)">Portfolio User Scope:</label>
              <select id="portfolioExplorerUserSelect" class="search-input" style="width:230px;font-size:12px">
                <option value="CURRENT">Signed-in User (Current)</option>
                <option value="ALL">All Users (Developer Super-View)</option>
              </select>
              <button class="btn btn-outline btn-sm" id="portfolioExplorerReloadBtn">&#8635; Fetch Live Data</button>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline btn-sm" id="portfolioExportActiveCsvBtn">&#128229; Export Dataset CSV</button>
              <button class="btn btn-outline btn-sm" id="portfolioRunIntegrityAuditBtn" style="color:var(--gold,#d97706);border-color:var(--gold,#d97706)">&#129658; Run Integrity Audit</button>
            </div>
          </div>

          <!-- Developer Metrics KPI Row -->
          <div id="portfolioExplorerKpis" style="margin-bottom:12px"></div>

          <!-- Dataset Sub-tabs -->
          <div class="chip-row" id="portfolioDatasetTabs" style="margin-bottom:10px">
            <div class="chip active" data-dataset="deals">&#128188; Deals &amp; Investments</div>
            <div class="chip" data-dataset="recurring">&#128257; Recurring SIPs &amp; Schedules</div>
            <div class="chip" data-dataset="gold">&#129689; Gold &amp; Precious Metals</div>
            <div class="chip" data-dataset="accounts">&#127974; Accounts &amp; Liabilities</div>
            <div class="chip" data-dataset="expenses">&#129534; Expenses &amp; Projects</div>
            <div class="chip" data-dataset="tax_notes">&#128203; Tax, Notes &amp; Contacts</div>
            <div class="chip" data-dataset="diagnostics">&#129658; Data Integrity &amp; Diagnostics</div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <input id="portfolioExplorerSearchInput" type="text" class="search-input" placeholder="Filter rows in active dataset..." style="width:260px">
            <div id="portfolioDatasetCount" style="font-size:12px;color:var(--text2)">Loading dataset...</div>
          </div>

          <div class="table-scroll" style="max-height:460px;border:1px solid var(--border2);border-radius:8px">
            <table class="data" id="portfolioExplorerTable"></table>
          </div>
        </div>
      </div>

      <!-- 10. VISITS & LOGINS -->
      <div class="panel" id="adminVisitsSection">
        <div class="chart-title" style="margin-bottom:4px">Visits &amp; Customer Logins</div>
        <div class="hint" style="margin-bottom:10px">Real-time visitor and login telemetry tracking customer location, device (Mobile / Desktop / Tablet), browser, operating system, IP address, and screen size.</div>
        <div id="visitsStats" style="margin-bottom:14px"></div>
        <div class="table-scroll" style="max-height:400px"><table class="data" id="visitsTable"></table></div>
      </div>

      <!-- 11. DANGER ZONE -->
      <div class="panel">
        <div class="chart-title" style="margin-bottom:6px;color:var(--red,#e5484d)">Danger Zone</div>
        <div class="hint" style="margin-bottom:10px">Permanently deletes every deal, payment, recurring item, gold purchase, expense, contact, note, and document for <b>every user on this project</b>. Accounts remain intact.</div>
        <button class="btn btn-outline" id="adminClearAllDataBtn" style="border-color:var(--red,#e5484d);color:var(--red,#e5484d)">Clear Entire Portfolio Data</button>
      </div>`;

    // Danger Zone handler
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

    const syncBtn = App.utils.qs('#syncProfilesBtn', pane);
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        try {
          const res = await App.api.adminReconcileProfiles();
          App.utils.toast(`Reconciliation completed: ${res.synced} synced, ${res.total} total profiles verified`);
          await drawUsersPanel(pane);
        } catch (e) {
          App.utils.toast('Reconciliation error: ' + (e.message || e), 'err');
        } finally {
          syncBtn.disabled = false;
          syncBtn.textContent = '⇄ Sync & Reconcile Profiles';
        }
      });
    }

    const searchInput = App.utils.qs('#adminUsersSearchInput', pane);
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        usersSearch = e.target.value;
        drawUsersPanel(pane);
      });
    }

    App.utils.qsa('#adminUserRoleFilters .chip', pane).forEach((chip) => {
      chip.addEventListener('click', () => {
        usersRoleFilter = chip.dataset.userFilter;
        App.utils.qsa('#adminUserRoleFilters .chip', pane).forEach((c) => c.classList.toggle('active', c === chip));
        drawUsersPanel(pane);
      });
    });

    App.utils.qsa('.admin-jump-pill', pane).forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = pill.dataset.jumpTo;
        if (!targetId) return;
        const targetEl = App.utils.qs(targetId, pane);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          targetEl.style.transition = 'outline 0.3s, box-shadow 0.3s';
          targetEl.style.outline = '2px solid var(--gold, #d97706)';
          targetEl.style.boxShadow = '0 0 16px rgba(217, 119, 6, 0.25)';
          setTimeout(() => {
            targetEl.style.outline = '';
            targetEl.style.boxShadow = '';
          }, 1500);
        }
      });
    });

    async function safely(label, fn) {
      try { await fn(); }
      catch (e) { App.utils.toast(`Could not load ${label}: ` + (e.message || e), 'err'); }
    }

    await safely('Manage Users', () => drawUsersPanel(pane));
    await safely('Audit History', () => drawAdminAuditPanel(pane));
    await safely('AI Model Provider', () => drawAdminAiProviders(pane));
    await safely('Gold Price Provider', () => drawAdminGoldProviders(pane));
    await safely('Supabase Connection & Config', () => drawAdminSupabasePanel(pane));
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
