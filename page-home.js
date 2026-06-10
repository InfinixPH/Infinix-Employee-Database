// ============================================================
// page-home.js — Home page
// Greeting · quick actions · stat cards · announcements
// smart calendar (HR events) · birthdays · upcoming events
// recent activity · status breakdown · nav tiles
// ============================================================
'use strict';

// ── Events sheet constant (parallel to ANNOUNCEMENTS_SHEET) ──
const EVENTS_SHEET = 'Events';

// ── Module-level cache for calendar events ─────────────────
let _calEventsCache = null; // null = not loaded, [] = loaded but empty

// ============================================================
// MAIN RENDER
// ============================================================
function renderHome() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = '';   // ← Fix #4: topbar-title was redundant with breadcrumb; blank it on home

  if (typeof employees === 'undefined' || typeof getStats === 'undefined') {
    document.getElementById('content').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Loading…</div>';
    return;
  }

  const s           = getStats();
  const total       = employees.length;
  const active      = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
                                            normalizeDeployStatus(e.deploymentStatus) !== 'BACKOUT').length;
  const deployed    = employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'DEPLOYED').length;
  const missingReqs = employees.filter(e => !requirementsComplete(e)).length;

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = currentUser?.name?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';

  // Birthdays today
  const bdayToday = (typeof getBirthdaysToday === 'function') ? getBirthdaysToday() : [];

  // Recent log entries
  const recentItems = _buildRecentList(8);

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="ph-wrap">

      <!-- ── TOP ROW: Greeting + Quick Actions ── -->
      <div class="ph-greeting">
        <div class="ph-greeting-text">
          <span class="ph-hi">${esc(greeting)}, ${esc(userName)} 👋</span>
          <span class="ph-date">${_formatDate(new Date())}</span>
        </div>
        <div class="ph-quick-actions">
          ${canWrite() ? `<button class="ph-qa-btn ph-qa-primary" onclick="openAddModal()">
            <i data-lucide="user-plus" style="width:14px;height:14px"></i> Add Employee
          </button>` : ''}
          <button class="ph-qa-btn" onclick="Router.go('people')">
            <i data-lucide="users" style="width:14px;height:14px"></i> View People
          </button>
          ${canViewSensitive() ? `<button class="ph-qa-btn" onclick="exportXLSX()">
            <i data-lucide="download" style="width:14px;height:14px"></i> Export
          </button>` : ''}
          <button class="ph-qa-btn" onclick="Router.go('analytics')">
            <i data-lucide="bar-chart-2" style="width:14px;height:14px"></i> Analytics
          </button>
        </div>
      </div>

      <!-- ── BIRTHDAY BANNER (if any today) ── -->
      ${bdayToday.length ? `
      <div class="ph-bday-banner">
        <i data-lucide="cake" style="width:15px;height:15px;flex-shrink:0"></i>
        <span>Birthday today: <strong>${bdayToday.map(e => esc(e.firstName || e.name || '')).join(', ')}</strong> 🎉</span>
      </div>` : ''}

      <!-- ── STAT CARDS ── -->
      <div class="ph-stats">
        ${Components.statCard({ label: 'Total Employees', value: total, sub: 'All records', color: 'var(--accent)',
          icon: '<i data-lucide="users" style="width:18px;height:18px;stroke-width:2"></i>',
          onclick: "Router.go('people')" })}
        ${Components.statCard({ label: 'Active', value: active, sub: `${s.Floating || 0} floating`, color: 'var(--success)',
          icon: '<i data-lucide="user-check" style="width:18px;height:18px;stroke-width:2"></i>',
          onclick: "filterByStatus('Active');Router.go('people')" })}
        ${Components.statCard({ label: 'Deployed', value: deployed, sub: `${total - deployed} not yet`, color: '#378ADD',
          icon: '<i data-lucide="map-pin" style="width:18px;height:18px;stroke-width:2"></i>',
          onclick: "Router.go('tracker')" })}
        ${Components.statCard({ label: 'Missing Reqs', value: missingReqs,
          sub: missingReqs === 0 ? 'All complete' : 'Need attention',
          color: missingReqs === 0 ? 'var(--success)' : 'var(--danger)',
          icon: '<i data-lucide="clipboard-list" style="width:18px;height:18px;stroke-width:2"></i>',
          onclick: missingReqs > 0 ? "missingFieldFilter='requirements';Router.go('people')" : '' })}
      </div>

      <!-- ── MAIN GRID (3 columns) ── -->
      <div class="ph-main-grid">

        <!-- COL 1: Announcements + Status Breakdown -->
        <div class="ph-col">

          <!-- Announcements -->
          <div class="ph-card ph-ann-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="megaphone" style="width:14px;height:14px"></i> Announcements</span>
              <div style="display:flex;gap:6px;align-items:center">
                ${canViewSensitive() ? `<button class="ph-card-link" onclick="openAnnouncementManager()">+ Manage</button>` : ''}
                <button class="ph-card-link" onclick="viewAllAnnouncements()">View all →</button>
              </div>
            </div>
            <div id="ph-ann-body">
              <div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">Loading…</div>
            </div>
          </div>

          <!-- Status Breakdown -->
          <div class="ph-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="pie-chart" style="width:14px;height:14px"></i> Status Breakdown</span>
            </div>
            <div class="ph-status-list">
              ${Object.entries(s).map(([st, count]) => `
                <div class="ph-status-row" onclick="filterByStatus('${esc(st)}');Router.go('people')" title="View ${esc(st)}">
                  <span class="ph-status-dot" style="background:${STATUS_COLORS[st] || 'var(--text3)'}"></span>
                  <span class="ph-status-name">${esc(st)}</span>
                  <span class="ph-status-count">${count}</span>
                  <div class="ph-status-bar-wrap">
                    <div class="ph-status-bar-fill" style="width:${total ? Math.round(count/total*100) : 0}%;background:${STATUS_COLORS[st] || 'var(--text3)'}"></div>
                  </div>
                </div>`).join('')}
            </div>
          </div>

        </div>

        <!-- COL 2: Calendar + Upcoming Events -->
        <div class="ph-col">

          <!-- Smart Calendar -->
          <div class="ph-card ph-cal-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="calendar" style="width:14px;height:14px"></i> <span id="ph-cal-label"></span></span>
              <div style="display:flex;gap:4px;align-items:center">
                ${canViewSensitive() ? `<button class="ph-cal-add-btn" onclick="_phOpenAddEvent()" title="Add event">
                  <i data-lucide="plus" style="width:11px;height:11px"></i>
                </button>` : ''}
                <button class="ph-cal-nav" onclick="_phCalPrev()"><i data-lucide="chevron-left" style="width:12px;height:12px"></i></button>
                <button class="ph-cal-nav" onclick="_phCalNext()"><i data-lucide="chevron-right" style="width:12px;height:12px"></i></button>
              </div>
            </div>
            <div id="ph-calendar"></div>
            <!-- Day event detail popover -->
            <div id="ph-cal-popover" class="ph-cal-popover" style="display:none"></div>
          </div>

          <!-- Upcoming Events -->
          <div class="ph-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="calendar-clock" style="width:14px;height:14px"></i> Upcoming Events</span>
              ${canViewSensitive() ? `<button class="ph-card-link" onclick="_phOpenAddEvent()">+ Add →</button>` : ''}
            </div>
            <div id="ph-events-list">
              <div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">Loading…</div>
            </div>
          </div>

        </div>

        <!-- COL 3: Birthdays + Recent Activity -->
        <div class="ph-col">

          <!-- Birthdays Widget -->
          <div class="ph-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="cake" style="width:14px;height:14px"></i> Birthdays</span>
              <button class="ph-card-link" onclick="viewAllBirthdays()">View all →</button>
            </div>
            <div id="ph-bday-wrap">
              ${_renderHomeBdayTabs()}
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="ph-card ph-recent-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="activity" style="width:14px;height:14px"></i> Recent Activity</span>
              <button class="ph-card-link" onclick="Router.go('log')">View all →</button>
            </div>
            <div id="ph-recent-list">
              ${recentItems.length
                ? recentItems.map(r => `
                    <div class="ph-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                      ${Components.avatar(r.name, 28)}
                      <div class="ph-recent-body">
                        <div class="ph-recent-name">${esc(r.name)}</div>
                        <div class="ph-recent-action">${esc(r.action)} · <span class="ph-recent-time">${esc(r.time)}</span></div>
                      </div>
                    </div>`).join('')
                : Components.emptyState({ icon: '<i data-lucide="activity" style="width:32px;height:32px;stroke-width:1.5;opacity:.3"></i>', title: 'No recent activity' })
              }
            </div>
          </div>

        </div>
      </div>

      <!-- ── FEATURE BANNER ── -->
      <div class="ph-feature-banner">
        <div class="ph-fb-hero">
          <div class="ph-fb-hero-title">Everything you need,<br>in one place.</div>
          <div class="ph-fb-hero-sub">Manage your workforce efficiently<br>with all the tools at your fingertips.</div>
        </div>
        <div class="ph-fb-actions">
          ${canWrite() ? `
          <div class="ph-fb-action" onclick="openAddModal()">
            <div class="ph-fb-action-icon"><i data-lucide="user-plus"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Add New Employee</div>
              <div class="ph-fb-action-sub">Create a new employee profile</div>
            </div>
          </div>` : ''}
          <div class="ph-fb-action" onclick="Router.go('tracker')">
            <div class="ph-fb-action-icon"><i data-lucide="map-pin"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Deployment Tracker</div>
              <div class="ph-fb-action-sub">Track employee deployments</div>
            </div>
          </div>
          <div class="ph-fb-action" onclick="Router.go('log')">
            <div class="ph-fb-action-icon"><i data-lucide="file-text"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Activity Log</div>
              <div class="ph-fb-action-sub">View all record changes</div>
            </div>
          </div>
          <div class="ph-fb-action" onclick="Router.go('analytics')">
            <div class="ph-fb-action-icon"><i data-lucide="bar-chart-2"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Generate Report</div>
              <div class="ph-fb-action-sub">Create custom reports</div>
            </div>
          </div>
          ${(typeof currentRole !== 'undefined' && currentRole === 'owner') ? `
          <div class="ph-fb-action" onclick="Router.go('settings')">
            <div class="ph-fb-action-icon"><i data-lucide="settings"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Settings</div>
              <div class="ph-fb-action-sub">Configure the system</div>
            </div>
          </div>` : ''}
        </div>
      </div>

    </div>`;

  _injectHomeStyles();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Async: render calendar (needs events loaded first)
  _phLoadEventsAndRender();

  // Async: lazy-load recent activity
  if (!logCache) {
    gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H` })
      .then(r => {
        logCache = r.result.values || [];
        const el = document.getElementById('ph-recent-list');
        if (!el) return;
        const items = _buildRecentList(8);
        el.innerHTML = items.length
          ? items.map(r => `
              <div class="ph-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                ${Components.avatar(r.name, 28)}
                <div class="ph-recent-body">
                  <div class="ph-recent-name">${esc(r.name)}</div>
                  <div class="ph-recent-action">${esc(r.action)} · <span class="ph-recent-time">${esc(r.time)}</span></div>
                </div>
              </div>`).join('')
          : Components.emptyState({ icon: '<i data-lucide="activity" style="width:32px;height:32px;stroke-width:1.5;opacity:.3"></i>', title: 'No recent activity' });
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }).catch(() => {});
  }

  // Async: lazy-load announcements
  if (!announcementsCache || announcementsCache.length === 0) {
    if (typeof loadAnnouncements === 'function') {
      loadAnnouncements().then(() => {
        _renderHomeAnnouncements();
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }).catch(() => {});
    }
  } else {
    _renderHomeAnnouncements();
  }
}

