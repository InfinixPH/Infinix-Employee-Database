// ============================================================
// page-home.js — Home page
// Greeting · quick actions · stat cards · announcement preview
// mini calendar · status breakdown · recent activity · nav tiles
// ============================================================
'use strict';

function renderHome() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = 'Home';

  if (typeof employees === 'undefined' || typeof getStats === 'undefined') {
    document.getElementById('content').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Loading…</div>';
    return;
  }

  const s          = getStats();
  const total      = employees.length;
  const active     = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
                                           normalizeDeployStatus(e.deploymentStatus) !== 'BACKOUT').length;
  const deployed   = employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'DEPLOYED').length;
  const missingReqs = employees.filter(e => !requirementsComplete(e)).length;

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = currentUser?.name?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';

  // Announcement preview (latest active one)
  const ann = _getLatestAnnouncement();

  // Birthdays today
  const bdayToday = (typeof getBirthdaysToday === 'function') ? getBirthdaysToday() : [];

  // Recent log entries
  const recentItems = _buildRecentList(6);

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="ph-wrap">

      <!-- ── TOP ROW: Greeting + Quick Actions ── -->
      <div class="ph-greeting">
        <div class="ph-greeting-text">
          <span class="ph-hi">${esc(greeting)}, ${esc(userName)}</span>
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

      <!-- ── MAIN GRID ── -->
      <div class="ph-main-grid">

        <!-- LEFT COL -->
        <div class="ph-left-col">

          <!-- Announcement preview -->
          <div class="ph-card ph-ann-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="megaphone" style="width:14px;height:14px"></i> Announcements</span>
              <button class="ph-card-link" onclick="Router.go('analytics')">View all →</button>
            </div>
            <div id="ph-ann-body">
              ${ann
                ? `<div class="ph-ann-item">
                    <div class="ph-ann-title">${esc(ann.title)}</div>
                    <div class="ph-ann-body-text">${esc(ann.body)}</div>
                    <div class="ph-ann-meta">Posted by ${esc(ann.postedBy)} · ${esc(ann.time)}</div>
                   </div>`
                : `<div class="ph-ann-empty"><i data-lucide="bell-off" style="width:20px;height:20px;opacity:.3"></i><span>No announcements yet</span></div>`
              }
            </div>
          </div>

          <!-- Status breakdown -->
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

        <!-- RIGHT COL -->
        <div class="ph-right-col">

          <!-- Mini Calendar -->
          <div class="ph-card ph-cal-card">
            <div class="ph-card-header">
              <span class="ph-card-title"><i data-lucide="calendar" style="width:14px;height:14px"></i> <span id="ph-cal-label"></span></span>
              <div style="display:flex;gap:4px">
                <button class="ph-cal-nav" onclick="_phCalPrev()"><i data-lucide="chevron-left" style="width:12px;height:12px"></i></button>
                <button class="ph-cal-nav" onclick="_phCalNext()"><i data-lucide="chevron-right" style="width:12px;height:12px"></i></button>
              </div>
            </div>
            <div id="ph-calendar"></div>
          </div>

          <!-- Recent Activity -->
          <div class="ph-card">
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

      <!-- ── NAV TILES ── -->
      <div class="ph-tiles-section">
        <div class="ph-card-title ph-tiles-heading"><i data-lucide="layout-grid" style="width:13px;height:13px"></i> Quick Navigation</div>
        <div class="ph-tiles">
          <div class="ph-tile" onclick="Router.go('analytics')">
            <div class="ph-tile-icon"><i data-lucide="bar-chart-2"></i></div>
            <div class="ph-tile-label">Analytics</div>
          </div>
          <div class="ph-tile" onclick="Router.go('tracker')">
            <div class="ph-tile-icon"><i data-lucide="map-pin"></i></div>
            <div class="ph-tile-label">Tracker</div>
          </div>
          <div class="ph-tile" onclick="Router.go('log')">
            <div class="ph-tile-icon"><i data-lucide="file-text"></i></div>
            <div class="ph-tile-label">Activity Log</div>
          </div>
          <div class="ph-tile" onclick="Router.go('inactive')">
            <div class="ph-tile-icon"><i data-lucide="user-minus"></i></div>
            <div class="ph-tile-label">Inactive</div>
          </div>
          <div class="ph-tile" onclick="Router.go('people')">
            <div class="ph-tile-icon"><i data-lucide="users"></i></div>
            <div class="ph-tile-label">All People</div>
          </div>
          ${(typeof currentRole !== 'undefined' && currentRole === 'owner') ? `
          <div class="ph-tile" onclick="Router.go('settings')">
            <div class="ph-tile-icon"><i data-lucide="settings"></i></div>
            <div class="ph-tile-label">Settings</div>
          </div>` : ''}
        </div>
      </div>

    </div>`;

  // Lazy-load recent activity
  if (!logCache) {
    gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H` })
      .then(r => {
        logCache = r.result.values || [];
        const el = document.getElementById('ph-recent-list');
        if (!el) return;
        const items = _buildRecentList(6);
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

  // Also lazy-load announcements if cache empty
  if (!announcementsCache || announcementsCache.length === 0) {
    if (typeof loadAnnouncements === 'function') {
      loadAnnouncements().then(() => {
        const ann2 = _getLatestAnnouncement();
        const el = document.getElementById('ph-ann-body');
        if (!el) return;
        if (ann2) {
          el.innerHTML = `<div class="ph-ann-item">
            <div class="ph-ann-title">${esc(ann2.title)}</div>
            <div class="ph-ann-body-text">${esc(ann2.body)}</div>
            <div class="ph-ann-meta">Posted by ${esc(ann2.postedBy)} · ${esc(ann2.time)}</div>
          </div>`;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }).catch(() => {});
    }
  }

  _injectHomeStyles();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Render calendar after lucide
  _phCalRender();
}

// ── Calendar state & render ────────────────────────────────
let _phCalYear  = new Date().getFullYear();
let _phCalMonth = new Date().getMonth();

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

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Get birthday days this month for highlights
  const bdayDays = new Set();
  if (typeof getBirthdaysThisMonth === 'function' && year === today.getFullYear() && month === today.getMonth()) {
    getBirthdaysThisMonth().forEach(e => {
      const d = new Date(e.birthdate || e.dateOfBirth || e.dob || '');
      if (!isNaN(d)) bdayDays.add(d.getDate());
    });
  }

  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = `<div class="ph-cal-grid">`;
  html += dayNames.map(d => `<div class="ph-cal-dayname">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += `<div class="ph-cal-cell ph-cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const isBday  = bdayDays.has(d);
    html += `<div class="ph-cal-cell${isToday ? ' ph-cal-today' : ''}${isBday ? ' ph-cal-bday' : ''}" title="${isBday ? '🎂 Birthday' : ''}">${d}</div>`;
  }
  html += `</div>`;
  calEl.innerHTML = html;
}

// ── Helpers ────────────────────────────────────────────────
function _getLatestAnnouncement() {
  if (!announcementsCache || !announcementsCache.length) return null;
  const active = announcementsCache.filter(a => String(a.active || a.Active || '').toLowerCase() !== 'false');
  if (!active.length) return null;
  const a = active[active.length - 1];
  return {
    title:    a.title    || a.Title    || '(No title)',
    body:     a.body     || a.Body     || '',
    postedBy: a.postedBy || a.PostedBy || '—',
    time:     a.timestamp || a.Timestamp ? _relativeTime(new Date(a.timestamp || a.Timestamp)) : '—',
  };
}

function _buildRecentList(limit = 6) {
  if (!logCache || !logCache.length) return [];
  return logCache.slice(-50).reverse()
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

function _injectHomeStyles() {
  if (document.getElementById('page-home-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-home-styles';
  s.textContent = `
    .ph-wrap { padding: 20px 24px; max-width: 1140px; display: flex; flex-direction: column; gap: 16px; }

    /* Greeting */
    .ph-greeting { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .ph-greeting-text { display: flex; flex-direction: column; gap: 2px; }
    .ph-hi   { font-size: 20px; font-weight: 700; color: var(--text1); }
    .ph-date { font-size: 12px; color: var(--text3); }

    /* Quick actions */
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

    /* Birthday banner */
    .ph-bday-banner {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 14px; border-radius: 8px; font-size: 12.5px;
      background: rgba(245,200,66,.08); border: 1px solid rgba(245,200,66,.25);
      color: var(--warning);
    }

    /* Stat cards */
    .ph-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    @media (max-width: 900px) { .ph-stats { grid-template-columns: repeat(2, 1fr); } }

    /* Main grid */
    .ph-main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 820px) { .ph-main-grid { grid-template-columns: 1fr; } }
    .ph-left-col, .ph-right-col { display: flex; flex-direction: column; gap: 12px; }

    /* Generic card */
    .ph-card {
      background: var(--card, var(--bg2));
      border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px;
    }
    .ph-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .ph-card-title {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: var(--text3);
    }
    .ph-card-link {
      font-size: 11.5px; color: var(--accent); background: none;
      border: none; cursor: pointer; padding: 0; font-weight: 500;
    }
    .ph-card-link:hover { opacity: .75; }

    /* Announcement */
    .ph-ann-item { display: flex; flex-direction: column; gap: 4px; }
    .ph-ann-title { font-size: 13px; font-weight: 600; color: var(--text1); }
    .ph-ann-body-text {
      font-size: 12px; color: var(--text2); line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    }
    .ph-ann-meta { font-size: 11px; color: var(--text3); margin-top: 2px; }
    .ph-ann-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0; color: var(--text3); font-size: 12px; }

    /* Status breakdown */
    .ph-status-list { display: flex; flex-direction: column; gap: 6px; }
    .ph-status-row {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      padding: 3px 6px; border-radius: 6px; transition: background .15s;
    }
    .ph-status-row:hover { background: var(--bg3, rgba(255,255,255,.04)); }
    .ph-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .ph-status-name  { font-size: 12px; color: var(--text2); min-width: 76px; }
    .ph-status-count { font-size: 12px; font-weight: 600; color: var(--text1); min-width: 26px; text-align: right; }
    .ph-status-bar-wrap { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .ph-status-bar-fill { height: 100%; border-radius: 2px; transition: width .4s ease; }

    /* Calendar */
    .ph-cal-card {}
    .ph-cal-nav {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border: 1px solid var(--border);
      border-radius: 5px; background: var(--bg2); cursor: pointer; color: var(--text2);
      transition: border-color .15s;
    }
    .ph-cal-nav:hover { border-color: var(--accent); color: var(--accent); }
    .ph-cal-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 2px; margin-top: 2px;
    }
    .ph-cal-dayname {
      font-size: 10px; font-weight: 600; color: var(--text3);
      text-align: center; padding: 3px 0; text-transform: uppercase;
    }
    .ph-cal-cell {
      text-align: center; font-size: 11.5px; padding: 4px 2px;
      border-radius: 5px; color: var(--text2); cursor: default;
      transition: background .12s;
    }
    .ph-cal-empty { background: none !important; }
    .ph-cal-today {
      background: var(--accent) !important; color: #000 !important;
      font-weight: 700; border-radius: 5px;
    }
    .ph-cal-bday {
      background: rgba(245,200,66,.18); color: var(--warning);
      font-weight: 600;
    }
    .ph-cal-bday.ph-cal-today { background: var(--accent) !important; color: #000 !important; }

    /* Recent activity */
    .ph-recent-item {
      display: flex; align-items: center; gap: 9px; padding: 6px 5px;
      border-radius: 6px; cursor: pointer; transition: background .15s;
    }
    .ph-recent-item:hover { background: var(--bg3, rgba(255,255,255,.04)); }
    .ph-recent-body { flex: 1; min-width: 0; }
    .ph-recent-name   { font-size: 12px; font-weight: 500; color: var(--text1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ph-recent-action { font-size: 11px; color: var(--text3); }
    .ph-recent-time   { color: var(--accent); }

    /* Nav tiles */
    .ph-tiles-section { display: flex; flex-direction: column; gap: 8px; }
    .ph-tiles-heading { margin-bottom: 0; }
    .ph-tiles { display: flex; gap: 8px; flex-wrap: wrap; }
    .ph-tile {
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      padding: 12px 18px; background: var(--card, var(--bg2));
      border: 1px solid var(--border); border-radius: 10px; cursor: pointer;
      min-width: 80px; transition: border-color .18s, background .18s;
    }
    .ph-tile:hover { border-color: var(--accent); background: rgba(0,255,224,.04); }
    .ph-tile-icon { display: flex; align-items: center; justify-content: center; color: var(--text2); }
    .ph-tile:hover .ph-tile-icon { color: var(--accent); }
    .ph-tile-icon i, .ph-tile-icon svg { width: 18px; height: 18px; stroke-width: 1.8; }
    .ph-tile-label { font-size: 11px; font-weight: 500; color: var(--text2); white-space: nowrap; }

    /* comp overrides */
    .comp-stat-icon { display: flex; align-items: center; margin-bottom: 2px; }
    .comp-stat-icon i, .comp-stat-icon svg { width: 18px; height: 18px; stroke-width: 2; }
  `;
  document.head.appendChild(s);
}
