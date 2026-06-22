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
  const backoutCount= employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'BACKOUT').length;
  const compliance  = total > 0 ? Math.round(((total - missingReqs) / total) * 100) : 100;
  const activeRate  = total > 0 ? Math.round((active / total) * 100) : 0;
  const deployRate  = active > 0 ? Math.round((deployed / active) * 100) : 0;
  const backoutRate = total > 0 ? Math.round((backoutCount / total) * 100) : 0;
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
           KPI STRIP — 4 cards across the top
      ══════════════════════════════════════════════════════ -->
      <div class="ph-kpi-strip">
        <div class="ph-kpi" onclick="Router.go('people')"
             style="--ph-kpi-accent:var(--accent);--ph-kpi-bg:rgba(0,200,170,.1)">
          <div class="ph-kpi-icon"><i class="fi fi-sr-users"></i></div>
          <div class="ph-kpi-body">
            <div class="ph-kpi-val">${total}</div>
            <div class="ph-kpi-label">Total Employees</div>
            <div class="ph-kpi-trend neu"><i class="fi fi-sr-chart-histogram"></i> All records</div>
          </div>
        </div>
        <div class="ph-kpi" onclick="filterByStatus('Active');Router.go('people')"
             style="--ph-kpi-accent:#00E676;--ph-kpi-bg:rgba(0,230,118,.1)">
          <div class="ph-kpi-icon" style="background:rgba(0,230,118,.1);color:#00E676"><i class="fi fi-sr-user-check"></i></div>
          <div class="ph-kpi-body">
            <div class="ph-kpi-val" style="color:#00E676">${active}</div>
            <div class="ph-kpi-label">Active Employees</div>
            <div class="ph-kpi-trend ${activeRate>=70?'up':activeRate>=40?'neu':'down'}">
              <i class="fi fi-sr-${activeRate>=70?'arrow-trend-up':activeRate>=40?'minus':'arrow-trend-down'}"></i> ${activeRate}% rate
            </div>
          </div>
        </div>
        <div class="ph-kpi" onclick="missingFieldFilter='notDeployed';Router.go('people')"
             style="--ph-kpi-accent:#378ADD;--ph-kpi-bg:rgba(55,138,221,.1)">
          <div class="ph-kpi-icon" style="background:rgba(55,138,221,.1);color:#378ADD"><i class="fi fi-sr-marker"></i></div>
          <div class="ph-kpi-body">
            <div class="ph-kpi-val" style="color:#378ADD">${deployed}</div>
            <div class="ph-kpi-label">Deployed</div>
            <div class="ph-kpi-trend ${deployRate>=70?'up':deployRate>=40?'neu':'down'}">
              <i class="fi fi-sr-${deployRate>=70?'arrow-trend-up':deployRate>=40?'minus':'arrow-trend-down'}"></i> ${deployRate}% of active
            </div>
          </div>
        </div>
        <div class="ph-kpi" onclick="missingFieldFilter='requirements';Router.go('people')"
             style="--ph-kpi-accent:#8B5CF6;--ph-kpi-bg:rgba(139,92,246,.1)">
          <div class="ph-kpi-icon" style="background:rgba(139,92,246,.1);color:#8B5CF6"><i class="fi fi-sr-shield"></i></div>
          <div class="ph-kpi-body">
            <div class="ph-kpi-val" style="color:#8B5CF6">${compliance}%</div>
            <div class="ph-kpi-label">Compliance Rate</div>
            <div class="ph-kpi-trend ${compliance>=80?'up':compliance>=60?'neu':'down'}">
              <i class="fi fi-sr-${compliance>=80?'arrow-trend-up':compliance>=60?'minus':'arrow-trend-down'}"></i> ${missingReqs} pending
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════
           HERO SECTION — Greeting + Actions
      ══════════════════════════════════════════════════════ -->
      <div class="ph-hero">
        <div class="ph-hero-left">
          <div class="ph-hero-welcome">Welcome back! 👋</div>
          <div class="ph-hero-greeting">${esc(greeting)},</div>
          <div class="ph-hero-name">${esc(userName)}</div>
          <div class="ph-hero-sub">Here's what's happening with your workforce today.</div>

          <!-- Action buttons -->
          <div class="ph-hero-actions">
            <button class="ph-btn-primary" onclick="Router.go('people')">
              <i class="fi fi-sr-users"></i> View Employee Directory
            </button>
            <button class="ph-btn-outline" onclick="missingFieldFilter='requirements';Router.go('people')" style="position:relative">
              <i class="fi fi-sr-clock"></i> Pending Actions
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
            <span class="ph-card-title"><i class="fi fi-sr-bolt"></i> Action Center</span>
            <button class="ph-card-link" onclick="missingFieldFilter='requirements';Router.go('people')">View all</button>
          </div>
          <div class="ph-action-list">
            <div class="ph-action-row" onclick="missingFieldFilter='missingRequirements';Router.go('people')">
              <div class="ph-action-icon ph-ai-red"><i class="fi fi-sr-file-delete"></i></div>
              <span class="ph-action-label">Missing Medical Certificates</span>
              <span class="ph-action-badge ph-ab-red">${missingMedCert || missingReqs}</span>
            </div>
            <div class="ph-action-row" onclick="missingFieldFilter='missingGovIds';Router.go('people')">
              <div class="ph-action-icon ph-ai-orange"><i class="fi fi-sr-id-card-clip-alt"></i></div>
              <span class="ph-action-label">Government IDs Pending</span>
              <span class="ph-action-badge ph-ab-orange">${govIdPending || Math.max(0,missingReqs-2)}</span>
            </div>
            <div class="ph-action-row" onclick="missingFieldFilter='contractPending';Router.go('people')">
              <div class="ph-action-icon ph-ai-yellow"><i class="fi fi-sr-file-exclamation"></i></div>
              <span class="ph-action-label">Contracts Expiring This Month</span>
              <span class="ph-action-badge ph-ab-yellow">7</span>
            </div>
            <div class="ph-action-row" onclick="missingFieldFilter='notDeployed';Router.go('people')">
              <div class="ph-action-icon ph-ai-teal"><i class="fi fi-sr-marker"></i></div>
              <span class="ph-action-label">Not Yet Deployed</span>
              <span class="ph-action-badge ph-ab-teal">${notDeployed}</span>
            </div>
            <div class="ph-action-row" onclick="viewAllBirthdays()">
              <div class="ph-action-icon ph-ai-purple"><i class="fi fi-sr-cake-birthday"></i></div>
              <span class="ph-action-label">Birthday Celebrants Today</span>
              <span class="ph-action-badge ph-ab-purple">${bdayToday.length}</span>
            </div>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div class="ph-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i class="fi fi-sr-calendar-clock"></i> Upcoming Events</span>
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
            <span class="ph-card-title"><i class="fi fi-sr-chart-histogram"></i> Workforce Overview</span>
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
                  <i class="fi fi-sr-user-check" style="color:var(--success)"></i>
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
                  <i class="fi fi-sr-marker" style="color:#378ADD"></i>
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
                  <i class="fi fi-sr-shield" style="color:#8B5CF6"></i>
                  <span class="ph-wf-metric-label">Compliance Rate</span>
                </div>
                <div class="ph-wf-metric-vals">${total - missingReqs} / ${total}</div>
                <div class="ph-wf-bar-wrap">
                  <div class="ph-wf-bar-fill" style="width:${compliance}%;background:#8B5CF6"></div>
                </div>
                <div class="ph-wf-metric-pct">${compliance}%</div>
              </div>
              <div class="ph-wf-metric">
                <div class="ph-wf-metric-top">
                  <i class="fi fi-sr-triangle-warning" style="color:#F59E0B"></i>
                  <span class="ph-wf-metric-label">Backout Rate</span>
                </div>
                <div class="ph-wf-metric-vals">${backoutCount} / ${total}</div>
                <div class="ph-wf-bar-wrap">
                  <div class="ph-wf-bar-fill" style="width:${Math.max(backoutRate,2)}%;background:#F59E0B"></div>
                </div>
                <div class="ph-wf-metric-pct">${backoutRate}%</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Access -->
        <div class="ph-card ph-quickaccess-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i class="fi fi-sr-apps"></i> Quick Access</span>
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
            <span class="ph-card-title"><i class="fi fi-sr-calendar"></i> <span id="ph-cal-label"></span></span>
            <div style="display:flex;gap:4px;align-items:center">
              ${canViewSensitive() ? `<button class="ph-cal-add-btn" onclick="_phOpenAddEvent()" title="Add event">
                <i class="fi fi-sr-plus"></i>
              </button>` : ''}
              <button class="ph-cal-nav" onclick="_phCalPrev()"><i class="fi fi-sr-angle-left"></i></button>
              <button class="ph-cal-nav" onclick="_phCalNext()"><i class="fi fi-sr-angle-right"></i></button>
            </div>
          </div>
          <div id="ph-calendar"></div>
          <div id="ph-cal-popover-backdrop" class="ph-cal-popover-backdrop" style="display:none" onclick="_phCloseCalPopover()"></div>
          <div id="ph-cal-popover" class="ph-cal-popover" style="display:none"></div>
        </div>

        <!-- Recent Activity -->
        <div class="ph-card ph-recent-card">
          <div class="ph-card-header">
            <span class="ph-card-title"><i class="fi fi-sr-pulse"></i> Recent Activity</span>
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
              : Components.emptyState({ icon: '<i class="fi fi-sr-pulse" style="opacity:.3"></i>', title: 'No recent activity' })
            }
          </div>

          <!-- Status Breakdown (below recent activity) -->
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="ph-card-title" style="margin-bottom:10px;display:flex;align-items:center;gap:5px">
              <i class="fi fi-sr-chart-pie"></i> Status Breakdown
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
            <div class="ph-fb-action-icon"><i class="fi fi-sr-user-add"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Add New Employee</div>
              <div class="ph-fb-action-sub">Create a new employee profile</div>
            </div>
          </div>` : ''}
          <div class="ph-fb-action" onclick="Router.go('tracker')">
            <div class="ph-fb-action-icon"><i class="fi fi-sr-marker"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Deployment Tracker</div>
              <div class="ph-fb-action-sub">Track employee deployments</div>
            </div>
          </div>
          <div class="ph-fb-action" onclick="Router.go('log')">
            <div class="ph-fb-action-icon"><i class="fi fi-sr-document"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Activity Log</div>
              <div class="ph-fb-action-sub">View all record changes</div>
            </div>
          </div>
          <div class="ph-fb-action" onclick="Router.go('analytics')">
            <div class="ph-fb-action-icon"><i class="fi fi-sr-chart-histogram"></i></div>
            <div class="ph-fb-action-body">
              <div class="ph-fb-action-title">Generate Report</div>
              <div class="ph-fb-action-sub">Create custom reports</div>
            </div>
          </div>
          ${(typeof currentRole !== 'undefined' && currentRole === 'owner') ? `
          <div class="ph-fb-action" onclick="Router.go('settings')">
            <div class="ph-fb-action-icon"><i class="fi fi-sr-settings"></i></div>
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
          : Components.emptyState({ icon: '<i class="fi fi-sr-pulse" style="opacity:.3"></i>', title: 'No recent activity' });
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
    el.innerHTML = `<div class="ph-ann-empty"><i class="fi fi-sr-bell-slash" style="opacity:.3"></i><span>No announcements yet</span></div>`;
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
  if (!list || !list.length) return `<div class="ph-bday-empty"><i class="fi fi-sr-pennant"></i><span>None</span></div>`;
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
    el.innerHTML = `<div class="ph-ev-empty"><i class="fi fi-sr-calendar-xmark"></i><span>No upcoming events</span></div>`;
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
          <i class="fi fi-sr-cross"></i>
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
          <i class="fi fi-sr-calendar-plus" style="vertical-align:-2px;margin-right:6px"></i>Add Calendar Event
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
          <i class="fi fi-sr-check"></i> Save Event
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

    html += `<div class="${cls}" onclick="_phCalDayClick(${d},${year},${month},this)" title="${hasEvent ? evCount + ' event' + (evCount>1?'s':'') : ''}${isBday ? (hasEvent ? ' · ' : '') + '🎂 Birthday' : ''}">${d}<div class="ph-cal-dots">${dots}${bdayDot}</div></div>`;
  }
  html += `</div>`;
  calEl.innerHTML = html;

  // Legend: render once into a dedicated persistent element instead of
  // insertAdjacentHTML-ing a new one on every render (was creating duplicates).
  let legendEl = calEl.parentElement?.querySelector('.ph-cal-legend');
  if (!legendEl && calEl.parentElement) {
    legendEl = document.createElement('div');
    legendEl.className = 'ph-cal-legend';
    calEl.insertAdjacentElement('afterend', legendEl);
  }
  if (legendEl) {
    legendEl.innerHTML = `
      <div class="ph-cal-leg-item">
        <div class="ph-cal-leg-dot" style="background:var(--accent)"></div> HR Event
      </div>
      <div class="ph-cal-leg-item">
        <div class="ph-cal-leg-dot" style="background:#FF9800"></div> Birthday
      </div>`;
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phCalDayClick(day, year, month, clickedEl) {
  const popover = document.getElementById('ph-cal-popover');
  const backdrop = document.getElementById('ph-cal-popover-backdrop');
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
        <i class="fi fi-sr-calendar-check" style="color:var(--accent);flex-shrink:0"></i>
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
        <i class="fi fi-sr-cake-birthday" style="color:var(--warning);flex-shrink:0"></i>
        <div class="ph-pop-ev-title" style="color:var(--warning)">${esc(name)} 🎉</div>
      </div>`).join('');
  }

  if (!body) {
    // No events — offer to add one if HR
    body = canViewSensitive()
      ? `<div class="ph-pop-empty">No events.
          <button class="ph-card-link" style="font-size:11px" onclick="_phOpenAddEventDate('${dateStr}')">Add one?</button></div>`
      : `<div class="ph-pop-empty">No events.</div>`;
  }

  popover.innerHTML = `
    <div class="ph-pop-header">
      <span class="ph-pop-date">${dateLabel}</span>
      <button class="ph-pop-close" onclick="_phCloseCalPopover()"><i class="fi fi-sr-cross"></i></button>
    </div>
    ${body}`;

  // Position as a true floating popup, anchored near the clicked day cell,
  // clamped so it never overflows the viewport.
  if (backdrop) backdrop.style.display = 'block';
  popover.style.display = 'block';

  if (clickedEl && clickedEl.getBoundingClientRect) {
    const rect = clickedEl.getBoundingClientRect();
    const popW = 280; // matches CSS width
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
    let top = rect.bottom + 8;
    // If it would overflow the bottom of the viewport, show it above the cell instead.
    const estPopH = 160;
    if (top + estPopH > window.innerHeight - 12) {
      top = rect.top - estPopH - 8;
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _phCloseCalPopover() {
  const popover = document.getElementById('ph-cal-popover');
  const backdrop = document.getElementById('ph-cal-popover-backdrop');
  if (popover) popover.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
}

function _phOpenAddEventDate(date) {
  _phCloseCalPopover();
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
  { id: 'people',      label: 'Employee\nDatabase',    icon: 'users',            color: 'rgba(0,230,118,.15)',  textColor: 'var(--success)',  onclick: "Router.go('people')",                                   visible: true },
  { id: 'tracker',     label: 'Deployment\nTracker',   icon: 'marker',           color: 'rgba(55,138,221,.15)', textColor: '#378ADD',         onclick: "Router.go('tracker')",                                  visible: true },
  { id: 'requirements',label: 'Requirements',          icon: 'clipboard-list',   color: 'rgba(255,152,0,.15)',  textColor: '#ff9800',         onclick: "missingFieldFilter='requirements';Router.go('people')",  visible: true },
  { id: 'analytics',   label: 'Analytics &\nReports',  icon: 'chart-histogram',  color: 'rgba(139,92,246,.15)', textColor: '#8b5cf6',         onclick: "Router.go('analytics')",                                visible: true },
  { id: 'export',      label: 'Export\nData',          icon: 'download',         color: 'rgba(0,200,170,.12)',  textColor: 'var(--accent)',   onclick: "exportXLSX()",                                          visible: true,  sensitive: true },
  { id: 'settings',    label: 'Settings',              icon: 'settings',         color: 'rgba(255,255,255,.06)',textColor: 'var(--text2)',    onclick: "Router.go('settings')",                                 visible: true,  ownerOnly: true },
  { id: 'log',         label: 'Activity\nLog',         icon: 'pulse',            color: 'rgba(55,138,221,.15)', textColor: '#378ADD',         onclick: "Router.go('log')",                                      visible: false },
  { id: 'people-add',  label: 'Add\nEmployee',         icon: 'user-add',         color: 'rgba(0,230,118,.15)',  textColor: 'var(--success)',  onclick: "openAddModal()",                                        visible: false },
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
          <i class="fi fi-sr-${t.icon}" style="font-size:20px"></i>
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
            <i class="fi fi-sr-${t.icon}" style="font-size:15px"></i>
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

  /* ═══════════════════════════════════════════════════════
     LAYOUT
  ═══════════════════════════════════════════════════════ */
  .ph-wrap {
    padding: 20px 24px 48px;
    max-width: 1300px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ═══════════════════════════════════════════════════════
     KPI STRIP — 4-column top bar
  ═══════════════════════════════════════════════════════ */
  .ph-kpi-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  @media (max-width: 900px) { .ph-kpi-strip { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 560px) { .ph-kpi-strip { grid-template-columns: 1fr; } }

  .ph-kpi {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px 16px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    cursor: pointer;
    transition: border-color .2s, transform .18s, box-shadow .2s;
    position: relative;
    overflow: hidden;
  }
  .ph-kpi::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--ph-kpi-accent, var(--accent));
    border-radius: 14px 14px 0 0;
  }
  .ph-kpi:hover {
    border-color: var(--ph-kpi-accent, var(--accent));
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(0,0,0,.18);
  }
  [data-theme="light"] .ph-kpi { background: #fff; }
  [data-theme="light"] .ph-kpi:hover { box-shadow: 0 8px 28px rgba(0,0,0,.09); }

  .ph-kpi-icon {
    width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    background: var(--ph-kpi-bg, rgba(0,200,170,.1));
    color: var(--ph-kpi-accent, var(--accent));
  }
  .ph-kpi-body { flex: 1; min-width: 0; }
  .ph-kpi-val {
    font-size: 26px; font-weight: 800; line-height: 1; letter-spacing: -0.5px;
    color: var(--text1);
  }
  .ph-kpi-label {
    font-size: 11px; font-weight: 600; color: var(--text3);
    text-transform: uppercase; letter-spacing: .6px; margin-top: 4px;
  }
  .ph-kpi-trend {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 700; margin-top: 6px;
    padding: 2px 7px; border-radius: 20px;
  }
  .ph-kpi-trend.up   { background: rgba(0,230,118,.12); color: #00E676; }
  .ph-kpi-trend.down { background: rgba(255,82,82,.12);  color: #FF5252; }
  .ph-kpi-trend.neu  { background: rgba(255,255,255,.06); color: var(--text3); }
  [data-theme="light"] .ph-kpi-trend.up   { background: rgba(0,160,80,.1);  color: #1a8a40; }
  [data-theme="light"] .ph-kpi-trend.down { background: rgba(200,50,50,.1); color: #b22222; }
  [data-theme="light"] .ph-kpi-trend.neu  { background: rgba(0,0,0,.05); color: #888; }

  /* ═══════════════════════════════════════════════════════
     HERO SECTION — greeting + illustration
  ═══════════════════════════════════════════════════════ */
  .ph-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 28px 36px;
    gap: 24px;
    overflow: hidden;
    position: relative;
    min-height: 178px;
    box-shadow: 0 2px 16px rgba(0,0,0,.12);
  }
  .ph-hero::after {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 80% 50%, rgba(0,200,170,.07) 0%, transparent 65%);
    pointer-events: none;
  }
  [data-theme="light"] .ph-hero { background: #fff; box-shadow: 0 4px 24px rgba(10,138,133,.08); }
  [data-theme="light"] .ph-hero::after { background: radial-gradient(ellipse at 80% 50%, rgba(10,138,133,.06) 0%, transparent 65%); }

  .ph-hero-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .ph-hero-welcome { font-size: 12px; font-weight: 600; color: var(--text3); }
  .ph-hero-greeting { font-size: 26px; font-weight: 800; color: var(--text1); line-height: 1.15; }
  .ph-hero-name { font-size: 26px; font-weight: 800; color: var(--accent); line-height: 1.15; }
  [data-theme="light"] .ph-hero-name { color: #0a8a85; }
  .ph-hero-sub { font-size: 12px; color: var(--text3); margin-top: 6px; }

  .ph-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  .ph-btn-primary {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 9px 20px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #071a1a; border: none;
    border-radius: 9px; cursor: pointer;
    transition: opacity .15s, box-shadow .15s, transform .15s;
    box-shadow: 0 2px 16px rgba(0,200,170,.28);
  }
  .ph-btn-primary:hover { opacity: .9; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(0,200,170,.38); }
  .ph-btn-outline {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 9px 18px; font-size: 13px; font-weight: 600;
    background: rgba(255,255,255,.05); color: var(--text2);
    border: 1px solid var(--border2); border-radius: 9px; cursor: pointer;
    transition: all .18s; position: relative;
  }
  .ph-btn-outline:hover { background: rgba(255,255,255,.09); color: var(--text1); border-color: rgba(255,255,255,.2); }
  [data-theme="light"] .ph-btn-outline { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.12); color: #333; }
  [data-theme="light"] .ph-btn-outline:hover { background: rgba(0,0,0,.07); }
  .ph-btn-badge {
    position: absolute; top: -7px; right: -7px;
    background: var(--danger); color: #fff;
    font-size: 9px; font-weight: 700; min-width: 16px; height: 16px;
    border-radius: 8px; padding: 0 4px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--bg-base);
  }

  .ph-hero-right { flex-shrink: 0; }
  .ph-hero-illustration { position: relative; width: 180px; height: 120px; }
  .ph-hero-blob {
    position: absolute; inset: 0;
    background: radial-gradient(circle at 55% 45%, rgba(0,200,170,.18) 0%, rgba(0,200,170,.04) 60%, transparent 80%);
    border-radius: 50%; filter: blur(12px);
  }
  .ph-hero-float-card {
    position: absolute; top: 10px; right: 10px;
    background: var(--bg-glass); border: 1px solid var(--border2);
    border-radius: 12px; padding: 10px 16px;
    backdrop-filter: blur(20px); text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,.25);
  }
  [data-theme="light"] .ph-hero-float-card { background: rgba(255,255,255,.8); }
  .ph-hfc-label { font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: var(--text3); font-weight: 700; }
  .ph-hfc-val { font-size: 28px; font-weight: 800; color: var(--accent); line-height: 1.1; }
  .ph-hfc-badge { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 6px; margin-top: 3px; display: inline-block; }
  .ph-hfc-up { background: rgba(0,230,118,.12); color: #00E676; }
  [data-theme="light"] .ph-hfc-up { background: rgba(0,160,80,.1); color: #1a8a40; }
  .ph-hero-circles { position: absolute; bottom: 8px; left: 10px; display: flex; }
  .ph-hero-circle {
    width: 34px; height: 34px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(0,200,170,.35), rgba(0,184,160,.15));
    border: 2px solid rgba(0,200,170,.4); color: var(--accent);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800;
    box-shadow: 0 0 10px rgba(0,200,170,.15);
  }

  /* ═══════════════════════════════════════════════════════
     GENERIC CARD
  ═══════════════════════════════════════════════════════ */
  .ph-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,.1);
    transition: border-color .2s;
  }
  [data-theme="light"] .ph-card { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
  .ph-card-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .ph-card-title {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; letter-spacing: .8px;
    text-transform: uppercase; color: var(--text3); opacity: .8;
  }
  [data-theme="light"] .ph-card-title { color: #076e6a; opacity: 1; }
  .ph-card-link {
    font-size: 12px; color: var(--accent); background: none;
    border: none; cursor: pointer; padding: 0; font-weight: 500; opacity: .85;
  }
  .ph-card-link:hover { opacity: 1; }

  /* ═══════════════════════════════════════════════════════
     3-COLUMN ROW (Celebrants · Actions · Events)
  ═══════════════════════════════════════════════════════ */
  .ph-row3 {
    display: grid;
    grid-template-columns: 1fr 1.1fr 1fr;
    gap: 16px;
    align-items: stretch;
  }
  @media (max-width: 1100px) { .ph-row3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 700px)  { .ph-row3 { grid-template-columns: 1fr; } }
  .ph-row3 > .ph-card { display: flex; flex-direction: column; height: 100%; }

  /* ═══════════════════════════════════════════════════════
     ACTION CENTER — card grid style
  ═══════════════════════════════════════════════════════ */
  .ph-action-list { display: flex; flex-direction: column; gap: 6px; }
  .ph-action-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 10px; cursor: pointer;
    background: rgba(255,255,255,.025);
    border: 1px solid var(--border);
    transition: background .15s, border-color .15s, transform .15s;
  }
  .ph-action-row:hover {
    background: rgba(255,255,255,.06);
    border-color: var(--border2);
    transform: translateX(2px);
  }
  [data-theme="light"] .ph-action-row { background: rgba(0,0,0,.02); border-color: rgba(0,0,0,.08); }
  [data-theme="light"] .ph-action-row:hover { background: rgba(0,0,0,.05); border-color: rgba(0,0,0,.14); }

  .ph-action-icon {
    width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .ph-ai-red    { background: rgba(255,82,82,.12);   color: #FF5252; }
  .ph-ai-orange { background: rgba(255,152,0,.12);   color: #FF9800; }
  .ph-ai-yellow { background: rgba(255,215,64,.12);  color: #FFD740; }
  .ph-ai-teal   { background: rgba(0,200,170,.12);   color: var(--accent); }
  .ph-ai-purple { background: rgba(139,92,246,.12);  color: #8B5CF6; }
  [data-theme="light"] .ph-ai-red    { background: rgba(220,50,50,.1);  color: #c0392b; }
  [data-theme="light"] .ph-ai-orange { background: rgba(200,100,0,.1);  color: #e67e22; }
  [data-theme="light"] .ph-ai-yellow { background: rgba(180,130,0,.1);  color: #b8860b; }
  [data-theme="light"] .ph-ai-teal   { background: rgba(0,138,133,.1);  color: #0a8a85; }
  [data-theme="light"] .ph-ai-purple { background: rgba(100,60,200,.1); color: #5b34c9; }

  .ph-action-label { flex: 1; font-size: 12px; font-weight: 500; color: var(--text2); }
  [data-theme="light"] .ph-action-label { color: #333; }

  .ph-action-badge {
    font-size: 10px; font-weight: 700; padding: 2px 8px;
    border-radius: 20px; flex-shrink: 0; min-width: 26px; text-align: center;
  }
  .ph-ab-red    { background: rgba(255,82,82,.15);   color: #FF5252; }
  .ph-ab-orange { background: rgba(255,152,0,.15);   color: #FF9800; }
  .ph-ab-yellow { background: rgba(255,215,64,.12);  color: #FFD740; }
  .ph-ab-teal   { background: rgba(0,200,170,.12);   color: var(--accent); }
  .ph-ab-purple { background: rgba(139,92,246,.12);  color: #8B5CF6; }
  [data-theme="light"] .ph-ab-red    { background: rgba(220,50,50,.1);  color: #c0392b; }
  [data-theme="light"] .ph-ab-orange { background: rgba(200,100,0,.1);  color: #e67e22; }
  [data-theme="light"] .ph-ab-yellow { background: rgba(180,130,0,.1);  color: #b8860b; }
  [data-theme="light"] .ph-ab-teal   { background: rgba(0,138,133,.1);  color: #0a8a85; }
  [data-theme="light"] .ph-ab-purple { background: rgba(100,60,200,.1); color: #5b34c9; }

  /* ═══════════════════════════════════════════════════════
     BIRTHDAY TABS
  ═══════════════════════════════════════════════════════ */
  .ph-bday-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
  .ph-bday-tab {
    padding: 6px 12px; font-size: 11px; font-weight: 600;
    background: none; border: none; cursor: pointer; color: var(--text3);
    border-bottom: 2px solid transparent; transition: color .15s, border-color .15s;
  }
  .ph-bday-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  [data-theme="light"] .ph-bday-tab.active { color: #0a8a85; border-bottom-color: #0a8a85; }

  .ph-bday-list { display: flex; flex-direction: column; gap: 8px; }
  .ph-bday-item {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 0; border-bottom: 1px solid var(--border);
  }
  .ph-bday-item:last-child { border-bottom: none; }
  .ph-bday-name { font-size: 13px; font-weight: 600; color: var(--text1); }
  .ph-bday-dept { font-size: 11px; color: var(--text3); margin-top: 1px; }
  .ph-bday-days {
    margin-left: auto; font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 20px;
    background: rgba(0,200,170,.1); color: var(--accent);
  }
  .ph-bday-days.today { background: rgba(255,152,0,.12); color: #FF9800; }
  [data-theme="light"] .ph-bday-days { color: #0a8a85; }
  [data-theme="light"] .ph-bday-days.today { color: #e67e22; }
  .ph-bday-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 20px 12px; text-align: center;
    font-size: 12px; color: var(--text3);
  }
  .ph-bday-empty .fi { font-size: 22px; color: var(--text3); opacity: .35; }

  /* ═══════════════════════════════════════════════════════
     UPCOMING EVENTS
  ═══════════════════════════════════════════════════════ */
  .ph-event-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }
  .ph-event-item:last-child { border-bottom: none; }
  .ph-event-date-box {
    width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
    background: rgba(0,200,170,.1); border: 1px solid rgba(0,200,170,.2);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .ph-event-month { font-size: 8px; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: .5px; }
  .ph-event-day   { font-size: 16px; font-weight: 800; color: var(--text1); line-height: 1; }
  [data-theme="light"] .ph-event-date-box { background: rgba(0,138,133,.08); border-color: rgba(0,138,133,.18); }
  [data-theme="light"] .ph-event-month { color: #0a8a85; }

  .ph-event-body  { flex: 1; min-width: 0; }
  .ph-event-title { font-size: 13px; font-weight: 600; color: var(--text1); }
  .ph-event-meta  { font-size: 11px; color: var(--text3); margin-top: 2px; }
  .ph-event-tag   {
    font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
    background: rgba(55,138,221,.12); color: #378ADD; margin-left: 4px;
  }
  [data-theme="light"] .ph-event-tag { background: rgba(40,100,200,.1); color: #1a5cb0; }

  .ph-ev-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 20px 12px; text-align: center;
  }
  .ph-ev-empty .fi { font-size: 22px; color: var(--text3); opacity: .35; }
  .ph-ev-empty span { font-size: 12px; color: var(--text3); }

  /* ═══════════════════════════════════════════════════════
     ROW 2: Workforce Overview + Quick Access
  ═══════════════════════════════════════════════════════ */
  .ph-row2 {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 16px;
    align-items: stretch;
  }
  @media (max-width: 900px) { .ph-row2 { grid-template-columns: 1fr; } }
  .ph-row2 > .ph-card { display: flex; flex-direction: column; height: 100%; }

  /* Workforce Overview */
  .ph-workforce-body { display: flex; gap: 24px; align-items: center; }
  .ph-gauge-wrap { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
  .ph-gauge-svg { width: 100%; height: 100%; }
  :root { --ph-gauge-track: rgba(255,255,255,.08); }
  [data-theme="light"] { --ph-gauge-track: rgba(10,138,133,.10); }
  .ph-gauge-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .ph-gauge-pct  { font-size: 20px; font-weight: 800; color: var(--text1); line-height: 1; }
  .ph-gauge-lbl  { font-size: 9px; color: var(--text3); line-height: 1.3; margin-top: 2px; text-align: center; }
  .ph-gauge-star { font-size: 9px; color: var(--warning); margin-top: 3px; font-weight: 700; }

  .ph-wf-metrics { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .ph-wf-metric  { display: flex; flex-direction: column; gap: 3px; }
  .ph-wf-metric-top { display: flex; align-items: center; gap: 5px; }
  .ph-wf-metric-top .fi { font-size: 14px; }
  .ph-wf-metric-label { font-size: 11px; color: var(--text2); font-weight: 500; }
  .ph-wf-metric-vals  { font-size: 12px; font-weight: 700; color: var(--text1); }
  .ph-wf-bar-wrap { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .ph-wf-bar-fill { height: 100%; border-radius: 3px; transition: width .5s ease; }
  .ph-wf-metric-pct { font-size: 11px; color: var(--text3); font-weight: 600; }

  /* Quick Access grid */
  .ph-qa-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  }
  .ph-qa-tile {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 14px 8px; border-radius: 12px; cursor: pointer;
    background: rgba(255,255,255,.035); border: 1px solid var(--border);
    transition: background .18s, border-color .18s, transform .18s;
    text-align: center;
  }
  .ph-qa-tile:hover { background: rgba(255,255,255,.07); border-color: var(--border2); transform: translateY(-2px); }
  [data-theme="light"] .ph-qa-tile { background: rgba(0,0,0,.02); }
  [data-theme="light"] .ph-qa-tile:hover { background: rgba(0,0,0,.05); }

  .ph-qa-icon {
    width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center; font-size: 20px;
  }
  .ph-qa-label {
    font-size: 10px; font-weight: 600; color: var(--text2); line-height: 1.3;
    text-transform: uppercase; letter-spacing: .4px;
  }

  /* ═══════════════════════════════════════════════════════
     ROW 3: Calendar + Recent Activity
  ═══════════════════════════════════════════════════════ */
  .ph-row-cal {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 16px;
    align-items: stretch;
  }
  @media (max-width: 900px) { .ph-row-cal { grid-template-columns: 1fr; } }
  .ph-row-cal > .ph-card { min-width: 0; display: flex; flex-direction: column; height: 100%; }

  /* Recent Activity */
  .ph-recent-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border); cursor: pointer;
    transition: background .12s; border-radius: 6px;
  }
  .ph-recent-item:last-child { border-bottom: none; }
  .ph-recent-item:hover { background: var(--bg-frosted); }
  .ph-recent-body { flex: 1; min-width: 0; }
  .ph-recent-name { font-size: 13px; font-weight: 600; color: var(--text1); }
  .ph-recent-action { font-size: 11px; color: var(--text3); margin-top: 1px; }
  .ph-recent-time-row { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
  .ph-recent-time { font-size: 10px; color: var(--text3); font-style: italic; }

  /* Status Breakdown */
  .ph-status-list { display: flex; flex-direction: column; gap: 7px; }
  .ph-status-row {
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    padding: 4px 6px; border-radius: 6px; transition: background .12s;
  }
  .ph-status-row:hover { background: var(--bg-frosted); }
  .ph-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 5px currentColor; }
  .ph-status-name { font-size: 12px; color: var(--text2); font-weight: 500; min-width: 70px; }
  .ph-status-count { font-size: 12px; font-weight: 700; color: var(--text1); min-width: 28px; text-align: right; }
  .ph-status-bar-wrap { flex: 1; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .ph-status-bar-fill { height: 100%; border-radius: 3px; transition: width .5s ease; }

  /* ═══════════════════════════════════════════════════════
     CALENDAR
  ═══════════════════════════════════════════════════════ */
  .ph-cal-add-btn {
    width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border2);
    background: rgba(0,200,170,.1); color: var(--accent); cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 12px;
    transition: background .15s;
  }
  .ph-cal-add-btn:hover { background: rgba(0,200,170,.2); }
  .ph-cal-nav {
    width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--bg-frosted); color: var(--text2); cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 13px;
    transition: all .15s;
  }
  .ph-cal-nav:hover { border-color: var(--border2); color: var(--text1); }

  #ph-calendar { overflow: visible; }
  .ph-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }

  .ph-cal-dayname {
    font-size: 9px; font-weight: 700; text-align: center; color: var(--text3);
    text-transform: uppercase; letter-spacing: .6px; padding: 0 0 8px;
    opacity: .65;
  }

  .ph-cal-cell {
    aspect-ratio: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; border-radius: 9px; font-size: 12px; font-weight: 500;
    cursor: default; position: relative; color: var(--text2);
    transition: background .15s, transform .15s, border-color .15s;
    gap: 1px; border: 1px solid transparent; background: rgba(255,255,255,.02);
  }
  [data-theme="light"] .ph-cal-cell { background: rgba(0,0,0,.015); }
  .ph-cal-cell.ph-cal-empty { background: none; cursor: default; }

  .ph-cal-cell.ph-cal-today {
    background: rgba(0,200,170,.16); color: var(--accent); font-weight: 800;
    border: 1px solid rgba(0,200,170,.35);
    box-shadow: 0 0 0 1px rgba(0,200,170,.1), 0 2px 8px rgba(0,200,170,.12);
  }
  [data-theme="light"] .ph-cal-cell.ph-cal-today {
    background: rgba(0,138,133,.12); border-color: rgba(0,138,133,.3); color: #0a8a85;
  }

  .ph-cal-cell.ph-cal-has-event {
    cursor: pointer; border-color: var(--border);
  }
  .ph-cal-cell.ph-cal-has-event:hover {
    background: rgba(0,200,170,.08); border-color: rgba(0,200,170,.25); transform: translateY(-1px);
  }
  [data-theme="light"] .ph-cal-cell.ph-cal-has-event:hover { background: rgba(0,138,133,.06); }

  .ph-cal-cell.ph-cal-bday:not(.ph-cal-today) { border-color: rgba(255,152,0,.25); }

  .ph-cal-dots { display: flex; gap: 2px; align-items: center; justify-content: center; height: 5px; }
  .ph-cal-event-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  .ph-cal-bday-dot  { width: 4px; height: 4px; border-radius: 50%; background: #FF9800; flex-shrink: 0; }

  .ph-cal-legend {
    display: flex; gap: 16px; margin-top: 14px; padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .ph-cal-leg-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--text3); font-weight: 500;
  }
  .ph-cal-leg-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .ph-cal-popover-backdrop {
    position: fixed; inset: 0; z-index: 998;
    background: rgba(0,0,0,0.25);
  }
  .ph-cal-popover {
    position: fixed; width: 280px; max-width: 90vw; z-index: 999;
    background: var(--bg-glass); border: 1px solid var(--border2); border-radius: 12px;
    padding: 14px 16px; font-size: 12px; color: var(--text1);
    box-shadow: 0 16px 48px rgba(0,0,0,.55);
    backdrop-filter: blur(28px) saturate(1.7);
    -webkit-backdrop-filter: blur(28px) saturate(1.7);
    animation: phPopIn .15s ease-out;
  }
  @keyframes phPopIn {
    from { opacity: 0; transform: translateY(-4px) scale(.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  [data-theme="light"] .ph-cal-popover { background: rgba(255,255,255,.97); }

  .ph-pop-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
  }
  .ph-pop-date { font-size: 13px; font-weight: 700; color: var(--text1); }
  .ph-pop-close {
    width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-frosted); color: var(--text2); cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 10px;
    flex-shrink: 0; transition: all .15s;
  }
  .ph-pop-close:hover { border-color: var(--border2); color: var(--text1); }

  .ph-pop-event {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 7px 0; border-bottom: 1px solid var(--border);
  }
  .ph-pop-event:last-child { border-bottom: none; }
  .ph-pop-event .fi { font-size: 14px; margin-top: 1px; }
  .ph-pop-ev-title { font-size: 12px; font-weight: 600; color: var(--text1); }
  .ph-pop-ev-note  { font-size: 11px; color: var(--text2); margin-top: 2px; line-height: 1.4; }
  .ph-pop-ev-by    { font-size: 10px; color: var(--text3); margin-top: 3px; font-style: italic; }

  .ph-pop-empty {
    font-size: 11px; color: var(--text3); text-align: center; padding: 10px 0 2px;
  }

  /* ═══════════════════════════════════════════════════════
     FEATURE BANNER
  ═══════════════════════════════════════════════════════ */
  .ph-feature-banner {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 18px;
    padding: 28px 32px; display: flex; gap: 28px; overflow: hidden;
    position: relative;
  }
  .ph-feature-banner::before {
    content: '';
    position: absolute; top: -40px; left: -40px;
    width: 200px; height: 200px;
    background: radial-gradient(circle, rgba(0,200,170,.08) 0%, transparent 70%);
    pointer-events: none;
  }
  [data-theme="light"] .ph-feature-banner { background: #fff; }
  .ph-fb-hero { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; min-width: 200px; }
  .ph-fb-x-logo {
    width: 36px; height: 36px; border-radius: 10px; font-size: 18px; font-weight: 900;
    background: var(--accent); color: #071a1a;
    display: flex; align-items: center; justify-content: center; margin-bottom: 4px;
  }
  .ph-fb-hero-title { font-size: 18px; font-weight: 800; color: var(--text1); line-height: 1.25; }
  .ph-fb-hero-sub { font-size: 12px; color: var(--text3); line-height: 1.5; }
  .ph-fb-explore-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px; font-size: 12px; font-weight: 600;
    background: rgba(0,200,170,.12); color: var(--accent);
    border: 1px solid rgba(0,200,170,.25); border-radius: 8px; cursor: pointer;
    margin-top: 10px; transition: all .18s; width: fit-content;
  }
  .ph-fb-explore-btn:hover { background: rgba(0,200,170,.22); }
  [data-theme="light"] .ph-fb-explore-btn { color: #0a8a85; }

  .ph-fb-actions {
    flex: 1; display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px; align-content: start;
  }
  .ph-fb-action {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; border-radius: 12px; cursor: pointer;
    background: rgba(255,255,255,.03); border: 1px solid var(--border);
    transition: all .18s;
  }
  .ph-fb-action:hover { background: rgba(255,255,255,.07); border-color: var(--border2); transform: translateX(2px); }
  [data-theme="light"] .ph-fb-action { background: rgba(0,0,0,.02); }
  [data-theme="light"] .ph-fb-action:hover { background: rgba(0,0,0,.05); }
  .ph-fb-action-icon {
    width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
    background: rgba(0,200,170,.1); color: var(--accent); font-size: 18px;
    display: flex; align-items: center; justify-content: center;
  }
  .ph-fb-action-title { font-size: 12px; font-weight: 600; color: var(--text1); }
  .ph-fb-action-sub   { font-size: 10px; color: var(--text3); margin-top: 1px; }

  /* ═══════════════════════════════════════════════════════
     QUICK ACCESS EDIT OVERLAY
  ═══════════════════════════════════════════════════════ */
  .ph-qa-edit-overlay {
    position: fixed; inset: 0; z-index: 9900;
    background: rgba(0,0,0,.65); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
  }
  .ph-qa-edit-modal {
    background: var(--bg2); border: 1px solid var(--border2);
    border-radius: 18px; padding: 24px; width: 360px; max-width: 95vw;
    box-shadow: 0 20px 60px rgba(0,0,0,.6);
  }
  [data-theme="light"] .ph-qa-edit-modal { background: #fff; }
  .ph-qa-edit-title { font-size: 15px; font-weight: 700; color: var(--text1); margin-bottom: 4px; }
  .ph-qa-edit-sub { font-size: 12px; color: var(--text3); margin-bottom: 16px; }
  .ph-qa-edit-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; }
  .ph-qa-edit-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 9px; background: rgba(255,255,255,.04);
    border: 1px solid var(--border); cursor: grab;
  }
  [data-theme="light"] .ph-qa-edit-row { background: rgba(0,0,0,.02); }
  .ph-qa-edit-row.drag-over { border-color: var(--accent); background: rgba(0,200,170,.06); }
  .ph-qa-edit-drag { color: var(--text3); cursor: grab; }
  .ph-qa-edit-icon { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 15px; }
  .ph-qa-edit-name { flex: 1; font-size: 13px; color: var(--text2); }
  .ph-qa-edit-toggle {
    width: 34px; height: 18px; border-radius: 9px; border: none; cursor: pointer;
    position: relative; transition: background .2s; flex-shrink: 0;
  }
  .ph-qa-edit-toggle::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; border-radius: 50%; background: #fff;
    transition: left .2s;
  }
  .ph-qa-edit-toggle.on  { background: var(--accent); }
  .ph-qa-edit-toggle.off { background: rgba(255,255,255,.15); }
  [data-theme="light"] .ph-qa-edit-toggle.off { background: rgba(0,0,0,.2); }
  .ph-qa-edit-toggle.on::after  { left: 18px; }
  .ph-qa-edit-footer { display: flex; gap: 8px; justify-content: flex-end; }
  .ph-qa-edit-cancel { background: rgba(255,255,255,.05); border: 1px solid var(--border); color: var(--text2); padding: 7px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: background .15s; }
  .ph-qa-edit-cancel:hover { background: rgba(255,255,255,.1); }
  .ph-qa-edit-save { background: var(--accent); color: #071a1a; border: none; padding: 7px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: opacity .15s; }
  .ph-qa-edit-save:hover { opacity: .85; }
  `;
  document.head.appendChild(s);
}