// ── Announcements renderer for home panel ─────────────────
function _renderHomeAnnouncements() {
  const el = document.getElementById('ph-ann-body');
  if (!el) return;
  const list = announcementsCache || [];
  if (!list.length) {
    el.innerHTML = `<div class="ph-ann-empty"><i data-lucide="bell-off" style="width:20px;height:20px;opacity:.3"></i><span>No announcements yet</span></div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }
  // Show all announcements as a scrollable list (max 4, with scroll)
  el.innerHTML = `<div class="ph-ann-scroll">
    ${list.map((a, i) => `
      <div class="ph-ann-item${i < list.length - 1 ? ' ph-ann-item-sep' : ''}">
        <div class="ph-ann-title">${esc(a.title)}</div>
        <div class="ph-ann-body-text">${esc(a.body)}</div>
        <div class="ph-ann-meta">Posted by ${esc(a.postedBy)} · ${esc(a.timestamp)}</div>
      </div>`).join('')}
  </div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Birthday tabs renderer for home ───────────────────────
function _renderHomeBdayTabs() {
  if (typeof getBirthdaysToday !== 'function') return '<div style="font-size:12px;color:var(--text3);padding:8px 0">Loading…</div>';
  const bdayToday = getBirthdaysToday();
  const bdayWeek  = (typeof getBirthdaysThisWeek  === 'function') ? getBirthdaysThisWeek()  : [];
  const bdayMonth = (typeof getBirthdaysThisMonth === 'function') ? getBirthdaysThisMonth() : [];

  return `
    <div class="ph-bday-tabs">
      <button class="ph-bday-tab active" onclick="_phBdayTab('today',this)">
        Today${bdayToday.length ? `<span class="ph-tab-badge ph-tab-badge-warn">${bdayToday.length}</span>` : ''}
      </button>
      <button class="ph-bday-tab" onclick="_phBdayTab('week',this)">
        This Week${bdayWeek.length ? `<span class="ph-tab-badge">${bdayWeek.length}</span>` : ''}
      </button>
      <button class="ph-bday-tab" onclick="_phBdayTab('month',this)">
        This Month${bdayMonth.length ? `<span class="ph-tab-badge ph-tab-badge-dim">${bdayMonth.length}</span>` : ''}
      </button>
    </div>
    <div id="ph-bday-today" class="ph-bday-pane">${_renderBdayList(bdayToday)}</div>
    <div id="ph-bday-week"  class="ph-bday-pane" style="display:none">${_renderBdayList(bdayWeek)}</div>
    <div id="ph-bday-month" class="ph-bday-pane" style="display:none">${_renderBdayList(bdayMonth)}</div>`;
}

function _phBdayTab(key, btn) {
  document.querySelectorAll('.ph-bday-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['today','week','month'].forEach(k => {
    const el = document.getElementById(`ph-bday-${k}`);
    if (el) el.style.display = k === key ? '' : 'none';
  });
}

function _renderBdayList(list) {
  if (!list || !list.length) return `<div class="ph-bday-empty"><i data-lucide="party-popper" style="width:20px;height:20px;opacity:.25"></i><span>None</span></div>`;
  return list.map(item => {
    // getBirthdaysToday/ThisWeek/ThisMonth return { emp, day, daysUntil } objects
    const emp  = item.emp  || item;
    const name = esc(emp.fullName || emp.name || '');
    const store = emp.storeAssignment ? esc(emp.storeAssignment) : '';
    const isToday = item.daysUntil === 0;
    const label   = isToday ? '🎉 Today!' : (item.daysUntil > 0 ? `in ${item.daysUntil}d` : `${Math.abs(item.daysUntil)}d ago`);
    return `
      <div class="ph-bday-row" onclick="openDetailPanel('${esc(emp.infinixId || '')}')">
        ${Components.avatar(name, 28)}
        <div class="ph-bday-info">
          <div class="ph-bday-name">${name}</div>
          ${store ? `<div class="ph-bday-store">${store}</div>` : ''}
        </div>
        <div class="ph-bday-when${isToday ? ' ph-bday-when-today' : ''}">${label}</div>
      </div>`;
  }).join('');
}

// ============================================================
// EVENTS SHEET — load, render, add, delete
// ============================================================
async function _phLoadEventsAndRender() {
  // If already cached, skip fetch
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
        id:       r[0] || '',
        title:    r[1] || '',
        date:     r[2] || '',           // YYYY-MM-DD
        note:     r[3] || '',
        postedBy: r[4] || '',
        active:   String(r[5] || 'TRUE').trim().toUpperCase() !== 'FALSE',
        _row:     rows.indexOf(r) + 2,  // 1-indexed, header is row 1
      }));
  } catch (e) {
    console.warn('Events load error:', e);
    _calEventsCache = [];
  }
  _phCalRender();
  _phRenderEventsList();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Render the upcoming events list card
