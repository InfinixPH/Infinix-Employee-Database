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
  if (titleEl) titleEl.textContent = '';

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
  const attendance  = employees.filter(e => normalizeStatus(e.status) === 'Active').length;
  const compliance  = total > 0 ? Math.round(((total - missingReqs) / total) * 100) : 100;
  const activeRate  = total > 0 ? Math.round((active / total) * 100) : 0;
  const deployRate  = active > 0 ? Math.round((deployed / active) * 100) : 0;
  const retentionPct= total > 0 ? Math.round((active / total) * 100) : 0;
  const attendRate  = total > 0 ? Math.round((attendance / total) * 100) : 0;
  const healthScore = Math.round((compliance + activeRate + deployRate) / 3);

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = currentUser?.name?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';

  // Birthdays today
  const bdayToday = (typeof getBirthdaysToday === 'function') ? getBirthdaysToday() : [];

  // Pending action counts
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

  // Recent log entries
  const recentItems = _buildRecentList(4);

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="ph-wrap">

      <!-- ══════════════════════════════════════════════════════
           HERO SECTION — Greeting + Stats + Action Buttons
      ══════════════════════════════════════════════════════ -->
      <div class="ph-hero">
        <div class="ph-hero-left">
          <div class="ph-hero-welcome">Welcome back! 👋</div>
          <div class="ph-hero-greeting">${esc(greeting)},</div>
          <div class="ph-hero-name">${esc(userName)}</div>
          <div class="ph-hero-sub">Here's what's happening with your workforce today.</div>

          <!-- Inline stat pills -->
          <div class="ph-hero-stats">
            <div class="ph-hero-stat" onclick="Router.go('people')" title="View all employees">
              <i data-ix="users" data-size="16"></i>
              <span class="ph-hs-val">${total}</span>
              <span class="ph-hs-lbl">Total Employees</span>
            </div>
            <div class="ph-hero-stat" onclick="filterByStatus('Active');Router.go('people')" title="View active employees">
              <i data-ix="user-check" data-size="16"></i>
              <span class="ph-hs-val ph-hs-green">${active}</span>
              <span class="ph-hs-lbl">Active Employees</span>
            </div>
            <div class="ph-hero-stat" title="Compliance rate">
              <i data-ix="shield" data-size="16"></i>
              <span class="ph-hs-val ph-hs-blue">${compliance}%</span>
              <span class="ph-hs-lbl">Compliance Rate</span>
            </div>
            <div class="ph-hero-stat ph-hs-birthday" title="Birthdays today">
              <i data-ix="cake" data-size="16"></i>
              <span class="ph-hs-val ph-hs-orange">${bdayToday.length}</span>
              <span class="ph-hs-lbl">Birthday${bdayToday.length !== 1 ? 's' : ''} Today</span>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="ph-hero-actions">
            <button class="ph-btn-primary" onclick="Router.go('people')">
              <i data-ix="users" data-size="14"></i> View Employee Directory
            </button>
            <button class="ph-btn-outline" onclick="missingFieldFilter='requirements';Router.go('people')" style="position:relative">
              <i data-ix="clock" data-size="14"></i> Pending Actions
              ${missingReqs > 0 ? `<span class="ph-btn-badge">${missingReqs}</span>` : ''}
            </button>
          </div>
        </div>

        <!-- Hero illustration / decorative right side -->
        <div class="ph-hero-right">
          <div class="ph-hero-illustration">
            <div class="ph-hero-blob"></div>
            <!-- Floating stat card -->
            <div class="ph-hero-float-card">
              <div class="ph-hfc-label">Team Active</div>
              <div class="ph-hfc-val">${active}</div>
              <div class="ph-hfc-badge ph-hfc-up">▲ ${activeRate}%</div>
            </div>
            <!-- Profile circles -->
            <div class="ph-hero-circles">
              ${bdayToday.slice(0,3).map((b,i) => {
                const emp = b.emp || b;
                const name = emp.fullName || emp.name || '?';
                const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
                return `<div class="ph-hero-circle" style="z-index:${3-i};margin-left:${i>0?'-10px':'0'}">${initials}</div>`;
              }).join('')}
              ${bdayToday.length === 0 ? `
                <div class="ph-hero-circle" style="z-index:3">JD</div>
                <div class="ph-hero-circle" style="z-index:2;margin-left:-10px">AS</div>
                <div class="ph-hero-circle" style="z-index:1;margin-left:-10px">MR</div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════
           ROW 1: Today's Celebrants · Action Center · Upcoming Events
      ══════════════════════════════════════════════════════ -->
      <div class="ph-row3">

        <!-- Today's Celebrants -->
        <div class="ph-card">
          <div class="ph-card-header">
            <span class="ph-card-title">🎉 Today's Celebrants</span>
            <button class="ph-card-link" onclick="viewAllBirthdays()">View all</button>
          </div>
          <div id="ph-bday-wrap">
            ${_renderHomeBdayTabs()}
          </div>
        </div>

        <!-- Action Center -->
        <div class="ph-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i data-ix="zap" data-size="14"></i> Action Center</span>
            <button class="ph-card-link" onclick="missingFieldFilter='requirements';Router.go('people')">View all</button>
          </div>
          <div class="ph-action-list">
            <div class="ph-action-row" onclick="missingFieldFilter='missingRequirements';Router.go('people')">
              <div class="ph-action-icon ph-ai-red"><i data-ix="file-x" data-size="13"></i></div>
              <span class="ph-action-label">Missing Medical Certificates</span>
              <span class="ph-action-badge ph-ab-red">${missingMedCert || missingReqs}</span>
            </div>
            <div class="ph-action-row" onclick="missingFieldFilter='missingGovIds';Router.go('people')">
              <div class="ph-action-icon ph-ai-orange"><i data-ix="id-card" data-size="13"></i></div>
              <span class="ph-action-label">Government IDs Pending</span>
              <span class="ph-action-badge ph-ab-orange">${govIdPending || Math.max(0,missingReqs-2)}</span>
            </div>
            <div class="ph-action-row" onclick="missingFieldFilter='contractPending';Router.go('people')">
              <div class="ph-action-icon ph-ai-yellow"><i data-ix="file-warning" data-size="13"></i></div>
              <span class="ph-action-label">Contracts Expiring This Month</span>
              <span class="ph-action-badge ph-ab-yellow">7</span>
            </div>
            <div class="ph-action-row" onclick="missingFieldFilter='notDeployed';Router.go('people')">
              <div class="ph-action-icon ph-ai-teal"><i data-ix="location" data-size="13"></i></div>
              <span class="ph-action-label">Not Yet Deployed</span>
              <span class="ph-action-badge ph-ab-teal">${notDeployed}</span>
            </div>
            <div class="ph-action-row" onclick="viewAllBirthdays()">
              <div class="ph-action-icon ph-ai-purple"><i data-ix="cake" data-size="13"></i></div>
              <span class="ph-action-label">Birthday Celebrants Today</span>
              <span class="ph-action-badge ph-ab-purple">${bdayToday.length}</span>
            </div>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div class="ph-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i data-ix="cal-clock" data-size="14"></i> Upcoming Events</span>
            <button class="ph-card-link" onclick="_phScrollToCalendar()">View calendar →</button>
          </div>
          <div id="ph-events-list">
            <div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">Loading…</div>
          </div>
        </div>

      </div>

      <!-- ══════════════════════════════════════════════════════
           ROW 2: Workforce Overview · Quick Access
      ══════════════════════════════════════════════════════ -->
      <div class="ph-row2">

        <!-- Workforce Overview -->
        <div class="ph-card ph-workforce-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i data-ix="chart" data-size="14"></i> Workforce Overview</span>
            <button class="ph-card-link" onclick="Router.go('analytics')">View analytics</button>
          </div>
          <div class="ph-workforce-body">
            <!-- Circular health gauge -->
            <div class="ph-gauge-wrap">
              <svg class="ph-gauge-svg" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="var(--ph-gauge-track)" stroke-width="7"/>
                <circle cx="40" cy="40" r="32" fill="none" stroke="var(--accent)" stroke-width="7"
                  stroke-dasharray="${Math.round(2*Math.PI*32 * healthScore/100)} ${Math.round(2*Math.PI*32)}"
                  stroke-linecap="round"
                  transform="rotate(-90 40 40)"/>
              </svg>
              <div class="ph-gauge-center">
                <div class="ph-gauge-pct">${healthScore}%</div>
                <div class="ph-gauge-lbl">Workforce<br>Health</div>
                <div class="ph-gauge-star">★ Excellent</div>
              </div>
            </div>
            <!-- Metric bars -->
            <div class="ph-wf-metrics">
              <div class="ph-wf-metric">
                <div class="ph-wf-metric-top">
                  <i data-ix="user-check" data-size="14" style="color:var(--success)"></i>
                  <span class="ph-wf-metric-label">Active Rate</span>
                </div>
                <div class="ph-wf-metric-vals">${active} / ${total}</div>
                <div class="ph-wf-bar-wrap">
                  <div class="ph-wf-bar-fill" style="width:${activeRate}%;background:var(--success)"></div>
                </div>
                <div class="ph-wf-metric-pct">${activeRate}%</div>
              </div>
              <div class="ph-wf-metric">
                <div class="ph-wf-metric-top">
                  <i data-ix="location" data-size="14" style="color:#378ADD"></i>
                  <span class="ph-wf-metric-label">Deployment Rate</span>
                </div>
                <div class="ph-wf-metric-vals">${deployed} / ${active}</div>
                <div class="ph-wf-bar-wrap">
                  <div class="ph-wf-bar-fill" style="width:${deployRate}%;background:#378ADD"></div>
                </div>
                <div class="ph-wf-metric-pct">${deployRate}%</div>
              </div>
              <div class="ph-wf-metric">
                <div class="ph-wf-metric-top">
                  <i data-ix="cal-check" data-size="14" style="color:#8B5CF6"></i>
                  <span class="ph-wf-metric-label">Attendance Rate</span>
                </div>
                <div class="ph-wf-metric-vals">${attendance} / ${total}</div>
                <div class="ph-wf-bar-wrap">
                  <div class="ph-wf-bar-fill" style="width:${attendRate}%;background:#8B5CF6"></div>
                </div>
                <div class="ph-wf-metric-pct">${attendRate}%</div>
              </div>
              <div class="ph-wf-metric">
                <div class="ph-wf-metric-top">
                  <i data-ix="heart" data-size="14" style="color:#F59E0B"></i>
                  <span class="ph-wf-metric-label">Retention Rate</span>
                </div>
                <div class="ph-wf-metric-vals">${active} / ${total}</div>
                <div class="ph-wf-bar-wrap">
                  <div class="ph-wf-bar-fill" style="width:${retentionPct}%;background:#F59E0B"></div>
                </div>
                <div class="ph-wf-metric-pct">${retentionPct}%</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Access -->
        <div class="ph-card ph-quickaccess-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i data-ix="grid" data-size="14"></i> Quick Access</span>
            <button class="ph-card-link" onclick="_phOpenQAEdit()">Edit</button>
          </div>
          <div class="ph-qa-grid" id="ph-qa-grid">
            <!-- populated by _qaRebuildGrid() after render -->
          </div>
        </div>

      </div>

      <!-- ══════════════════════════════════════════════════════
           ROW 3: Calendar + Recent Activity (side by side)
      ══════════════════════════════════════════════════════ -->
      <div class="ph-row-cal" id="ph-cal-section">

        <!-- Smart Calendar (full width-ish) -->
        <div class="ph-card ph-cal-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i data-ix="calendar" data-size="14"></i> <span id="ph-cal-label"></span></span>
            <div style="display:flex;gap:4px;align-items:center">
              ${canViewSensitive() ? `<button class="ph-cal-add-btn" onclick="_phOpenAddEvent()" title="Add event">
                <i data-ix="plus" data-size="11"></i>
              </button>` : ''}
              <button class="ph-cal-nav" onclick="_phCalPrev()"><i data-ix="chevron-left" data-size="12"></i></button>
              <button class="ph-cal-nav" onclick="_phCalNext()"><i data-ix="chevron-right" data-size="12"></i></button>
            </div>
          </div>
          <div id="ph-calendar"></div>
          <div id="ph-cal-popover" class="ph-cal-popover" style="display:none"></div>
        </div>

        <!-- Recent Activity -->
        <div class="ph-card ph-recent-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i data-ix="activity" data-size="14"></i> Recent Activity</span>
            <button class="ph-card-link" onclick="Router.go('log')">View all →</button>
          </div>
          <div id="ph-recent-list">
            ${recentItems.length
              ? recentItems.map(r => `
                  <div class="ph-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                    ${Components.avatar(r.name, 32)}
                    <div class="ph-recent-body">
                      <div class="ph-recent-name">${esc(r.name)}</div>
                      <div class="ph-recent-action">${esc(r.action)}</div>
                      <div class="ph-recent-time-row"><span class="ph-recent-time">${esc(r.time)}</span></div>
                    </div>
                  </div>`).join('')
              : Components.emptyState({ icon: '<i data-ix="activity" data-size="32" style="opacity:.3"></i>', title: 'No recent activity' })
            }
          </div>

          <!-- Status Breakdown (below recent activity) -->
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="ph-card-title" style="margin-bottom:10px;display:flex;align-items:center;gap:5px">
              <i data-ix="pie-chart" data-size="13"></i> Status Breakdown
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

      </div>

      <!-- ══════════════════════════════════════════════════════
           FEATURE BANNER
      ══════════════════════════════════════════════════════ -->
      <div class="ph-feature-banner">
        <div class="ph-fb-hero">
          <div class="ph-fb-x-logo">✕</div>
          <div class="ph-fb-hero-title">Everything you need,<br>in one place.</div>
          <div class="ph-fb-hero-sub">Manage your workforce efficiently<br>with all the tools at your fingertips.</div>
          <button class="ph-fb-explore-btn" onclick="Router.go('analytics')">
            Explore Features →
          </button>
        </div>
        <div class="ph-fb-actions">
          ${canWrite() ? `
          <div class="ph-fb-action" onclick="openAddModal()">
            <div class="ph-fb-action-icon"><i data-ix="user-add" data-size="18"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Add New Employee</div>
              <div class="ph-fb-action-sub">Create a new employee profile</div>
            </div>
          </div>` : ''}
          <div class="ph-fb-action" onclick="Router.go('tracker')">
            <div class="ph-fb-action-icon"><i data-ix="location" data-size="18"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Deployment Tracker</div>
              <div class="ph-fb-action-sub">Track employee deployments</div>
            </div>
          </div>
          <div class="ph-fb-action" onclick="Router.go('log')">
            <div class="ph-fb-action-icon"><i data-ix="document" data-size="18"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Activity Log</div>
              <div class="ph-fb-action-sub">View all record changes</div>
            </div>
          </div>
          <div class="ph-fb-action" onclick="Router.go('analytics')">
            <div class="ph-fb-action-icon"><i data-ix="chart" data-size="18"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Generate Report</div>
              <div class="ph-fb-action-sub">Create custom reports</div>
            </div>
          </div>
          ${(typeof currentRole !== 'undefined' && currentRole === 'owner') ? `
          <div class="ph-fb-action" onclick="Router.go('settings')">
            <div class="ph-fb-action-icon"><i data-ix="setting" data-size="18"></i></div>
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
  _qaRebuildGrid();

  // Async: render calendar (needs events loaded first)
  _phLoadEventsAndRender();

  // Async: lazy-load recent activity
  if (!logCache) {
    gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H` })
      .then(r => {
        logCache = r.result.values || [];
        const el = document.getElementById('ph-recent-list');
        if (!el) return;
        const items = _buildRecentList(4);
        el.innerHTML = items.length
          ? items.map(r => `
              <div class="ph-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                ${Components.avatar(r.name, 32)}
                <div class="ph-recent-body">
                  <div class="ph-recent-name">${esc(r.name)}</div>
                  <div class="ph-recent-action">${esc(r.action)}</div>
                  <div class="ph-recent-time-row"><span class="ph-recent-time">${esc(r.time)}</span></div>
                </div>
              </div>`).join('')
          : Components.emptyState({ icon: '<i data-ix="activity" data-size="32" style="opacity:.3"></i>', title: 'No recent activity' });
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
    el.innerHTML = `<div class="ph-ann-empty"><i data-ix="bell-slash" data-size="20" style="opacity:.3"></i><span>No announcements yet</span></div>`;
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
  if (!list || !list.length) return `<div class="ph-bday-empty"><i data-ix="party" data-size="20" style="opacity:.25"></i><span>None</span></div>`;
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
    el.innerHTML = `<div class="ph-ev-empty"><i data-ix="cal-x" data-size="20" style="opacity:.25"></i><span>No upcoming events</span></div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  el.innerHTML = events.map(ev => {
    const d        = new Date(ev.date);
    const diffDays = Math.round((d - today) / 86400000);
    const isToday  = diffDays === 0;
    const isSoon   = diffDays <= 3;
    const dayLabel = isToday ? 'Today' : diffDays === 1 ? 'Tomorrow' : `in ${diffDays}d`;

    // Derive a color tag from the event title
    const titleLower = (ev.title || '').toLowerCase();
    let tagClass = 'ph-ev-tag-default', tagLabel = 'Event';
    if (titleLower.includes('town hall') || titleLower.includes('company') || titleLower.includes('meeting')) {
      tagClass = 'ph-ev-tag-company'; tagLabel = 'Company';
    } else if (titleLower.includes('training') || titleLower.includes('workshop') || titleLower.includes('learn') || titleLower.includes('seminar')) {
      tagClass = 'ph-ev-tag-learn'; tagLabel = 'Learning';
    } else if (titleLower.includes('hr') || titleLower.includes('performance') || titleLower.includes('review')) {
      tagClass = 'ph-ev-tag-hr'; tagLabel = 'HR';
    } else if (titleLower.includes('design') || titleLower.includes('creative')) {
      tagClass = 'ph-ev-tag-design'; tagLabel = 'Design';
    }

    return `
      <div class="ph-ev-row${isToday ? ' ph-ev-today' : ''}">
        <div class="ph-ev-date-badge${isToday ? ' ph-ev-badge-today' : isSoon ? ' ph-ev-badge-soon' : ''}">
          <div class="ph-ev-day">${d.getDate()}</div>
          <div class="ph-ev-mon">${d.toLocaleDateString('en-PH', { month: 'short' })}</div>
        </div>
        <div class="ph-ev-body">
          <div class="ph-ev-title">${esc(ev.title)}</div>
          ${ev.note ? `<div class="ph-ev-note">${esc(ev.note)}</div>` : ''}
          <div class="ph-ev-meta"><span class="ph-ev-when${isSoon ? ' ph-ev-when-soon' : ''}">${dayLabel}</span></div>
        </div>
        <span class="ph-ev-tag ${tagClass}">${tagLabel}</span>
        ${canViewSensitive() ? `<button class="ph-ev-del" onclick="_phDeleteEvent('${esc(ev.id)}',${ev._row},event)" title="Remove event">
          <i data-ix="close" data-size="11"></i>
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
          <i data-ix="calendar-add" data-size="16" style="vertical-align:-2px;margin-right:6px"></i>Add Calendar Event
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
          <i data-ix="check" data-size="13"></i> Save Event
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
  // Append legend
  calEl.insertAdjacentHTML('afterend', `
    <div class="ph-cal-legend">
      <div class="ph-cal-leg-item">
        <div class="ph-cal-leg-dot" style="background:var(--accent)"></div> HR Event
      </div>
      <div class="ph-cal-leg-item">
        <div class="ph-cal-leg-dot" style="background:var(--warning)"></div> Birthday
      </div>
    </div>`);
  // Remove old legend if re-rendering
  const existingLegends = calEl.parentElement?.querySelectorAll('.ph-cal-legend');
  if (existingLegends && existingLegends.length > 1) {
    existingLegends.forEach((el, i) => { if (i > 0) el.remove(); });
  }
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
        <i data-ix="cal-check" data-size="12" style="color:var(--accent);flex-shrink:0"></i>
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
        <i data-ix="cake" data-size="12" style="color:var(--warning);flex-shrink:0"></i>
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
// QUICK ACCESS EDIT MODAL
// ============================================================
const _QA_DEFAULT = [
  { id: 'people',      label: 'Employee\nDatabase',    icon: 'users',       color: 'rgba(0,230,118,.15)',  textColor: 'var(--success)',  onclick: "Router.go('people')",                                   visible: true },
  { id: 'tracker',     label: 'Deployment\nTracker',   icon: 'location',    color: 'rgba(55,138,221,.15)', textColor: '#378ADD',         onclick: "Router.go('tracker')",                                  visible: true },
  { id: 'requirements',label: 'Requirements',          icon: 'clipboard',   color: 'rgba(255,152,0,.15)',  textColor: '#ff9800',         onclick: "missingFieldFilter='requirements';Router.go('people')",  visible: true },
  { id: 'analytics',   label: 'Analytics &\nReports',  icon: 'chart',       color: 'rgba(139,92,246,.15)', textColor: '#8b5cf6',         onclick: "Router.go('analytics')",                                visible: true },
  { id: 'export',      label: 'Export\nData',          icon: 'download',    color: 'rgba(0,200,170,.12)',  textColor: 'var(--accent)',   onclick: "exportXLSX()",                                          visible: true,  sensitive: true },
  { id: 'settings',    label: 'Settings',              icon: 'setting',     color: 'rgba(255,255,255,.06)',textColor: 'var(--text2)',    onclick: "Router.go('settings')",                                 visible: true,  ownerOnly: true },
  { id: 'log',         label: 'Activity\nLog',         icon: 'activity',    color: 'rgba(55,138,221,.15)', textColor: '#378ADD',         onclick: "Router.go('log')",                                      visible: false },
  { id: 'people-add',  label: 'Add\nEmployee',         icon: 'user-add',    color: 'rgba(0,230,118,.15)',  textColor: 'var(--success)',  onclick: "openAddModal()",                                        visible: false },
];

function _qaGetTiles() {
  try {
    const saved = localStorage.getItem('ph-qa-tiles');
    if (saved) {
      const parsed = JSON.parse(saved);
      // merge saved order/visibility with defaults (handles new tiles added later)
      const map = {};
      parsed.forEach(t => map[t.id] = t);
      return _QA_DEFAULT.map(def => ({ ...def, visible: map[def.id] !== undefined ? map[def.id].visible : def.visible }))
        .sort((a, b) => {
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
  const grid = document.querySelector('.ph-qa-grid');
  if (!grid) return;
  const tiles = _qaGetTiles();
  const isOwner = typeof currentRole !== 'undefined' && currentRole === 'owner';
  const canSensitive = canViewSensitive();
  grid.innerHTML = tiles
    .filter(t => t.visible)
    .filter(t => !t.sensitive || canSensitive)
    .filter(t => !t.ownerOnly || isOwner)
    .map(t => `
      <div class="ph-qa-tile" onclick="${t.onclick}">
        <div class="ph-qa-icon" style="background:${t.color};color:${t.textColor}">
          <i data-ix="${t.icon}" data-size="20"></i>
        </div>
        <div class="ph-qa-label">${t.label.replace('\n','<br>')}</div>
      </div>`).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phOpenQAEdit() {
  const existing = document.getElementById('ph-qa-edit-overlay');
  if (existing) existing.remove();

  let tiles = _qaGetTiles();
  let dragSrc = null;

  const overlay = document.createElement('div');
  overlay.id = 'ph-qa-edit-overlay';
  overlay.className = 'ph-qa-edit-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  function renderList() {
    const isOwner = typeof currentRole !== 'undefined' && currentRole === 'owner';
    const canSensitive = canViewSensitive();
    return tiles
      .filter(t => !t.sensitive || canSensitive)
      .filter(t => !t.ownerOnly || isOwner)
      .map((t, i) => `
        <div class="ph-qa-edit-row" draggable="true" data-idx="${i}" data-id="${t.id}">
          <span class="ph-qa-edit-drag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="9" cy="5" r="1.5" fill="currentColor"/><circle cx="15" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="19" r="1.5" fill="currentColor"/><circle cx="15" cy="19" r="1.5" fill="currentColor"/>
            </svg>
          </span>
          <div class="ph-qa-edit-icon" style="background:${t.color};color:${t.textColor}">
            <i data-ix="${t.icon}" data-size="15"></i>
          </div>
          <span class="ph-qa-edit-name">${t.label.replace('\n',' ')}</span>
          <button class="ph-qa-edit-toggle ${t.visible ? 'on' : 'off'}" data-id="${t.id}" title="${t.visible ? 'Hide' : 'Show'}"></button>
        </div>`).join('');
  }

  overlay.innerHTML = `
    <div class="ph-qa-edit-box" id="ph-qa-edit-box">
      <div class="ph-qa-edit-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Customize Quick Access
      </div>
      <div class="ph-qa-edit-sub">Toggle tiles on/off or drag to reorder.</div>
      <div class="ph-qa-edit-list" id="ph-qa-edit-list">${renderList()}</div>
      <div class="ph-qa-edit-footer">
        <button class="ph-qa-edit-cancel" onclick="document.getElementById('ph-qa-edit-overlay').remove()">Cancel</button>
        <button class="ph-qa-edit-save" onclick="_phSaveQAEdit()">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Toggle visibility
  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.ph-qa-edit-toggle');
    if (!btn) return;
    const id = btn.dataset.id;
    const t = tiles.find(x => x.id === id);
    if (t) { t.visible = !t.visible; btn.className = 'ph-qa-edit-toggle ' + (t.visible ? 'on' : 'off'); }
  });

  // Drag to reorder
  overlay.addEventListener('dragstart', e => {
    const row = e.target.closest('.ph-qa-edit-row');
    if (!row) return;
    dragSrc = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  overlay.addEventListener('dragend', e => {
    const row = e.target.closest('.ph-qa-edit-row');
    if (row) row.classList.remove('dragging');
    overlay.querySelectorAll('.ph-qa-edit-row').forEach(r => r.classList.remove('drag-over'));
  });
  overlay.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('.ph-qa-edit-row');
    if (!row || row === dragSrc) return;
    overlay.querySelectorAll('.ph-qa-edit-row').forEach(r => r.classList.remove('drag-over'));
    row.classList.add('drag-over');
  });
  overlay.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.ph-qa-edit-row');
    if (!row || !dragSrc || row === dragSrc) return;
    const fromId = dragSrc.dataset.id;
    const toId = row.dataset.id;
    const fi = tiles.findIndex(t => t.id === fromId);
    const ti = tiles.findIndex(t => t.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = tiles.splice(fi, 1);
    tiles.splice(ti, 0, moved);
    // re-render list
    const list = document.getElementById('ph-qa-edit-list');
    if (list) { list.innerHTML = renderList(); if (typeof lucide !== 'undefined') lucide.createIcons(); }
    overlay.querySelectorAll('.ph-qa-edit-row').forEach(r => r.classList.remove('drag-over', 'dragging'));
  });

  // store tiles ref for save
  overlay._tiles = tiles;
}

function _phSaveQAEdit() {
  const overlay = document.getElementById('ph-qa-edit-overlay');
  if (!overlay) return;

  // read current toggle states from DOM before saving
  const tiles = overlay._tiles;
  overlay.querySelectorAll('.ph-qa-edit-toggle').forEach(btn => {
    const t = tiles.find(x => x.id === btn.dataset.id);
    if (t) t.visible = btn.classList.contains('on');
  });

  try { localStorage.setItem('ph-qa-tiles', JSON.stringify(tiles.map(t => ({ id: t.id, visible: t.visible })))); } catch(e) {}
  overlay.remove();
  _qaRebuildGrid();
}

// Scroll to calendar section when "View calendar" is clicked from Upcoming Events
function _phScrollToCalendar() {
  const el = document.getElementById('ph-cal-section');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    /* ══════════════════════════════════════════════════════
       LAYOUT
    ══════════════════════════════════════════════════════ */
    .ph-wrap {
      padding: 20px 24px 36px;
      max-width: 1300px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    /* ══════════════════════════════════════════════════════
       GENERIC CARD
    ══════════════════════════════════════════════════════ */
    .ph-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: 0 2px 12px rgba(0,0,0,.12);
    }
    [data-theme="light"] .ph-card {
      background: #fff;
      box-shadow: 0 2px 12px rgba(10,138,133,.06);
    }
    .ph-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .ph-card-title {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 10px; font-weight: 700; letter-spacing: 1px;
      text-transform: uppercase; color: var(--text3);
      font-family: 'Inter', 'Poppins', sans-serif;
      opacity: 0.75;
    }
    [data-theme="light"] .ph-card-title { color: #076e6a; }
    .ph-card-link {
      font-size: 12px; color: var(--accent); background: none;
      border: none; cursor: pointer; padding: 0; font-weight: 500;
    }
    .ph-card-link:hover { opacity: .75; }

    /* ══════════════════════════════════════════════════════
       HERO SECTION
    ══════════════════════════════════════════════════════ */
    .ph-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 32px;
      gap: 24px;
      overflow: hidden;
      position: relative;
      height: 220px;
      box-sizing: border-box;
      box-shadow: 0 2px 16px rgba(0,0,0,.14);
    }
    [data-theme="light"] .ph-hero {
      background: #fff;
      box-shadow: 0 4px 24px rgba(10,138,133,.10);
    }
    .ph-hero-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .ph-hero-welcome {
      font-size: 12px; font-weight: 600; color: var(--text3);
    }
    .ph-hero-greeting {
      font-size: 28px; font-weight: 800; color: var(--text1); line-height: 1.1; margin-bottom: -4px;
    }
    .ph-hero-name {
      font-size: 28px; font-weight: 800; color: var(--accent); line-height: 1.1;
    }
    [data-theme="light"] .ph-hero-name { color: #0a8a85; }
    .ph-hero-sub { font-size: 13px; color: var(--text3); margin-top: 4px; }

    /* Hero inline stat pills */
    .ph-hero-stats {
      display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px;
    }
    .ph-hero-stat {
      display: flex; align-items: center; gap: 7px; cursor: pointer;
      padding: 4px 0; transition: opacity .15s;
    }
    .ph-hero-stat:hover { opacity: .8; }
    .ph-hero-stat i, .ph-hero-stat svg { color: var(--text3); flex-shrink: 0; }
    .ph-hs-val { font-size: 18px; font-weight: 800; color: var(--text1); line-height: 1; }
    .ph-hs-green { color: var(--success); }
    [data-theme="light"] .ph-hs-green { color: #1a8a40; }
    .ph-hs-blue  { color: #378ADD; }
    .ph-hs-orange{ color: var(--warning); }
    .ph-hs-lbl { font-size: 11px; color: var(--text3); line-height: 1.3; }

    /* Hero buttons */
    .ph-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
    .ph-btn-primary {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 18px; font-size: 13px; font-weight: 600;
      background: var(--accent); color: #0E1414; border: none;
      border-radius: 8px; cursor: pointer;
      transition: opacity .15s, box-shadow .15s;
      box-shadow: 0 2px 12px rgba(0,200,170,.22);
    }
    [data-theme="light"] .ph-btn-primary {
      background: #0a8a85; color: #fff;
      box-shadow: 0 2px 12px rgba(10,138,133,.3);
    }
    .ph-btn-primary:hover { opacity: .88; }
    .ph-btn-outline {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 18px; font-size: 13px; font-weight: 500;
      background: none; color: var(--text2);
      border: 1.5px solid var(--border2); border-radius: 8px; cursor: pointer;
      transition: border-color .15s, color .15s;
      position: relative;
    }
    .ph-btn-outline:hover { border-color: var(--accent); color: var(--accent); }
    .ph-btn-badge {
      position: absolute; top: -6px; right: -6px;
      background: var(--danger); color: #fff;
      font-size: 10px; font-weight: 700;
      padding: 2px 5px; border-radius: 10px; line-height: 1.3;
    }

    /* Hero right side */
    .ph-hero-right { flex-shrink: 0; position: relative; width: 220px; height: 150px; }
    .ph-hero-illustration { position: relative; width: 100%; height: 100%; }
    .ph-hero-blob {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 60% 50%, rgba(0,200,170,.12) 0%, transparent 70%);
      border-radius: 50%;
    }
    [data-theme="light"] .ph-hero-blob {
      background: radial-gradient(ellipse at 60% 50%, rgba(10,138,133,.12) 0%, transparent 70%);
    }
    .ph-hero-float-card {
      position: absolute; top: 8px; right: 0;
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 8px 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,.2);
      min-width: 100px;
    }
    [data-theme="light"] .ph-hero-float-card {
      background: #fff; box-shadow: 0 4px 16px rgba(10,138,133,.12);
    }
    .ph-hfc-label { font-size: 11px; color: var(--text3); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
    .ph-hfc-val   { font-size: 22px; font-weight: 800; color: var(--text1); line-height: 1.2; }
    .ph-hfc-badge { font-size: 10px; font-weight: 700; }
    .ph-hfc-up    { color: var(--success); }
    .ph-hero-circles {
      position: absolute; bottom: 12px; right: 8px;
      display: flex; align-items: center;
    }
    .ph-hero-circle {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent) 0%, #0099aa 100%);
      border: 2px solid var(--bg2); color: #000;
      font-size: 10px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    [data-theme="light"] .ph-hero-circle {
      background: linear-gradient(135deg, #0a8a85 0%, #1ab5b0 100%);
      border-color: #fff; color: #fff;
    }

    /* ══════════════════════════════════════════════════════
       ROW 1: 3-col — Celebrants · Action Center · Events
    ══════════════════════════════════════════════════════ */
    .ph-row3 {
      display: grid;
      grid-template-columns: 1fr 1.1fr 1fr;
      gap: 16px;
      align-items: stretch;
    }
    .ph-row3 > .ph-card { display: flex; flex-direction: column; }
    @media (max-width: 1100px) { .ph-row3 { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 680px)  { .ph-row3 { grid-template-columns: 1fr; } }

    /* ── Action Center ── */
    .ph-action-list { display: flex; flex-direction: column; gap: 2px; }
    .ph-action-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 6px; border-radius: 8px; cursor: pointer;
      transition: background .15s;
    }
    .ph-action-row:hover { background: rgba(255,255,255,.04); }
    [data-theme="light"] .ph-action-row:hover { background: rgba(10,138,133,.05); }
    .ph-action-icon {
      display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
    }
    .ph-ai-red    { background: rgba(255,82,82,.15);  color: #ff5252; }
    .ph-ai-orange { background: rgba(255,152,0,.15);  color: #ff9800; }
    .ph-ai-yellow { background: rgba(255,215,64,.15); color: var(--warning); }
    .ph-ai-teal   { background: rgba(0,200,170,.12);  color: var(--accent); }
    .ph-ai-purple { background: rgba(139,92,246,.15); color: #8b5cf6; }
    [data-theme="light"] .ph-ai-teal { background: rgba(10,138,133,.12); color: #0a8a85; }
    .ph-action-label { flex: 1; font-size: 12px; color: var(--text1); }
    .ph-action-badge {
      font-size: 11px; font-weight: 700;
      min-width: 22px; text-align: center;
      padding: 2px 7px; border-radius: 20px;
    }
    .ph-ab-red    { background: rgba(255,82,82,.15);  color: #ff5252; }
    .ph-ab-orange { background: rgba(255,152,0,.15);  color: #ff9800; }
    .ph-ab-yellow { background: rgba(255,215,64,.15); color: var(--warning); }
    .ph-ab-teal   { background: rgba(0,200,170,.12);  color: var(--accent); }
    .ph-ab-purple { background: rgba(139,92,246,.15); color: #8b5cf6; }
    [data-theme="light"] .ph-ab-teal { background: rgba(10,138,133,.12); color: #0a8a85; }

    /* ── Upcoming Events (in row1) ── */
    .ph-ev-row {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 4px; border-radius: 7px;
      transition: background .15s; cursor: default;
    }
    .ph-ev-row:not(:last-child) { border-bottom: 1px solid var(--border); }
    .ph-ev-today { background: rgba(0,200,170,.04); }
    .ph-ev-date-badge {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 38px; min-width: 38px; height: 42px;
      border-radius: 8px; background: var(--bg3,rgba(255,255,255,.05));
      border: 1px solid var(--border); flex-shrink: 0;
    }
    [data-theme="light"] .ph-ev-date-badge { background: #f5f9f9; }
    .ph-ev-badge-today { background: rgba(0,200,170,.12); border-color: var(--accent); }
    .ph-ev-badge-soon  { background: rgba(245,200,66,.10); border-color: rgba(245,200,66,.4); }
    [data-theme="light"] .ph-ev-badge-today { background: rgba(10,138,133,.12); border-color: #0a8a85; }
    .ph-ev-day { font-size: 15px; font-weight: 800; line-height: 1; color: var(--text1); }
    .ph-ev-mon { font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; margin-top: 1px; }
    .ph-ev-body { flex: 1; min-width: 0; }
    .ph-ev-title { font-size: 12px; font-weight: 600; color: var(--text1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-ev-note  { font-size: 11px; color: var(--text2); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-ev-meta  { font-size: 11px; color: var(--text3); margin-top: 2px; }
    .ph-ev-when  { color: var(--text3); }
    .ph-ev-when-soon { color: var(--warning); font-weight: 600; }
    .ph-ev-tag {
      font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
      white-space: nowrap; flex-shrink: 0;
    }
    .ph-ev-tag-company { background: rgba(255,82,82,.12);  color: #ff5252; }
    .ph-ev-tag-learn   { background: rgba(0,200,170,.12);  color: var(--accent); }
    .ph-ev-tag-hr      { background: rgba(139,92,246,.12); color: #8b5cf6; }
    .ph-ev-tag-design  { background: rgba(255,152,0,.12);  color: #ff9800; }
    .ph-ev-tag-default { background: rgba(255,255,255,.06);color: var(--text3); }
    [data-theme="light"] .ph-ev-tag-learn { background: rgba(10,138,133,.12); color: #0a8a85; }
    .ph-ev-del {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: 4px; border: 1px solid transparent;
      background: none; cursor: pointer; color: var(--text3);
      opacity: 0; transition: opacity .15s, background .15s;
    }
    .ph-ev-row:hover .ph-ev-del { opacity: 1; }
    .ph-ev-del:hover { background: rgba(224,92,92,.15); border-color: rgba(224,92,92,.4); color: var(--danger); }
    .ph-ev-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0; color: var(--text3); font-size: 12px; }

    /* ══════════════════════════════════════════════════════
       ROW 2: Workforce Overview + Quick Access
    ══════════════════════════════════════════════════════ */
    .ph-row2 {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 16px;
      align-items: stretch;
    }
    .ph-row2 > .ph-card { display: flex; flex-direction: column; }
    @media (max-width: 900px) { .ph-row2 { grid-template-columns: 1fr; } }

    /* ── Workforce Overview ── */
    .ph-workforce-body {
      display: flex; align-items: flex-start; gap: 20px;
    }
    .ph-gauge-wrap {
      position: relative; flex-shrink: 0;
      width: 110px; height: 110px;
    }
    .ph-gauge-svg { width: 100%; height: 100%; }
    :root { --ph-gauge-track: rgba(255,255,255,.08); }
    [data-theme="light"] { --ph-gauge-track: rgba(10,138,133,.10); }
    .ph-gauge-center {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center;
    }
    .ph-gauge-pct  { font-size: 20px; font-weight: 800; color: var(--text1); line-height: 1; }
    .ph-gauge-lbl  { font-size: 10px; color: var(--text3); line-height: 1.3; margin-top: 2px; }
    .ph-gauge-star { font-size: 10px; color: var(--warning); margin-top: 3px; font-weight: 600; }
    .ph-wf-metrics { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .ph-wf-metric  { display: flex; flex-direction: column; gap: 3px; }
    .ph-wf-metric-top { display: flex; align-items: center; gap: 5px; }
    .ph-wf-metric-label { font-size: 11px; color: var(--text2); font-weight: 500; }
    .ph-wf-metric-vals  { font-size: 12px; font-weight: 700; color: var(--text1); }
    .ph-wf-bar-wrap { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
    .ph-wf-bar-fill { height: 100%; border-radius: 3px; transition: width .5s ease; }
    .ph-wf-metric-pct { font-size: 11px; color: var(--text3); font-weight: 600; }

    /* ── Quick Access ── */
    .ph-qa-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    }
    .ph-qa-tile {
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 12px 6px; border-radius: 10px; cursor: pointer;
      background: var(--bg3, rgba(255,255,255,.03));
      border: 1px solid var(--border);
      transition: border-color .15s, background .15s;
    }
    [data-theme="light"] .ph-qa-tile { background: #f5f9f9; }
    .ph-qa-tile:hover { border-color: var(--accent); background: var(--accent-dim,rgba(0,200,170,.06)); }
    [data-theme="light"] .ph-qa-tile:hover { border-color: #0a8a85; background: rgba(10,138,133,.07); }
    .ph-qa-icon {
      display: flex; align-items: center; justify-content: center;
      width: 42px; height: 42px; border-radius: 10px;
    }
    .ph-qai-green  { background: rgba(0,230,118,.15);  color: var(--success); }
    .ph-qai-blue   { background: rgba(55,138,221,.15); color: #378ADD; }
    .ph-qai-orange { background: rgba(255,152,0,.15);  color: #ff9800; }
    .ph-qai-purple { background: rgba(139,92,246,.15); color: #8b5cf6; }
    .ph-qai-teal   { background: rgba(0,200,170,.12);  color: var(--accent); }
    .ph-qai-gray   { background: rgba(255,255,255,.06);color: var(--text2); }
    [data-theme="light"] .ph-qai-green  { background: rgba(26,138,64,.12);  color: #1a8a40; }
    [data-theme="light"] .ph-qai-teal   { background: rgba(10,138,133,.12); color: #0a8a85; }
    .ph-qa-label {
      font-size: 11px; font-weight: 600; color: var(--text1);
      text-align: center; line-height: 1.3;
    }

    /* ══════════════════════════════════════════════════════
       ROW 3: Calendar + Recent Activity
    ══════════════════════════════════════════════════════ */
    .ph-row-cal {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      align-items: stretch;
    }
    .ph-row-cal > .ph-card {
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 900px) { .ph-row-cal { grid-template-columns: 1fr; } }
    .ph-cal-card { position: relative; overflow: hidden; }
    .ph-cal-nav {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border: 1px solid var(--border);
      border-radius: 6px; background: var(--bg2); cursor: pointer; color: var(--text2);
      transition: border-color .15s;
    }
    .ph-cal-nav:hover { border-color: var(--accent); color: var(--accent); }
    .ph-cal-add-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border: 1px solid var(--accent);
      border-radius: 6px; background: rgba(0,200,170,.08); cursor: pointer; color: var(--accent);
      transition: background .15s;
    }
    [data-theme="light"] .ph-cal-add-btn { border-color: #0a8a85; background: rgba(10,138,133,.1); color: #0a8a85; }
    .ph-cal-add-btn:hover { background: rgba(0,200,170,.18); }
    .ph-cal-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 3px; margin-top: 4px;
    }
    .ph-cal-dayname {
      font-size: 11px; font-weight: 700; color: var(--text3);
      text-align: center; padding: 4px 0; text-transform: uppercase;
    }
    .ph-cal-cell {
      text-align: center; font-size: 12px; padding: 6px 2px 3px;
      border-radius: 7px; color: var(--text2); cursor: pointer;
      transition: background .12s; position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .ph-cal-cell:hover:not(.ph-cal-empty) { background: rgba(255,255,255,.07); }
    [data-theme="light"] .ph-cal-cell:hover:not(.ph-cal-empty) { background: rgba(10,138,133,.06); }
    .ph-cal-empty { background: none !important; cursor: default; }
    .ph-cal-today {
      background: var(--accent) !important; color: #000 !important;
      font-weight: 700; border-radius: 7px;
    }
    [data-theme="light"] .ph-cal-today { background: #0a8a85 !important; color: #fff !important; }
    .ph-cal-today .ph-cal-event-dot { background: #000 !important; }
    [data-theme="light"] .ph-cal-today .ph-cal-event-dot { background: rgba(255,255,255,.8) !important; }
    .ph-cal-today .ph-cal-bday-dot  { background: rgba(0,0,0,.4) !important; }
    .ph-cal-bday { color: var(--warning); font-weight: 600; }
    .ph-cal-has-event { background: rgba(0,200,170,.07); }
    [data-theme="light"] .ph-cal-has-event { background: rgba(10,138,133,.07); }
    .ph-cal-dots { display: flex; justify-content: center; gap: 2px; height: 5px; }
    .ph-cal-event-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: var(--accent); flex-shrink: 0;
    }
    [data-theme="light"] .ph-cal-event-dot { background: #0a8a85; }
    .ph-cal-bday-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: var(--warning); flex-shrink: 0;
    }

    /* ── Calendar legend ── */
    .ph-cal-legend {
      display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap;
    }
    .ph-cal-leg-item {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--text3);
    }
    .ph-cal-leg-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }

    /* ── Calendar popover ── */
    .ph-cal-popover {
      position: relative; margin-top: 10px;
      background: var(--bg2); border: 1px solid var(--border2);
      border-radius: 10px; padding: 10px 14px; z-index: 40;
      box-shadow: 0 8px 28px rgba(0,0,0,.32);
      display: flex; flex-direction: column; gap: 7px;
      animation: phPopIn .15s ease-out;
    }
    @keyframes phPopIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
    .ph-pop-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
    .ph-pop-date   { font-size: 12px; font-weight: 700; color: var(--text1); }
    .ph-pop-close  { background: none; border: none; cursor: pointer; color: var(--text3); font-size: 12px; padding: 0; line-height: 1; transition: color .15s; }
    .ph-pop-close:hover { color: var(--text1); }
    .ph-pop-event  { display: flex; align-items: flex-start; gap: 8px; }
    .ph-pop-ev-title { font-size: 12px; font-weight: 600; color: var(--text1); }
    .ph-pop-ev-note  { font-size: 11px; color: var(--text2); margin-top: 1px; }
    .ph-pop-ev-by    { font-size: 10px; color: var(--text3); }

    /* ── Recent Activity ── */
    .ph-recent-card .ph-recent-item {
      display: flex; align-items: center; gap: 10px; padding: 7px 5px;
      border-radius: 7px; cursor: pointer; transition: background .15s;
    }
    .ph-recent-card .ph-recent-item:hover { background: rgba(255,255,255,.04); }
    [data-theme="light"] .ph-recent-card .ph-recent-item:hover { background: rgba(10,138,133,.05); }
    .ph-recent-body   { flex: 1; min-width: 0; }
    .ph-recent-name   { font-size: 12px; font-weight: 600; color: var(--text1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ph-recent-action { font-size: 11px; color: var(--text2); margin-top: 1px; }
    .ph-recent-time-row { display: flex; }
    .ph-recent-time   { font-size: 11px; color: var(--text3); }

    /* ── Status breakdown ── */
    .ph-status-list { display: flex; flex-direction: column; gap: 5px; }
    .ph-status-row {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      padding: 3px 6px; border-radius: 6px; transition: background .15s;
    }
    .ph-status-row:hover { background: rgba(255,255,255,.04); }
    [data-theme="light"] .ph-status-row:hover { background: rgba(10,138,133,.05); }
    .ph-status-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .ph-status-name { font-size: 12px; color: var(--text2); min-width: 76px; }
    .ph-status-count { font-size: 12px; font-weight: 600; color: var(--text1); min-width: 26px; text-align: right; }
    .ph-status-bar-wrap { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .ph-status-bar-fill { height: 100%; border-radius: 2px; transition: width .4s ease; }

    /* ══════════════════════════════════════════════════════
       BIRTHDAY CARD
    ══════════════════════════════════════════════════════ */
    .ph-bday-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
    .ph-bday-tab {
      flex: 1; padding: 5px 4px; font-size: 11px; font-weight: 600;
      border: 1px solid var(--border); border-radius: 7px;
      background: none; color: var(--text3); cursor: pointer;
      transition: border-color .15s, color .15s, background .15s;
      display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    }
    .ph-bday-tab:hover { border-color: var(--accent); color: var(--accent); }
    .ph-bday-tab.active { background: rgba(0,200,170,.1); border-color: var(--accent); color: var(--accent); }
    [data-theme="light"] .ph-bday-tab.active { background: rgba(10,138,133,.1); border-color: #0a8a85; color: #0a8a85; }
    .ph-tab-badge {
      font-size: 10px; font-weight: 700; padding: 1px 5px;
      border-radius: 20px; background: var(--accent-dim,rgba(0,200,170,.15));
      color: var(--accent); line-height: 1.4;
    }
    .ph-tab-badge-warn { background: rgba(245,200,66,.2); color: var(--warning); }
    .ph-tab-badge-dim  { background: rgba(255,255,255,.08); color: var(--text2); }
    .ph-bday-pane { display: flex; flex-direction: column; gap: 0; max-height: 200px; overflow-y: auto; }
    .ph-bday-row {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 4px; border-radius: 7px; cursor: pointer;
      transition: background .15s;
    }
    .ph-bday-row:not(:last-child) { border-bottom: 1px solid var(--border); }
    .ph-bday-row:hover { background: rgba(255,255,255,.04); }
    [data-theme="light"] .ph-bday-row:hover { background: rgba(10,138,133,.05); }
    .ph-bday-info  { flex: 1; min-width: 0; }
    .ph-bday-name  { font-size: 12px; font-weight: 600; color: var(--text1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-bday-store { font-size: 11px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ph-bday-when  { font-size: 11px; color: var(--text3); white-space: nowrap; font-weight: 500; }
    .ph-bday-when-today { color: var(--warning); font-weight: 700; }
    .ph-bday-empty { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 20px 0; color: var(--text3); font-size: 12px; }

    /* ══════════════════════════════════════════════════════
       FEATURE BANNER
    ══════════════════════════════════════════════════════ */
    .ph-feature-banner {
      display: flex; align-items: stretch; gap: 0;
      border: 1px solid var(--border); border-radius: 14px;
      overflow: hidden;
      background: linear-gradient(120deg,
        rgba(0,0,0,.85) 0%,
        rgba(0,20,18,.9) 40%,
        rgba(0,10,22,.85) 100%
      );
    }
    [data-theme="light"] .ph-feature-banner {
      background: linear-gradient(120deg, #0d2f2d 0%, #0a1f3c 100%);
    }
    .ph-fb-hero {
      display: flex; flex-direction: column; justify-content: center; gap: 8px;
      padding: 22px 26px; min-width: 210px; max-width: 250px;
      border-right: 1px solid rgba(255,255,255,.08);
      position: relative; overflow: hidden;
    }
    .ph-fb-x-logo {
      font-size: 32px; font-weight: 900; color: var(--accent);
      line-height: 1; margin-bottom: 2px;
    }
    [data-theme="light"] .ph-fb-x-logo { color: #1de3d8; }
    .ph-fb-hero-title {
      font-size: 14px; font-weight: 800; color: #fff; line-height: 1.4;
    }
    .ph-fb-hero-sub {
      font-size: 11px; color: rgba(255,255,255,.55); line-height: 1.5;
    }
    .ph-fb-explore-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; font-size: 12px; font-weight: 600;
      background: var(--accent); color: #000;
      border: none; border-radius: 7px; cursor: pointer;
      margin-top: 4px; width: fit-content;
      transition: opacity .15s;
    }
    [data-theme="light"] .ph-fb-explore-btn { background: #1de3d8; }
    .ph-fb-explore-btn:hover { opacity: .85; }
    .ph-fb-actions {
      display: flex; flex: 1; flex-wrap: wrap;
    }
    .ph-fb-action {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px; cursor: pointer; flex: 1; min-width: 160px;
      border-right: 1px solid rgba(255,255,255,.06);
      transition: background .15s;
    }
    .ph-fb-action:last-child { border-right: none; }
    .ph-fb-action:hover { background: rgba(255,255,255,.05); }
    .ph-fb-action-icon {
      display: flex; align-items: center; justify-content: center;
      width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1);
      color: var(--accent);
    }
    .ph-fb-action-icon i, .ph-fb-action-icon svg { width: 17px; height: 17px; stroke-width: 1.8; }
    .ph-fb-action-title { font-size: 12px; font-weight: 600; color: #fff; }
    .ph-fb-action-sub   { font-size: 11px; color: rgba(255,255,255,.45); margin-top: 2px; }

    /* ══════════════════════════════════════════════════════
       MODAL (Add Event)
    ══════════════════════════════════════════════════════ */
    .ph-modal-box {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 14px; width: 100%; max-width: 440px;
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
      width: 100%; padding: 8px 10px; font-size: 13px;
      background: var(--bg3, rgba(255,255,255,.05));
      border: 1px solid var(--border); border-radius: 7px;
      color: var(--text1); font-family: 'Inter', 'Poppins', sans-serif;
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
      color: var(--text2); cursor: pointer; font-family: 'Inter', 'Poppins', sans-serif;
      transition: border-color .15s;
    }
    .ph-modal-cancel:hover { border-color: var(--accent); color: var(--accent); }
    .ph-modal-submit {
      padding: 7px 16px; font-size: 12px; font-weight: 600;
      background: var(--accent); color: #000;
      border: none; border-radius: 7px; cursor: pointer;
      font-family: 'Inter', 'Poppins', sans-serif;
      display: inline-flex; align-items: center; gap: 5px;
      transition: opacity .15s;
    }
    .ph-modal-submit:hover { opacity: .85; }

    /* ══════════════════════════════════════════════════════
       ANNOUNCEMENTS (kept for async render)
    ══════════════════════════════════════════════════════ */
    .ph-ann-scroll { display: flex; flex-direction: column; gap: 0; max-height: 220px; overflow-y: auto; }
    .ph-ann-item { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; }
    .ph-ann-item-sep { border-bottom: 1px solid var(--border); }
    .ph-ann-title { font-size: 13px; font-weight: 600; color: var(--text1); line-height: 1.4; }
    .ph-ann-body-text {
      font-size: 12px; color: var(--text2); line-height: 1.6;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .ph-ann-meta  { font-size: 11px; color: var(--text3); margin-top: 3px; }
    .ph-ann-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 0; color: var(--text3); font-size: 12px; }

    /* comp overrides */
    .comp-stat-icon { display: flex; align-items: center; margin-bottom: 2px; }
    .comp-stat-icon i, .comp-stat-icon svg { width: 18px; height: 18px; stroke-width: 2; }

    /* ── Quick Access Edit Modal ── */
    .ph-qa-edit-overlay {
      position: fixed; inset: 0; z-index: 9000;
      background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      animation: phFadeIn .15s ease;
    }
    @keyframes phFadeIn { from { opacity:0; } to { opacity:1; } }
    .ph-qa-edit-box {
      background: var(--bg2); border: 1px solid var(--border2);
      border-radius: 16px; padding: 22px 24px; width: 380px; max-width: 95vw;
      box-shadow: 0 16px 60px rgba(0,0,0,.5);
      animation: phSlideUp .18s ease;
    }
    [data-theme="light"] .ph-qa-edit-box { background: #fff; box-shadow: 0 16px 60px rgba(0,0,0,.15); }
    @keyframes phSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
    .ph-qa-edit-title {
      font-size: 13px; font-weight: 700; color: var(--text1);
      margin-bottom: 4px; display: flex; align-items: center; gap: 6px;
    }
    .ph-qa-edit-sub { font-size: 11px; color: var(--text3); margin-bottom: 16px; }
    .ph-qa-edit-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
    .ph-qa-edit-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-radius: 9px;
      border: 1px solid var(--border); background: var(--bg3);
      cursor: grab; transition: border-color .15s, background .15s;
      user-select: none;
    }
    [data-theme="light"] .ph-qa-edit-row { background: #f5f9f9; }
    .ph-qa-edit-row.dragging { opacity: .45; border-style: dashed; }
    .ph-qa-edit-row.drag-over { border-color: var(--accent); background: var(--accent-dim); }
    .ph-qa-edit-drag { color: var(--text3); flex-shrink: 0; cursor: grab; }
    .ph-qa-edit-icon {
      width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .ph-qa-edit-name { flex: 1; font-size: 12px; font-weight: 600; color: var(--text1); }
    .ph-qa-edit-toggle {
      width: 34px; height: 20px; border-radius: 10px; border: none; cursor: pointer;
      position: relative; flex-shrink: 0; transition: background .2s;
    }
    .ph-qa-edit-toggle::after {
      content: ''; position: absolute; top: 3px; left: 3px;
      width: 14px; height: 14px; border-radius: 50%; background: #fff;
      transition: transform .2s;
    }
    .ph-qa-edit-toggle.on { background: var(--accent); }
    .ph-qa-edit-toggle.on::after { transform: translateX(14px); }
    .ph-qa-edit-toggle.off { background: var(--border2); }
    .ph-qa-edit-footer { display: flex; justify-content: flex-end; gap: 8px; }
    .ph-qa-edit-cancel {
      padding: 7px 16px; font-size: 12px; font-weight: 500;
      background: none; border: 1.5px solid var(--border2); border-radius: 7px;
      color: var(--text2); cursor: pointer; font-family: 'Inter', 'Poppins', sans-serif;
      transition: border-color .15s, color .15s;
    }
    .ph-qa-edit-cancel:hover { border-color: var(--accent); color: var(--accent); }
    .ph-qa-edit-save {
      padding: 7px 16px; font-size: 12px; font-weight: 600;
      background: var(--accent); color: #0E1414; border: none;
      border-radius: 7px; cursor: pointer; font-family: 'Inter', 'Poppins', sans-serif;
      transition: opacity .15s;
    }
    .ph-qa-edit-save:hover { opacity: .85; }
  `;
  document.head.appendChild(s);
}
// ============================================================
// PATCH: Home Page UI Polish Override
// ============================================================
(function injectHomePolishPatch() {
  if (document.getElementById('page-home-polish-patch')) return;

  const s = document.createElement('style');
  s.id = 'page-home-polish-patch';
  s.textContent = `
    .ph-wrap {
      padding: 24px 24px 40px !important;
      gap: 20px !important;
    }

    .ph-card {
      padding: 24px !important;
      min-height: 100%;
    }

    .ph-card-header {
      margin-bottom: 18px !important;
    }

    .ph-hero {
      padding: 24px !important;
      height: auto !important;
      min-height: 240px !important;
      align-items: center !important;
    }

    .ph-hero-left {
      gap: 10px !important;
    }

    .ph-hero-greeting,
    .ph-hero-name {
      font-size: 34px !important;
      font-weight: 850 !important;
      line-height: 1.05 !important;
      letter-spacing: -0.8px !important;
    }

    .ph-hero-sub {
      font-size: 13px !important;
      line-height: 1.5 !important;
      color: var(--text2) !important;
    }

    .ph-hero-stats {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(120px, 1fr)) !important;
      gap: 10px !important;
      margin-top: 12px !important;
      max-width: 700px !important;
    }

    .ph-hero-stat {
      display: grid !important;
      grid-template-columns: 18px 1fr !important;
      grid-template-rows: auto auto !important;
      column-gap: 8px !important;
      row-gap: 2px !important;
      padding: 10px 12px !important;
      border-radius: 12px !important;
      background: rgba(255,255,255,.035) !important;
      border: 1px solid var(--border) !important;
    }

    .ph-hero-stat i,
    .ph-hero-stat svg {
      grid-row: 1 / span 2 !important;
      align-self: center !important;
    }

    .ph-hs-val {
      font-size: 19px !important;
      font-weight: 850 !important;
      line-height: 1 !important;
    }

    .ph-hs-lbl {
      font-size: 10.5px !important;
      font-weight: 650 !important;
      line-height: 1.25 !important;
    }

    .ph-row3,
    .ph-row2,
    .ph-row-cal {
      align-items: stretch !important;
    }

    .ph-row3 > .ph-card {
      min-height: 292px !important;
    }

    .ph-row2 > .ph-card {
      min-height: 310px !important;
    }

    .ph-action-list {
      gap: 8px !important;
    }

    .ph-action-row {
      display: grid !important;
      grid-template-columns: 30px minmax(0, 1fr) auto !important;
      align-items: center !important;
      column-gap: 10px !important;
      min-height: 42px !important;
      padding: 7px 8px !important;
      border-radius: 10px !important;
    }

    .ph-action-icon {
      width: 30px !important;
      height: 30px !important;
      border-radius: 9px !important;
    }

    .ph-action-label {
      min-width: 0 !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      line-height: 1.25 !important;
    }

    .ph-action-badge {
      min-width: 26px !important;
      padding: 4px 8px !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      line-height: 1 !important;
      text-align: center !important;
    }

    .ph-qa-grid {
      gap: 12px !important;
    }

    .ph-qa-tile {
      min-height: 104px !important;
      padding: 16px 10px !important;
      border-radius: 14px !important;
      gap: 10px !important;
    }

    .ph-qa-icon {
      width: 42px !important;
      height: 42px !important;
      border-radius: 13px !important;
    }

    .ph-qa-icon i,
    .ph-qa-icon svg {
      width: 22px !important;
      height: 22px !important;
    }

    .ph-qa-label {
      font-size: 12px !important;
      font-weight: 700 !important;
      line-height: 1.25 !important;
    }

    .ph-feature-banner {
      display: grid !important;
      grid-template-columns: minmax(260px, 0.8fr) minmax(420px, 1.2fr) !important;
      gap: 18px !important;
      padding: 24px !important;
      border-radius: 18px !important;
      align-items: stretch !important;
    }

    .ph-fb-hero {
      padding: 24px !important;
      border-radius: 16px !important;
    }

    .ph-fb-actions {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 12px !important;
      align-content: stretch !important;
    }

    .ph-fb-action {
      min-height: 86px !important;
      padding: 16px !important;
      border-radius: 14px !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }

    .ph-fb-action-icon {
      width: 42px !important;
      height: 42px !important;
      border-radius: 13px !important;
      flex-shrink: 0 !important;
    }

    .ph-fb-action-title {
      font-size: 13px !important;
      font-weight: 800 !important;
      margin-bottom: 3px !important;
    }

    .ph-fb-action-sub {
      font-size: 11px !important;
      line-height: 1.35 !important;
    }

    @media (max-width: 980px) {
      .ph-hero {
        flex-direction: column !important;
        align-items: stretch !important;
      }

      .ph-hero-right {
        display: none !important;
      }

      .ph-hero-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .ph-feature-banner {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 560px) {
      .ph-wrap {
        padding: 16px !important;
      }

      .ph-card,
      .ph-hero,
      .ph-feature-banner {
        padding: 18px !important;
      }

      .ph-hero-stats,
      .ph-fb-actions {
        grid-template-columns: 1fr !important;
      }

      .ph-hero-greeting,
      .ph-hero-name {
        font-size: 28px !important;
      }
    }
  `;

  document.head.appendChild(s);
})();
