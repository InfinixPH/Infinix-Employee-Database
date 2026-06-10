// ============================================================
// page-settings.js — Settings page
// Role info · Column preferences · Page size · Password manager
// ============================================================
'use strict';

function renderSettingsPage() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = 'Settings';

  const role     = typeof currentRole !== 'undefined' ? currentRole : null;
  const roleMeta = (typeof ROLE_META !== 'undefined' && role) ? ROLE_META[role] : null;
  const isOwner  = role === 'owner';
  const isWriter = typeof canWrite === 'function' ? canWrite() : false;

  document.getElementById('content').innerHTML = `
    <div class="ps-wrap">

      <!-- ── Current session ── -->
      <div class="ps-section">
        ${Components.sectionHeader('👤 Current Session')}
        <div class="ps-card ps-session-card">
          <div class="ps-session-info">
            ${Components.avatar(
              (typeof currentUser !== 'undefined' && currentUser?.name) || 'U',
              42
            )}
            <div>
              <div class="ps-session-name">${esc((typeof currentUser !== 'undefined' && currentUser?.name) || 'Not signed in')}</div>
              <div class="ps-session-email">${esc((typeof currentUser !== 'undefined' && currentUser?.email) || '')}</div>
            </div>
          </div>
          <div class="ps-session-role">
            <div class="ps-role-badge ps-role-${esc(role || 'none')}">${esc(roleMeta?.label || role || 'No role')}</div>
            <div class="ps-role-desc">${_roleDesc(role)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="openRoleModal()" style="margin-left:auto;align-self:flex-start">Switch Role</button>
        </div>
      </div>

      <!-- ── Role permissions ── -->
      <div class="ps-section">
        ${Components.sectionHeader('🔐 Permissions')}
        <div class="ps-perms-grid">
          ${_permRow('View employee records',   true)}
          ${_permRow('Edit employee data',      isWriter)}
          ${_permRow('Delete records',          typeof canDeleteRecords === 'function' ? canDeleteRecords() : false)}
          ${_permRow('View sensitive fields',   typeof canViewSensitive === 'function' ? canViewSensitive() : false)}
          ${_permRow('Export to Excel',         typeof canViewSensitive === 'function' ? canViewSensitive() : false)}
          ${_permRow('Manage role passwords',   isOwner)}
        </div>
        ${isOwner ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="openPwManager()">🔑 Manage Role Passwords</button>` : ''}
      </div>

      <!-- ── Table columns ── -->
      <div class="ps-section">
        ${Components.sectionHeader('📋 Visible Table Columns', `<button class="btn btn-ghost btn-sm" onclick="_settingsResetCols()">Reset defaults</button>`)}
        <div class="ps-cols-grid" id="ps-cols-grid">
          ${(typeof TABLE_COLUMNS !== 'undefined' ? TABLE_COLUMNS : []).map(col => `
            <label class="ps-col-row ${col.always ? 'always' : ''}">
              <input type="checkbox"
                     ${col.always ? 'disabled checked' : ''}
                     ${!col.always && typeof visibleCols !== 'undefined' && visibleCols.has(col.key) ? 'checked' : ''}
                     onchange="_settingsToggleCol('${esc(col.key)}', this.checked)"
              />
              <span class="ps-col-label">${esc(col.label)}</span>
              ${col.always ? '<span class="ps-col-tag">Always</span>' : ''}
            </label>`).join('')}
        </div>
      </div>

      <!-- ── Page size ── -->
      <div class="ps-section">
        ${Components.sectionHeader('📄 Rows Per Page')}
        <div class="ps-card ps-psize-card">
          <span class="ps-psize-label">Show this many rows per page in employee tables:</span>
          <div class="ps-psize-options" id="ps-psize-options">
            ${[25, 50, 100].map(n => `
              <button class="ps-psize-btn ${(typeof pageSize !== 'undefined' && pageSize === n) ? 'active' : ''}"
                      onclick="_settingsSetPageSize(${n})">${n}</button>`).join('')}
          </div>
        </div>
      </div>

      <!-- ── About ── -->
      <div class="ps-section">
        ${Components.sectionHeader('ℹ️ About')}
        <div class="ps-card">
          <div class="ps-about-row"><span class="ps-about-label">App</span><span class="ps-about-val">Infinix HR Employee Database</span></div>
          <div class="ps-about-row"><span class="ps-about-label">Router version</span><span class="ps-about-val">1.0 (hash routing)</span></div>
          <div class="ps-about-row"><span class="ps-about-label">Data source</span><span class="ps-about-val">Google Sheets (live sync)</span></div>
        </div>
      </div>

    </div>`;

  _injectSettingsStyles();
}

// ── Helpers ─────────────────────────────────────────────────
function _roleDesc(role) {
  const desc = {
    owner:  'Full access — can edit, delete, export, and manage passwords.',
    hr:     'Can edit records and export data. Cannot manage passwords.',
    rssrsh: 'Can view and edit assigned records. No sensitive fields.',
    viewer: 'Read-only access.',
  };
  return desc[role] || 'Limited access.';
}

function _permRow(label, allowed) {
  return `
    <div class="ps-perm-row ${allowed ? 'yes' : 'no'}">
      <span class="ps-perm-icon">${allowed ? '✓' : '✗'}</span>
      <span class="ps-perm-label">${esc(label)}</span>
    </div>`;
}

function _settingsToggleCol(key, checked) {
  if (typeof visibleCols === 'undefined') return;
  if (checked) visibleCols.add(key); else visibleCols.delete(key);
  // Persist via localStorage to survive page reload
  localStorage.setItem('hr_visible_cols', JSON.stringify([...visibleCols]));
}

function _settingsResetCols() {
  if (typeof TABLE_COLUMNS === 'undefined' || typeof visibleCols === 'undefined') return;
  visibleCols = new Set(TABLE_COLUMNS.map(c => c.key));
  localStorage.removeItem('hr_visible_cols');
  // Re-render checkboxes
  const grid = document.getElementById('ps-cols-grid');
  if (!grid) return;
  TABLE_COLUMNS.forEach(col => {
    const cb = grid.querySelector(`input[onchange*="${col.key}"]`);
    if (cb && !col.always) cb.checked = true;
  });
}

function _settingsSetPageSize(n) {
  if (typeof changePageSize === 'function') changePageSize(n);
  else if (typeof pageSize !== 'undefined') { pageSize = n; }
  // Update button states
  document.querySelectorAll('.ps-psize-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.textContent) === n);
  });
}

// ── Styles ──────────────────────────────────────────────────
function _injectSettingsStyles() {
  if (document.getElementById('page-settings-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-settings-styles';
  s.textContent = `
    .ps-wrap { padding: 20px 24px; max-width: 760px; display: flex; flex-direction: column; gap: 24px; }
    .ps-section { display: flex; flex-direction: column; gap: 10px; }
    .ps-card { background: var(--card, var(--bg2)); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }

    /* Session card */
    .ps-session-card { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .ps-session-info { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .ps-session-name { font-size: 14px; font-weight: 600; color: var(--text1); }
    .ps-session-email { font-size: 12px; color: var(--text3); }
    .ps-session-role { display: flex; flex-direction: column; gap: 4px; }
    .ps-role-badge {
      font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
      text-transform: uppercase; letter-spacing: .5px; width: fit-content;
    }
    .ps-role-owner  { background: rgba(255,215,64,.15); color: #FFD740; border: 1px solid rgba(255,215,64,.3); }
    .ps-role-hr     { background: rgba(0,200,170,.12); color: var(--accent); border: 1px solid rgba(0,200,170,.3); }
    .ps-role-rssrsh { background: rgba(100,181,246,.12); color: #64B5F6; border: 1px solid rgba(100,181,246,.3); }
    .ps-role-viewer { background: rgba(150,150,150,.12); color: var(--text3); border: 1px solid var(--border); }
    .ps-role-none   { background: var(--bg3); color: var(--text3); border: 1px solid var(--border); }
    .ps-role-desc   { font-size: 11.5px; color: var(--text3); max-width: 260px; }

    /* Permissions grid */
    .ps-perms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .ps-perm-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 7px; border: 1px solid var(--border); background: var(--card, var(--bg2)); }
    .ps-perm-row.yes { border-color: rgba(0,230,118,.2); background: rgba(0,230,118,.04); }
    .ps-perm-row.no  { opacity: .55; }
    .ps-perm-icon { font-size: 13px; width: 18px; text-align: center; }
    .ps-perm-row.yes .ps-perm-icon { color: var(--success); }
    .ps-perm-row.no  .ps-perm-icon { color: var(--danger); }
    .ps-perm-label { font-size: 12.5px; color: var(--text1); }

    /* Columns grid */
    .ps-cols-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .ps-col-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--card, var(--bg2)); cursor: pointer; }
    .ps-col-row.always { opacity: .6; cursor: default; }
    .ps-col-row input[type=checkbox] { accent-color: var(--accent); }
    .ps-col-label { font-size: 12px; color: var(--text1); flex: 1; }
    .ps-col-tag { font-size: 10px; color: var(--text3); padding: 1px 6px; border: 1px solid var(--border); border-radius: 10px; }

    /* Page size */
    .ps-psize-card { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .ps-psize-label { font-size: 12.5px; color: var(--text2); flex: 1; }
    .ps-psize-options { display: flex; gap: 6px; }
    .ps-psize-btn {
      padding: 6px 18px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--bg3); color: var(--text2); font-size: 13px; cursor: pointer;
      transition: all .15s;
    }
    .ps-psize-btn:hover { border-color: var(--accent); color: var(--accent); }
    .ps-psize-btn.active { background: var(--accent); border-color: var(--accent); color: #000; font-weight: 700; }

    /* About */
    .ps-about-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .ps-about-row:last-child { border-bottom: none; }
    .ps-about-label { font-size: 11.5px; color: var(--text3); min-width: 130px; }
    .ps-about-val { font-size: 12.5px; color: var(--text1); }

    @media (max-width: 700px) {
      .ps-perms-grid { grid-template-columns: 1fr; }
      .ps-cols-grid { grid-template-columns: 1fr 1fr; }
      .ps-session-card { flex-direction: column; align-items: flex-start; }
    }
  `;
  document.head.appendChild(s);
}
