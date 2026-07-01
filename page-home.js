// ============================================================
// page-home.js — Home Dashboard
// Layout exactly matches reference image:
//   [Hero title] → [4 KPI cards] →
//   [Greeting card | Calendar widget] →
//   [Workforce Overview | Upcoming Events] →
//   [Recent Activity | Celebrants]
// ============================================================
'use strict';

const EVENTS_SHEET = 'Events';
let _calEventsCache = null;
let _phCalYear  = new Date().getFullYear();
let _phCalMonth = new Date().getMonth();

// ============================================================
// MAIN RENDER
// ============================================================
async function renderHome() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = '';

  if (typeof employees === 'undefined' || typeof getStats === 'undefined') {
    document.getElementById('content').innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text3)">Loading…</div>';
    return;
  }

  // Fetch log if not in memory so Recent Activity is always current
  if (!logCache || !logCache.length) {
    try {
      const r = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H`
      });
      logCache = r.result.values || [];
    } catch(e) { /* non-fatal — Recent Activity will just show empty */ }
  }

  const s            = getStats();
  const total        = employees.length;
  const active       = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
                                             normalizeDeployStatus(e.deploymentStatus) !== 'BACKOUT').length;
  const deployed     = employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'DEPLOYED').length;
  const missingReqs  = employees.filter(e => !requirementsComplete(e)).length;
  const backoutCount = employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'BACKOUT').length;
  const notDeployed  = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
    normalizeDeployStatus(e.deploymentStatus) !== 'DEPLOYED').length;

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const userName = currentUser?.name?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';

  const recentItems = _buildRecentList(6);
  const bdayToday   = typeof getBirthdaysToday === 'function' ? getBirthdaysToday() : [];
  const bdayMonth   = typeof getBirthdaysThisMonth === 'function' ? getBirthdaysThisMonth() : [];

  // Clean up any popover/backdrop left detached in <body> from a previous
  // render of this page (they get reparented to <body> when opened).
  document.getElementById('hd-cal-popover')?.remove();
  document.getElementById('hd-cal-popover-backdrop')?.remove();

  document.getElementById('content').innerHTML = `
    <div class="hd-wrap">

      <!-- ═══════════════════════════════════════════════════
           HERO — dark teal gradient matching app palette,
           title + subtitle + 2 buttons
      ═══════════════════════════════════════════════════ -->
      <div class="hd-hero" id="hd-hero">
        <div class="hd-hero-inner">
          <div class="hd-hero-title">WORKFORCE PORTAL</div>
          <div class="hd-hero-sub">Employee Management &bull; Deployment Tracking &bull; HR Operations</div>
          <div class="hd-hero-btns">
            <button class="hd-hero-btn hd-hero-btn-outline" onclick="Router.go('analytics')">Analytics</button>
            <button class="hd-hero-btn hd-hero-btn-outline" onclick="Router.go('recruitment')">Applicants</button>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════
           KPI STRIP — 4 cards with real distinct metrics
      ═══════════════════════════════════════════════════ -->
      <div class="hd-kpi-strip">
        <div class="hd-kpi" onclick="Router.go('active')" title="View all active workforce">
          <div class="hd-kpi-val">${active}</div>
          <div class="hd-kpi-label">Active Workforce</div>
        </div>
        <div class="hd-kpi" onclick="Router.go('tracker')" title="View deployment tracker">
          <div class="hd-kpi-val">${deployed}</div>
          <div class="hd-kpi-label">Deployed</div>
        </div>
        <div class="hd-kpi" onclick="drillDown('notDeployed')" title="View pending deployment">
          <div class="hd-kpi-val">${notDeployed}</div>
          <div class="hd-kpi-label">Pending Deploy</div>
        </div>
        <div class="hd-kpi" onclick="drillDown('missingRequirements')" title="View missing requirements">
          <div class="hd-kpi-val">${missingReqs}</div>
          <div class="hd-kpi-label">Missing Reqs</div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════
           ROW A: Greeting card (left) + Calendar widget (right)
      ═══════════════════════════════════════════════════ -->
      <div class="hd-row-a">

        <!-- Greeting card -->
        <div class="hd-card hd-greeting-card">
          <div class="hd-greeting-time">${greeting},</div>
          <div class="hd-greeting-name">${esc(userName)}</div>
          <div class="hd-greeting-sub">Here's what's happening with your workforce today.</div>
          <div class="hd-greeting-btns">
            <button class="hd-pill-btn" onclick="Router.go('active')">Employee Directory</button>
            <button class="hd-pill-btn" onclick="missingFieldFilter='requirements';Router.go('active')">Pending Actions</button>
          </div>
        </div>

        <!-- Mini Calendar widget -->
        <div class="hd-card hd-mini-cal-card">
          <div class="hd-card-header">
            <span class="hd-card-title">Calendar</span>
            <div style="display:flex;gap:4px;align-items:center">
              <button class="hd-icon-btn" onclick="_phCalPrev()">&#8249;</button>
              <button class="hd-icon-btn" onclick="_phCalNext()">&#8250;</button>
            </div>
          </div>
          <div class="hd-cal-label" id="hd-cal-label"></div>
          <div id="hd-calendar"></div>
          <div id="hd-cal-popover-backdrop" style="display:none;position:fixed;inset:0;z-index:900" onclick="_phCloseCalPopover()"></div>
          <div id="hd-cal-popover" class="hd-cal-popover" style="display:none"></div>
        </div>

      </div>

      <!-- ═══════════════════════════════════════════════════
           ROW B: Workforce Overview (left) + Upcoming Events (right)
      ═══════════════════════════════════════════════════ -->
      <div class="hd-row-b">

        <!-- Workforce Overview -->
        <div class="hd-card hd-overview-card">
          <div class="hd-card-header">
            <span class="hd-card-title">Workforce Overview</span>
            <button class="hd-card-link" onclick="Router.go('analytics')">Analytics →</button>
          </div>
          <div class="hd-overview-body">
            ${Object.entries(s).filter(([,v])=>v>0).map(([st, count]) => `
              <div class="hd-ov-row" onclick="filterByStatus('${esc(st)}');Router.go(st==='Active'?'active':'archive')">
                <span class="hd-ov-dot" style="background:${STATUS_COLORS[st]||'var(--text3)'}"></span>
                <span class="hd-ov-label">${esc(st)}</span>
                <div class="hd-ov-bar-wrap">
                  <div class="hd-ov-bar" style="width:${total?Math.round(count/total*100):0}%;background:${STATUS_COLORS[st]||'var(--accent)'}"></div>
                </div>
                <span class="hd-ov-count">${count}</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Upcoming Events -->
        <div class="hd-card hd-events-card">
          <div class="hd-card-header">
            <span class="hd-card-title">Upcoming Event</span>
            <button class="hd-card-link" onclick="Router.go('calendar')">View calendar →</button>
          </div>
          <div id="hd-events-list">
            <div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">Loading…</div>
          </div>
        </div>

      </div>

      <!-- ═══════════════════════════════════════════════════
           ROW C: Recent Activity (left) + Celebrants (right)
      ═══════════════════════════════════════════════════ -->
      <div class="hd-row-c">

        <!-- Recent Activity -->
        <div class="hd-card hd-recent-card">
          <div class="hd-card-header">
            <span class="hd-card-title">Recent Activity</span>
            <button class="hd-card-link" onclick="Router.go('log')">View all →</button>
          </div>
          <div class="hd-recent-list">
            ${recentItems.length
              ? recentItems.map(r => `
                <div class="hd-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                  ${Components.avatar(r.name, 30)}
                  <div class="hd-recent-body">
                    <div class="hd-recent-name">${esc(r.name)}</div>
                    <div class="hd-recent-action">${esc(r.action)}</div>
                  </div>
                  <div class="hd-recent-time">${esc(r.time)}</div>
                </div>`).join('')
              : `<div class="hd-empty-state">No recent activity</div>`}
          </div>
        </div>

        <!-- Celebrants -->
        <div class="hd-card hd-bday-card">
          <div class="hd-card-header">
            <span class="hd-card-title">Celebrants</span>
            <button class="hd-card-link" onclick="viewAllBirthdays()">View all →</button>
          </div>
          <div class="hd-bday-list">
            ${bdayToday.length
              ? bdayToday.slice(0, 6).map(b => {
                  const emp = b.emp || b;
                  const name = emp.fullName || emp.name || '?';
                  const initials = name.split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
                  return `
                    <div class="hd-bday-item" onclick="openDetailPanel('${esc(emp.infinixId||'')}')">
                      <div class="hd-bday-avatar">${initials}</div>
                      <div class="hd-bday-info">
                        <div class="hd-bday-name">${esc(name)}</div>
                        <div class="hd-bday-sub">🎂 Birthday Today</div>
                      </div>
                    </div>`;
                }).join('')
              : bdayMonth.length
                ? bdayMonth.slice(0,4).map(b => {
                    const emp = b.emp || b;
                    const name = emp.fullName || emp.name || '?';
                    const dob  = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
                    const initials = name.split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
                    const dateLabel = !isNaN(dob) ? dob.toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '';
                    return `
                      <div class="hd-bday-item" onclick="openDetailPanel('${esc(emp.infinixId||'')}')">
                        <div class="hd-bday-avatar">${initials}</div>
                        <div class="hd-bday-info">
                          <div class="hd-bday-name">${esc(name)}</div>
                          <div class="hd-bday-sub">🎂 ${dateLabel}</div>
                        </div>
                      </div>`;
                  }).join('')
                : `<div class="hd-empty-state">No birthdays this month</div>`}
          </div>
        </div>

      </div>
    </div>
  `;

  _injectHomeStyles();
  _phCalRender();
  _phLoadEventsAndRender();
}

// ============================================================
// CALENDAR — mini widget on home page
// ============================================================
function _phCalPrev() {
  _phCalMonth--;
  if (_phCalMonth < 0) { _phCalMonth = 11; _phCalYear--; }
  _phCalRender();
}
function _phCalNext() {
  _phCalMonth++;
  if (_phCalMonth > 11) { _phCalMonth = 0; _phCalYear++; }
  _phCalRender();
}

function _phCalRender() {
  const calEl   = document.getElementById('hd-calendar');
  const labelEl = document.getElementById('hd-cal-label');
  if (!calEl) return;

  const today = new Date();
  const year  = _phCalYear;
  const month = _phCalMonth;

  if (labelEl) labelEl.textContent = new Date(year, month, 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const firstDay    = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Birthday dots
  const bdayDays = new Set();
  if (typeof getBirthdaysThisMonth === 'function' &&
      year === today.getFullYear() && month === today.getMonth()) {
    getBirthdaysThisMonth().forEach(item => {
      const emp = item.emp || item;
      const d = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
      if (!isNaN(d)) bdayDays.add(d.getDate());
    });
  }

  // Event dots
  const eventsByDay = {};
  (_calEventsCache || []).forEach(ev => {
    const d = new Date(ev.date);
    if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(ev);
  });

  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = `<div class="hd-cal-grid">`;
  html += dayNames.map(d => `<div class="hd-cal-dn">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += `<div class="hd-cal-cell hd-cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday  = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const isBday   = bdayDays.has(d);
    const hasEvt   = !!eventsByDay[d];
    let cls = 'hd-cal-cell';
    if (isToday) cls += ' hd-cal-today';
    const dots = (hasEvt ? `<span class="hd-cal-dot hd-dot-evt"></span>` : '') +
                 (isBday ? `<span class="hd-cal-dot hd-dot-bday"></span>` : '');
    html += `<div class="${cls}" onclick="_phCalDayClick(${d},${year},${month},this)"
      title="${hasEvt ? eventsByDay[d].length + ' event(s)' : ''}${isBday ? (hasEvt?' · ':'')+'🎂' : ''}"
    >${d}<div class="hd-cal-dots">${dots}</div></div>`;
  }
  html += `</div>`;
  calEl.innerHTML = html;
}

function _phCalDayClick(day, year, month, clickedEl) {
  let popover  = document.getElementById('hd-cal-popover');
  let backdrop = document.getElementById('hd-cal-popover-backdrop');
  if (!popover) return;

  // Move popover + backdrop to <body> so the card's `overflow:hidden`
  // can never clip or trap them behind sibling cards (e.g. Upcoming Event).
  if (popover.parentElement !== document.body) document.body.appendChild(popover);
  if (backdrop && backdrop.parentElement !== document.body) document.body.appendChild(backdrop);

  const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const events  = (_calEventsCache || []).filter(ev => ev.date && ev.date.slice(0,10) === dateStr);
  const bdayNames = [];
  if (typeof getBirthdaysThisMonth === 'function') {
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth()) {
      getBirthdaysThisMonth().forEach(item => {
        const emp = item.emp || item;
        const d = new Date(emp.dob || emp.birthdate || emp.dateOfBirth || '');
        if (!isNaN(d) && d.getDate() === day) bdayNames.push(emp.fullName || emp.name || '?');
      });
    }
  }

  const dateLabel = new Date(year, month, day).toLocaleDateString('en-PH',
    { weekday:'long', month:'long', day:'numeric' });

  let body = '';
  events.forEach(ev => {
    body += `<div class="hd-pop-row">
      <span class="hd-pop-dot" style="background:var(--accent)"></span>
      <div><div class="hd-pop-title">${esc(ev.title)}</div>
      ${ev.note ? `<div class="hd-pop-note">${esc(ev.note)}</div>` : ''}</div>
    </div>`;
  });
  bdayNames.forEach(name => {
    body += `<div class="hd-pop-row">
      <span class="hd-pop-dot" style="background:#FF9800"></span>
      <div class="hd-pop-title" style="color:#FF9800">🎂 ${esc(name)}</div>
    </div>`;
  });
  if (!body) {
    body = `<div class="hd-pop-empty">No events.</div>`;
  }

  popover.innerHTML = `
    <div class="hd-pop-header">
      <span style="font-size:11px;font-weight:700;color:var(--text)">${dateLabel}</span>
      <button class="hd-icon-btn" onclick="_phCloseCalPopover()">✕</button>
    </div>${body}`;

  if (backdrop) backdrop.style.display = 'block';
  popover.style.display = 'block';

  if (clickedEl) {
    const rect = clickedEl.getBoundingClientRect();
    const pw = 240;
    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = rect.bottom + 6;
    if (top + 160 > window.innerHeight - 8) top = rect.top - 160 - 6;
    popover.style.left = left + 'px';
    popover.style.top  = top  + 'px';
  }
}

function _phCloseCalPopover() {
  const p = document.getElementById('hd-cal-popover');
  const b = document.getElementById('hd-cal-popover-backdrop');
  if (p) p.style.display = 'none';
  if (b) b.style.display = 'none';
}

// ============================================================
// EVENTS — load + render into upcoming list
// ============================================================
async function _phLoadEventsAndRender() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A2:H`
    });
    const rows = res.result.values || [];
    _calEventsCache = rows
      .map((r, i) => ({
        id: r[0] || '', title: r[1] || '', date: r[2] || '',
        time: r[3] || '', endTime: r[4] || '',
        note: r[5] || '', postedBy: r[6] || '',
        active: String(r[7] || 'TRUE').trim().toUpperCase() !== 'FALSE',
        _row: i + 2, // true sheet row, computed BEFORE any filtering
      }))
      .filter(e => e.active);
  } catch (e) {
    console.warn('Events load error:', e);
    _calEventsCache = [];
  }
  _phCalRender();
  _phRenderEventsList();
}

function _phRenderEventsList() {
  const el = document.getElementById('hd-events-list');
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const events = (_calEventsCache || [])
    .filter(ev => { const d = new Date(ev.date); return !isNaN(d) && d >= today; })
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  if (!events.length) {
    el.innerHTML = `<div class="hd-empty-state">No upcoming events</div>`;
    return;
  }
  el.innerHTML = events.map(ev => {
    const d = new Date(ev.date);
    const diff = Math.round((d - today) / 86400000);
    const when = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff}d`;
    return `<div class="hd-ev-row">
      <div class="hd-ev-date">
        <div class="hd-ev-day">${d.getDate()}</div>
        <div class="hd-ev-mon">${d.toLocaleDateString('en-PH',{month:'short'})}</div>
      </div>
      <div class="hd-ev-body">
        <div class="hd-ev-title">${esc(ev.title)}</div>
        ${ev.note ? `<div class="hd-ev-note">${esc(ev.note.slice(0,60))}</div>` : ''}
        <div class="hd-ev-when">${when}</div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// HELPERS
// ============================================================
function _buildRecentList(limit = 6) {
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
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// viewAllBirthdays is defined in app.js — no re-declaration needed here

// ============================================================
// STYLES
// ============================================================
function _injectHomeStyles() {
  if (document.getElementById('page-home-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-home-styles';
  s.textContent = `

  /* ═══ WRAPPER ════════════════════════════════════════════ */
  .hd-wrap {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0 0 40px;
    max-width: 100%;
  }
  /* Add spacing between content sections below the KPI strip */
  .hd-row-a { margin-top: 16px; padding: 0 16px; }
  .hd-row-b { margin-top: 16px; padding: 0 16px; }
  .hd-row-c { margin-top: 16px; padding: 0 16px; }

  /* ═══ HERO — compact black hero matching reference screenshot ═══ */
  .hd-hero {
    position: relative;
    width: 100%;
    min-height: 260px;
    background:
      radial-gradient(circle at 20% 0%, rgba(0,200,170,.10), transparent 55%),
      radial-gradient(circle at 80% 100%, rgba(0,200,170,.06), transparent 55%),
      linear-gradient(160deg, #0B1212 0%, #0E1717 55%, #0A1414 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    padding: 48px 24px 40px;
    border-bottom: 1px solid var(--border2);
  }

  [data-theme="light"] .hd-hero {
    background:
      radial-gradient(circle at 20% 0%, rgba(10,138,133,.10), transparent 55%),
      radial-gradient(circle at 80% 100%, rgba(10,138,133,.07), transparent 55%),
      linear-gradient(160deg, #0B1716 0%, #0E1A19 55%, #0A1514 100%);
  }

  /* Content inner */
  .hd-hero-inner {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
    max-width: 700px;
    width: 100%;
  }

  .hd-hero-title {
    font-size: clamp(22px, 4.5vw, 52px);
    font-weight: 900;
    letter-spacing: 4px;
    color: #EAFBF7;
    text-transform: uppercase;
    line-height: 1.0;
    white-space: nowrap;
    text-shadow: 0 2px 18px rgba(0,0,0,.4);
  }
  .hd-hero-sub {
    font-size: 13px;
    color: rgba(234,251,247,.62);
    font-style: italic;
    letter-spacing: .5px;
  }
  .hd-hero-btns {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 4px;
  }
  .hd-hero-btn {
    padding: 11px 40px;
    font-size: 13px;
    font-weight: 700;
    font-family: 'Inter', sans-serif;
    border-radius: 6px;
    cursor: pointer;
    letter-spacing: .5px;
    transition: all .18s;
    min-width: 150px;
  }
  .hd-hero-btn-outline {
    background: var(--accent-dim);
    border: 2px solid var(--border3);
    color: var(--accent);
  }
  .hd-hero-btn-outline:hover { border-color: var(--accent); background: rgba(0,200,170,.16); }

  /* ═══ KPI STRIP ══════════════════════════════════════════ */
  .hd-kpi-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    padding: 0;
  }
  @media (max-width: 768px) { .hd-kpi-strip { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .hd-kpi-strip { grid-template-columns: 1fr; } }

  .hd-kpi {
    background: var(--bg-mid);
    border: 1px solid var(--border);
    padding: 20px 22px;
    cursor: pointer;
    transition: background .15s;
    text-align: left;
  }
  .hd-kpi:not(:last-child) { border-right: none; }
  .hd-kpi:hover { background: var(--bg-card-hover); }
  .hd-kpi-val {
    font-size: 28px;
    font-weight: 900;
    color: var(--accent);
    line-height: 1.1;
  }
  .hd-kpi-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-top: 4px;
  }
  /* Always dark regardless of theme */
  [data-theme="light"] .hd-kpi { background: #111 !important; border-color: #222 !important; }
  [data-theme="light"] .hd-kpi:hover { background: #1c1c1c !important; }
  [data-theme="light"] .hd-kpi-val { color: #fff !important; }
  [data-theme="light"] .hd-kpi-label { color: rgba(255,255,255,.5) !important; }

  /* ═══ SHARED CARD ════════════════════════════════════════ */
  .hd-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .hd-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
  }
  .hd-card-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  .hd-card-link {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    padding: 0;
    opacity: .8;
    transition: opacity .15s;
  }
  .hd-card-link:hover { opacity: 1; }
  .hd-icon-btn {
    width: 26px; height: 26px;
    background: var(--bg-frosted);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text2);
    font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif;
    transition: background .12s;
  }
  .hd-icon-btn:hover { background: rgba(0,200,170,.1); color: var(--accent); }

  /* ═══ ROW A: Greeting + Mini Calendar ════════════════════ */
  .hd-row-a {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 768px) { .hd-row-a { grid-template-columns: 1fr; } }

  /* Greeting */
  .hd-greeting-card { padding: 0; min-height: 200px; }
  .hd-greeting-card .hd-card-header { display: none; }
  .hd-greeting-time {
    font-size: 26px;
    font-weight: 800;
    color: var(--text);
    padding: 24px 20px 0;
    line-height: 1.2;
  }
  .hd-greeting-name {
    font-size: 26px;
    font-weight: 800;
    color: var(--text);
    padding: 0 20px;
    line-height: 1.2;
  }
  .hd-greeting-sub {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text2);
    padding: 10px 20px 0;
    line-height: 1.5;
  }
  .hd-greeting-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 16px 20px 20px;
    margin-top: auto;
  }
  .hd-pill-btn {
    padding: 5px 14px;
    border: 1px solid rgba(255,255,255,.25);
    background: transparent;
    color: var(--text);
    border-radius: 20px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: background .12s, border-color .12s;
  }
  .hd-pill-btn:hover { background: rgba(0,200,170,.1); border-color: var(--accent); color: var(--accent); }

  /* Mini Calendar */
  .hd-mini-cal-card {}
  .hd-cal-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: .8px;
    padding: 6px 14px 4px;
  }
  .hd-cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    padding: 4px 10px 12px;
  }
  .hd-cal-dn {
    text-align: center;
    font-size: 9px;
    font-weight: 700;
    color: var(--text3);
    padding: 3px 0;
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  .hd-cal-cell {
    text-align: center;
    padding: 4px 2px 2px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text2);
    border-radius: 6px;
    cursor: pointer;
    transition: background .12s;
    position: relative;
    line-height: 1.4;
  }
  .hd-cal-empty { cursor: default; }
  .hd-cal-cell:not(.hd-cal-empty):hover { background: rgba(0,200,170,.1); color: var(--accent); }
  .hd-cal-today {
    background: var(--accent) !important;
    color: #000 !important;
    font-weight: 800;
    border-radius: 6px;
  }
  .hd-cal-dots {
    display: flex; justify-content: center; gap: 2px;
    margin-top: 1px; min-height: 5px;
  }
  .hd-cal-dot {
    width: 4px; height: 4px; border-radius: 50%; display: block;
  }
  .hd-dot-evt  { background: var(--accent); }
  .hd-dot-bday { background: #FF9800; }

  /* Popover */
  .hd-cal-popover {
    position: fixed;
    z-index: 901;
    background: var(--bg-glass);
    backdrop-filter: blur(32px);
    -webkit-backdrop-filter: blur(32px);
    border: 1px solid var(--border2);
    border-radius: 10px;
    width: 240px;
    padding: 10px 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.35);
  }
  .hd-pop-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .hd-pop-row {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 5px 0; border-bottom: 1px solid var(--border);
  }
  .hd-pop-row:last-child { border-bottom: none; }
  .hd-pop-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .hd-pop-title { font-size: 12px; font-weight: 600; color: var(--text); }
  .hd-pop-note  { font-size: 10.5px; color: var(--text3); margin-top: 2px; }
  .hd-pop-empty { font-size: 11px; color: var(--text3); font-style: italic; padding: 4px 0; }

  /* ═══ ROW B: Overview + Upcoming Events ══════════════════ */
  .hd-row-b {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 768px) { .hd-row-b { grid-template-columns: 1fr; } }

  .hd-overview-card, .hd-events-card { min-height: 220px; }

  /* Overview rows */
  .hd-overview-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .hd-ov-row {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer; padding: 3px 0;
    transition: opacity .12s;
  }
  .hd-ov-row:hover { opacity: .8; }
  .hd-ov-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .hd-ov-label { font-size: 11.5px; font-weight: 600; color: var(--text2); min-width: 80px; }
  .hd-ov-bar-wrap { flex: 1; height: 5px; background: rgba(255,255,255,.06); border-radius: 4px; overflow: hidden; }
  .hd-ov-bar { height: 100%; border-radius: 4px; transition: width .4s; }
  .hd-ov-count { font-size: 11px; font-weight: 700; color: var(--text); min-width: 24px; text-align: right; }

  /* Events list */
  .hd-ev-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    transition: background .12s;
  }
  .hd-ev-row:last-child { border-bottom: none; }
  .hd-ev-row:hover { background: rgba(0,200,170,.04); }
  .hd-ev-date {
    flex-shrink: 0; text-align: center; width: 32px;
    background: rgba(0,200,170,.08); border-radius: 7px; padding: 4px 2px;
  }
  .hd-ev-day  { font-size: 16px; font-weight: 800; color: var(--accent); line-height: 1; }
  .hd-ev-mon  { font-size: 8px; font-weight: 700; text-transform: uppercase; color: var(--text3); letter-spacing: .5px; }
  .hd-ev-body { flex: 1; min-width: 0; }
  .hd-ev-title { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd-ev-note  { font-size: 10.5px; color: var(--text3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd-ev-when  { font-size: 10px; font-weight: 700; color: var(--accent); margin-top: 3px; }

  /* ═══ ROW C: Recent Activity + Celebrants ════════════════ */
  .hd-row-c {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 768px) { .hd-row-c { grid-template-columns: 1fr; } }

  .hd-recent-card, .hd-bday-card { min-height: 200px; }

  /* Recent list */
  .hd-recent-list { flex: 1; overflow-y: auto; }
  .hd-recent-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background .12s;
  }
  .hd-recent-item:last-child { border-bottom: none; }
  .hd-recent-item:hover { background: rgba(0,200,170,.04); }
  .hd-recent-body { flex: 1; min-width: 0; }
  .hd-recent-name   { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd-recent-action { font-size: 10.5px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd-recent-time   { font-size: 10px; color: var(--text3); flex-shrink: 0; white-space: nowrap; }

  /* Birthday list */
  .hd-bday-list { flex: 1; overflow-y: auto; }
  .hd-bday-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background .12s;
  }
  .hd-bday-item:last-child { border-bottom: none; }
  .hd-bday-item:hover { background: rgba(0,200,170,.04); }
  .hd-bday-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(0,200,170,.15); border: 1px solid rgba(0,200,170,.3);
    color: var(--accent); font-size: 12px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .hd-bday-info { flex: 1; min-width: 0; }
  .hd-bday-name { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd-bday-sub  { font-size: 10.5px; color: var(--text3); margin-top: 2px; }

  /* ═══ SHARED ══════════════════════════════════════════════ */
  .hd-empty-state {
    padding: 24px 16px;
    text-align: center;
    font-size: 12px;
    color: var(--text3);
    font-style: italic;
  }

  /* Light mode overrides */
  [data-theme="light"] .hd-pill-btn { border-color: rgba(0,0,0,.2); color: #222; }
  `;
  document.head.appendChild(s);
}
