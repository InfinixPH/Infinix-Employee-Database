// ============================================================
// page-profile.js — Full-page employee profile
// Hero · Tabs: Employment / Personal / Gov IDs / Requirements / History
// ============================================================
'use strict';

let _profileEmpId  = null;
let _profileTabKey = 'employment';

function renderProfilePage(id) {
  _profileEmpId = id;

  const emp = employees.find(e => String(e.infinixId) === String(id));
  if (!emp) {
    document.getElementById('content').innerHTML =
      Components.emptyState({ icon: '🔍', title: 'Employee not found', message: `No record with ID ${esc(id)}` });
    return;
  }

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim();

  const statusColor = { Active:'var(--success)', Floating:'#FFD740', Resigned:'#FFAB40', AWOL:'var(--danger)', Terminated:'#CE93D8', Backout:'#FF7043' }[emp.status] || 'var(--text3)';
  const fullName    = emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim();

  // Completion metrics
  const reqDone  = REQUIREMENT_FIELDS.filter(([k]) => emp[k]).length;
  const reqTotal = REQUIREMENT_FIELDS.length;
  const reqPct   = Math.round(reqDone / reqTotal * 100);

  const profileChecks = [
    { label: 'Employment Status', done: !!emp.status && emp.status !== '-' },
    { label: 'Deployment Status', done: emp.deploymentStatus === 'DEPLOYED' },
    { label: 'QR Scanned',        done: emp.qrStatus === 'SCANNED' },
    { label: 'Contract Sent',     done: emp.contractStatus === 'SENT' },
    { label: 'Mobile Number',     done: !isMissing(emp.mobile) },
    { label: 'Email Address',     done: !isMissing(emp.email) },
    { label: 'SSS Number',        done: !isMissing(emp.sss) },
    { label: 'PhilHealth',        done: !isMissing(emp.philhealth) },
    { label: 'Pag-IBIG',          done: !isMissing(emp.pagibig) },
    { label: 'Bank Account',      done: !isMissing(emp.bankAccount) },
  ];
  const profPct = Math.round(profileChecks.filter(c => c.done).length / profileChecks.length * 100);

  // Birthday banner
  let bdayBanner = '';
  if (emp.dob) {
    const bd = new Date(emp.dob); const now = new Date();
    if (!isNaN(bd)) {
      const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
      const diff = Math.round((thisYear - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      if (diff === 0) bdayBanner = `<div class="pp-bday-banner warn">🎉 Birthday today! Happy Birthday, ${esc(emp.firstName || '!')}!</div>`;
      else if (diff > 0 && diff <= 7) bdayBanner = `<div class="pp-bday-banner info">🎂 Birthday in ${diff} day${diff !== 1 ? 's' : ''}</div>`;
    }
  }

  document.getElementById('content').innerHTML = `
    <div class="pp-wrap">

      <!-- HERO -->
      <div class="pp-hero">
        <div class="pp-hero-left">
          ${Components.avatar(fullName, 72, statusColor)}
          <div class="pp-hero-info">
            <div class="pp-hero-name">${esc(fullName)}</div>
            <div class="pp-hero-id">${esc(emp.infinixId || 'No ID assigned')}</div>
            <div class="pp-hero-badges">
              ${badgeHTML(emp.status)}
              ${emp.deploymentStatus ? badgeHTML(emp.deploymentStatus, emp.deploymentStatus.replace(/ /g, '-')) : ''}
              ${emp.qrStatus === 'SCANNED' ? `<span class="badge b-SCANNED">QR ✓</span>` : ''}
            </div>
            <div class="pp-hero-meta">
              ${emp.region ? `<span>📍 ${esc(emp.region)}</span>` : ''}
              ${emp.storeAssignment ? `<span>🏪 ${esc(emp.storeAssignment)}</span>` : ''}
              ${emp.rssName ? `<span>👤 ${esc(emp.rssName)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="pp-hero-right">
          <div class="pp-completion">
            ${Components.progressBar(profPct, { label: 'Profile', showPct: true })}
            ${Components.progressBar(reqPct, { label: 'Requirements', showPct: true })}
          </div>
          <div class="pp-hero-actions">
            ${canWrite() ? `<button class="btn btn-ghost btn-sm" onclick="openEditModal('${esc(emp.infinixId)}')">✏ Edit</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="Router.go('people')">← Back</button>
          </div>
        </div>
      </div>

      ${bdayBanner}

      <!-- TABS -->
      ${Components.tabBar([
        { key: 'employment',  label: 'Employment',    icon: '💼' },
        { key: 'personal',    label: 'Personal',      icon: '👤' },
        { key: 'govids',      label: 'Gov IDs',       icon: '🏛' },
        { key: 'requirements',label: 'Requirements',  icon: '📋', badge: reqDone < reqTotal ? (reqTotal - reqDone) : undefined },
        { key: 'history',     label: 'History',       icon: '🕐' },
      ], _profileTabKey, 'switchProfileTab')}

      <!-- TAB PANES -->
      <div id="pp-pane-employment" class="pp-pane ${_profileTabKey === 'employment' ? 'active' : ''}">
        ${_paneEmployment(emp)}
      </div>
      <div id="pp-pane-personal" class="pp-pane ${_profileTabKey === 'personal' ? 'active' : ''}">
        ${_panePersonal(emp)}
      </div>
      <div id="pp-pane-govids" class="pp-pane ${_profileTabKey === 'govids' ? 'active' : ''}">
        ${_paneGovIds(emp)}
      </div>
      <div id="pp-pane-requirements" class="pp-pane ${_profileTabKey === 'requirements' ? 'active' : ''}">
        ${_paneRequirements(emp, reqDone, reqTotal, reqPct)}
      </div>
      <div id="pp-pane-history" class="pp-pane ${_profileTabKey === 'history' ? 'active' : ''}">
        ${_paneHistory(emp)}
      </div>

    </div>`;

  // Lazy load audit trail
  if (_profileTabKey === 'history') {
    _loadAuditTrail(emp.infinixId);
  }

  _injectProfileStyles();
}

// ── Tab switching ───────────────────────────────────────────
function switchProfileTab(key) {
  _profileTabKey = key;
  document.querySelectorAll('.comp-tab').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick')?.includes(`'${key}'`));
  });
  document.querySelectorAll('.pp-pane').forEach(el => el.classList.remove('active'));
  const pane = document.getElementById(`pp-pane-${key}`);
  if (pane) pane.classList.add('active');

  if (key === 'history' && _profileEmpId) {
    _loadAuditTrail(_profileEmpId);
  }
}

// ── Pane: Employment ────────────────────────────────────────
function _paneEmployment(e) {
  const row = (label, val) => `
    <div class="pp-field">
      <div class="pp-field-label">${esc(label)}</div>
      <div class="pp-field-val ${val ? '' : 'muted'}">${val || '—'}</div>
    </div>`;
  return `
    <div class="pp-grid">
      ${row('Employment Status', badgeHTML(e.status))}
      ${row('Deployment Status', e.deploymentStatus ? badgeHTML(e.deploymentStatus, e.deploymentStatus.replace(/ /g, '-')) : '')}
      ${row('Deployment Date', esc(e.deploymentDate))}
      ${row('QR Scan Status', badgeHTML(e.qrStatus || 'NOT SCANNED', (e.qrStatus || 'NOT SCANNED').replace(/ /g, '-')))}
      ${row('Contract Status', badgeHTML(e.contractStatus || 'NOT YET SENT', (e.contractStatus || 'NOT YET SENT').replace(/ /g, '-')))}
      ${row('Contract Sent Date', esc(e.contractSentDate))}
      ${row('Status Effective Date', esc(e.statusDate))}
      ${row('Status Remarks', esc(e.statusRemarks))}
      ${row('Region', esc(e.region))}
      ${row('Store Assignment', esc(e.storeAssignment))}
      ${row('Store ID', esc(e.storeId))}
      ${row('RSS Name', esc(e.rssName))}
      ${row('RSS ID', esc(e.rssId))}
      ${row('Last Updated', esc(e.lastUpdated))}
    </div>
    <div class="pp-notes-section">
      <div class="pp-field-label" style="margin-bottom:6px">📝 Notes</div>
      <textarea class="pp-notes-area" id="pp-notes-area" placeholder="Add notes…">${esc(e.notes || '')}</textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:6px">
        <button class="btn btn-ghost btn-sm" onclick="saveNotes('${esc(e.infinixId)}', document.getElementById('pp-notes-area').value)">💾 Save Notes</button>
      </div>
    </div>`;
}

// ── Pane: Personal ──────────────────────────────────────────
function _panePersonal(e) {
  const row  = (label, val) => `<div class="pp-field"><div class="pp-field-label">${esc(label)}</div><div class="pp-field-val ${val ? '' : 'muted'}">${val || '—'}</div></div>`;
  const sens = (label, val) => `<div class="pp-field"><div class="pp-field-label">${esc(label)}</div><div class="pp-field-val sensitive ${val ? '' : 'muted'}">${val || '—'}</div></div>`;
  return `
    <div class="pp-grid">
      ${row('Full Name',      esc(e.fullName))}
      ${row('First Name',     esc(e.firstName))}
      ${row('Last Name',      esc(e.lastName))}
      ${row('Middle Name',    esc(e.middleName))}
      ${row('Gender',         esc(e.gender))}
      ${row('Marital Status', esc(e.maritalStatus))}
      ${sens('Date of Birth', esc(e.dob))}
      ${sens('Mobile No.',    esc(e.mobile))}
      ${sens('Email',         esc(e.email))}
    </div>
    <div class="pp-field pp-field-full" style="margin-top:8px">
      <div class="pp-field-label">Address</div>
      <div class="pp-field-val sensitive ${e.address ? '' : 'muted'}">${e.address ? esc(e.address) : '—'}</div>
    </div>`;
}

// ── Pane: Gov IDs ───────────────────────────────────────────
function _paneGovIds(e) {
  const idRow = (label, val) => {
    const missing = !val || String(val).trim() === '';
    return `
      <div class="pp-id-card ${missing ? 'missing' : ''}">
        <div class="pp-id-label">${esc(label)}</div>
        <div class="pp-id-val sensitive ${missing ? 'muted' : ''}">${missing ? '⚠ Missing' : esc(val)}</div>
      </div>`;
  };
  const payRow = (label, val) => {
    const missing = !val || String(val).trim() === '';
    return `
      <div class="pp-id-card ${missing ? 'missing' : ''}">
        <div class="pp-id-label">${esc(label)}</div>
        <div class="pp-id-val sensitive ${missing ? 'muted' : ''}">${missing ? '⚠ Missing' : esc(val)}</div>
      </div>`;
  };
  return `
    <div class="pp-ids-section">
      <div class="pp-section-label">Government IDs</div>
      <div class="pp-ids-grid">
        ${idRow('SSS Number', e.sss)}
        ${idRow('PhilHealth Number', e.philhealth)}
        ${idRow('Pag-IBIG Number', e.pagibig)}
        ${idRow('TIN Number', e.tin)}
      </div>
    </div>
    <div class="pp-ids-section" style="margin-top:16px">
      <div class="pp-section-label">Payroll</div>
      <div class="pp-ids-grid">
        ${payRow('Basic Wage Rate', e.basicWage ? '₱' + Number(e.basicWage).toLocaleString() : '')}
        ${payRow('Bank Name', e.bankName)}
        ${payRow('Bank Account Number', e.bankAccount)}
      </div>
    </div>`;
}

// ── Pane: Requirements ──────────────────────────────────────
function _paneRequirements(e, reqDone, reqTotal, reqPct) {
  return `
    <div class="pp-req-summary">
      <div class="pp-req-pct-big" style="color:${reqPct===100?'var(--success)':reqPct>=60?'var(--warning)':'var(--danger)'}">${reqPct}%</div>
      <div class="pp-req-sub">${reqDone} of ${reqTotal} requirements submitted</div>
      ${Components.progressBar(reqPct, { showPct: false })}
    </div>
    <div class="pp-req-list">
      ${REQUIREMENT_FIELDS.map(([k, label]) => `
        <div class="pp-req-item ${e[k] ? 'done' : 'miss'}">
          <span class="pp-req-check">${e[k] ? '✓' : '✗'}</span>
          <span class="pp-req-label">${esc(label)}</span>
        </div>`).join('')}
    </div>`;
}

// ── Pane: History ───────────────────────────────────────────
function _paneHistory(e) {
  return `
    <div id="pp-audit-container">
      <div style="font-size:12px;color:var(--text3);padding:12px 0">Loading history…</div>
    </div>`;
}

function _loadAuditTrail(id) {
  const container = document.getElementById('pp-audit-container');
  if (!container) return;

  const render = (entries) => {
    if (!entries.length) {
      container.innerHTML = Components.emptyState({ icon: '🕐', title: 'No history yet', message: 'Changes to this employee will appear here.' });
      return;
    }
    container.innerHTML = `<div class="pp-timeline">` +
      entries.map((row, i) => Components.timelineItem({
        time:    row[0] ? new Date(row[0]).toLocaleString('en-PH') : '—',
        actor:   row[6] || 'System',
        action:  row[3] || 'Updated',
        detail:  [row[4] && row[5] ? `${row[4]} → ${row[5]}` : '', row[7] || ''].filter(Boolean).join(' · '),
        isFirst: i === 0,
        isLast:  i === entries.length - 1,
      })).join('') +
    `</div>`;
  };

  // Use cache if available
  if (logCache) {
    const entries = logCache.filter(r => String(r[1]) === String(id)).reverse();
    render(entries);
    return;
  }

  gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H` })
    .then(r => {
      logCache = r.result.values || [];
      const entries = logCache.filter(row => String(row[1]) === String(id)).reverse();
      render(entries);
    })
    .catch(() => {
      if (container) container.innerHTML = Components.emptyState({ icon: '⚠️', title: 'Could not load history' });
    });
}

// ── Styles ──────────────────────────────────────────────────
function _injectProfileStyles() {
  if (document.getElementById('page-profile-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-profile-styles';
  s.textContent = `
    .pp-wrap { padding: 20px 24px; max-width: 960px; display: flex; flex-direction: column; gap: 0; }

    /* Hero */
    .pp-hero {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 20px; padding: 20px; background: var(--card, var(--bg2));
      border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .pp-hero-left { display: flex; align-items: flex-start; gap: 16px; flex: 1; min-width: 0; }
    .pp-hero-info { flex: 1; min-width: 0; }
    .pp-hero-name { font-size: 20px; font-weight: 700; color: var(--text1); margin-bottom: 2px; }
    .pp-hero-id { font-size: 12px; color: var(--accent); font-weight: 600; margin-bottom: 8px; letter-spacing: .5px; }
    .pp-hero-badges { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
    .pp-hero-meta { display: flex; gap: 12px; flex-wrap: wrap; }
    .pp-hero-meta span { font-size: 11.5px; color: var(--text3); }
    .pp-hero-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    .pp-completion { display: flex; flex-direction: column; gap: 6px; min-width: 180px; }
    .pp-hero-actions { display: flex; gap: 6px; }

    /* Birthday banner */
    .pp-bday-banner { padding: 8px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; }
    .pp-bday-banner.warn { background: rgba(245,200,66,.1); border: 1px solid rgba(245,200,66,.3); color: var(--warning); }
    .pp-bday-banner.info { background: rgba(0,200,170,.06); border: 1px solid var(--border); color: var(--accent); }

    /* Panes */
    .pp-pane { display: none; }
    .pp-pane.active { display: block; }

    /* Field grid */
    .pp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
    .pp-field { padding: 11px 14px; background: var(--card, var(--bg2)); }
    .pp-field-full { grid-column: 1 / -1; }
    .pp-field-label { font-size: 10.5px; color: var(--text3); font-weight: 500; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 3px; }
    .pp-field-val { font-size: 13px; color: var(--text1); }
    .pp-field-val.muted { color: var(--text3); font-style: italic; }
    .pp-field-val.sensitive { filter: blur(3.5px); transition: filter .2s; cursor: pointer; }
    .pp-field-val.sensitive:hover, .pp-field-val.sensitive:focus { filter: none; }

    /* Notes */
    .pp-notes-section { margin-top: 4px; }
    .pp-notes-area {
      width: 100%; min-height: 80px; background: var(--bg2); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px; color: var(--text1); font-size: 12.5px;
      resize: vertical; font-family: inherit;
    }
    .pp-notes-area:focus { outline: none; border-color: var(--accent); }

    /* Gov ID cards */
    .pp-ids-section { }
    .pp-section-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; }
    .pp-ids-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .pp-id-card { padding: 12px 14px; background: var(--card, var(--bg2)); border: 1px solid var(--border); border-radius: 8px; }
    .pp-id-card.missing { border-color: rgba(229,57,53,.3); background: rgba(229,57,53,.04); }
    .pp-id-label { font-size: 10.5px; color: var(--text3); text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
    .pp-id-val { font-size: 13.5px; color: var(--text1); font-weight: 500; }
    .pp-id-val.muted { color: var(--danger); font-size: 12px; font-style: italic; font-weight: 400; }
    .pp-id-val.sensitive { filter: blur(3px); cursor: pointer; transition: filter .2s; }
    .pp-id-val.sensitive:hover { filter: none; }

    /* Requirements */
    .pp-req-summary { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px; margin-bottom: 16px; }
    .pp-req-pct-big { font-size: 48px; font-weight: 800; line-height: 1; }
    .pp-req-sub { font-size: 13px; color: var(--text3); }
    .pp-req-list { display: flex; flex-direction: column; gap: 6px; }
    .pp-req-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card, var(--bg2)); }
    .pp-req-item.done { border-color: rgba(0,230,118,.25); background: rgba(0,230,118,.04); }
    .pp-req-item.miss { border-color: rgba(229,57,53,.2); background: rgba(229,57,53,.03); }
    .pp-req-check { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
    .pp-req-item.done .pp-req-check { color: var(--success); }
    .pp-req-item.miss .pp-req-check { color: var(--danger); }
    .pp-req-label { font-size: 12.5px; color: var(--text1); }

    /* Timeline */
    .pp-timeline { padding: 4px 0; }

    @media (max-width: 720px) {
      .pp-hero { flex-direction: column; }
      .pp-hero-right { align-items: flex-start; width: 100%; }
      .pp-grid { grid-template-columns: 1fr; }
      .pp-ids-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(s);
}
