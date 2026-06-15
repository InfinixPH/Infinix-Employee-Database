// ============================================================
// page-home.js — Home page  v2.0  (redesigned)
// ============================================================
'use strict';

const EVENTS_SHEET = 'Events';
let _calEventsCache = null;

// ============================================================
// MAIN RENDER
// ============================================================
function renderHome() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = '';

  if (typeof employees === 'undefined' || typeof getStats === 'undefined') {
    document.getElementById('content').innerHTML =
      '<div style="padding:60px;text-align:center;color:var(--text-tertiary)">Loading…</div>';
    return;
  }

  const s           = getStats();
  const total       = employees.length;
  const active      = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
                        normalizeDeployStatus(e.deploymentStatus) !== 'BACKOUT').length;
  const deployed    = employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'DEPLOYED').length;
  const missingReqs = employees.filter(e => !requirementsComplete(e)).length;
  const attendance  = employees.filter(e => normalizeStatus(e.status) === 'Active').length;
  const compliance  = total > 0 ? Math.round(((total - missingReqs) / total) * 100) : 100;
  const activeRate  = total > 0 ? Math.round((active / total) * 100) : 0;
  const deployRate  = active > 0 ? Math.round((deployed / active) * 100) : 0;
  const retentionPct= total > 0 ? Math.round((active / total) * 100) : 0;
  const attendRate  = total > 0 ? Math.round((attendance / total) * 100) : 0;
  const healthScore = Math.round((compliance + activeRate + deployRate) / 3);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = currentUser?.name?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';

  const bdayToday = (typeof getBirthdaysToday === 'function') ? getBirthdaysToday() : [];

  const missingMedCert = employees.filter(e => {
    const r = e.requirements || e.docs || {};
    return !r.medicalCertificate && !r.medCert && !(e.medicalCertificate);
  }).length;
  const govIdPending = employees.filter(e => {
    const r = e.requirements || e.docs || {};
    return !r.governmentId && !r.govId && !(e.governmentId);
  }).length;
  const notDeployed = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
    normalizeDeployStatus(e.deploymentStatus) !== 'DEPLOYED').length;

  const recentItems = _buildRecentList(5);

  // ── Today's date label ──────────────────────────────────
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  document.getElementById('content').innerHTML = `
<div class="ph2-wrap">

  <!-- ═══════════════════════════════════════════
       HERO
  ═══════════════════════════════════════════ -->
  <div class="ph2-hero">

    <!-- Left: greeting + kpi pills -->
    <div class="ph2-hero-left">
      <div class="ph2-hero-eye">
        <span class="ph2-hero-dot"></span>${esc(dateLabel)}
      </div>
      <h1 class="ph2-hero-h1">${esc(greeting)}, <span class="ph2-hero-name">${esc(userName)}</span> 👋</h1>
      <p class="ph2-hero-sub">Here's your workforce snapshot for today.</p>

      <div class="ph2-kpi-row">
        <div class="ph2-kpi" onclick="Router.go('people')" title="Total employees">
          <div class="ph2-kpi-val">${total}</div>
          <div class="ph2-kpi-lbl">Total</div>
        </div>
        <div class="ph2-kpi-sep"></div>
        <div class="ph2-kpi ph2-kpi-green" onclick="filterByStatus('Active');Router.go('people')" title="Active employees">
          <div class="ph2-kpi-val">${active}</div>
          <div class="ph2-kpi-lbl">Active</div>
        </div>
        <div class="ph2-kpi-sep"></div>
        <div class="ph2-kpi ph2-kpi-blue" title="Deployed">
          <div class="ph2-kpi-val">${deployed}</div>
          <div class="ph2-kpi-lbl">Deployed</div>
        </div>
        <div class="ph2-kpi-sep"></div>
        <div class="ph2-kpi ph2-kpi-amber" title="Compliance rate">
          <div class="ph2-kpi-val">${compliance}%</div>
          <div class="ph2-kpi-lbl">Compliance</div>
        </div>
        ${bdayToday.length > 0 ? `
        <div class="ph2-kpi-sep"></div>
        <div class="ph2-kpi ph2-kpi-purple" onclick="viewAllBirthdays()" title="Birthdays today">
          <div class="ph2-kpi-val">${bdayToday.length}</div>
          <div class="ph2-kpi-lbl">Birthday${bdayToday.length !== 1 ? 's' : ''} 🎂</div>
        </div>` : ''}
      </div>

      <div class="ph2-hero-actions">
        <button class="ph2-btn-primary" onclick="Router.go('people')">
          <i data-lucide="users" style="width:14px;height:14px"></i> Employee Directory
        </button>
        ${canWrite() ? `<button class="ph2-btn-ghost" onclick="openAddModal()">
          <i data-lucide="user-plus" style="width:14px;height:14px"></i> Add Employee
        </button>` : ''}
        <button class="ph2-btn-ghost" onclick="Router.go('analytics')">
          <i data-lucide="bar-chart-2" style="width:14px;height:14px"></i> Analytics
        </button>
      </div>
    </div>

    <!-- Right: health ring + sparklines -->
    <div class="ph2-hero-right">
      <div class="ph2-health-ring-wrap">
        <svg class="ph2-ring-svg" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ph2-ring-track)" stroke-width="9"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="9"
            stroke-dasharray="${(2 * Math.PI * 50 * healthScore / 100).toFixed(1)} ${(2 * Math.PI * 50).toFixed(1)}"
            stroke-linecap="round" transform="rotate(-90 60 60)"
            style="transition:stroke-dasharray 1s ease"/>
        </svg>
        <div class="ph2-ring-center">
          <div class="ph2-ring-pct">${healthScore}<span class="ph2-ring-unit">%</span></div>
          <div class="ph2-ring-lbl">Workforce<br>Health</div>
        </div>
      </div>

      <div class="ph2-hero-mini-stats">
        ${_phMiniBar('Active Rate', active, total, activeRate, 'var(--success)')}
        ${_phMiniBar('Deploy Rate', deployed, active, deployRate, '#378ADD')}
        ${_phMiniBar('Compliance', total - missingReqs, total, compliance, '#a78bfa')}
      </div>
    </div>

  </div>

  <!-- ═══════════════════════════════════════════
       ROW 1: 4 stat cards
  ═══════════════════════════════════════════ -->
  <div class="ph2-stat-row">
    ${_phStatCard('users', 'Total Employees', total, null, "Router.go('people')", '#378ADD')}
    ${_phStatCard('user-check', 'Active', active, activeRate + '%', "filterByStatus('Active');Router.go('people')", 'var(--success)')}
    ${_phStatCard('map-pin', 'Deployed', deployed, deployRate + '%', "Router.go('tracker')", '#a78bfa')}
    ${_phStatCard('shield-check', 'Compliance', compliance + '%', missingReqs + ' missing', "missingFieldFilter='requirements';Router.go('people')", '#f59e0b')}
  </div>

  <!-- ═══════════════════════════════════════════
       ROW 2: Celebrants | Action Center | Upcoming Events
  ═══════════════════════════════════════════ -->
  <div class="ph2-row3">

    <!-- Today's Celebrants -->
    <div class="ph2-card">
      <div class="ph2-card-hd">
        <div class="ph2-card-title">
          <span class="ph2-card-icon" style="background:rgba(245,200,66,.12);color:#f5c842">🎂</span>
          Celebrants
        </div>
        <button class="ph2-card-link" onclick="viewAllBirthdays()">View all</button>
      </div>
      <div id="ph-bday-wrap">${_renderHomeBdayTabs()}</div>
    </div>

    <!-- Action Center -->
    <div class="ph2-card">
      <div class="ph2-card-hd">
        <div class="ph2-card-title">
          <span class="ph2-card-icon" style="background:rgba(248,113,113,.12);color:#f87171">
            <i data-lucide="zap" style="width:13px;height:13px"></i>
          </span>
          Action Center
        </div>
        <button class="ph2-card-link" onclick="missingFieldFilter='requirements';Router.go('people')">View all</button>
      </div>
      <div class="ph2-action-list">
        ${_phAction('file-x','Missing Med Certs', missingMedCert || missingReqs, 'red', "missingFieldFilter='requirements';Router.go('people')")}
        ${_phAction('id-card','Gov IDs Pending', govIdPending || Math.max(0,missingReqs-2), 'orange', "missingFieldFilter='requirements';Router.go('people')")}
        ${_phAction('file-warning','Contracts Expiring', 7, 'yellow', "Router.go('tracker')")}
        ${_phAction('map-pin','Not Yet Deployed', notDeployed, 'teal', "Router.go('tracker')")}
        ${_phAction('cake','Birthdays Today', bdayToday.length, 'purple', 'viewAllBirthdays()')}
      </div>
    </div>

    <!-- Upcoming Events -->
    <div class="ph2-card">
      <div class="ph2-card-hd">
        <div class="ph2-card-title">
          <span class="ph2-card-icon" style="background:rgba(55,138,221,.12);color:#378ADD">
            <i data-lucide="calendar-clock" style="width:13px;height:13px"></i>
          </span>
          Upcoming Events
        </div>
        <button class="ph2-card-link" onclick="_phScrollToCalendar()">Calendar →</button>
      </div>
      <div id="ph-events-list">
        <div class="ph2-loading-text">Loading…</div>
      </div>
    </div>

  </div>

  <!-- ═══════════════════════════════════════════
       ROW 3: Calendar + Recent Activity
  ═══════════════════════════════════════════ -->
  <div class="ph2-row-cal" id="ph-cal-section">

    <!-- Calendar -->
    <div class="ph2-card ph2-cal-card">
      <div class="ph2-card-hd">
        <div class="ph2-card-title">
          <span class="ph2-card-icon" style="background:var(--accent-dim);color:var(--accent)">
            <i data-lucide="calendar" style="width:13px;height:13px"></i>
          </span>
          <span id="ph-cal-label">Calendar</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${canViewSensitive() ? `<button class="ph2-cal-add-btn" onclick="_phOpenAddEvent()" title="Add event">
            <i data-lucide="plus" style="width:12px;height:12px"></i> Add
          </button>` : ''}
          <button class="ph2-cal-nav" onclick="_phCalPrev()"><i data-lucide="chevron-left" style="width:13px;height:13px"></i></button>
          <button class="ph2-cal-nav" onclick="_phCalNext()"><i data-lucide="chevron-right" style="width:13px;height:13px"></i></button>
        </div>
      </div>
      <div id="ph-calendar"></div>
      <div id="ph-cal-popover" class="ph2-cal-popover" style="display:none"></div>
      <div class="ph2-cal-legend">
        <span class="ph2-leg-item"><span class="ph2-leg-dot" style="background:var(--accent)"></span>HR Event</span>
        <span class="ph2-leg-item"><span class="ph2-leg-dot" style="background:#f5c842"></span>Birthday</span>
      </div>
    </div>

    <!-- Recent Activity + Status Breakdown -->
    <div class="ph2-card ph2-recent-card">
      <div class="ph2-card-hd">
        <div class="ph2-card-title">
          <span class="ph2-card-icon" style="background:rgba(0,200,170,.10);color:var(--accent)">
            <i data-lucide="activity" style="width:13px;height:13px"></i>
          </span>
          Recent Activity
        </div>
        <button class="ph2-card-link" onclick="Router.go('log')">View all →</button>
      </div>

      <div id="ph-recent-list">
        ${recentItems.length
          ? recentItems.map(r => _phRecentItem(r)).join('')
          : `<div class="ph2-empty"><i data-lucide="activity" style="width:28px;height:28px;opacity:.2"></i><span>No recent activity</span></div>`}
      </div>

      <!-- Status Breakdown -->
      <div class="ph2-divider"></div>
      <div class="ph2-sub-title">
        <i data-lucide="pie-chart" style="width:12px;height:12px"></i> Status Breakdown
      </div>
      <div class="ph2-status-list">
        ${Object.entries(s).map(([st, count]) => `
          <div class="ph2-status-row" onclick="filterByStatus('${esc(st)}');Router.go('people')">
            <span class="ph2-status-dot" style="background:${STATUS_COLORS[st] || 'var(--text-tertiary)'}"></span>
            <span class="ph2-status-name">${esc(st)}</span>
            <span class="ph2-status-count">${count}</span>
            <div class="ph2-bar-wrap">
              <div class="ph2-bar-fill" style="width:${total ? Math.round(count/total*100) : 0}%;background:${STATUS_COLORS[st] || 'var(--text-tertiary)'}"></div>
            </div>
            <span class="ph2-status-pct">${total ? Math.round(count/total*100) : 0}%</span>
          </div>`).join('')}
      </div>
    </div>

  </div>

  <!-- ═══════════════════════════════════════════
       ROW 4: Quick Access
  ═══════════════════════════════════════════ -->
  <div class="ph2-card">
    <div class="ph2-card-hd">
      <div class="ph2-card-title">
        <span class="ph2-card-icon" style="background:rgba(139,92,246,.12);color:#a78bfa">
          <i data-lucide="grid-2x2" style="width:13px;height:13px"></i>
        </span>
        Quick Access
      </div>
      <button class="ph2-card-link" onclick="_phOpenQAEdit()">Customize</button>
    </div>
    <div class="ph2-qa-grid" id="ph-qa-grid"></div>
  </div>

</div>`;

  _injectHomeStyles();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  _qaRebuildGrid();
  _phLoadEventsAndRender();

  // Async: lazy-load recent activity
  if (!logCache) {
    gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H` })
      .then(r => {
        logCache = r.result.values || [];
        const el = document.getElementById('ph-recent-list');
        if (!el) return;
        const items = _buildRecentList(5);
        el.innerHTML = items.length
          ? items.map(r => _phRecentItem(r)).join('')
          : `<div class="ph2-empty"><i data-lucide="activity" style="width:28px;height:28px;opacity:.2"></i><span>No recent activity</span></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }).catch(() => {});
  }

  if (!announcementsCache || announcementsCache.length === 0) {
    if (typeof loadAnnouncements === 'function') {
      loadAnnouncements().then(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }).catch(() => {});
    }
  }
}

