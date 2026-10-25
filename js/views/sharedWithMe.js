/* Shared With Me (024_portfolio_sharing_admin_users.sql & 046) -
   Interactive Collaborator Workspace for portfolios shared with the signed-in user.
   Supports Full Access (Co-Manager), Editor, Commenter, Viewer, and custom Granular scopes. */
window.App = window.App || {};

(function () {
  async function openSharedWorkspaceModal(portfolio, ownerUser, perms, onRefresh) {
    const ownerId = ownerUser.id;
    const ownerName = ownerUser.full_name || ownerUser.email || 'Portfolio Owner';
    const role = perms.role || 'Viewer';
    const isFullAccess = role === 'Full Access' || role === 'Full co-manager privileges';
    const isEditor = isFullAccess || role === 'Editor';
    const isCommenter = isEditor || role === 'Commenter';

    let activeTab = 'overview';

    async function loadWorkspaceData() {
      const [deals, summary, docs, contacts, comments, schedule, payments] = await Promise.all([
        App.api.listDeals({ eq: { user_id: ownerId } }).catch(() => []),
        App.api.getPortfolioSummary(ownerId).catch(() => ({})),
        perms.view_documents !== false ? App.api.listDocuments({ eq: { user_id: ownerId } }).catch(() => []) : Promise.resolve([]),
        perms.view_contacts ? (App.api.listContacts ? App.api.listContacts().catch(() => []) : Promise.resolve([])) : Promise.resolve([]),
        App.api.listPortfolioComments ? App.api.listPortfolioComments(portfolio.id).catch(() => []) : Promise.resolve([]),
        App.api.listSchedule ? App.api.listSchedule({ eq: { user_id: ownerId } }).catch(() => []) : Promise.resolve([]),
        App.api.listPayments ? App.api.listPayments({ eq: { user_id: ownerId } }).catch(() => []) : Promise.resolve([]),
      ]);
      return { deals, summary, docs, contacts, comments, schedule, payments };
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)';
    
    async function renderWorkspace() {
      const data = await loadWorkspaceData();
      const s = data.summary || {};
      const deals = data.deals || [];
      const docs = data.docs || [];
      const contacts = data.contacts || [];
      const comments = data.comments || [];
      const schedule = data.schedule || [];
      const payments = data.payments || [];

      const showAmount = (val) => (perms.view_amounts !== false ? App.utils.fmtMoney(val) : '••••••');
      const showRoi = (val) => (perms.view_returns !== false ? App.utils.fmtPct(val) : '••%');
      const showDealName = (name, i) => (perms.view_deals !== false ? App.utils.escapeHtml(name) : `Protected Asset ${i + 1}`);

      const roleBadgeColor = isFullAccess
        ? 'background:rgba(34,197,94,0.18);color:var(--green,#22c55e);border-color:rgba(34,197,94,0.4)'
        : (role === 'Editor'
          ? 'background:rgba(59,130,246,0.18);color:var(--blue,#3b82f6);border-color:rgba(59,130,246,0.4)'
          : (role === 'Commenter'
            ? 'background:rgba(168,85,247,0.18);color:#c084fc;border-color:rgba(168,85,247,0.4)'
            : 'background:rgba(201,168,76,0.18);color:var(--gold);border-color:rgba(201,168,76,0.4)'));

      modal.innerHTML = `
        <div style="background:#0e1626;border:1px solid rgba(201,168,76,0.35);border-radius:14px;max-width:960px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.7)">
          
          <!-- Workspace Header -->
          <div style="padding:16px 20px;background:#152238;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(201,168,76,0.15);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:20px">&#128101;</div>
              <div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-weight:700;font-size:16px;color:var(--text)">${App.utils.escapeHtml(portfolio.name || 'Shared Portfolio')}</span>
                  <span class="badge" style="${roleBadgeColor};font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;border:1px solid">
                    ${App.utils.escapeHtml(role)}
                  </span>
                </div>
                <div style="font-size:12px;color:var(--text3)">
                  Owner: <b>${App.utils.escapeHtml(ownerName)}</b> &middot; Access: <span style="color:var(--teal)">Collaborator Mode</span>
                </div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px">
              ${isEditor ? `
                <button class="btn btn-gold btn-sm" id="btnSwitchContextCoManage" style="box-shadow:0 2px 8px rgba(201,168,76,0.3)">
                  ⚡ Co-Manage (Switch App Workspace)
                </button>
              ` : ''}
              <button class="btn btn-outline btn-sm" id="btnCloseSharedWorkspaceModal" style="padding:4px 10px;font-size:13px">✕ Close</button>
            </div>
          </div>

          <!-- Workspace Tabs Bar -->
          <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08);background:#0a101d;overflow-x:auto;padding:0 12px">
            <button class="tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-wtab="overview" style="padding:10px 16px;font-size:13px;border:none;background:none;color:${activeTab === 'overview' ? 'var(--gold)' : 'var(--text2)'};border-bottom:2px solid ${activeTab === 'overview' ? 'var(--gold)' : 'transparent'};cursor:pointer;font-weight:600">
              📊 Financial Overview
            </button>
            <button class="tab-btn ${activeTab === 'deals' ? 'active' : ''}" data-wtab="deals" style="padding:10px 16px;font-size:13px;border:none;background:none;color:${activeTab === 'deals' ? 'var(--gold)' : 'var(--text2)'};border-bottom:2px solid ${activeTab === 'deals' ? 'var(--gold)' : 'transparent'};cursor:pointer;font-weight:600">
              💼 Deals &amp; Investments (${deals.length})
            </button>
            <button class="tab-btn ${activeTab === 'cashflow' ? 'active' : ''}" data-wtab="cashflow" style="padding:10px 16px;font-size:13px;border:none;background:none;color:${activeTab === 'cashflow' ? 'var(--gold)' : 'var(--text2)'};border-bottom:2px solid ${activeTab === 'cashflow' ? 'var(--gold)' : 'transparent'};cursor:pointer;font-weight:600">
              💳 Cash Flow &amp; Payments
            </button>
            ${perms.view_documents !== false ? `
              <button class="tab-btn ${activeTab === 'docs' ? 'active' : ''}" data-wtab="docs" style="padding:10px 16px;font-size:13px;border:none;background:none;color:${activeTab === 'docs' ? 'var(--gold)' : 'var(--text2)'};border-bottom:2px solid ${activeTab === 'docs' ? 'var(--gold)' : 'transparent'};cursor:pointer;font-weight:600">
                📁 Documents (${docs.length})
              </button>
            ` : ''}
            <button class="tab-btn ${activeTab === 'comments' ? 'active' : ''}" data-wtab="comments" style="padding:10px 16px;font-size:13px;border:none;background:none;color:${activeTab === 'comments' ? 'var(--gold)' : 'var(--text2)'};border-bottom:2px solid ${activeTab === 'comments' ? 'var(--gold)' : 'transparent'};cursor:pointer;font-weight:600">
              💬 Collaboration &amp; Notes (${comments.length})
            </button>
            ${perms.view_contacts ? `
              <button class="tab-btn ${activeTab === 'contacts' ? 'active' : ''}" data-wtab="contacts" style="padding:10px 16px;font-size:13px;border:none;background:none;color:${activeTab === 'contacts' ? 'var(--gold)' : 'var(--text2)'};border-bottom:2px solid ${activeTab === 'contacts' ? 'var(--gold)' : 'transparent'};cursor:pointer;font-weight:600">
                👥 Contacts (${contacts.length})
              </button>
            ` : ''}
          </div>

          <!-- Workspace Content Body -->
          <div style="flex:1;overflow-y:auto;padding:20px" id="sharedWorkspaceBody">
            ${renderTabContent(activeTab, data, showAmount, showRoi, showDealName, isEditor, isFullAccess, isCommenter, ownerId, portfolio.id)}
          </div>

          <!-- Workspace Footer -->
          <div style="padding:10px 20px;background:#152238;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--text3)">
            <div>
              <span>Granular Scopes: </span>
              ${['view_net_worth:Net Worth', 'view_deals:Deals', 'view_amounts:Amounts', 'view_returns:Returns', 'view_goals:Goals', 'view_documents:Documents', 'view_contacts:Contacts']
                .map((pair) => {
                  const [k, label] = pair.split(':');
                  const allowed = perms[k] !== false;
                  return `<span class="badge" style="font-size:10px;margin-right:4px;background:${allowed ? 'rgba(34,197,94,0.12);color:var(--green,#22c55e)' : 'rgba(239,68,68,0.12);color:var(--red,#ef4444)'}">${allowed ? '✓ ' : '✕ '}${label}</span>`;
                }).join('')}
            </div>
            <div>Investment OS &middot; Collaborative Workspace</div>
          </div>
        </div>
      `;

      // Wire Tab clicks
      modal.querySelectorAll('[data-wtab]').forEach((b) => b.addEventListener('click', () => {
        activeTab = b.dataset.wtab;
        renderWorkspace();
      }));

      // Wire Close
      const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
      modal.querySelector('#btnCloseSharedWorkspaceModal')?.addEventListener('click', close);

      // Wire Switch Context
      modal.querySelector('#btnSwitchContextCoManage')?.addEventListener('click', () => {
        close();
        if (App.setActivePortfolioContext) {
          App.setActivePortfolioContext({
            portfolioId: portfolio.id,
            owner_user_id: ownerId,
            owner_name: ownerName,
            name: portfolio.name,
            role,
            permissions: perms
          });
        }
      });

      // Wire Tab Actions
      wireTabActions(activeTab, modal, data, ownerId, portfolio.id, () => renderWorkspace());
    }

    function renderTabContent(tab, data, showAmount, showRoi, showDealName, isEditor, isFullAccess, isCommenter, ownerId, portfolioId) {
      const s = data.summary || {};
      const deals = data.deals || [];
      const docs = data.docs || [];
      const contacts = data.contacts || [];
      const comments = data.comments || [];
      const schedule = data.schedule || [];
      const payments = data.payments || [];

      if (tab === 'overview') {
        return `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px">
            <div class="kpi-card" style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Total Invested</div>
              <div style="font-size:22px;font-weight:700;color:var(--gold)">${perms.view_net_worth !== false ? showAmount(s.total_invested) : 'Protected'}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">${s.active_deals_count ?? 0} active investments</div>
            </div>

            <div class="kpi-card" style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Current Outstanding</div>
              <div style="font-size:22px;font-weight:700;color:var(--teal)">${perms.view_net_worth !== false ? showAmount(s.current_outstanding_principal) : 'Protected'}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">Principal at risk</div>
            </div>

            <div class="kpi-card" style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Interest Realized</div>
              <div style="font-size:22px;font-weight:700;color:var(--green,#22c55e)">${perms.view_net_worth !== false ? showAmount(s.interest_earned) : 'Protected'}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">Earned to date</div>
            </div>

            <div class="kpi-card" style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Portfolio Yield (ROI)</div>
              <div style="font-size:22px;font-weight:700;color:var(--gold)">${showRoi(s.realized_roi)}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">Weighted annualized</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div class="panel" style="background:var(--bg2);border:1px solid var(--border);padding:14px;border-radius:10px">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px">Investment Status Breakdown</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;font-size:12.5px"><span>Active Deals:</span><b>${s.active_deals_count ?? 0}</b></div>
                <div style="display:flex;justify-content:space-between;font-size:12.5px"><span>Closed / Matured Deals:</span><b>${s.closed_deals_count ?? 0}</b></div>
                <div style="display:flex;justify-content:space-between;font-size:12.5px"><span>Total Lifetime Deals:</span><b>${deals.length}</b></div>
              </div>
            </div>

            <div class="panel" style="background:var(--bg2);border:1px solid var(--border);padding:14px;border-radius:10px">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px">Collaborator Capabilities</div>
              <div style="font-size:12px;color:var(--text2);line-height:1.6">
                ${isFullAccess ? '⚡ <b>Full Access:</b> You have full co-management privileges. You can add, edit, or delete deals, record payments, upload documents, and discuss strategy.' :
                  isEditor ? '✏️ <b>Editor:</b> You can create/edit deals, record incoming payments, attach documents, and leave notes.' :
                  isCommenter ? '💬 <b>Commenter:</b> You can view the investments and post reviews, questions, and advice in the Collaboration Thread.' :
                  '👁️ <b>Viewer:</b> Read-only access honoring the owner\'s granular privacy settings.'}
              </div>
            </div>
          </div>
        `;
      }

      if (tab === 'deals') {
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" id="sharedDealsSearchInput" placeholder="Search deals..." class="search-input" style="width:200px">
            </div>
            ${isEditor ? `
              <button class="btn btn-gold btn-sm" id="btnAddDealSharedBtn">+ Add Investment Deal</button>
            ` : ''}
          </div>

          <div class="table-scroll" style="max-height:420px">
            <table class="data" id="sharedDealsTable">
              <thead>
                <tr>
                  <th>Deal Name</th>
                  <th>Type</th>
                  <th>Invested</th>
                  <th>ROI %</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th>Maturity</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${deals.length ? deals.map((d, idx) => `
                  <tr>
                    <td><b>${showDealName(d.deal_name, idx)}</b> ${d.collateral_available ? '🔒' : ''}</td>
                    <td>${App.utils.escapeHtml(d.investment_type || '—')}</td>
                    <td>${showAmount(d.invested_amount)}</td>
                    <td>${showRoi(d.annual_roi)}</td>
                    <td>${App.utils.escapeHtml(d.payment_frequency || '—')}</td>
                    <td><span class="badge ${App.utils.statusBadgeClass(d.status)}">${d.status}</span></td>
                    <td>${App.utils.fmtDate(d.maturity_date)}</td>
                    <td class="row-actions" style="text-align:right">
                      <button class="icon-btn" data-shared-view-deal="${d.id}" title="View Details">&#128065;</button>
                      ${isEditor ? `
                        <button class="icon-btn" data-shared-edit-deal="${d.id}" title="Edit Deal">&#9998;</button>
                        <button class="icon-btn" data-shared-pay-deal="${d.id}" title="Record Payment">&#128179;</button>
                      ` : ''}
                      ${isFullAccess ? `
                        <button class="icon-btn del" data-shared-del-deal="${d.id}" title="Delete Deal">&#128465;</button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No deals found in this portfolio.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }

      if (tab === 'cashflow') {
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div style="font-weight:700;font-size:13px;color:var(--text)">Payment Schedule &amp; Recent Receipts</div>
            ${isEditor ? `
              <button class="btn btn-gold btn-sm" id="btnRecordPaymentSharedBtn">+ Record Payment</button>
            ` : ''}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="panel" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px">
              <div style="font-weight:700;font-size:12.5px;color:var(--gold);margin-bottom:8px">Upcoming Scheduled Payments (${schedule.length})</div>
              <div class="table-scroll" style="max-height:300px">
                <table class="data" style="font-size:11.5px">
                  <thead><tr><th>Due Date</th><th>Expected Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    ${schedule.slice(0, 15).map((row) => `
                      <tr>
                        <td>${App.utils.fmtDate(row.due_date)}</td>
                        <td>${showAmount(row.expected_total || (Number(row.expected_principal || 0) + Number(row.expected_interest || 0)))}</td>
                        <td><span class="badge ${App.utils.statusBadgeClass(row.status)}">${row.status}</span></td>
                      </tr>
                    `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:14px">No schedule records.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px">
              <div style="font-weight:700;font-size:12.5px;color:var(--teal);margin-bottom:8px">Confirmed Payment Receipts (${payments.length})</div>
              <div class="table-scroll" style="max-height:300px">
                <table class="data" style="font-size:11.5px">
                  <thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                  <tbody>
                    ${payments.slice(0, 15).map((row) => `
                      <tr>
                        <td>${App.utils.fmtDate(row.transaction_date)}</td>
                        <td>${showAmount(row.amount)}</td>
                        <td>${App.utils.escapeHtml(row.confirmation_method || 'Manual')}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:14px">No payments recorded yet.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      }

      if (tab === 'docs') {
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div style="font-weight:700;font-size:13px;color:var(--text)">Attached Documents, Agreements &amp; Receipts (${docs.length})</div>
            ${isEditor ? `
              <button class="btn btn-gold btn-sm" id="btnUploadDocSharedBtn">+ Upload Document</button>
            ` : ''}
          </div>

          <div class="table-scroll" style="max-height:380px">
            <table class="data">
              <thead><tr><th>Document Name</th><th>Type</th><th>Reference</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                ${docs.length ? docs.map((dc) => `
                  <tr>
                    <td><b>${App.utils.escapeHtml(dc.file_name || dc.title || 'Document')}</b></td>
                    <td>${App.utils.escapeHtml(dc.document_type || 'General')}</td>
                    <td>${App.utils.escapeHtml(dc.document_reference || '—')}</td>
                    <td>${App.utils.fmtDate(dc.document_date)}</td>
                    <td class="row-actions">
                      <button class="btn btn-outline btn-sm" data-shared-view-doc="${dc.id}" style="padding:2px 8px;font-size:11px">&#128065; View</button>
                      ${isFullAccess ? `<button class="icon-btn del" data-shared-del-doc="${dc.id}" title="Delete Document">&#128465;</button>` : ''}
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">No documents attached to this portfolio yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }

      if (tab === 'comments') {
        return `
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="panel" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px">💬 Portfolio Discussion &amp; Strategy Notes</div>
              
              <!-- Post Comment Box -->
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;background:var(--fill-1);padding:12px;border-radius:8px;border:1px solid var(--border2)">
                <div style="display:flex;gap:8px">
                  <select id="sharedCommentTypeSelect" class="search-input" style="width:160px;font-size:12px">
                    <option value="General">General Note</option>
                    <option value="Deal Feedback">Deal Feedback</option>
                    <option value="Strategy">Strategy Suggestion</option>
                    <option value="Question">Question</option>
                    <option value="Alert">Risk Alert</option>
                  </select>
                  <input type="text" id="sharedCommentInput" placeholder="Write a comment, strategy note, or question..." class="search-input" style="flex:1">
                  <button class="btn btn-gold btn-sm" id="btnPostSharedComment">Post Note</button>
                </div>
              </div>

              <!-- Comments List -->
              <div style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto">
                ${comments.length ? comments.map((c) => `
                  <div style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                      <div style="display:flex;align-items:center;gap:6px">
                        <span style="font-weight:700;font-size:12.5px;color:var(--text)">${App.utils.escapeHtml(c.author_name || 'Collaborator')}</span>
                        <span class="badge" style="font-size:10px;background:rgba(201,168,76,0.15);color:var(--gold)">${App.utils.escapeHtml(c.comment_type || 'General')}</span>
                      </div>
                      <span style="font-size:11px;color:var(--text3)">${App.utils.fmtDateTime(c.created_at)}</span>
                    </div>
                    <div style="font-size:12.5px;color:var(--text2);line-height:1.5">${App.utils.escapeHtml(c.content)}</div>
                  </div>
                `).join('') : '<div style="text-align:center;padding:24px;color:var(--text3)">No discussion notes yet. Start the conversation!</div>'}
              </div>
            </div>
          </div>
        `;
      }

      if (tab === 'contacts') {
        return `
          <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:12px">Emergency &amp; Directory Contacts (${contacts.length})</div>
          <div class="table-scroll" style="max-height:380px">
            <table class="data">
              <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Email</th><th>Emergency</th></tr></thead>
              <tbody>
                ${contacts.length ? contacts.map((ct) => `
                  <tr>
                    <td><b>${App.utils.escapeHtml(ct.full_name || '—')}</b></td>
                    <td>${App.utils.escapeHtml(ct.relationship || '—')}</td>
                    <td>${App.utils.escapeHtml(ct.phone || '—')}</td>
                    <td>${App.utils.escapeHtml(ct.email || '—')}</td>
                    <td>${ct.is_emergency_contact ? '<span class="badge st-active">Yes</span>' : '<span style="color:var(--text3)">No</span>'}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">No contacts found.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }

      return '';
    }

    function wireTabActions(tab, modalEl, data, ownerId, portfolioId, reload) {
      const deals = data.deals || [];
      const docs = data.docs || [];

      // Deals tab actions
      if (tab === 'deals') {
        modalEl.querySelector('#btnAddDealSharedBtn')?.addEventListener('click', () => {
          openCreateDealModalForShared(ownerId, reload);
        });

        modalEl.querySelectorAll('[data-shared-view-deal]').forEach((b) => b.addEventListener('click', () => {
          const deal = deals.find((d) => d.id === Number(b.dataset.sharedViewDeal));
          if (deal && App.dealsView && App.dealsView.openDealDetail) {
            App.dealsView.openDealDetail(deal.id);
          }
        }));

        modalEl.querySelectorAll('[data-shared-edit-deal]').forEach((b) => b.addEventListener('click', () => {
          const deal = deals.find((d) => d.id === Number(b.dataset.sharedEditDeal));
          if (deal && App.dealsView && App.dealsView.openDealWizard) {
            App.dealsView.openDealWizard(deal);
          }
        }));

        modalEl.querySelectorAll('[data-shared-pay-deal]').forEach((b) => b.addEventListener('click', () => {
          const deal = deals.find((d) => d.id === Number(b.dataset.sharedPayDeal));
          if (deal && App.paymentsView && App.paymentsView.openRecordPaymentModal) {
            App.paymentsView.openRecordPaymentModal(deals, deal.id);
          }
        }));

        modalEl.querySelectorAll('[data-shared-del-deal]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('Are you sure you want to delete this deal?')) return;
          try {
            await App.api.deleteDeal(Number(b.dataset.sharedDelDeal));
            App.utils.toast('Deal deleted successfully');
            reload();
          } catch (e) {
            App.utils.toast('Could not delete deal: ' + (e.message || e), 'err');
          }
        }));
      }

      // Cash flow tab actions
      if (tab === 'cashflow') {
        modalEl.querySelector('#btnRecordPaymentSharedBtn')?.addEventListener('click', () => {
          if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
            App.paymentsView.openRecordPaymentModal(deals);
          }
        });
      }

      // Docs tab actions
      if (tab === 'docs') {
        modalEl.querySelector('#btnUploadDocSharedBtn')?.addEventListener('click', () => {
          openUploadDocModalForShared(deals, ownerId, reload);
        });

        modalEl.querySelectorAll('[data-shared-view-doc]').forEach((b) => b.addEventListener('click', async () => {
          const doc = docs.find((d) => d.id === Number(b.dataset.sharedViewDoc));
          if (doc) {
            try {
              const url = await App.api.getDocumentUrl(doc.id);
              if (url) window.open(url, '_blank');
              else App.utils.toast('Document link unavailable', 'err');
            } catch (e) {
              App.utils.toast('Could not open document: ' + (e.message || e), 'err');
            }
          }
        }));

        modalEl.querySelectorAll('[data-shared-del-doc]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('Delete this document?')) return;
          try {
            await App.api.deleteDocument(Number(b.dataset.sharedDelDoc));
            App.utils.toast('Document deleted');
            reload();
          } catch (e) {
            App.utils.toast('Could not delete document: ' + (e.message || e), 'err');
          }
        }));
      }

      // Comments tab actions
      if (tab === 'comments') {
        modalEl.querySelector('#btnPostSharedComment')?.addEventListener('click', async () => {
          const content = modalEl.querySelector('#sharedCommentInput').value.trim();
          const type = modalEl.querySelector('#sharedCommentTypeSelect').value;
          if (!content) { App.utils.toast('Please enter comment text', 'err'); return; }
          try {
            await App.api.addPortfolioComment({
              portfolio_id: portfolioId,
              comment_type: type,
              content
            });
            App.utils.toast('Note posted successfully');
            reload();
          } catch (e) {
            App.utils.toast('Could not post note: ' + (e.message || e), 'err');
          }
        });
      }
    }

    document.body.appendChild(modal);
    await renderWorkspace();
  }

  function openCreateDealModalForShared(ownerId, onDone) {
    const fields = [
      { key: 'deal_name', label: 'Deal Name', required: true, span: 2 },
      { key: 'investment_type', label: 'Investment Type', required: true, type: 'select', options: ['P2P Lending', 'Real Estate', 'Venture Debt', 'Fixed Deposit', 'Bonds', 'Crypto', 'Stocks', 'Other'] },
      { key: 'invested_amount', label: 'Invested Amount (₹)', required: true, type: 'number' },
      { key: 'annual_roi', label: 'Annual ROI %', required: true, type: 'number' },
      { key: 'start_date', label: 'Start Date', required: true, type: 'date' },
      { key: 'maturity_date', label: 'Maturity Date', type: 'date' },
      { key: 'payment_frequency', label: 'Payment Frequency', required: true, type: 'select', options: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'At Maturity', 'Custom'] },
      { key: 'notes', label: 'Notes / Deal Terms', type: 'textarea', span: 2 }
    ];

    App.ui.open({
      title: 'Add Deal to Shared Portfolio',
      bodyHtml: App.ui.renderForm(fields, { start_date: App.utils.todayISO(), payment_frequency: 'Monthly', status: 'ACTIVE' }),
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        { label: 'Save Deal', className: 'btn-gold', onClick: async () => {
          const { values, errors } = App.ui.readForm(fields);
          if (errors.length) { App.utils.toast('Please fill in required deal fields', 'err'); return; }
          try {
            await App.api.createDealForUser({
              deal_name: values.deal_name,
              investment_type: values.investment_type,
              invested_amount: Number(values.invested_amount),
              principal_amount: Number(values.invested_amount),
              original_principal: Number(values.invested_amount),
              annual_roi: Number(values.annual_roi),
              start_date: values.start_date,
              maturity_date: values.maturity_date || null,
              payment_frequency: values.payment_frequency,
              status: 'ACTIVE',
              notes: values.notes || null,
            }, ownerId);
            App.utils.toast('Investment deal added to shared portfolio!');
            App.ui.close();
            if (onDone) onDone();
          } catch (e) {
            App.utils.toast('Could not create deal: ' + (e.message || e), 'err');
          }
        } }
      ]
    });
  }

  function openUploadDocModalForShared(deals, ownerId, onDone) {
    const dealOptions = [{ value: '', label: '(general, not deal-specific)' }].concat(deals.map((d) => ({ value: d.id, label: d.deal_name })));
    const fields = [
      { key: 'deal_id', label: 'Deal', type: 'select', numeric: true, options: dealOptions },
      { key: 'document_type', label: 'Document Type', required: true, type: 'select', options: ['Investment Agreement', 'Payment Receipt', 'Statement', 'Tax Certificate', 'Screenshot', 'Other'] },
      { key: 'document_reference', label: 'Reference / Identifier' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 2 }
    ];

    App.ui.open({
      title: 'Upload Document to Shared Portfolio',
      bodyHtml: App.ui.renderForm(fields) + '<div class="field span2" style="margin-top:10px"><label>Choose File *</label><input type="file" id="sharedDocFileInput" style="display:block"></div>',
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        { label: 'Upload File', className: 'btn-gold', onClick: async () => {
          const { values, errors } = App.ui.readForm(fields);
          const file = App.utils.qs('#sharedDocFileInput')?.files[0];
          if (errors.length || !file) { App.utils.toast('Please select document type and a file', 'err'); return; }
          try {
            await App.api.uploadDocumentForUser(file, {
              dealId: values.deal_id || null,
              documentType: values.document_type,
              documentReference: values.document_reference,
              notes: values.notes
            }, ownerId);
            App.utils.toast('Document uploaded successfully!');
            App.ui.close();
            if (onDone) onDone();
          } catch (e) {
            App.utils.toast('Upload failed: ' + (e.message || e), 'err');
          }
        } }
      ]
    });
  }

  async function renderSharedWithMeView() {
    const pane = App.utils.qs('#pane-sharedWithMe');
    if (!pane) return;

    pane.innerHTML = `
      <div class="section-title">Shared With Me <div class="line"></div><small>portfolios &amp; assets shared with your account</small></div>
      
      <div class="panel" style="margin-bottom:14px;background:var(--fill-1);border:1px solid var(--border)">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="font-size:24px;line-height:1">&#128101;</div>
          <div style="flex:1">
            <div style="font-weight:700;color:var(--text);font-size:14px;margin-bottom:4px">How Granular Portfolio Sharing Works</div>
            <div style="font-size:12.5px;color:var(--text2);line-height:1.5">
              Portfolios where you are added as a <b>Full Access Co-Manager</b>, <b>Editor</b>, <b>Commenter</b>, or <b>Viewer</b> appear automatically here.
              Co-Managers &amp; Editors can switch active workspace context or perform updates, while Commenters and Viewers can review assets and participate in discussions according to granted granular scopes.
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div id="sharedWithMeList">
          <div style="text-align:center;padding:24px;color:var(--text3)">Loading shared portfolios...</div>
        </div>
      </div>`;

    const myId = App.state.profile && App.state.profile.id;
    const myEmail = App.state.profile && App.state.profile.email;
    const portfolios = (await App.api.listPortfoliosSharedWithMe()).filter((p) => p.owner_user_id !== myId);

    if (!portfolios.length) {
      App.utils.qs('#sharedWithMeList', pane).innerHTML = `
        <div class="empty-note" style="padding:28px 16px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">&#128101;</div>
          <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:4px">No Portfolios Shared With You Yet</div>
          <div style="font-size:12.5px;color:var(--text3);max-width:480px;margin:0 auto 16px">
            When another user or family member grants your account (<code>${App.utils.escapeHtml(myEmail || myId || 'your account')}</code>) Full Access, Editor, Commenter, or Viewer permissions in their <b>Settings &rarr; Granular Portfolio Sharing</b>, it will instantly appear here.
          </div>
          <a href="#settings" class="btn btn-outline btn-sm">Manage My Own Shared Portfolios &rarr;</a>
        </div>`;
      return;
    }

    const ownerIds = portfolios.map((p) => p.owner_user_id);
    const names = await App.api.getDisplayNames(ownerIds);

    const listHtml = await Promise.all(portfolios.map(async (p) => {
      const members = await App.api.listPortfolioMembers(p.id).catch(() => []);
      const myMembership = members.find((m) =>
        m.member_user_id === myId ||
        (myEmail && String(m.member_user_id).toLowerCase() === myEmail.toLowerCase())
      ) || members[0] || {};

      const role = myMembership.role || 'Viewer';
      const perms = myMembership.permissions || {};
      const scopes = [];
      if (perms.view_net_worth !== false) scopes.push('Net Worth');
      if (perms.view_deals !== false) scopes.push('Deals');
      if (perms.view_amounts !== false) scopes.push('Amounts');
      if (perms.view_returns !== false) scopes.push('Returns');
      if (perms.view_goals !== false) scopes.push('Goals');
      if (perms.view_documents) scopes.push('Documents');
      if (perms.view_contacts) scopes.push('Contacts');

      const isFullAccess = role === 'Full Access' || role === 'Full co-manager privileges';
      const isEditor = isFullAccess || role === 'Editor';

      const roleBadgeColor = isFullAccess
        ? 'background:rgba(34,197,94,0.18);color:var(--green,#22c55e)'
        : (role === 'Editor'
          ? 'background:rgba(59,130,246,0.18);color:var(--blue,#3b82f6)'
          : (role === 'Commenter'
            ? 'background:rgba(168,85,247,0.18);color:#c084fc'
            : 'background:rgba(201,168,76,0.18);color:var(--gold)'));

      return `
        <div class="risk-item" style="padding:16px;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">
          <div style="font-size:24px;width:40px;height:40px;border-radius:50%;background:rgba(201,168,76,0.12);color:var(--gold);display:flex;align-items:center;justify-content:center">&#128101;</div>
          <div style="flex:1;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <div class="risk-name" style="font-size:15px;font-weight:700;color:var(--text)">${App.utils.escapeHtml(names[p.owner_user_id] || 'Portfolio Owner')}</div>
              <span class="badge" style="${roleBadgeColor};font-size:11px;font-weight:600">
                ${App.utils.escapeHtml(role)}
              </span>
            </div>
            <div class="risk-desc" style="font-size:12.5px;color:var(--text2);margin-bottom:8px">
              <b>${App.utils.escapeHtml(p.name || 'Shared Portfolio')}</b> &middot; Status: <span style="color:var(--teal);font-weight:600">Active</span>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${scopes.map((s) => `<span class="badge" style="font-size:10.5px;background:var(--fill-2);border:1px solid var(--border2);color:var(--text3)">${s}</span>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${isEditor ? `
              <button class="btn btn-outline btn-sm" data-comanage-owner="${p.owner_user_id}" data-portfolio-id="${p.id}" data-role="${App.utils.escapeHtml(role)}" data-portfolio-name="${App.utils.escapeHtml(p.name || '')}" style="border-color:var(--gold);color:var(--gold)">
                ⚡ Co-Manage Mode
              </button>
            ` : ''}
            <button class="btn btn-gold btn-sm" data-view-owner="${p.owner_user_id}" data-portfolio-id="${p.id}">
              📂 Open Portfolio Workspace
            </button>
          </div>
        </div>`;
    }));

    App.utils.qs('#sharedWithMeList', pane).innerHTML = listHtml.join('');

    // Wire Open Portfolio Workspace
    App.utils.qsa('[data-view-owner]', pane).forEach((b) => b.addEventListener('click', async () => {
      const portfolioId = Number(b.dataset.portfolioId);
      const targetPortfolio = portfolios.find((p) => p.id === portfolioId) || { id: portfolioId, owner_user_id: b.dataset.viewOwner };
      const members = await App.api.listPortfolioMembers(portfolioId).catch(() => []);
      const myMembership = members.find((m) =>
        m.member_user_id === myId ||
        (myEmail && String(m.member_user_id).toLowerCase() === myEmail.toLowerCase())
      ) || members[0] || {};

      const perms = Object.assign({}, myMembership.permissions || {}, {
        role: myMembership.role || 'Viewer',
      });

      openSharedWorkspaceModal(
        targetPortfolio,
        { id: b.dataset.viewOwner, full_name: names[b.dataset.viewOwner] },
        perms,
        () => renderSharedWithMeView()
      );
    }));

    // Wire Quick Co-Manage Switch
    App.utils.qsa('[data-comanage-owner]', pane).forEach((b) => b.addEventListener('click', async () => {
      const portfolioId = Number(b.dataset.portfolioId);
      const ownerId = b.dataset.comanageOwner;
      const ownerName = names[ownerId] || 'Shared Portfolio';
      const role = b.dataset.role || 'Full Access';
      const portName = b.dataset.portfolioName;

      const members = await App.api.listPortfolioMembers(portfolioId).catch(() => []);
      const myMembership = members.find((m) =>
        m.member_user_id === myId ||
        (myEmail && String(m.member_user_id).toLowerCase() === myEmail.toLowerCase())
      ) || members[0] || {};

      if (App.setActivePortfolioContext) {
        App.setActivePortfolioContext({
          portfolioId,
          owner_user_id: ownerId,
          owner_name: ownerName,
          name: portName,
          role,
          permissions: myMembership.permissions || {}
        });
      }
    }));
  }

  App.router.register('sharedWithMe', renderSharedWithMeView);
  App.sharedWithMeView = { openSharedWorkspaceModal };
})();
