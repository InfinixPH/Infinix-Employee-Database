// ============================================================
// page-calendar.js — Full Calendar Page
// Matches Calmendar reference: sidebar mini-cal + week view + drawer
// Sheet: "Events"  |  Headers: ID | Title | Date | Note | PostedBy | Active
// ============================================================
'use strict';

// ── State ─────────────────────────────────────────────────────
let _calPageDate    = new Date();   // current week anchor
let _calPageView    = 'week';       // 'week' | 'month' | 'day'
let _calPageEvents  = null;         // null = not yet loaded
let _calPageDrawer  = null;         // currently open event
let _calMiniDate    = new Date();   // mini calendar month
let _calEditId       = null;        // event id currently being edited (null = add mode)
let _calEditRow      = null;        // sheet row of event being edited

function _p2(n) { return String(n).padStart(2,'0'); }

// ── Load events ───────────────────────────────────────────────
async function _calLoadEvents(force) {
  if (_calPageEvents !== null && !force) return;
  try {
    const r = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A2:H`
    });
    const rows = r.result.values || [];
    _calPageEvents = rows
      .map((r,i) => ({
        id:r[0]||'', title:r[1]||'', date:r[2]||'',
        time: r[3]||'', endTime: r[4]||'',
        note:r[5]||'', postedBy:r[6]||'',
        active: String(r[7]||'TRUE').trim().toUpperCase(),
        color: '#00C8AA',
        _row: i + 2, // true sheet row, computed BEFORE any filtering
      }))
      .filter(e => e.active !== 'FALSE')
      .filter(e => e.title && e.date);
  } catch(e) {
    console.error('Calendar page: failed to load Events sheet.', e);
    _calPageEvents = [];
    toast('Failed to load calendar events.', 'error');
  }
}

// ── Main render ───────────────────────────────────────────────
async function renderCalendarPage() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = 'Calendar';

  const content = document.getElementById('content');
  content.innerHTML = `<div class="calpg-loading"><div class="spinner"></div></div>`;

  await _calLoadEvents(true);
  _injectCalPageStyles();

  content.innerHTML = `
    <div class="calpg-shell">

      <!-- ── LEFT SIDEBAR ── -->
      <aside class="calpg-sidebar">

        <!-- Mini calendar -->
        <div class="calpg-mini-cal">
          <div class="calpg-mini-header">
            <button class="calpg-mini-nav" onclick="_calMiniPrev()">&#8249;</button>
            <span class="calpg-mini-label" id="calpg-mini-label"></span>
            <button class="calpg-mini-nav" onclick="_calMiniNext()">&#8250;</button>
          </div>
          <div class="calpg-mini-dow-row">
            ${['M','T','W','T','F','S','S'].map(d=>`<div class="calpg-mini-dn">${d}</div>`).join('')}
          </div>
          <div class="calpg-mini-grid" id="calpg-mini-grid"></div>
        </div>

        <!-- Upcoming events today -->
        <div class="calpg-side-section">
          <div class="calpg-side-title">
            <span>Upcoming events</span>
            <button class="hd-card-link" onclick="_calViewNextEvent()">View all</button>
          </div>
          <div id="calpg-today-list"></div>
        </div>

        <!-- Time breakdown -->
        <div class="calpg-side-section">
          <div class="calpg-side-title">
            <span>Time breakdown</span>
          </div>
          <div class="calpg-breakdown" id="calpg-breakdown"></div>
        </div>

        <!-- My calendars -->
        <div class="calpg-side-section">
          <div class="calpg-side-title calpg-side-toggle" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>My calendars</span>
            <span class="calpg-chevron">▾</span>
          </div>
          <div class="calpg-cal-list">
            <div class="calpg-cal-item"><span class="calpg-cal-dot" style="background:#00C8AA"></span> HR Events</div>
            <div class="calpg-cal-item"><span class="calpg-cal-dot" style="background:#FF9800"></span> Birthdays</div>
            <div class="calpg-cal-item"><span class="calpg-cal-dot" style="background:#378ADD"></span> Deployments</div>
          </div>
        </div>

      </aside>

      <!-- ── MAIN CONTENT ── -->
      <div class="calpg-main">

        <!-- Top bar -->
        <div class="calpg-topbar">
          <div class="calpg-topbar-left">
            <button class="calpg-tb-btn" onclick="_calWeekPrev()">&#8249;</button>
            <button class="calpg-tb-btn" onclick="_calWeekNext()">&#8250;</button>
            <button class="calpg-tb-today" onclick="_calViewToday()">Today</button>
            <h2 class="calpg-main-label" id="calpg-main-label"></h2>
          </div>
          <div class="calpg-topbar-right">
            <div class="calpg-view-tabs">
              <button class="calpg-view-tab ${_calPageView==='month'?'active':''}" onclick="_calSetView('month')">Month</button>
              <button class="calpg-view-tab ${_calPageView==='week'?'active':''}" onclick="_calSetView('week')">Week</button>
              <button class="calpg-view-tab ${_calPageView==='day'?'active':''}" onclick="_calSetView('day')">Day</button>
            </div>
            ${canViewSensitive() ? `<button class="btn btn-primary btn-sm" onclick="_calOpenAddModal()" style="margin-left:10px">+ Add Event</button>` : ''}
          </div>
        </div>

        <!-- Calendar grid -->
        <div class="calpg-grid-wrap" id="calpg-grid-wrap"></div>

      </div>

      <!-- ── EVENT DRAWER ── -->
      <div class="calpg-drawer-backdrop hidden" id="calpg-drawer-backdrop" onclick="_calCloseDrawer()"></div>
      <div class="calpg-drawer hidden" id="calpg-drawer">
        <div id="calpg-drawer-body"></div>
      </div>

    </div>

    <!-- Add/Edit Event Modal -->
    <div class="overlay hidden" id="calpg-add-modal">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2 id="calpg-ev-modal-title">Add Calendar Event</h2>
          <button class="modal-close" onclick="_calCloseAddModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Title *</label><input id="calpg-ev-title" class="field-input" placeholder="Event title…"></div>
          <div class="field"><label>Date *</label><input id="calpg-ev-date" type="date" class="field-input"></div>
          <div style="display:flex;gap:10px">
            <div class="field" style="flex:1"><label>Start Time</label><input id="calpg-ev-time" type="time" class="field-input" value="09:00"></div>
            <div class="field" style="flex:1"><label>End Time</label><input id="calpg-ev-endtime" type="time" class="field-input" value="10:00"></div>
          </div>
          <div class="field"><label>Note</label><textarea id="calpg-ev-note" class="field-input" rows="3" placeholder="Optional…" style="resize:vertical"></textarea></div>
          <div class="field"><label>Posted By</label><input id="calpg-ev-by" class="field-input" placeholder="HR"></div>
          <div id="calpg-ev-msg" style="font-size:11px;color:var(--success);min-height:14px"></div>
        </div>
        <div class="modal-footer" style="justify-content:space-between">
          <button id="calpg-ev-delete-btn" class="btn btn-danger btn-sm hidden" onclick="_calDeleteFromModal()">Delete Event</button>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="btn btn-ghost" onclick="_calCloseAddModal()">Cancel</button>
            <button class="btn btn-primary" onclick="_calSubmitEvent()">Save Event</button>
          </div>
        </div>
      </div>
    </div>
  `;

  _calRenderMiniCal();
  _calRenderMain();
  _calRenderTodayList();
  _calRenderBreakdown();
}

// ── Mini calendar ──────────────────────────────────────────────
function _calRenderMiniCal() {
  const label = document.getElementById('calpg-mini-label');
  const grid  = document.getElementById('calpg-mini-grid');
  if (!label || !grid) return;

  const y = _calMiniDate.getFullYear(), m = _calMiniDate.getMonth();
  label.textContent = new Date(y,m,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});

  const today      = new Date(); today.setHours(0,0,0,0);
  const firstDay   = new Date(y,m,1).getDay(); // 0=Sun
  const startOff   = firstDay === 0 ? 6 : firstDay - 1; // Mon-start
  const daysInMonth= new Date(y,m+1,0).getDate();
  const prevDays   = new Date(y,m,0).getDate();

  // Event dots
  const evtDays = new Set();
  (_calPageEvents||[]).forEach(e => {
    const d = new Date(e.date);
    if (!isNaN(d) && d.getFullYear()===y && d.getMonth()===m) evtDays.add(d.getDate());
  });

  const totalCells = Math.ceil((startOff + daysInMonth) / 7) * 7;
  let html = '';
  for (let i = 0; i < totalCells; i++) {
    let dayNum, isCur = true;
    if (i < startOff)                  { dayNum = prevDays - startOff + i + 1; isCur = false; }
    else if (i >= startOff + daysInMonth){ dayNum = i - startOff - daysInMonth + 1; isCur = false; }
    else                               { dayNum = i - startOff + 1; }

    const dateObj  = new Date(y, isCur ? m : (i < startOff ? m-1 : m+1), dayNum);
    const isToday  = dateObj.getTime() === today.getTime();
    const hasEvt   = isCur && evtDays.has(dayNum);
    const isInWeek = _isInCurrentWeek(dateObj);

    html += `<div class="calpg-mini-cell ${isCur?'':'other'} ${isToday?'today':''} ${isInWeek?'in-week':''} ${hasEvt?'has-evt':''}"
      onclick="_calJumpToDate(${dateObj.getTime()})">${dayNum}${hasEvt?'<span class="calpg-mini-dot"></span>':''}</div>`;
  }
  grid.innerHTML = html;
}

function _isInCurrentWeek(date) {
  const anchor = _calWeekStart();
  const end = new Date(anchor); end.setDate(end.getDate() + 6);
  return date >= anchor && date <= end;
}
function _calMiniPrev() { _calMiniDate = new Date(_calMiniDate.getFullYear(), _calMiniDate.getMonth()-1, 1); _calRenderMiniCal(); }
function _calMiniNext() { _calMiniDate = new Date(_calMiniDate.getFullYear(), _calMiniDate.getMonth()+1, 1); _calRenderMiniCal(); }
function _calJumpToDate(ts) { _calPageDate = new Date(ts); _calRenderMain(); _calRenderMiniCal(); }

// ── Week / month / day render ──────────────────────────────────
function _calWeekStart() {
  const d = new Date(_calPageDate); d.setHours(0,0,0,0);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow; // Mon start
  d.setDate(d.getDate() + diff);
  return d;
}

function _calSetView(v) {
  _calPageView = v;
  // Re-render the page to update tab active state
  renderCalendarPage();
}
function _calWeekPrev() {
  if (_calPageView === 'month') { _calPageDate = new Date(_calPageDate.getFullYear(), _calPageDate.getMonth()-1, 1); }
  else if (_calPageView === 'day') { _calPageDate.setDate(_calPageDate.getDate()-1); }
  else { _calPageDate.setDate(_calPageDate.getDate()-7); }
  _calRenderMain(); _calRenderMiniCal(); _calRenderTodayList();
}
function _calWeekNext() {
  if (_calPageView === 'month') { _calPageDate = new Date(_calPageDate.getFullYear(), _calPageDate.getMonth()+1, 1); }
  else if (_calPageView === 'day') { _calPageDate.setDate(_calPageDate.getDate()+1); }
  else { _calPageDate.setDate(_calPageDate.getDate()+7); }
  _calRenderMain(); _calRenderMiniCal(); _calRenderTodayList();
}
function _calViewToday() {
  _calPageDate = new Date();
  _calMiniDate = new Date();
  _calRenderMain(); _calRenderMiniCal(); _calRenderTodayList();
}
function _calViewNextEvent() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = `${today.getFullYear()}-${_p2(today.getMonth()+1)}-${_p2(today.getDate())}`;
  const next = (_calPageEvents||[])
    .filter(e => e.date && e.date.slice(0,10) >= todayStr)
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time))[0];
  if (next) {
    _calPageDate = new Date(next.date);
    _calMiniDate = new Date(next.date);
  } else {
    _calPageDate = new Date();
    _calMiniDate = new Date();
  }
  _calPageView = 'week';
  renderCalendarPage();
}

function _calRenderMain() {
  if (_calPageView === 'week') _calRenderWeek();
  else if (_calPageView === 'month') _calRenderMonth();
  else _calRenderDay();
}

// ── WEEK VIEW ─────────────────────────────────────────────────
function _calRenderWeek() {
  const wrap  = document.getElementById('calpg-grid-wrap');
  const label = document.getElementById('calpg-main-label');
  if (!wrap) return;

  const weekStart = _calWeekStart();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    days.push(d);
  }

  if (label) {
    const y = weekStart.getFullYear(), m = weekStart.getMonth();
    label.textContent = new Date(y,m,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const hours = [];
  for (let h = 8; h <= 20; h++) hours.push(h);

  // Build event map: dateStr → [events]
  const evtMap = {};
  (_calPageEvents||[]).forEach(e => {
    const k = e.date ? e.date.slice(0,10) : '';
    if (!k) return;
    if (!evtMap[k]) evtMap[k] = [];
    evtMap[k].push(e);
  });

  // Header row
  let html = `<div class="calpg-week-wrap">
    <div class="calpg-week-grid">
      <!-- Time gutter header -->
      <div class="calpg-time-gutter-head"></div>
      <!-- Day headers -->
      ${days.map(d => {
        const isToday = d.getTime() === today.getTime();
        return `<div class="calpg-day-head ${isToday?'is-today':''}">
          <div class="calpg-day-dow">${d.toLocaleDateString('en-PH',{weekday:'short'})}</div>
          <div class="calpg-day-num ${isToday?'today-circle':''}">${d.getDate()}</div>
        </div>`;
      }).join('')}
      <!-- Time rows -->
      ${hours.map(h => `
        <div class="calpg-time-gutter">${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}</div>
        ${days.map(d => {
          const dateStr = `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}`;
          const dayEvts = (evtMap[dateStr]||[]);
          return `<div class="calpg-hour-cell" onclick="_calCellClick('${dateStr}', ${h})">
            ${dayEvts.map(e => {
              const startH = parseInt((e.time||'09:00').split(':')[0]);
              if (startH !== h) return '';
              return `<div class="calpg-evt-block" style="background:${e.color||'#00C8AA'}20;border-left:3px solid ${e.color||'#00C8AA'}"
                onclick="event.stopPropagation();_calOpenDrawer('${esc(e.id)}')"
              >
                <div class="calpg-evt-block-title">${esc(e.title)}</div>
                <div class="calpg-evt-block-time">${e.time||'09:00'} – ${e.endTime||'10:00'}</div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      `).join('')}
    </div>
  </div>`;
  wrap.innerHTML = html;

  // Scroll to 8am
  requestAnimationFrame(() => {
    const g = wrap.querySelector('.calpg-week-wrap');
    if (g) g.scrollTop = 0;
  });
}

// ── MONTH VIEW ────────────────────────────────────────────────
function _calRenderMonth() {
  const wrap  = document.getElementById('calpg-grid-wrap');
  const label = document.getElementById('calpg-main-label');
  if (!wrap) return;

  const y = _calPageDate.getFullYear(), m = _calPageDate.getMonth();
  if (label) label.textContent = new Date(y,m,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});

  const today    = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(y,m,1).getDay();
  const startOff = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(y,m+1,0).getDate();
  const prevDays    = new Date(y,m,0).getDate();
  const totalCells  = Math.ceil((startOff + daysInMonth) / 7) * 7;

  const evtMap = {};
  (_calPageEvents||[]).forEach(e => {
    const k = e.date ? e.date.slice(0,10) : '';
    if (!k) return;
    if (!evtMap[k]) evtMap[k] = [];
    evtMap[k].push(e);
  });

  const dowRow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    .map(d=>`<div class="calpg-month-dn">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < totalCells; i++) {
    let dayNum, isCur = true;
    if (i < startOff)                    { dayNum = prevDays - startOff + i + 1; isCur = false; }
    else if (i >= startOff + daysInMonth){ dayNum = i - startOff - daysInMonth + 1; isCur = false; }
    else                                 { dayNum = i - startOff + 1; }

    const dateObj  = new Date(y, isCur ? m : (i<startOff?m-1:m+1), dayNum);
    const isToday  = isCur && dateObj.getTime() === today.getTime();
    const dateStr  = `${dateObj.getFullYear()}-${_p2(dateObj.getMonth()+1)}-${_p2(dateObj.getDate())}`;
    const dayEvts  = evtMap[dateStr] || [];

    cells += `<div class="calpg-month-cell ${isCur?'':'other'} ${isToday?'is-today':''}">
      <div class="calpg-month-num ${isToday?'today-circle':''}">${dayNum}</div>
      ${dayEvts.slice(0,2).map(e=>`<div class="calpg-month-evt" style="background:${e.color||'#00C8AA'}25;border-left:2px solid ${e.color||'#00C8AA'}"
        onclick="event.stopPropagation();_calOpenDrawer('${esc(e.id)}')"
      >${esc(e.title)}</div>`).join('')}
      ${dayEvts.length>2?`<div class="calpg-month-more">+${dayEvts.length-2} more</div>`:''}
    </div>`;
  }

  wrap.innerHTML = `<div class="calpg-month-grid">
    <div class="calpg-month-dow-row">${dowRow}</div>
    <div class="calpg-month-cells">${cells}</div>
  </div>`;
}

// ── DAY VIEW ─────────────────────────────────────────────────
function _calRenderDay() {
  const wrap  = document.getElementById('calpg-grid-wrap');
  const label = document.getElementById('calpg-main-label');
  if (!wrap) return;

  const d = new Date(_calPageDate); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = d.getTime() === today.getTime();
  if (label) label.textContent = d.toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

  const dateStr = `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}`;
  const dayEvts = (_calPageEvents||[]).filter(e => e.date && e.date.slice(0,10) === dateStr);
  const hours   = []; for (let h = 8; h <= 20; h++) hours.push(h);

  wrap.innerHTML = `<div class="calpg-week-wrap">
    <div class="calpg-day-grid">
      <div class="calpg-time-gutter-head"></div>
      <div class="calpg-day-head ${isToday?'is-today':''}">
        <div class="calpg-day-dow">${d.toLocaleDateString('en-PH',{weekday:'long'})}</div>
        <div class="calpg-day-num ${isToday?'today-circle':''}">${d.getDate()}</div>
      </div>
      ${hours.map(h=>`
        <div class="calpg-time-gutter">${h%12||12}:00 ${h<12?'AM':'PM'}</div>
        <div class="calpg-hour-cell" style="min-height:60px" onclick="_calCellClick('${dateStr}',${h})">
          ${dayEvts.filter(e=>parseInt((e.time||'09').split(':')[0])===h).map(e=>`
            <div class="calpg-evt-block" style="background:${e.color||'#00C8AA'}20;border-left:3px solid ${e.color||'#00C8AA'}"
              onclick="event.stopPropagation();_calOpenDrawer('${esc(e.id)}')">
              <div class="calpg-evt-block-title">${esc(e.title)}</div>
              <div class="calpg-evt-block-time">${e.time||'09:00'} – ${e.endTime||'10:00'}</div>
              ${e.note?`<div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">${esc(e.note)}</div>`:''}
            </div>`).join('')}
        </div>`).join('')}
    </div>
  </div>`;
}

// ── Upcoming events list ────────────────────────────────────────
function _calRenderTodayList() {
  const el = document.getElementById('calpg-today-list');
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = `${today.getFullYear()}-${_p2(today.getMonth()+1)}-${_p2(today.getDate())}`;
  const evts = (_calPageEvents||[])
    .filter(e => e.date && e.date.slice(0,10) >= todayStr)
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time))
    .slice(0, 5);
  if (!evts.length) { el.innerHTML = `<div style="font-size:11px;color:var(--text3);font-style:italic;padding:6px 0">No upcoming events</div>`; return; }
  el.innerHTML = evts.map(e => {
    const isToday = e.date.slice(0,10) === todayStr;
    const dateLabel = isToday ? 'Today' : new Date(e.date).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    return `
    <div class="calpg-today-item" onclick="_calOpenDrawer('${esc(e.id)}')">
      <span class="calpg-today-dot" style="background:${e.color||'#00C8AA'}"></span>
      <div class="calpg-today-info">
        <div class="calpg-today-title">${esc(e.title)}</div>
        <div class="calpg-today-time">${dateLabel} · ${e.time||''}${e.endTime?' – '+e.endTime:''}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Time breakdown ────────────────────────────────────────────
function _calRenderBreakdown() {
  const el = document.getElementById('calpg-breakdown');
  if (!el) return;
  const items = [
    { label:'Meeting',  color:'#4CAF50', pct:70 },
    { label:'Projects', color:'#FF5722', pct:45 },
    { label:'Events',   color:'#2196F3', pct:30 },
    { label:'Reviews',  color:'#9C27B0', pct:20 },
  ];
  el.innerHTML = items.map(it => `
    <div class="calpg-bk-row">
      <div class="calpg-bk-label">${it.label}</div>
      <div class="calpg-bk-bar-wrap">
        <div class="calpg-bk-bar" style="width:${it.pct}%;background:${it.color}"></div>
      </div>
    </div>`).join('');
}

// ── Cell click (add event) ────────────────────────────────────
function _calCellClick(dateStr, hour) {
  if (!canViewSensitive()) return;
  _calOpenAddModal(dateStr, hour);
}

// ── Drawer ────────────────────────────────────────────────────
function _calOpenDrawer(id) {
  try {
    const e = (_calPageEvents || []).find(ev => ev.id === id);
    if (!e) { console.warn('Drawer: event not found for id', id); return; }
    _calPageDrawer = e;
    const d = new Date(e.date);
    const dateLabel = isNaN(d) ? e.date : d.toLocaleDateString('en-PH',{weekday:'short',month:'long',day:'numeric',year:'numeric'});
    const body = document.getElementById('calpg-drawer-body');
    if (body) body.innerHTML = `
      <div class="calpg-drawer-header">
        <div style="width:12px;height:12px;border-radius:50%;background:${e.color||'#00C8AA'};flex-shrink:0;margin-top:4px"></div>
        <div class="calpg-drawer-title">${esc(e.title)}</div>
        <button class="calpg-drawer-close" onclick="_calCloseDrawer()">✕</button>
      </div>
      <div class="calpg-drawer-content">
        <div class="calpg-dr-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text)">${dateLabel}</div>
            ${e.time ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${e.time} – ${e.endTime||''}</div>` : ''}
          </div>
        </div>
        ${e.note ? `
        <div class="calpg-dr-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style="font-size:12px;color:var(--text2);line-height:1.6">${esc(e.note)}</div>
        </div>` : ''}
        <div class="calpg-dr-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <div style="font-size:11px;color:var(--text3)">Posted by ${esc(e.postedBy||'HR')}</div>
        </div>
        ${canViewSensitive() && e._row ? `
        <div style="padding-top:12px;border-top:1px solid var(--border);margin-top:4px;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="_calCloseDrawer();_calOpenAddModal(null,null,'${esc(e.id)}')">Edit Event</button>
          <button class="btn btn-danger btn-sm" onclick="_calDeleteEvent('${esc(e.id)}',${e._row||0})">Delete Event</button>
        </div>` : ''}
      </div>`;
    document.getElementById('calpg-drawer-backdrop')?.classList.remove('hidden');
    document.getElementById('calpg-drawer')?.classList.remove('hidden');
  } catch(err) { console.warn('Drawer error:', err); }
}

function _calCloseDrawer() {
  document.getElementById('calpg-drawer-backdrop')?.classList.add('hidden');
  document.getElementById('calpg-drawer')?.classList.add('hidden');
  _calPageDrawer = null;
}

// ── Add/Edit Event Modal ──────────────────────────────────────
function _calOpenAddModal(dateStr, hour, editEventId) {
  if (!canViewSensitive()) { toast('Permission denied.','error'); return; }
  const overlay = document.getElementById('calpg-add-modal');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.classList.add('open');

  const editEvent = editEventId ? (_calPageEvents || []).find(ev => ev.id === editEventId) : null;
  const titleEl   = document.getElementById('calpg-ev-modal-title');
  const delBtn    = document.getElementById('calpg-ev-delete-btn');

  if (editEvent) {
    _calEditId  = editEvent.id;
    _calEditRow = editEvent._row;
    if (titleEl) titleEl.textContent = 'Edit Calendar Event';
    if (delBtn)  delBtn.classList.remove('hidden');
    document.getElementById('calpg-ev-title').value    = editEvent.title || '';
    document.getElementById('calpg-ev-date').value     = editEvent.date || '';
    document.getElementById('calpg-ev-time').value     = editEvent.time || '09:00';
    document.getElementById('calpg-ev-endtime').value  = editEvent.endTime || '10:00';
    document.getElementById('calpg-ev-note').value     = editEvent.note || '';
    document.getElementById('calpg-ev-by').value       = editEvent.postedBy || '';
  } else {
    _calEditId  = null;
    _calEditRow = null;
    if (titleEl) titleEl.textContent = 'Add Calendar Event';
    if (delBtn)  delBtn.classList.add('hidden');
    document.getElementById('calpg-ev-title').value = '';
    document.getElementById('calpg-ev-note').value   = '';
    document.getElementById('calpg-ev-by').value     = '';
    if (dateStr) { const el = document.getElementById('calpg-ev-date'); if(el) el.value = dateStr; }
    const timeEl = document.getElementById('calpg-ev-time');
    const endEl  = document.getElementById('calpg-ev-endtime');
    if (typeof hour === 'number' && !isNaN(hour)) {
      if (timeEl) timeEl.value = _p2(hour) + ':00';
      if (endEl)  endEl.value  = _p2((hour+1) % 24) + ':00';
    } else {
      if (timeEl) timeEl.value = '09:00';
      if (endEl)  endEl.value  = '10:00';
    }
  }
  const msgEl = document.getElementById('calpg-ev-msg');
  if (msgEl) msgEl.textContent = '';
  setTimeout(() => document.getElementById('calpg-ev-title')?.focus(), 80);
}
function _calCloseAddModal() {
  const o = document.getElementById('calpg-add-modal');
  if (o) { o.classList.remove('open'); o.classList.add('hidden'); }
  _calEditId  = null;
  _calEditRow = null;
}
async function _calSubmitEvent() {
  const title   = (document.getElementById('calpg-ev-title')?.value||'').trim();
  const date    = (document.getElementById('calpg-ev-date')?.value||'').trim();
  const time    = (document.getElementById('calpg-ev-time')?.value||'').trim();
  const endTime = (document.getElementById('calpg-ev-endtime')?.value||'').trim();
  const note    = (document.getElementById('calpg-ev-note')?.value||'').trim();
  const by      = (document.getElementById('calpg-ev-by')?.value||'').trim() || currentUser?.name || 'HR';
  const msgEl   = document.getElementById('calpg-ev-msg');
  if (!title) { toast('Please enter a title.','error'); return; }
  if (!date)  { toast('Please select a date.','error'); return; }
  try {
    if (_calEditId && _calEditRow) {
      // Edit mode: update the existing row in place
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${EVENTS_SHEET}!A${_calEditRow}:H${_calEditRow}`,
        valueInputOption: 'RAW',
        resource: { values: [[_calEditId, title, date, time, endTime, note, by, 'TRUE']] }
      });
      if (msgEl) msgEl.textContent = '✓ Updated!';
      toast('Event updated!','success');
    } else {
      const id = 'EVT-' + Date.now();
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${EVENTS_SHEET}!A:H`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [[id, title, date, time, endTime, note, by, 'TRUE']] }
      });
      if (msgEl) msgEl.textContent = '✓ Saved!';
      toast('Event added!','success');
    }
    _calPageEvents = null;
    _calCloseAddModal();
    await _calLoadEvents(true);
    _calRenderMain(); _calRenderMiniCal(); _calRenderTodayList();
  } catch(e) { toast('Failed to save event.','error'); console.error(e); }
}
async function _calDeleteFromModal() {
  if (!_calEditId || !_calEditRow) return;
  await _calDeleteEvent(_calEditId, _calEditRow);
  _calCloseAddModal();
}
async function _calDeleteEvent(id, rowNum) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  try {
    const sheetId = await getSheetId(EVENTS_SHEET);
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{
        deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum } }
      }] }
    });
    _calPageEvents = null;
    _calCloseDrawer();
    await _calLoadEvents(true);
    _calRenderMain(); _calRenderMiniCal(); _calRenderTodayList();
    toast('Event deleted.','success');
  } catch(e) { toast('Failed to delete event.','error'); console.error(e); }
}

// ── Styles ────────────────────────────────────────────────────
function _injectCalPageStyles() {
  if (document.getElementById('calpg-styles')) return;
  const s = document.createElement('style');
  s.id = 'calpg-styles';
  s.textContent = `
  /* ═══ SHELL ══════════════════════════════════════════════════ */
  .calpg-shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    height: calc(100vh - 58px);
    overflow: hidden;
  }
  .calpg-loading { display:flex;align-items:center;justify-content:center;height:60vh; }

  /* ═══ SIDEBAR ════════════════════════════════════════════════ */
  .calpg-sidebar {
    background: var(--bg-card);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-bottom: 20px;
  }

  /* Mini calendar */
  .calpg-mini-cal { padding: 14px 12px 10px; }
  .calpg-mini-header {
    display:flex;align-items:center;justify-content:space-between;
    margin-bottom:8px;
  }
  .calpg-mini-label { font-size:12px;font-weight:700;color:var(--text); }
  .calpg-mini-nav {
    width:24px;height:24px;border-radius:6px;
    background:none;border:none;cursor:pointer;color:var(--text2);
    font-size:16px;display:flex;align-items:center;justify-content:center;
    transition:background .12s;
  }
  .calpg-mini-nav:hover { background:rgba(0,200,170,.1);color:var(--accent); }
  .calpg-mini-dow-row {
    display:grid;grid-template-columns:repeat(7,1fr);
    margin-bottom:4px;
  }
  .calpg-mini-dn {
    text-align:center;font-size:9px;font-weight:700;
    color:var(--text3);text-transform:uppercase;padding:2px 0;
  }
  .calpg-mini-grid {
    display:grid;grid-template-columns:repeat(7,1fr);gap:1px;
  }
  .calpg-mini-cell {
    text-align:center;padding:3px 0;font-size:11px;
    color:var(--text2);border-radius:5px;cursor:pointer;
    position:relative;transition:background .1s;
    display:flex;flex-direction:column;align-items:center;
  }
  .calpg-mini-cell:hover { background:rgba(0,200,170,.1);color:var(--accent); }
  .calpg-mini-cell.other { color:var(--text3);opacity:.4; }
  .calpg-mini-cell.today { background:var(--accent);color:#000;font-weight:800;border-radius:50%; }
  .calpg-mini-cell.in-week { background:rgba(0,200,170,.08); }
  .calpg-mini-cell.today.in-week { background:var(--accent); }
  .calpg-mini-dot {
    width:4px;height:4px;border-radius:50%;
    background:var(--accent);margin-top:1px;
  }

  /* Sidebar sections */
  .calpg-side-section {
    padding:12px 14px;
    border-top:1px solid var(--border);
  }
  .calpg-side-title {
    display:flex;align-items:center;justify-content:space-between;
    font-size:10px;font-weight:700;text-transform:uppercase;
    letter-spacing:1px;color:var(--text3);margin-bottom:8px;
    cursor:default;
  }
  .calpg-side-toggle { cursor:pointer; }
  .calpg-chevron { font-size:12px; }
  .collapsed .calpg-cal-list { display:none; }

  /* Today list */
  .calpg-today-item {
    display:flex;align-items:flex-start;gap:8px;
    padding:5px 0;cursor:pointer;transition:opacity .12s;
  }
  .calpg-today-item:hover { opacity:.75; }
  .calpg-today-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:3px; }
  .calpg-today-title { font-size:11.5px;font-weight:600;color:var(--text); }
  .calpg-today-time  { font-size:10px;color:var(--text3);margin-top:1px; }

  /* Breakdown */
  .calpg-bk-row { display:flex;align-items:center;gap:8px;margin-bottom:6px; }
  .calpg-bk-label { font-size:11px;color:var(--text2);min-width:58px; }
  .calpg-bk-bar-wrap { flex:1;height:4px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden; }
  .calpg-bk-bar { height:100%;border-radius:4px;transition:width .4s; }

  /* Calendar list */
  .calpg-cal-list { display:flex;flex-direction:column;gap:5px; }
  .calpg-cal-item { display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text2); }
  .calpg-cal-dot { width:10px;height:10px;border-radius:3px;flex-shrink:0; }

  /* ═══ MAIN AREA ══════════════════════════════════════════════ */
  .calpg-main {
    display:flex;flex-direction:column;overflow:hidden;
    background:var(--bg);
  }

  .calpg-topbar {
    display:flex;align-items:center;justify-content:space-between;
    padding:12px 20px;
    border-bottom:1px solid var(--border);
    background:var(--bg-card);
    flex-shrink:0;
  }
  .calpg-topbar-left  { display:flex;align-items:center;gap:8px; }
  .calpg-topbar-right { display:flex;align-items:center; }
  .calpg-tb-btn {
    width:28px;height:28px;border-radius:7px;
    background:var(--bg-frosted);border:1px solid var(--border);
    cursor:pointer;color:var(--text2);font-size:16px;
    display:flex;align-items:center;justify-content:center;
    transition:all .12s;
  }
  .calpg-tb-btn:hover { background:rgba(0,200,170,.1);color:var(--accent);border-color:rgba(0,200,170,.3); }
  .calpg-tb-today {
    padding:4px 12px;border-radius:18px;border:1px solid var(--border);
    background:var(--bg-frosted);color:var(--text2);cursor:pointer;
    font-size:11.5px;font-weight:600;font-family:'Inter',sans-serif;
    transition:all .12s;
  }
  .calpg-tb-today:hover { border-color:var(--accent);color:var(--accent); }
  .calpg-main-label { font-size:16px;font-weight:700;color:var(--text);margin:0; }

  .calpg-view-tabs { display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden; }
  .calpg-view-tab {
    padding:5px 14px;border:none;background:none;
    color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;
    font-family:'Inter',sans-serif;transition:background .12s,color .12s;
  }
  .calpg-view-tab:not(:last-child) { border-right:1px solid var(--border); }
  .calpg-view-tab.active { background:var(--accent);color:#000; }
  .calpg-view-tab:not(.active):hover { background:rgba(0,200,170,.08);color:var(--accent); }

  /* Grid wrap */
  .calpg-grid-wrap { flex:1;overflow:auto; }

  /* ═══ WEEK GRID ══════════════════════════════════════════════ */
  .calpg-week-wrap { overflow:auto;height:100%; }
  .calpg-week-grid {
    display:grid;
    grid-template-columns: 60px repeat(7, 1fr);
    min-width:700px;
  }
  .calpg-day-grid {
    display:grid;
    grid-template-columns: 60px 1fr;
    min-width:300px;
  }
  .calpg-time-gutter-head { background:var(--bg-card);border-bottom:1px solid var(--border);border-right:1px solid var(--border); }
  .calpg-day-head {
    background:var(--bg-card);border-bottom:1px solid var(--border);
    border-right:1px solid var(--border);
    padding:8px 6px;text-align:center;position:sticky;top:0;z-index:2;
  }
  .calpg-day-head.is-today { background:rgba(0,200,170,.06); }
  .calpg-day-dow { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3); }
  .calpg-day-num {
    font-size:18px;font-weight:800;color:var(--text);
    margin-top:3px;display:inline-block;
    width:32px;height:32px;line-height:32px;border-radius:50%;text-align:center;
  }
  .today-circle { background:var(--accent);color:#000;font-weight:900; }
  .calpg-time-gutter {
    font-size:10px;color:var(--text3);
    padding:4px 8px 0 0;text-align:right;
    border-right:1px solid var(--border);
    border-top:1px solid var(--border);
    position:relative;
    height:50px;vertical-align:top;
    background:var(--bg-card);
    line-height:1.2;
  }
  .calpg-hour-cell {
    border-right:1px solid var(--border);
    border-top:1px solid var(--border);
    height:50px;position:relative;
    padding:2px;
    cursor:pointer;transition:background .1s;
    display:flex;flex-direction:column;gap:2px;
  }
  .calpg-hour-cell:hover { background:rgba(0,200,170,.03); }

  .calpg-evt-block {
    border-radius:5px;padding:3px 6px;cursor:pointer;
    transition:filter .12s;margin-bottom:1px;
    flex-shrink:0;
  }
  .calpg-evt-block:hover { filter:brightness(1.15); }
  .calpg-evt-block-title { font-size:10.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .calpg-evt-block-time  { font-size:9px;color:var(--text3);margin-top:1px; }

  /* ═══ MONTH GRID ═════════════════════════════════════════════ */
  .calpg-month-grid { display:flex;flex-direction:column;height:100%; }
  .calpg-month-dow-row {
    display:grid;grid-template-columns:repeat(7,1fr);
    background:var(--bg-card);border-bottom:1px solid var(--border);
  }
  .calpg-month-dn {
    text-align:center;padding:8px 4px;
    font-size:10px;font-weight:700;text-transform:uppercase;
    letter-spacing:.8px;color:var(--text3);
  }
  .calpg-month-cells {
    display:grid;grid-template-columns:repeat(7,1fr);
    flex:1;
  }
  .calpg-month-cell {
    border-right:1px solid var(--border);border-bottom:1px solid var(--border);
    padding:6px;min-height:90px;cursor:pointer;
    display:flex;flex-direction:column;gap:2px;
    transition:background .12s;
  }
  .calpg-month-cell:nth-child(7n) { border-right:none; }
  .calpg-month-cell:hover { background:rgba(0,200,170,.04); }
  .calpg-month-cell.other .calpg-month-num { color:var(--text3);opacity:.35; }
  .calpg-month-cell.is-today { background:rgba(0,200,170,.07); }
  .calpg-month-num {
    font-size:12px;font-weight:600;color:var(--text2);
    width:22px;height:22px;display:flex;align-items:center;justify-content:center;
    border-radius:50%;
  }
  .calpg-month-num.today-circle { background:var(--accent);color:#000;font-weight:900;font-size:11px; }
  .calpg-month-evt {
    border-radius:3px;padding:2px 5px;
    font-size:10px;font-weight:600;color:var(--text);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    cursor:pointer;transition:filter .1s;
  }
  .calpg-month-evt:hover { filter:brightness(1.2); }
  .calpg-month-more { font-size:9.5px;color:var(--text3);padding:0 4px; }

  /* ═══ DRAWER ═════════════════════════════════════════════════ */
  .calpg-drawer-backdrop {
    position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:200;
  }
  .calpg-drawer {
    position:fixed;right:0;top:58px;bottom:0;width:320px;max-width:92vw;
    background:var(--bg-glass);
    backdrop-filter:blur(48px) saturate(1.8);
    -webkit-backdrop-filter:blur(48px) saturate(1.8);
    border-left:1px solid var(--border2);
    z-index:201;overflow-y:auto;
    animation:drawerSlideIn .22s ease-out;
  }
  @keyframes drawerSlideIn { from{transform:translateX(30px);opacity:0} to{transform:none;opacity:1} }
  .calpg-drawer.hidden,.calpg-drawer-backdrop.hidden{display:none}
  .calpg-drawer-header {
    display:flex;align-items:flex-start;gap:10px;
    padding:20px 18px 14px;
    border-bottom:1px solid var(--border);
  }
  .calpg-drawer-title { flex:1;font-size:15px;font-weight:700;color:var(--text);line-height:1.3; }
  .calpg-drawer-close {
    width:28px;height:28px;border-radius:7px;
    background:none;border:1px solid var(--border);
    cursor:pointer;color:var(--text2);font-size:12px;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;
  }
  .calpg-drawer-content { padding:16px 18px;display:flex;flex-direction:column;gap:14px; }
  .calpg-dr-row { display:flex;gap:10px;align-items:flex-start; }
  .calpg-dr-row svg { flex-shrink:0;margin-top:2px;color:var(--text3); }

  /* Time breakdown */
  .calpg-breakdown { display:flex;flex-direction:column;gap:6px; }

  /* Today info */
  .calpg-today-info { flex:1;min-width:0; }

  /* Responsive */
  @media(max-width:768px) {
    .calpg-shell { grid-template-columns:1fr; }
    .calpg-sidebar { display:none; }
    .calpg-drawer { width:100vw; }
  }
  `;
  document.head.appendChild(s);
}