// ── Small helper renderers ────────────────────────────────

function _phMiniBar(label, val, max, pct, color) {
  return `<div class="ph2-mini-bar">
    <div class="ph2-mini-bar-top">
      <span class="ph2-mini-bar-lbl">${label}</span>
      <span class="ph2-mini-bar-pct" style="color:${color}">${pct}%</span>
    </div>
    <div class="ph2-mini-bar-track">
      <div class="ph2-mini-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <div class="ph2-mini-bar-vals">${val} / ${max}</div>
  </div>`;
}

function _phStatCard(icon, label, value, sub, onclick, color) {
  return `<div class="ph2-stat-card" onclick="${onclick}">
    <div class="ph2-sc-icon" style="background:${color}1a;color:${color}">
      <i data-lucide="${icon}" style="width:18px;height:18px"></i>
    </div>
    <div class="ph2-sc-body">
      <div class="ph2-sc-val">${value}</div>
      <div class="ph2-sc-lbl">${label}</div>
      ${sub ? `<div class="ph2-sc-sub">${sub}</div>` : ''}
    </div>
    <div class="ph2-sc-arr"><i data-lucide="arrow-up-right" style="width:14px;height:14px;opacity:.35"></i></div>
  </div>`;
}

function _phAction(icon, label, count, color, onclick) {
  const colorMap = {
    red:    ['rgba(248,113,113,.12)', '#f87171'],
    orange: ['rgba(251,146,60,.12)',  '#fb923c'],
    yellow: ['rgba(251,191,36,.12)',  '#fbbf24'],
    teal:   ['var(--accent-dim)',     'var(--accent)'],
    purple: ['rgba(167,139,250,.12)', '#a78bfa'],
  };
  const [bg, fg] = colorMap[color] || colorMap.teal;
  return `<div class="ph2-action-row" onclick="${onclick}">
    <div class="ph2-action-icon" style="background:${bg};color:${fg}">
      <i data-lucide="${icon}" style="width:13px;height:13px"></i>
    </div>
    <span class="ph2-action-lbl">${label}</span>
    <span class="ph2-action-badge" style="background:${bg};color:${fg}">${count}</span>
  </div>`;
}