function _phRenderEventsList() {
  const el = document.getElementById('ph-events-list');
  if (!el) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = (_calEventsCache || [])
    .filter(ev => {
      const d = new Date(ev.date);
      return !isNaN(d) && d >= today;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);

  if (!events.length) {
    el.innerHTML = `<div class="ph-ev-empty"><i data-lucide="calendar-x" style="width:20px;height:20px;opacity:.25"></i><span>No upcoming events</span></div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  el.innerHTML = events.map(ev => {
    const d        = new Date(ev.date);
    const diffDays = Math.round((d - today) / 86400000);
    const isToday  = diffDays === 0;
    const isSoon   = diffDays <= 3;
    const dayLabel = isToday ? 'Today' : diffDays === 1 ? 'Tomorrow' : `in ${diffDays}d`;
    const monthLabel = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

    return `
      <div class="ph-ev-row${isToday ? ' ph-ev-today' : ''}">
        <div class="ph-ev-date-badge${isToday ? ' ph-ev-badge-today' : isSoon ? ' ph-ev-badge-soon' : ''}">
          <div class="ph-ev-day">${d.getDate()}</div>
          <div class="ph-ev-mon">${d.toLocaleDateString('en-PH', { month: 'short' })}</div>
        </div>
        <div class="ph-ev-body">
          <div class="ph-ev-title">${esc(ev.title)}</div>
          ${ev.note ? `<div class="ph-ev-note">${esc(ev.note)}</div>` : ''}
          <div class="ph-ev-meta">${esc(ev.postedBy)} · <span class="ph-ev-when${isSoon ? ' ph-ev-when-soon' : ''}">${dayLabel}</span></div>
        </div>
        ${canViewSensitive() ? `<button class="ph-ev-del" onclick="_phDeleteEvent('${esc(ev.id)}',${ev._row},event)" title="Remove event">
          <i data-lucide="x" style="width:11px;height:11px"></i>
        </button>` : ''}
      </div>`;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Add event modal ────────────────────────────────────────
function _phOpenAddEvent() {
  if (!canViewSensitive()) { toast('Only HR/Agency or Owner can add events.', 'error'); return; }

  const overlay = document.createElement('div');
  overlay.id = 'ph-ev-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  const today = new Date().toISOString().split('T')[0];
  overlay.innerHTML = `
    <div class="ph-modal-box">
      <div class="ph-modal-header">
        <span style="font-size:14px;font-weight:700;color:var(--text1)">
          <i data-lucide="calendar-plus" style="width:16px;height:16px;vertical-align:-2px;margin-right:6px"></i>Add Calendar Event
        </span>
        <button class="ph-modal-close" onclick="document.getElementById('ph-ev-modal').remove()">✕</button>
      </div>
      <div class="ph-modal-body">
        <label class="ph-modal-label">Event Title <span style="color:var(--danger)">*</span></label>
        <input id="ph-ev-title" class="ph-modal-input" placeholder="e.g. Team Meeting, Training Day…">

        <label class="ph-modal-label" style="margin-top:10px">Date <span style="color:var(--danger)">*</span></label>
        <input id="ph-ev-date" type="date" class="ph-modal-input" value="${today}">

        <label class="ph-modal-label" style="margin-top:10px">Note / Details</label>
        <textarea id="ph-ev-note" class="ph-modal-input" rows="3" placeholder="Optional description…" style="resize:vertical"></textarea>

        <label class="ph-modal-label" style="margin-top:10px">Posted By</label>
        <input id="ph-ev-by" class="ph-modal-input" placeholder="e.g. HR – Candy" value="${esc(currentUser?.name || '')}">
      </div>
      <div class="ph-modal-footer">
        <button class="ph-modal-cancel" onclick="document.getElementById('ph-ev-modal').remove()">Cancel</button>
        <button class="ph-modal-submit" onclick="_phSubmitEvent()">
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
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [[id, title, date, note, by, 'TRUE']] }
    });
    toast('Event added!', 'success');
    document.getElementById('ph-ev-modal')?.remove();
    // Invalidate cache and re-render
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
    // Mark as inactive rather than delete (safer, preserves row indices)
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!F${rowNum}`,
      valueInputOption: 'RAW',
      resource: { values: [['FALSE']] }
    });
    toast('Event removed.', 'success');
    _calEventsCache = null;
    _phLoadEventsAndRender();
  } catch (e) {
    toast('Failed to remove event.', 'error');
  }
}

// ============================================================
// CALENDAR — state & render
// ============================================================
let _phCalYear  = new Date().getFullYear();
let _phCalMonth = new Date().getMonth();
let _phCalSelectedDay = null;

function _phCalPrev() { _phCalMonth--; if (_phCalMonth < 0) { _phCalMonth = 11; _phCalYear--; } _phCalRender(); }
function _phCalNext() { _phCalMonth++; if (_phCalMonth > 11) { _phCalMonth = 0; _phCalYear++; } _phCalRender(); }

function _phCalRender() {
  const calEl   = document.getElementById('ph-calendar');
  const labelEl = document.getElementById('ph-cal-label');
  if (!calEl) return;

  const today = new Date();
  const year  = _phCalYear;
  const month = _phCalMonth;

  if (labelEl) labelEl.textContent = new Date(year, month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Birthday dots
  const bdayDays = new Set();
  if (typeof getBirthdaysThisMonth === 'function' && year === today.getFullYear() && month === today.getMonth()) {
    getBirthdaysThisMonth().forEach(item => {
      const emp = item.emp || item;
      const d   = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
      if (!isNaN(d)) bdayDays.add(d.getDate());
    });
  }

  // HR event dots — build a map: day → array of events
  const eventsByDay = {};
  (_calEventsCache || []).forEach(ev => {
    const d = new Date(ev.date);
    if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(ev);
  });

  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = `<div class="ph-cal-grid">`;
  html += dayNames.map(d => `<div class="ph-cal-dayname">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += `<div class="ph-cal-cell ph-cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday   = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const isBday    = bdayDays.has(d);
    const hasEvent  = !!eventsByDay[d];
    const evCount   = hasEvent ? eventsByDay[d].length : 0;

    let cls = 'ph-cal-cell';
    if (isToday)  cls += ' ph-cal-today';
    if (isBday)   cls += ' ph-cal-bday';
    if (hasEvent) cls += ' ph-cal-has-event';

    const dots = hasEvent ? `<span class="ph-cal-event-dot"></span>` : '';
    const bdayDot = isBday ? `<span class="ph-cal-bday-dot"></span>` : '';

    html += `<div class="${cls}" onclick="_phCalDayClick(${d},${year},${month})" title="${hasEvent ? evCount + ' event' + (evCount>1?'s':'') : ''}${isBday ? (hasEvent ? ' · ' : '') + '🎂 Birthday' : ''}">${d}<div class="ph-cal-dots">${dots}${bdayDot}</div></div>`;
  }
  html += `</div>`;
  calEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phCalDayClick(day, year, month) {
  const popover = document.getElementById('ph-cal-popover');
  if (!popover) return;

  const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const events  = (_calEventsCache || []).filter(ev => ev.date === dateStr);

  const bdayDays = new Set();
  if (typeof getBirthdaysThisMonth === 'function') {
    const todayObj = new Date();
    if (year === todayObj.getFullYear() && month === todayObj.getMonth()) {
      getBirthdaysThisMonth().forEach(item => {
        const emp = item.emp || item;
        const d   = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
        if (!isNaN(d) && d.getDate() === day) bdayDays.add(emp.fullName || emp.name || '?');
      });
    }
  }

  const dateLabel = new Date(year, month, day).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  let body = '';
  if (events.length) {
    body += events.map(ev => `
      <div class="ph-pop-event">
        <i data-lucide="calendar-check" style="width:12px;height:12px;color:var(--accent);flex-shrink:0"></i>
        <div>
          <div class="ph-pop-ev-title">${esc(ev.title)}</div>
          ${ev.note ? `<div class="ph-pop-ev-note">${esc(ev.note)}</div>` : ''}
          ${ev.postedBy ? `<div class="ph-pop-ev-by">${esc(ev.postedBy)}</div>` : ''}
        </div>
      </div>`).join('');
  }
  if (bdayDays.size) {
    body += [...bdayDays].map(name => `
      <div class="ph-pop-event">
        <i data-lucide="cake" style="width:12px;height:12px;color:var(--warning);flex-shrink:0"></i>
        <div class="ph-pop-ev-title" style="color:var(--warning)">${esc(name)} 🎉</div>
      </div>`).join('');
  }

  if (!body) {
    // No events — offer to add one if HR
    body = canViewSensitive()
      ? `<div style="font-size:11px;color:var(--text3);text-align:center;padding:4px 0">No events.
          <button class="ph-card-link" style="font-size:11px" onclick="_phOpenAddEventDate('${dateStr}')">Add one?</button></div>`
      : `<div style="font-size:11px;color:var(--text3);text-align:center;padding:4px 0">No events.</div>`;
  }

  popover.innerHTML = `
    <div class="ph-pop-header">
      <span class="ph-pop-date">${dateLabel}</span>
      <button class="ph-pop-close" onclick="document.getElementById('ph-cal-popover').style.display='none'">✕</button>
    </div>
    ${body}`;

  popover.style.display = 'block';
  lucide && lucide.createIcons();
}

function _phOpenAddEventDate(date) {
  document.getElementById('ph-cal-popover').style.display = 'none';
  _phOpenAddEvent();
  setTimeout(() => {
    const d = document.getElementById('ph-ev-date');
    if (d) d.value = date;
  }, 80);
}

// ============================================================
// HELPERS
// ============================================================
function _buildRecentList(limit = 8) {
  if (!logCache || !logCache.length) return [];
  return logCache.slice(-60).reverse()
    .slice(0, limit)
    .map(row => ({
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
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function _formatDate(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ============================================================
// STYLES
// ============================================================
function _injectHomeStyles() {
  if (document.getElementById('page-home-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-home-styles';
  s.textContent = `
    /* ── Layout ── */
    .ph-wrap {
      padding: 20px 24px;
      max-width: 1280px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* ── Greeting ── */
    .ph-greeting { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .ph-greeting-text { display: flex; flex-direction: column; gap: 2px; }
    .ph-hi   { font-size: 20px; font-weight: 700; color: var(--text1); }
    .ph-date { font-size: 12px; color: var(--text3); }

    /* ── Quick actions ── */
    .ph-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .ph-qa-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 13px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--border); border-radius: 7px;
      background: var(--bg2); color: var(--text2); cursor: pointer;
      transition: border-color .15s, background .15s, color .15s;
    }
    .ph-qa-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(0,255,224,.04); }
    .ph-qa-primary { background: var(--accent) !important; color: #000 !important; border-color: var(--accent) !important; font-weight: 600; }
    .ph-qa-primary:hover { opacity: .88; }

    /* ── Birthday banner ── */
    .ph-bday-banner {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 14px; border-radius: 8px; font-size: 12.5px;
      background: rgba(245,200,66,.08); border: 1px solid rgba(245,200,66,.25);
      color: var(--warning);
    }

    /* ── Stat cards ── */
    .ph-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    @media (max-width: 960px) { .ph-stats { grid-template-columns: repeat(2, 1fr); } }

    /* ── 3-col main grid ── */
    .ph-main-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      align-items: start;
    }
    @media (max-width: 1100px) { .ph-main-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 680px)  { .ph-main-grid { grid-template-columns: 1fr; } }
    .ph-col { display: flex; flex-direction: column; gap: 12px; }

    /* ── Generic card ── */
    .ph-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,.18);
    }
    [data-theme="light"] .ph-card {
      background: #fff;
      box-shadow: 0 2px 12px rgba(10,138,133,.07);
    }
    .ph-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .ph-card-title {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase; color: var(--text3);
    }
    [data-theme="light"] .ph-card-title { color: #076e6a; }
    .ph-card-link {
      font-size: 11.5px; color: var(--accent); background: none;
      border: none; cursor: pointer; padding: 0; font-weight: 500;
    }
    .ph-card-link:hover { opacity: .75; }

    /* ── Announcements ── */
    .ph-ann-scroll { display: flex; flex-direction: column; gap: 0; max-height: 200px; overflow-y: auto; }
    .ph-ann-item { display: flex; flex-direction: column; gap: 3px; padding: 8px 0; }
    .ph-ann-item-sep { border-bottom: 1px solid var(--border); }
    .ph-ann-title { font-size: 12.5px; font-weight: 600; color: var(--text1); }
    .ph-ann-body-text {
      font-size: 11.5px; color: var(--text2); line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .ph-ann-meta { font-size: 10.5px; color: var(--text3); margin-top: 2px; }
    .ph-ann-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0; color: var(--text3); font-size: 12px; }

    /* ── Status breakdown ── */
    .ph-status-list { display: flex; flex-direction: column; gap: 5px; }
    .ph-status-row {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      padding: 3px 6px; border-radius: 6px; transition: background .15s;
    }
    .ph-status-row:hover { background: rgba(255,255,255,.04); }
    [data-theme="light"] .ph-status-row:hover { background: rgba(10,138,133,.05); }
    .ph-status-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .ph-status-name { font-size: 11.5px; color: var(--text2); min-width: 76px; }
    .ph-status-count { font-size: 11.5px; font-weight: 600; color: var(--text1); min-width: 26px; text-align: right; }
    .ph-status-bar-wrap { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .ph-status-bar-fill { height: 100%; border-radius: 2px; transition: width .4s ease; }

    /* ── Calendar ── */
    .ph-cal-card { position: relative; }
    .ph-cal-nav {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border: 1px solid var(--border);
      border-radius: 5px; background: var(--bg2); cursor: pointer; color: var(--text2);
      transition: border-color .15s;
    }
    .ph-cal-nav:hover { border-color: var(--accent); color: var(--accent); }
    .ph-cal-add-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border: 1px solid var(--accent);
      border-radius: 5px; background: rgba(0,255,224,.08); cursor: pointer; color: var(--accent);
      transition: background .15s;
    }
    .ph-cal-add-btn:hover { background: rgba(0,255,224,.16); }
    .ph-cal-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 2px; margin-top: 2px;
    }
    .ph-cal-dayname {
      font-size: 9.5px; font-weight: 700; color: var(--text3);
      text-align: center; padding: 3px 0; text-transform: uppercase;
    }
    .ph-cal-cell {
      text-align: center; font-size: 11px; padding: 4px 2px 2px;
      border-radius: 5px; color: var(--text2); cursor: pointer;
      transition: background .12s; position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 1px;
    }
    .ph-cal-cell:hover:not(.ph-cal-empty) { background: rgba(255,255,255,.06); }
    .ph-cal-empty { background: none !important; cursor: default; }
    .ph-cal-today {
      background: var(--accent) !important; color: #000 !important;
      font-weight: 700; border-radius: 5px;
    }
    .ph-cal-today .ph-cal-event-dot { background: #000 !important; }
    .ph-cal-today .ph-cal-bday-dot  { background: rgba(0,0,0,.5) !important; }
    .ph-cal-bday { color: var(--warning); font-weight: 600; }
    .ph-cal-has-event { background: rgba(0,255,224,.06); }
    .ph-cal-dots { display: flex; justify-content: center; gap: 2px; height: 5px; }
    .ph-cal-event-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: var(--accent); flex-shrink: 0;
    }
    .ph-cal-bday-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: var(--warning); flex-shrink: 0;
    }

    /* ── Calendar popover ── */
    .ph-cal-popover {
      position: relative; margin-top: 8px;
      background: var(--bg2, rgba(14,20,20,0.98)); border: 1px solid var(--border);
      border-radius: 9px; padding: 10px 12px; z-index: 40;
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
      display: flex; flex-direction: column; gap: 7px;
      animation: phPopIn .15s ease-out;
    }
    @keyframes phPopIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
    .ph-pop-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
    .ph-pop-date   { font-size: 11px; font-weight: 700; color: var(--text1); }
    .ph-pop-close  { background: none; border: none; cursor: pointer; color: var(--text3); font-size: 12px; padding: 0; line-height: 1; }
    .ph-pop-close:hover { color: var(--text1); }
    .ph-pop-event  { display: flex; align-items: flex-start; gap: 7px; }
    .ph-pop-ev-title { font-size: 11.5px; font-weight: 600; color: var(--text1); }
    .ph-pop-ev-note  { font-size: 10.5px; color: var(--text2); margin-top: 1px; }
    .ph-pop-ev-by    { font-size: 10px; color: var(--text3); }

    /* ── Upcoming Events ── */
    .ph-ev-row {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 6px; border-radius: 7px;
      transition: background .15s; cursor: default;
    }
    .ph-ev-row:not(:last-child) { border-bottom: 1px solid var(--border); }
    .ph-ev-today { background: rgba(0,255,224,.04); }
    .ph-ev-date-badge {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 36px; min-width: 36px; height: 38px;
      border-radius: 7px; background: var(--bg3, rgba(255,255,255,.05));
      border: 1px solid var(--border); flex-shrink: 0;
    }
    .ph-ev-badge-today { background: rgba(0,255,224,.12); border-color: var(--accent); }
    .ph-ev-badge-soon  { background: rgba(245,200,66,.1); border-color: rgba(245,200,66,.4); }
    .ph-ev-day { font-size: 15px; font-weight: 800; line-height: 1; color: var(--text1); }
    .ph-ev-mon { font-size: 9px; font-weight: 600; color: var(--text3); text-transform: uppercase; margin-top: 1px; }
    .ph-ev-body { flex: 1; min-width: 0; }
    .ph-ev-title { font-size: 12px; font-weight: 600; color: var(--text1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-ev-note  { font-size: 11px; color: var(--text2); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-ev-meta  { font-size: 10.5px; color: var(--text3); margin-top: 2px; }
    .ph-ev-when  { color: var(--text3); }
    .ph-ev-when-soon { color: var(--warning); font-weight: 600; }
    .ph-ev-del {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: 4px; border: 1px solid transparent;
      background: none; cursor: pointer; color: var(--text3);
      opacity: 0; transition: opacity .15s, background .15s;
    }
    .ph-ev-row:hover .ph-ev-del { opacity: 1; }
    .ph-ev-del:hover { background: rgba(224,92,92,.15); border-color: rgba(224,92,92,.4); color: var(--danger); }
    .ph-ev-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0; color: var(--text3); font-size: 12px; }

    /* ── Birthday card ── */
    .ph-bday-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
    .ph-bday-tab {
      flex: 1; padding: 5px 4px; font-size: 10.5px; font-weight: 600;
      border: 1px solid var(--border); border-radius: 6px;
      background: none; color: var(--text3); cursor: pointer;
      transition: border-color .15s, color .15s, background .15s;
      display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    }
    .ph-bday-tab:hover { border-color: var(--accent); color: var(--accent); }
    .ph-bday-tab.active { background: rgba(0,255,224,.1); border-color: var(--accent); color: var(--accent); }
    .ph-tab-badge {
      font-size: 9px; font-weight: 700; padding: 1px 5px;
      border-radius: 20px; background: var(--accent-dim,rgba(0,255,224,.15));
      color: var(--accent); line-height: 1.4;
    }
    .ph-tab-badge-warn { background: rgba(245,200,66,.2); color: var(--warning); }
    .ph-tab-badge-dim  { background: rgba(255,255,255,.08); color: var(--text2); }
    .ph-bday-pane { display: flex; flex-direction: column; gap: 0; max-height: 180px; overflow-y: auto; }
    .ph-bday-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 4px; border-radius: 6px; cursor: pointer;
      transition: background .15s;
    }
    .ph-bday-row:hover { background: rgba(255,255,255,.04); }
    .ph-bday-info { flex: 1; min-width: 0; }
    .ph-bday-name  { font-size: 12px; font-weight: 500; color: var(--text1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-bday-store { font-size: 10.5px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-bday-when  { font-size: 10.5px; color: var(--text3); white-space: nowrap; font-weight: 500; }
    .ph-bday-when-today { color: var(--warning); font-weight: 700; }
    .ph-bday-empty { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 14px 0; color: var(--text3); font-size: 11.5px; }

    /* ── Recent activity ── */
    .ph-recent-card .ph-recent-item {
      display: flex; align-items: center; gap: 9px; padding: 6px 5px;
      border-radius: 6px; cursor: pointer; transition: background .15s;
    }
    .ph-recent-card .ph-recent-item:hover { background: rgba(255,255,255,.04); }
    .ph-recent-body { flex: 1; min-width: 0; }
    .ph-recent-name   { font-size: 12px; font-weight: 500; color: var(--text1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ph-recent-action { font-size: 11px; color: var(--text3); }
    .ph-recent-time   { color: var(--accent); }

    /* ── Feature Banner ── */
    .ph-feature-banner {
      display: flex; align-items: stretch; gap: 0;
      background: linear-gradient(135deg, rgba(0,255,224,0.06) 0%, rgba(0,184,160,0.03) 50%, rgba(74,100,220,0.05) 100%);
      border: 1px solid var(--border); border-radius: 12px;
      overflow: hidden;
    }
    [data-theme="light"] .ph-feature-banner {
      background: linear-gradient(135deg, rgba(10,138,133,0.06) 0%, rgba(10,138,133,0.02) 100%);
    }
    .ph-fb-hero {
      display: flex; flex-direction: column; justify-content: center; gap: 6px;
      padding: 20px 24px; min-width: 200px; max-width: 240px;
      background: linear-gradient(135deg, rgba(0,255,224,0.10) 0%, rgba(0,184,160,0.05) 100%);
      border-right: 1px solid var(--border);
    }
    [data-theme="light"] .ph-fb-hero {
      background: linear-gradient(135deg, rgba(10,138,133,0.12) 0%, rgba(10,138,133,0.05) 100%);
    }
    .ph-fb-hero-title {
      font-size: 14px; font-weight: 800; color: var(--text1); line-height: 1.3;
    }
    .ph-fb-hero-sub {
      font-size: 11px; color: var(--text3); line-height: 1.5;
    }
    .ph-fb-actions {
      display: flex; flex: 1; flex-wrap: wrap;
    }
    .ph-fb-action {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px; cursor: pointer; flex: 1; min-width: 160px;
      border-right: 1px solid var(--border);
      transition: background .15s;
    }
    .ph-fb-action:last-child { border-right: none; }
    .ph-fb-action:hover { background: rgba(0,255,224,.05); }
    [data-theme="light"] .ph-fb-action:hover { background: rgba(10,138,133,.06); }
    .ph-fb-action-icon {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
      background: rgba(255,255,255,.05); border: 1px solid var(--border);
      color: var(--accent);
    }
    [data-theme="light"] .ph-fb-action-icon { background: rgba(10,138,133,.08); }
    .ph-fb-action-icon i, .ph-fb-action-icon svg { width: 16px; height: 16px; stroke-width: 1.8; }
    .ph-fb-action-title { font-size: 12px; font-weight: 600; color: var(--text1); }
    .ph-fb-action-sub   { font-size: 10.5px; color: var(--text3); margin-top: 1px; }

    /* ── Add event modal ── */
    .ph-modal-box {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 12px; width: 100%; max-width: 440px;
      display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,.5);
    }
    .ph-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px 12px; border-bottom: 1px solid var(--border);
    }
    .ph-modal-close {
      background: none; border: none; cursor: pointer; color: var(--text3);
      font-size: 13px; padding: 0; line-height: 1; transition: color .15s;
    }
    .ph-modal-close:hover { color: var(--text1); }
    .ph-modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; }
    .ph-modal-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .ph-modal-input {
      width: 100%; padding: 8px 10px; font-size: 12.5px;
      background: var(--bg3, rgba(255,255,255,.05));
      border: 1px solid var(--border); border-radius: 7px;
      color: var(--text1); font-family: 'Poppins', sans-serif;
      box-sizing: border-box; transition: border-color .15s;
    }
    .ph-modal-input:focus { outline: none; border-color: var(--accent); }
    .ph-modal-footer {
      padding: 12px 20px 16px; display: flex; justify-content: flex-end; gap: 8px;
      border-top: 1px solid var(--border);
    }
    .ph-modal-cancel {
      padding: 7px 16px; font-size: 12px; background: none;
      border: 1px solid var(--border); border-radius: 7px;
      color: var(--text2); cursor: pointer; font-family: 'Poppins', sans-serif;
      transition: border-color .15s;
    }
    .ph-modal-cancel:hover { border-color: var(--accent); color: var(--accent); }
    .ph-modal-submit {
      padding: 7px 16px; font-size: 12px; font-weight: 600;
      background: var(--accent); color: #000;
      border: none; border-radius: 7px; cursor: pointer;
      font-family: 'Poppins', sans-serif;
      display: inline-flex; align-items: center; gap: 5px;
      transition: opacity .15s;
    }
    .ph-modal-submit:hover { opacity: .85; }

    /* comp overrides */
    .comp-stat-icon { display: flex; align-items: center; margin-bottom: 2px; }
    .comp-stat-icon i, .comp-stat-icon svg { width: 18px; height: 18px; stroke-width: 2; }
  `;
  document.head.appendChild(s);
}