function _phRecentItem(r) {
  return `<div class="ph2-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
    ${Components.avatar(r.name, 30)}
    <div class="ph2-recent-body">
      <div class="ph2-recent-name">${esc(r.name)}</div>
      <div class="ph2-recent-action">${esc(r.action)}</div>
    </div>
    <div class="ph2-recent-time">${esc(r.time)}</div>
  </div>`;
}

// ── Birthday tabs ─────────────────────────────────────────
function _renderHomeBdayTabs() {
  if (typeof getBirthdaysToday !== 'function')
    return '<div class="ph2-loading-text">Loading…</div>';
  const bdayToday = getBirthdaysToday();
  const bdayWeek  = (typeof getBirthdaysThisWeek  === 'function') ? getBirthdaysThisWeek()  : [];
  const bdayMonth = (typeof getBirthdaysThisMonth === 'function') ? getBirthdaysThisMonth() : [];

  return `
    <div class="ph2-bday-tabs">
      <button class="ph2-bday-tab active" onclick="_phBdayTab('today',this)">
        Today${bdayToday.length ? `<span class="ph2-tab-badge ph2-tab-warn">${bdayToday.length}</span>` : ''}
      </button>
      <button class="ph2-bday-tab" onclick="_phBdayTab('week',this)">
        Week${bdayWeek.length ? `<span class="ph2-tab-badge">${bdayWeek.length}</span>` : ''}
      </button>
      <button class="ph2-bday-tab" onclick="_phBdayTab('month',this)">
        Month${bdayMonth.length ? `<span class="ph2-tab-badge ph2-tab-dim">${bdayMonth.length}</span>` : ''}
      </button>
    </div>
    <div id="ph-bday-today" class="ph2-bday-pane">${_renderBdayList(bdayToday)}</div>
    <div id="ph-bday-week"  class="ph2-bday-pane" style="display:none">${_renderBdayList(bdayWeek)}</div>
    <div id="ph-bday-month" class="ph2-bday-pane" style="display:none">${_renderBdayList(bdayMonth)}</div>`;
}

function _phBdayTab(key, btn) {
  document.querySelectorAll('.ph2-bday-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['today','week','month'].forEach(k => {
    const el = document.getElementById(`ph-bday-${k}`);
    if (el) el.style.display = k === key ? '' : 'none';
  });
}

function _renderBdayList(list) {
  if (!list || !list.length) {
    return `<div class="ph2-empty">
      <i data-lucide="party-popper" style="width:24px;height:24px;opacity:.2"></i>
      <span>None to show</span>
    </div>`;
  }
  return list.map(item => {
    const emp  = item.emp  || item;
    const name = esc(emp.fullName || emp.name || '');
    const store = emp.storeAssignment ? esc(emp.storeAssignment) : '';
    const isToday = item.daysUntil === 0;
    const label   = isToday ? '🎉 Today!' : (item.daysUntil > 0 ? `in ${item.daysUntil}d` : `${Math.abs(item.daysUntil)}d ago`);
    return `
      <div class="ph2-bday-row" onclick="openDetailPanel('${esc(emp.infinixId || '')}')">
        ${Components.avatar(name, 28)}
        <div class="ph2-bday-info">
          <div class="ph2-bday-name">${name}</div>
          ${store ? `<div class="ph2-bday-store">${store}</div>` : ''}
        </div>
        <div class="ph2-bday-when${isToday ? ' ph2-bday-today' : ''}">${label}</div>
      </div>`;
  }).join('');
}

// ============================================================
// EVENTS — load, render, add, delete
// ============================================================
async function _phLoadEventsAndRender() {
  if (_calEventsCache !== null) {
    _phCalRender();
    _phRenderEventsList();
    return;
  }
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A2:F`
    });
    const rows = res.result.values || [];
    _calEventsCache = rows
      .filter(r => String(r[5] || 'TRUE').trim().toUpperCase() !== 'FALSE')
      .map(r => ({
        id: r[0] || '', title: r[1] || '', date: r[2] || '',
        note: r[3] || '', postedBy: r[4] || '',
        active: String(r[5] || 'TRUE').trim().toUpperCase() !== 'FALSE',
        _row: rows.indexOf(r) + 2,
      }));
  } catch (e) {
    console.warn('Events load error:', e);
    _calEventsCache = [];
  }
  _phCalRender();
  _phRenderEventsList();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phRenderEventsList() {
  const el = document.getElementById('ph-events-list');
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);

  const events = (_calEventsCache || [])
    .filter(ev => { const d = new Date(ev.date); return !isNaN(d) && d >= today; })
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  if (!events.length) {
    el.innerHTML = `<div class="ph2-empty">
      <i data-lucide="calendar-x" style="width:24px;height:24px;opacity:.2"></i>
      <span>No upcoming events</span>
    </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  el.innerHTML = events.map(ev => {
    const d = new Date(ev.date);
    const diff = Math.round((d - today) / 86400000);
    const isToday = diff === 0;
    const isSoon  = diff <= 3;
    const whenLbl = isToday ? 'Today' : diff === 1 ? 'Tomorrow' : `in ${diff}d`;

    const tl = (ev.title || '').toLowerCase();
    let tagBg = 'rgba(255,255,255,.06)', tagFg = 'var(--text-tertiary)', tagLbl = 'Event';
    if (tl.includes('town hall') || tl.includes('meeting') || tl.includes('company')) {
      tagBg = 'rgba(248,113,113,.12)'; tagFg = '#f87171'; tagLbl = 'Company';
    } else if (tl.includes('training') || tl.includes('workshop') || tl.includes('seminar')) {
      tagBg = 'var(--accent-dim)'; tagFg = 'var(--accent)'; tagLbl = 'Training';
    } else if (tl.includes('hr') || tl.includes('review') || tl.includes('performance')) {
      tagBg = 'rgba(167,139,250,.12)'; tagFg = '#a78bfa'; tagLbl = 'HR';
    }

    return `<div class="ph2-ev-row${isToday ? ' ph2-ev-today' : ''}">
      <div class="ph2-ev-date${isToday ? ' ph2-ev-date-today' : isSoon ? ' ph2-ev-date-soon' : ''}">
        <div class="ph2-ev-dd">${d.getDate()}</div>
        <div class="ph2-ev-mm">${d.toLocaleDateString('en-PH',{month:'short'})}</div>
      </div>
      <div class="ph2-ev-body">
        <div class="ph2-ev-title">${esc(ev.title)}</div>
        ${ev.note ? `<div class="ph2-ev-note">${esc(ev.note)}</div>` : ''}
        <div class="ph2-ev-when${isSoon ? ' ph2-ev-when-soon' : ''}">${whenLbl}</div>
      </div>
      <span class="ph2-ev-tag" style="background:${tagBg};color:${tagFg}">${tagLbl}</span>
      ${canViewSensitive() ? `<button class="ph2-ev-del" onclick="_phDeleteEvent('${esc(ev.id)}',${ev._row},event)">
        <i data-lucide="x" style="width:10px;height:10px"></i>
      </button>` : ''}
    </div>`;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Add event modal ────────────────────────────────────────
function _phOpenAddEvent() {
  if (!canViewSensitive()) { toast('Only HR/Agency or Owner can add events.', 'error'); return; }
  const existing = document.getElementById('ph2-ev-modal');
  if (existing) existing.remove();

  const today = new Date().toISOString().split('T')[0];
  const overlay = document.createElement('div');
  overlay.id = 'ph2-ev-modal';
  overlay.className = 'ph2-modal-overlay';
  overlay.innerHTML = `
    <div class="ph2-modal-box">
      <div class="ph2-modal-header">
        <span class="ph2-modal-ttl">
          <i data-lucide="calendar-plus" style="width:15px;height:15px;vertical-align:-2px;margin-right:6px"></i>Add Event
        </span>
        <button class="ph2-modal-close" onclick="document.getElementById('ph2-ev-modal').remove()">✕</button>
      </div>
      <div class="ph2-modal-body">
        <div class="ph2-field">
          <label class="ph2-field-label">Event Title <span class="ph2-req">*</span></label>
          <input id="ph-ev-title" class="ph2-field-input" placeholder="e.g. Team Meeting, Training Day…">
        </div>
        <div class="ph2-field">
          <label class="ph2-field-label">Date <span class="ph2-req">*</span></label>
          <input id="ph-ev-date" type="date" class="ph2-field-input" value="${today}">
        </div>
        <div class="ph2-field">
          <label class="ph2-field-label">Note / Details</label>
          <textarea id="ph-ev-note" class="ph2-field-input" rows="3" placeholder="Optional description…"></textarea>
        </div>
        <div class="ph2-field">
          <label class="ph2-field-label">Posted By</label>
          <input id="ph-ev-by" class="ph2-field-input" value="${esc(currentUser?.name || '')}">
        </div>
      </div>
      <div class="ph2-modal-footer">
        <button class="ph2-btn-ghost" onclick="document.getElementById('ph2-ev-modal').remove()">Cancel</button>
        <button class="ph2-btn-primary" onclick="_phSubmitEvent()">
          <i data-lucide="check" style="width:13px;height:13px"></i> Save Event
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => document.getElementById('ph-ev-title')?.focus(), 80);
}

async function _phSubmitEvent() {
  const title = (document.getElementById('ph-ev-title')?.value || '').trim();
  const date  = (document.getElementById('ph-ev-date')?.value  || '').trim();
  const note  = (document.getElementById('ph-ev-note')?.value  || '').trim();
  const by    = (document.getElementById('ph-ev-by')?.value    || '').trim() || currentUser?.name || currentRole || 'HR';

  if (!title) { toast('Please enter an event title.', 'error'); return; }
  if (!date)  { toast('Please pick a date.', 'error'); return; }

  const id = 'EV-' + Date.now();
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${EVENTS_SHEET}!A:F`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: { values: [[id, title, date, note, by, 'TRUE']] }
    });
    toast('Event added!', 'success');
    document.getElementById('ph2-ev-modal')?.remove();
    _calEventsCache = null;
    _phLoadEventsAndRender();
  } catch (e) {
    toast('Failed to save event.', 'error');
    console.error(e);
  }
}

async function _phDeleteEvent(id, rowNum, evt) {
  evt.stopPropagation();
  if (!confirm('Remove this event?')) return;
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${EVENTS_SHEET}!F${rowNum}`,
      valueInputOption: 'RAW', resource: { values: [['FALSE']] }
    });
    toast('Event removed.', 'success');
    _calEventsCache = null;
    _phLoadEventsAndRender();
  } catch (e) { toast('Failed to remove event.', 'error'); }
}

// ============================================================
// CALENDAR
// ============================================================
let _phCalYear  = new Date().getFullYear();
let _phCalMonth = new Date().getMonth();

function _phCalPrev() { _phCalMonth--; if (_phCalMonth < 0) { _phCalMonth = 11; _phCalYear--; } _phCalRender(); }
function _phCalNext() { _phCalMonth++; if (_phCalMonth > 11) { _phCalMonth = 0; _phCalYear++; } _phCalRender(); }

function _phCalRender() {
  const calEl   = document.getElementById('ph-calendar');
  const labelEl = document.getElementById('ph-cal-label');
  if (!calEl) return;

  const today = new Date();
  const y = _phCalYear, m = _phCalMonth;

  if (labelEl) labelEl.textContent = new Date(y, m, 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const bdayDays = new Set();
  if (typeof getBirthdaysThisMonth === 'function' &&
      y === today.getFullYear() && m === today.getMonth()) {
    getBirthdaysThisMonth().forEach(item => {
      const emp = item.emp || item;
      const d   = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
      if (!isNaN(d)) bdayDays.add(d.getDate());
    });
  }

  const eventsByDay = {};
  (_calEventsCache || []).forEach(ev => {
    const d = new Date(ev.date);
    if (isNaN(d) || d.getFullYear() !== y || d.getMonth() !== m) return;
    const day = d.getDate();
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(ev);
  });

  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = `<div class="ph2-cal-grid">`;
  html += dayNames.map(d => `<div class="ph2-cal-dn">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="ph2-cal-cell ph2-cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday  = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
    const isBday   = bdayDays.has(d);
    const hasEvent = !!eventsByDay[d];
    let cls = 'ph2-cal-cell';
    if (isToday)  cls += ' ph2-cal-today';
    if (isBday)   cls += ' ph2-cal-bday';
    if (hasEvent) cls += ' ph2-cal-has-ev';

    html += `<div class="${cls}" onclick="_phCalDayClick(${d},${y},${m})">
      <span class="ph2-cal-num">${d}</span>
      <div class="ph2-cal-dots">
        ${hasEvent ? `<span class="ph2-dot-ev"></span>` : ''}
        ${isBday   ? `<span class="ph2-dot-bd"></span>` : ''}
      </div>
    </div>`;
  }
  html += `</div>`;
  calEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phCalDayClick(day, y, m) {
  const popover = document.getElementById('ph-cal-popover');
  if (!popover) return;

  const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const events  = (_calEventsCache || []).filter(ev => ev.date === dateStr);

  const bdayNames = [];
  if (typeof getBirthdaysThisMonth === 'function') {
    const now = new Date();
    if (y === now.getFullYear() && m === now.getMonth()) {
      getBirthdaysThisMonth().forEach(item => {
        const emp = item.emp || item;
        const d   = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
        if (!isNaN(d) && d.getDate() === day) bdayNames.push(emp.fullName || emp.name || '?');
      });
    }
  }

  const dateLabel = new Date(y, m, day).toLocaleDateString('en-PH', { weekday:'long', month:'long', day:'numeric' });
  let body = '';

  events.forEach(ev => {
    body += `<div class="ph2-pop-ev">
      <i data-lucide="calendar-check" style="width:12px;height:12px;color:var(--accent);flex-shrink:0;margin-top:1px"></i>
      <div>
        <div class="ph2-pop-ev-title">${esc(ev.title)}</div>
        ${ev.note ? `<div class="ph2-pop-ev-note">${esc(ev.note)}</div>` : ''}
        ${ev.postedBy ? `<div class="ph2-pop-ev-by">${esc(ev.postedBy)}</div>` : ''}
      </div>
    </div>`;
  });

  bdayNames.forEach(name => {
    body += `<div class="ph2-pop-ev">
      <i data-lucide="cake" style="width:12px;height:12px;color:#f5c842;flex-shrink:0;margin-top:1px"></i>
      <div class="ph2-pop-ev-title" style="color:#f5c842">${esc(name)} 🎉</div>
    </div>`;
  });

  if (!body) {
    body = canViewSensitive()
      ? `<div class="ph2-pop-empty">No events. <button class="ph2-card-link" onclick="_phOpenAddEventDate('${dateStr}')">Add one?</button></div>`
      : `<div class="ph2-pop-empty">No events.</div>`;
  }

  popover.innerHTML = `
    <div class="ph2-pop-hd">
      <span class="ph2-pop-date">${dateLabel}</span>
      <button class="ph2-pop-close" onclick="document.getElementById('ph-cal-popover').style.display='none'">✕</button>
    </div>
    ${body}`;
  popover.style.display = 'block';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phOpenAddEventDate(date) {
  document.getElementById('ph-cal-popover').style.display = 'none';
  _phOpenAddEvent();
  setTimeout(() => { const d = document.getElementById('ph-ev-date'); if (d) d.value = date; }, 80);
}

function _phScrollToCalendar() {
  const el = document.getElementById('ph-cal-section');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// QUICK ACCESS
// ============================================================
const _QA_DEFAULT = [
  { id:'people',       label:'Employee\nDatabase',    icon:'users',         color:'rgba(0,208,104,.12)',  textColor:'var(--success)',  onclick:"Router.go('people')",                                   visible:true },
  { id:'tracker',      label:'Deployment\nTracker',   icon:'map-pin',       color:'rgba(55,138,221,.12)', textColor:'#378ADD',         onclick:"Router.go('tracker')",                                  visible:true },
  { id:'requirements', label:'Requirements',          icon:'clipboard-list',color:'rgba(251,146,60,.12)', textColor:'#fb923c',         onclick:"missingFieldFilter='requirements';Router.go('people')", visible:true },
  { id:'analytics',    label:'Analytics &\nReports',  icon:'bar-chart-2',   color:'rgba(167,139,250,.12)',textColor:'#a78bfa',         onclick:"Router.go('analytics')",                                visible:true },
  { id:'export',       label:'Export\nData',          icon:'download',      color:'var(--accent-dim)',    textColor:'var(--accent)',   onclick:'exportXLSX()',                                          visible:true,  sensitive:true },
  { id:'settings',     label:'Settings',              icon:'settings',      color:'rgba(255,255,255,.06)',textColor:'var(--text-secondary)',onclick:"Router.go('settings')",                            visible:true,  ownerOnly:true },
  { id:'log',          label:'Activity\nLog',         icon:'activity',      color:'rgba(55,138,221,.12)', textColor:'#378ADD',         onclick:"Router.go('log')",                                      visible:false },
  { id:'people-add',   label:'Add\nEmployee',         icon:'user-plus',     color:'rgba(0,208,104,.12)',  textColor:'var(--success)',  onclick:'openAddModal()',                                        visible:false },
];

function _qaGetTiles() {
  try {
    const saved = localStorage.getItem('ph-qa-tiles');
    if (saved) {
      const parsed = JSON.parse(saved);
      const map = {};
      parsed.forEach(t => map[t.id] = t);
      return _QA_DEFAULT
        .map(def => ({ ...def, visible: map[def.id] !== undefined ? map[def.id].visible : def.visible }))
        .sort((a,b) => {
          const ai = parsed.findIndex(t => t.id === a.id);
          const bi = parsed.findIndex(t => t.id === b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
    }
  } catch(e) {}
  return _QA_DEFAULT.map(t => ({ ...t }));
}

function _qaRebuildGrid() {
  const grid = document.getElementById('ph-qa-grid');
  if (!grid) return;
  const tiles = _qaGetTiles();
  const isOwner     = typeof currentRole !== 'undefined' && currentRole === 'owner';
  const canSensitive = canViewSensitive();
  grid.innerHTML = tiles
    .filter(t => t.visible)
    .filter(t => !t.sensitive || canSensitive)
    .filter(t => !t.ownerOnly || isOwner)
    .map(t => `
      <div class="ph2-qa-tile" onclick="${t.onclick}">
        <div class="ph2-qa-icon" style="background:${t.color};color:${t.textColor}">
          <i data-lucide="${t.icon}" style="width:20px;height:20px"></i>
        </div>
        <div class="ph2-qa-lbl">${t.label.replace('\n','<br>')}</div>
      </div>`).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phOpenQAEdit() {
  const existing = document.getElementById('ph2-qa-edit-overlay');
  if (existing) existing.remove();

  let tiles = _qaGetTiles();
  let dragSrc = null;

  const overlay = document.createElement('div');
  overlay.id = 'ph2-qa-edit-overlay';
  overlay.className = 'ph2-modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  function renderList() {
    const isOwner = typeof currentRole !== 'undefined' && currentRole === 'owner';
    const cs = canViewSensitive();
    return tiles
      .filter(t => !t.sensitive || cs)
      .filter(t => !t.ownerOnly || isOwner)
      .map((t,i) => `
        <div class="ph2-qa-edit-row" draggable="true" data-idx="${i}" data-id="${t.id}">
          <span class="ph2-qa-edit-drag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
            </svg>
          </span>
          <div class="ph2-qa-edit-icon" style="background:${t.color};color:${t.textColor}">
            <i data-lucide="${t.icon}" style="width:14px;height:14px"></i>
          </div>
          <span class="ph2-qa-edit-name">${t.label.replace('\n',' ')}</span>
          <button class="ph2-qa-toggle ${t.visible ? 'on' : ''}" data-id="${t.id}"></button>
        </div>`).join('');
  }

  overlay.innerHTML = `
    <div class="ph2-modal-box" style="max-width:380px">
      <div class="ph2-modal-header">
        <span class="ph2-modal-ttl">Customize Quick Access</span>
        <button class="ph2-modal-close" onclick="document.getElementById('ph2-qa-edit-overlay').remove()">✕</button>
      </div>
      <div class="ph2-modal-body" style="padding-bottom:0">
        <p style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">Toggle tiles on/off or drag to reorder.</p>
        <div id="ph2-qa-edit-list">${renderList()}</div>
      </div>
      <div class="ph2-modal-footer">
        <button class="ph2-btn-ghost" onclick="document.getElementById('ph2-qa-edit-overlay').remove()">Cancel</button>
        <button class="ph2-btn-primary" onclick="_phSaveQAEdit()">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.ph2-qa-toggle');
    if (!btn) return;
    const t = tiles.find(x => x.id === btn.dataset.id);
    if (t) { t.visible = !t.visible; btn.classList.toggle('on', t.visible); }
  });

  overlay.addEventListener('dragstart', e => {
    const row = e.target.closest('.ph2-qa-edit-row');
    if (!row) return;
    dragSrc = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  overlay.addEventListener('dragend', () => {
    overlay.querySelectorAll('.ph2-qa-edit-row').forEach(r => r.classList.remove('dragging','drag-over'));
  });
  overlay.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('.ph2-qa-edit-row');
    if (!row || row === dragSrc) return;
    overlay.querySelectorAll('.ph2-qa-edit-row').forEach(r => r.classList.remove('drag-over'));
    row.classList.add('drag-over');
  });
  overlay.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.ph2-qa-edit-row');
    if (!row || !dragSrc || row === dragSrc) return;
    const fi = tiles.findIndex(t => t.id === dragSrc.dataset.id);
    const ti = tiles.findIndex(t => t.id === row.dataset.id);
    if (fi < 0 || ti < 0) return;
    const [moved] = tiles.splice(fi, 1);
    tiles.splice(ti, 0, moved);
    const list = document.getElementById('ph2-qa-edit-list');
    if (list) { list.innerHTML = renderList(); if (typeof lucide !== 'undefined') lucide.createIcons(); }
    overlay.querySelectorAll('.ph2-qa-edit-row').forEach(r => r.classList.remove('drag-over','dragging'));
  });

  overlay._tiles = tiles;
}

function _phSaveQAEdit() {
  const overlay = document.getElementById('ph2-qa-edit-overlay');
  if (!overlay) return;
  const tiles = overlay._tiles;
  overlay.querySelectorAll('.ph2-qa-toggle').forEach(btn => {
    const t = tiles.find(x => x.id === btn.dataset.id);
    if (t) t.visible = btn.classList.contains('on');
  });
  try { localStorage.setItem('ph-qa-tiles', JSON.stringify(tiles.map(t => ({ id:t.id, visible:t.visible })))); } catch(e) {}
  overlay.remove();
  _qaRebuildGrid();
}

// ============================================================
// HELPERS
// ============================================================
function _buildRecentList(limit = 5) {
  if (!logCache || !logCache.length) return [];
  return logCache.slice(-60).reverse().slice(0, limit).map(row => ({
    time:   row[0] ? _relativeTime(new Date(row[0])) : '—',
    id:     row[1] || '',
    name:   row[2] || 'Unknown',
    action: row[3] || 'Updated',
  }));
}

function _relativeTime(date) {
  if (isNaN(date)) return '—';
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ============================================================
// STYLES
// ============================================================
function _injectHomeStyles() {
  if (document.getElementById('ph2-styles')) return;
  const s = document.createElement('style');
  s.id = 'ph2-styles';
  s.textContent = `
/* ══════════════════════════════════════════════════
   TOKENS
══════════════════════════════════════════════════ */
:root {
  --ph2-ring-track: rgba(255,255,255,.07);
  --ph2-card-bg: var(--bg-card, rgba(16,22,22,.88));
  --ph2-card-border: var(--border, rgba(255,255,255,.07));
  --ph2-radius: 14px;
  --ph2-gap: 14px;
}
[data-theme="light"] {
  --ph2-ring-track: rgba(10,138,133,.10);
  --ph2-card-bg: rgba(255,255,255,.82);
  --ph2-card-border: rgba(0,0,0,.07);
}

/* ══════════════════════════════════════════════════
   LAYOUT WRAPPER
══════════════════════════════════════════════════ */
.ph2-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--ph2-gap);
  padding: 20px 24px 36px;
  max-width: 1360px;
  font-family: 'Inter', system-ui, sans-serif;
}

/* ══════════════════════════════════════════════════
   CARD BASE
══════════════════════════════════════════════════ */
.ph2-card {
  background: var(--ph2-card-bg);
  border: 1px solid var(--ph2-card-border);
  border-radius: var(--ph2-radius);
  padding: 18px 20px;
  box-shadow: 0 2px 12px rgba(0,0,0,.18);
}
[data-theme="light"] .ph2-card {
  background: #fff;
  box-shadow: 0 2px 12px rgba(10,138,133,.06);
}
.ph2-card-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.ph2-card-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-tertiary);
}
[data-theme="light"] .ph2-card-title { color: #076e6a; }
.ph2-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px; height: 24px;
  border-radius: 7px;
  font-size: 13px;
  flex-shrink: 0;
}
.ph2-card-link {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: opacity .15s;
  font-family: 'Inter', system-ui, sans-serif;
}
.ph2-card-link:hover { opacity: .7; }

/* ══════════════════════════════════════════════════
   HERO
══════════════════════════════════════════════════ */
.ph2-hero {
  display: flex;
  align-items: center;
  gap: 32px;
  background: var(--ph2-card-bg);
  border: 1px solid var(--ph2-card-border);
  border-radius: 18px;
  padding: 28px 32px;
  box-shadow: 0 2px 20px rgba(0,0,0,.2);
  min-height: 210px;
  overflow: hidden;
  position: relative;
}
[data-theme="light"] .ph2-hero {
  background: #fff;
  box-shadow: 0 4px 24px rgba(10,138,133,.08);
}
.ph2-hero::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(ellipse at 100% 0%, rgba(0,200,170,.06) 0%, transparent 55%);
  pointer-events: none;
}
.ph2-hero-left  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.ph2-hero-right { flex-shrink: 0; display: flex; align-items: center; gap: 20px; }

.ph2-hero-eye {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: .03em;
}
.ph2-hero-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px rgba(0,200,170,.5);
  display: inline-block;
}
.ph2-hero-h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -.4px;
  color: var(--text-primary);
  line-height: 1.2;
  margin: 0;
}
.ph2-hero-name { color: var(--accent); }
[data-theme="light"] .ph2-hero-name { color: #0a8a85; }
.ph2-hero-sub  { font-size: 12.5px; color: var(--text-tertiary); margin: 0; }

/* KPI pills */
.ph2-kpi-row {
  display: flex;
  align-items: center;
  gap: 0;
  flex-wrap: wrap;
  background: rgba(255,255,255,.03);
  border: 1px solid var(--ph2-card-border);
  border-radius: 10px;
  padding: 2px 4px;
  width: fit-content;
  max-width: 100%;
}
[data-theme="light"] .ph2-kpi-row { background: rgba(10,138,133,.04); border-color: rgba(10,138,133,.12); }
.ph2-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background .15s;
  border-radius: 8px;
}
.ph2-kpi:hover { background: rgba(255,255,255,.05); }
[data-theme="light"] .ph2-kpi:hover { background: rgba(10,138,133,.06); }
.ph2-kpi-val {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.ph2-kpi-lbl {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: .05em;
  white-space: nowrap;
}
.ph2-kpi-sep {
  width: 1px;
  height: 28px;
  background: var(--ph2-card-border);
  flex-shrink: 0;
}
.ph2-kpi-green .ph2-kpi-val { color: var(--success); }
.ph2-kpi-blue  .ph2-kpi-val { color: #378ADD; }
.ph2-kpi-amber .ph2-kpi-val { color: #f59e0b; }
.ph2-kpi-purple .ph2-kpi-val { color: #a78bfa; }

/* Hero action buttons */
.ph2-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ph2-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12.5px;
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--accent);
  color: #0e1414;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity .15s, box-shadow .15s;
  box-shadow: 0 2px 10px rgba(0,200,170,.2);
  white-space: nowrap;
}
[data-theme="light"] .ph2-btn-primary { background: #0a8a85; color: #fff; }
.ph2-btn-primary:hover { opacity: .88; }
.ph2-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 500;
  font-family: 'Inter', system-ui, sans-serif;
  background: none;
  color: var(--text-secondary);
  border: 1px solid var(--ph2-card-border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color .15s, color .15s;
  white-space: nowrap;
}
.ph2-btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

/* Health ring */
.ph2-health-ring-wrap {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}
.ph2-ring-svg { width: 100%; height: 100%; }
.ph2-ring-center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
}
.ph2-ring-pct {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.ph2-ring-unit {
  font-size: 13px;
  font-weight: 700;
}
.ph2-ring-lbl {
  font-size: 9.5px;
  color: var(--text-tertiary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  margin-top: 3px;
  line-height: 1.3;
}

/* Mini bars (hero right) */
.ph2-hero-mini-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 160px;
}
.ph2-mini-bar { display: flex; flex-direction: column; gap: 3px; }
.ph2-mini-bar-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ph2-mini-bar-lbl {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-secondary);
}
.ph2-mini-bar-pct {
  font-size: 11px;
  font-weight: 700;
}
.ph2-mini-bar-track {
  height: 4px;
  background: rgba(255,255,255,.07);
  border-radius: 2px;
  overflow: hidden;
}
[data-theme="light"] .ph2-mini-bar-track { background: rgba(0,0,0,.07); }
.ph2-mini-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .7s ease;
}
.ph2-mini-bar-vals {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* ══════════════════════════════════════════════════
   STAT CARDS ROW
══════════════════════════════════════════════════ */
.ph2-stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ph2-gap);
}
@media (max-width: 1000px) { .ph2-stat-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px)  { .ph2-stat-row { grid-template-columns: 1fr 1fr; } }

.ph2-stat-card {
  background: var(--ph2-card-bg);
  border: 1px solid var(--ph2-card-border);
  border-radius: var(--ph2-radius);
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s, border-color .15s;
  box-shadow: 0 1px 8px rgba(0,0,0,.14);
}
[data-theme="light"] .ph2-stat-card { background: #fff; box-shadow: 0 1px 8px rgba(10,138,133,.05); }
.ph2-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,.22);
  border-color: var(--border-mid);
}
[data-theme="light"] .ph2-stat-card:hover { border-color: rgba(10,138,133,.25); box-shadow: 0 6px 16px rgba(10,138,133,.1); }

.ph2-sc-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px; height: 44px;
  border-radius: 11px;
  flex-shrink: 0;
}
.ph2-sc-body { flex: 1; min-width: 0; }
.ph2-sc-val {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -.5px;
}
.ph2-sc-lbl {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: .05em;
  margin-top: 3px;
}
.ph2-sc-sub {
  font-size: 10.5px;
  color: var(--text-tertiary);
  margin-top: 2px;
}
.ph2-sc-arr {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

/* ══════════════════════════════════════════════════
   ROW 3: 3-column
══════════════════════════════════════════════════ */
.ph2-row3 {
  display: grid;
  grid-template-columns: 1fr 1.05fr 1fr;
  gap: var(--ph2-gap);
  align-items: start;
}
@media (max-width: 1100px) { .ph2-row3 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 680px)  { .ph2-row3 { grid-template-columns: 1fr; } }

/* ── Action list ── */
.ph2-action-list { display: flex; flex-direction: column; gap: 1px; }
.ph2-action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .12s;
}
.ph2-action-row:hover { background: rgba(255,255,255,.04); }
[data-theme="light"] .ph2-action-row:hover { background: rgba(10,138,133,.05); }
.ph2-action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 8px;
  flex-shrink: 0;
}
.ph2-action-lbl {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.ph2-action-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  min-width: 24px;
  text-align: center;
  flex-shrink: 0;
}

/* ── Events list ── */
.ph2-ev-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-radius: 8px;
  transition: background .12s;
  position: relative;
}
.ph2-ev-row:not(:last-child) { border-bottom: 1px solid var(--ph2-card-border); }
.ph2-ev-today { background: rgba(0,200,170,.03); }
.ph2-ev-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-width: 40px;
  height: 44px;
  border-radius: 9px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--ph2-card-border);
  flex-shrink: 0;
}
[data-theme="light"] .ph2-ev-date { background: #f5f9f9; }
.ph2-ev-date-today { background: var(--accent-dim); border-color: var(--accent); }
.ph2-ev-date-soon  { background: rgba(251,191,36,.08); border-color: rgba(251,191,36,.3); }
.ph2-ev-dd {
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}
.ph2-ev-mm {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
}
.ph2-ev-body { flex: 1; min-width: 0; }
.ph2-ev-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ph2-ev-note {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.ph2-ev-when {
  font-size: 10.5px;
  color: var(--text-tertiary);
  margin-top: 2px;
}
.ph2-ev-when-soon { color: #fbbf24; font-weight: 600; }
.ph2-ev-tag {
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ph2-ev-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  border-radius: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity .12s, background .12s;
  flex-shrink: 0;
}
.ph2-ev-row:hover .ph2-ev-del { opacity: 1; }
.ph2-ev-del:hover { background: rgba(248,113,113,.15); color: #f87171; }

/* ══════════════════════════════════════════════════
   CALENDAR + RECENT ROW
══════════════════════════════════════════════════ */
.ph2-row-cal {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: var(--ph2-gap);
  align-items: start;
}
@media (max-width: 900px) { .ph2-row-cal { grid-template-columns: 1fr; } }
.ph2-cal-card { position: relative; }

/* Cal nav */
.ph2-cal-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid rgba(0,200,170,.25);
  border-radius: 6px;
  cursor: pointer;
  transition: background .15s;
}
.ph2-cal-add-btn:hover { background: rgba(0,200,170,.18); }
[data-theme="light"] .ph2-cal-add-btn { color: #0a8a85; border-color: rgba(10,138,133,.3); background: rgba(10,138,133,.08); }
.ph2-cal-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border: 1px solid var(--ph2-card-border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: border-color .15s, color .15s;
}
.ph2-cal-nav:hover { border-color: var(--accent); color: var(--accent); }

/* Calendar grid */
.ph2-cal-grid {
  display: grid;
  grid-template-columns: repeat(7,1fr);
  gap: 2px;
  margin-top: 4px;
}
.ph2-cal-dn {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-align: center;
  padding: 4px 0 6px;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.ph2-cal-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 2px 4px;
  border-radius: 7px;
  cursor: pointer;
  transition: background .1s;
  position: relative;
}
.ph2-cal-cell:hover:not(.ph2-cal-empty) { background: rgba(255,255,255,.07); }
[data-theme="light"] .ph2-cal-cell:hover:not(.ph2-cal-empty) { background: rgba(10,138,133,.07); }
.ph2-cal-empty  { cursor: default; }
.ph2-cal-today  { background: var(--accent) !important; border-radius: 7px; }
[data-theme="light"] .ph2-cal-today { background: #0a8a85 !important; }
.ph2-cal-today .ph2-cal-num { color: #000 !important; font-weight: 800; }
[data-theme="light"] .ph2-cal-today .ph2-cal-num { color: #fff !important; }
.ph2-cal-bday .ph2-cal-num { color: #f5c842; font-weight: 700; }
.ph2-cal-has-ev { background: rgba(0,200,170,.06); }
[data-theme="light"] .ph2-cal-has-ev { background: rgba(10,138,133,.07); }
.ph2-cal-num {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  line-height: 1;
}
.ph2-cal-dots { display: flex; justify-content: center; gap: 2px; height: 4px; }
.ph2-dot-ev {
  width: 3.5px; height: 3.5px;
  border-radius: 50%;
  background: var(--accent);
}
.ph2-dot-bd {
  width: 3.5px; height: 3.5px;
  border-radius: 50%;
  background: #f5c842;
}
.ph2-cal-today .ph2-dot-ev { background: rgba(0,0,0,.5); }
[data-theme="light"] .ph2-cal-today .ph2-dot-ev { background: rgba(255,255,255,.7); }

/* Legend */
.ph2-cal-legend {
  display: flex;
  gap: 14px;
  margin-top: 12px;
}
.ph2-leg-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-tertiary);
}
.ph2-leg-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Calendar popover */
.ph2-cal-popover {
  margin-top: 10px;
  background: var(--bg-elevated, rgba(20,28,28,.96));
  border: 1px solid var(--border-mid);
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.35);
  display: flex;
  flex-direction: column;
  gap: 7px;
  animation: ph2PopIn .14s ease-out;
}
@keyframes ph2PopIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
[data-theme="light"] .ph2-cal-popover { background: rgba(242,248,248,.97); border-color: rgba(10,138,133,.15); }
.ph2-pop-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}
.ph2-pop-date {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-primary);
}
.ph2-pop-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 0;
  line-height: 1;
}
.ph2-pop-ev {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.ph2-pop-ev-title { font-size: 11.5px; font-weight: 600; color: var(--text-primary); }
.ph2-pop-ev-note  { font-size: 10.5px; color: var(--text-secondary); margin-top: 1px; }
.ph2-pop-ev-by    { font-size: 10px; color: var(--text-tertiary); }
.ph2-pop-empty    { font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 4px 0; }

/* ── Recent activity ── */
.ph2-recent-card { display: flex; flex-direction: column; }
.ph2-recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .12s;
}
.ph2-recent-item:hover { background: rgba(255,255,255,.04); }
[data-theme="light"] .ph2-recent-item:hover { background: rgba(10,138,133,.05); }
.ph2-recent-body { flex: 1; min-width: 0; }
.ph2-recent-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ph2-recent-action {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ph2-recent-time {
  font-size: 10.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Divider */
.ph2-divider {
  height: 1px;
  background: var(--ph2-card-border);
  margin: 14px 0;
}
.ph2-sub-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

/* Status breakdown */
.ph2-status-list { display: flex; flex-direction: column; gap: 4px; }
.ph2-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 7px;
  cursor: pointer;
  transition: background .12s;
}
.ph2-status-row:hover { background: rgba(255,255,255,.04); }
[data-theme="light"] .ph2-status-row:hover { background: rgba(10,138,133,.05); }
.ph2-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.ph2-status-name {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 72px;
}
.ph2-status-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 24px;
  text-align: right;
}
.ph2-bar-wrap {
  flex: 1;
  height: 3px;
  background: var(--ph2-card-border);
  border-radius: 2px;
  overflow: hidden;
}
.ph2-bar-fill { height: 100%; border-radius: 2px; transition: width .5s ease; }
.ph2-status-pct {
  font-size: 10px;
  color: var(--text-tertiary);
  min-width: 28px;
  text-align: right;
}

/* ══════════════════════════════════════════════════
   BIRTHDAY
══════════════════════════════════════════════════ */
.ph2-bday-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.ph2-bday-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 4px;
  font-size: 10.5px;
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
  border: 1px solid var(--ph2-card-border);
  border-radius: 7px;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all .12s;
}
.ph2-bday-tab:hover { border-color: var(--accent); color: var(--accent); }
.ph2-bday-tab.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}
[data-theme="light"] .ph2-bday-tab.active { background: rgba(10,138,133,.1); border-color: #0a8a85; color: #0a8a85; }
.ph2-tab-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 20px;
  background: var(--accent-dim);
  color: var(--accent);
  line-height: 1.4;
}
.ph2-tab-warn { background: rgba(245,200,66,.15); color: #f5c842; }
.ph2-tab-dim  { background: rgba(255,255,255,.06); color: var(--text-tertiary); }
.ph2-bday-pane {
  display: flex;
  flex-direction: column;
  max-height: 196px;
  overflow-y: auto;
}
.ph2-bday-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 4px;
  border-radius: 7px;
  cursor: pointer;
  transition: background .12s;
}
.ph2-bday-row:not(:last-child) { border-bottom: 1px solid var(--ph2-card-border); }
.ph2-bday-row:hover { background: rgba(255,255,255,.04); }
[data-theme="light"] .ph2-bday-row:hover { background: rgba(10,138,133,.05); }
.ph2-bday-info { flex: 1; min-width: 0; }
.ph2-bday-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ph2-bday-store {
  font-size: 10.5px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ph2-bday-when {
  font-size: 10.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-weight: 500;
  flex-shrink: 0;
}
.ph2-bday-today { color: #f5c842; font-weight: 700; }

/* ══════════════════════════════════════════════════
   QUICK ACCESS
══════════════════════════════════════════════════ */
.ph2-qa-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}
.ph2-qa-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 12px;
  border-radius: 11px;
  cursor: pointer;
  border: 1px solid var(--ph2-card-border);
  background: rgba(255,255,255,.02);
  transition: border-color .15s, background .15s, transform .15s;
}
[data-theme="light"] .ph2-qa-tile { background: #f7fafa; }
.ph2-qa-tile:hover {
  border-color: var(--accent);
  background: var(--accent-dim);
  transform: translateY(-2px);
}
[data-theme="light"] .ph2-qa-tile:hover { background: rgba(10,138,133,.07); border-color: #0a8a85; }
.ph2-qa-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px; height: 44px;
  border-radius: 11px;
}
.ph2-qa-lbl {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.35;
}

/* ══════════════════════════════════════════════════
   MODAL (add event / qa edit)
══════════════════════════════════════════════════ */
.ph2-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.65);
  backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: ph2FadeIn .15s ease;
}
@keyframes ph2FadeIn { from { opacity:0; } to { opacity:1; } }
.ph2-modal-box {
  background: var(--bg-elevated, rgba(20,28,28,.96));
  border: 1px solid var(--border-mid);
  border-radius: 16px;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(0,0,0,.55);
  animation: ph2SlideUp .18s ease;
}
@keyframes ph2SlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
[data-theme="light"] .ph2-modal-box { background: rgba(240,248,248,.97); border-color: rgba(10,138,133,.18); }
.ph2-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--ph2-card-border);
}
.ph2-modal-ttl {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
}
.ph2-modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 0;
  line-height: 1;
  transition: color .12s;
}
.ph2-modal-close:hover { color: var(--text-primary); }
.ph2-modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.ph2-field { display: flex; flex-direction: column; gap: 5px; }
.ph2-field-label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: .05em;
}
.ph2-req { color: var(--danger); }
.ph2-field-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-family: 'Inter', system-ui, sans-serif;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--ph2-card-border);
  border-radius: 8px;
  color: var(--text-primary);
  box-sizing: border-box;
  outline: none;
  transition: border-color .12s;
}
[data-theme="light"] .ph2-field-input { background: rgba(255,255,255,.7); border-color: rgba(0,0,0,.1); }
.ph2-field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.ph2-modal-footer {
  padding: 12px 20px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--ph2-card-border);
}

/* ── QA edit rows ── */
.ph2-qa-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  border: 1px solid var(--ph2-card-border);
  background: rgba(255,255,255,.02);
  cursor: grab;
  user-select: none;
  margin-bottom: 5px;
  transition: border-color .12s;
}
[data-theme="light"] .ph2-qa-edit-row { background: #f5f9f9; }
.ph2-qa-edit-row.dragging { opacity: .4; border-style: dashed; }
.ph2-qa-edit-row.drag-over { border-color: var(--accent); background: var(--accent-dim); }
.ph2-qa-edit-drag { color: var(--text-tertiary); flex-shrink: 0; cursor: grab; }
.ph2-qa-edit-icon {
  width: 30px; height: 30px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ph2-qa-edit-name {
  flex: 1;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}
.ph2-qa-toggle {
  width: 36px; height: 20px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  background: var(--border-mid);
  transition: background .18s;
}
.ph2-qa-toggle::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform .18s;
}
.ph2-qa-toggle.on { background: var(--accent); }
.ph2-qa-toggle.on::after { transform: translateX(16px); }

/* ══════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════ */
.ph2-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 22px 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
.ph2-loading-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
  padding: 6px 0;
}
  `;
  document.head.appendChild(s);
}
