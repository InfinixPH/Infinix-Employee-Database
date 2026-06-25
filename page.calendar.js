// ============================================================
// page-calendar.js — Calendar Page
// Full month-view calendar UI + upcoming events panel
// Sheet: "Events"  Headers: ID | Title | Date | Note | PostedBy | Active
// ============================================================
'use strict';

// ── Module state ─────────────────────────────────────────────
let _calViewDate   = new Date();   // month/year currently shown
let _calEvents     = null;          // null = not yet loaded
let _calSelected   = null;          // selected date string YYYY-MM-DD
let _calDrawerEvent= null;          // event shown in detail drawer

// Placeholder events shown until sheet is connected
const CAL_PLACEHOLDER_EVENTS = [
  { id:'evt-1', title:'Team Meeting',       date:'2026-06-05', note:'Monthly all-hands call', postedBy:'HR' },
  { id:'evt-2', title:'Payroll Cutoff',     date:'2026-06-15', note:'Submit timesheets by EOD', postedBy:'HR' },
  { id:'evt-3', title:'Training Session',   date:'2026-06-18', note:'Product knowledge — new store assignments', postedBy:'HR' },
  { id:'evt-4', title:'Deployment Drive',   date:'2026-06-20', note:'NCR batch deployment target date', postedBy:'HR' },
  { id:'evt-5', title:'Holiday — Eid',      date:'2026-06-27', note:'Non-working holiday', postedBy:'System' },
  { id:'evt-6', title:'Contract Review',    date:'2026-07-01', note:'Expiring contracts follow-up', postedBy:'HR' },
  { id:'evt-7', title:'Payroll Cutoff',     date:'2026-07-15', note:'Submit timesheets by EOD', postedBy:'HR' },
];

// ── Load events from Google Sheet ────────────────────────────
async function loadCalendarEvents(force){
  if(_calEvents !== null && !force) return _calEvents;
  try{
    const r = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A2:F`
    });
    const rows = r.result.values || [];
    _calEvents = rows
      .filter(r => String(r[5]||'').trim().toUpperCase() !== 'FALSE')
      .map(r => ({
        id:       r[0]||'',
        title:    r[1]||'',
        date:     r[2]||'',
        note:     r[3]||'',
        postedBy: r[4]||'',
        active:   String(r[5]||'true').trim().toUpperCase() !== 'FALSE'
      }))
      .filter(e => e.title && e.date);
    return _calEvents;
  }catch(e){
    console.warn('Calendar: Events sheet not connected yet — showing placeholder data.', e);
    _calEvents = CAL_PLACEHOLDER_EVENTS;
    return _calEvents;
  }
}

// ── Main render ───────────────────────────────────────────────
async function renderCalendarPage(){
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = 'Calendar';

  const content = document.getElementById('content');
  content.innerHTML = `<div class="cal-loading"><div class="spinner"></div></div>`;

  const events = await loadCalendarEvents();

  content.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-main">
        <!-- Month nav header -->
        <div class="cal-header">
          <button class="cal-nav-btn" onclick="calPrevMonth()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="cal-month-label" id="cal-month-label"></div>
          <button class="cal-nav-btn" onclick="calNextMonth()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button class="cal-today-btn" onclick="calGoToday()">Today</button>
          ${canViewSensitive() ? `<button class="btn btn-primary btn-sm" onclick="openCalEventModal()" style="margin-left:auto">+ Add Event</button>` : ''}
        </div>

        <!-- Day of week labels -->
        <div class="cal-dow-row">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
        </div>

        <!-- Calendar grid -->
        <div class="cal-grid" id="cal-grid"></div>
      </div>

      <!-- Sidebar: upcoming events + mini month info -->
      <div class="cal-sidebar">
        <div class="cal-upcoming-panel">
          <div class="cal-panel-title">Upcoming Events</div>
          <div id="cal-upcoming-list"></div>
        </div>
        <div class="cal-legend-panel">
          <div class="cal-panel-title">Legend</div>
          <div class="cal-legend">
            <div class="cal-legend-row"><span class="cal-leg-dot today"></span> Today</div>
            <div class="cal-legend-row"><span class="cal-leg-dot has-event"></span> Has event</div>
            <div class="cal-legend-row"><span class="cal-leg-dot selected"></span> Selected</div>
          </div>
        </div>
        ${canViewSensitive() ? `
        <div class="cal-sheet-notice">
          <div class="cal-notice-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </div>
          <div>Events sheet: <strong>${EVENTS_SHEET}</strong><br>
          <span style="color:var(--text3);font-size:10px">Headers: ID · Title · Date · Note · PostedBy · Active</span></div>
        </div>` : ''}
      </div>
    </div>

    <!-- Event detail drawer -->
    <div class="cal-drawer-backdrop hidden" id="cal-drawer-backdrop" onclick="closeCalDrawer()"></div>
    <div class="cal-drawer hidden" id="cal-drawer">
      <div class="cal-drawer-inner" id="cal-drawer-inner"></div>
    </div>

    <!-- Add Event Modal -->
    <div class="overlay hidden" id="cal-event-modal">
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <h2>Add Calendar Event</h2>
          <button class="modal-close" onclick="closeCalEventModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Title</label><input id="cal-evt-title" type="text" placeholder="Event title" class="field-input"></div>
          <div class="field"><label>Date</label><input id="cal-evt-date" type="date" class="field-input"></div>
          <div class="field"><label>Note (optional)</label><textarea id="cal-evt-note" rows="3" placeholder="Details…" style="width:100%;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:12.5px;font-family:'Inter',sans-serif;resize:vertical"></textarea></div>
          <div class="field"><label>Posted by</label><input id="cal-evt-poster" type="text" placeholder="HR" class="field-input"></div>
          <div id="cal-event-msg" style="font-size:11px;min-height:14px;color:var(--success)"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeCalEventModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveCalEvent()">Save Event</button>
        </div>
      </div>
    </div>
  `;

  _renderCalGrid();
  _renderUpcomingEvents();
  _injectCalStyles();
}

// ── Render the calendar grid ──────────────────────────────────
function _renderCalGrid(){
  const events = _calEvents || CAL_PLACEHOLDER_EVENTS;
  const year   = _calViewDate.getFullYear();
  const month  = _calViewDate.getMonth(); // 0-based

  // Update header label
  const label = document.getElementById('cal-month-label');
  if(label) label.textContent = _calViewDate.toLocaleDateString('en-US',{month:'long',year:'numeric'});

  // Build event map: dateStr → [events]
  const evtMap = {};
  events.forEach(e => {
    const d = e.date ? e.date.slice(0,10) : '';
    if(!d) return;
    if(!evtMap[d]) evtMap[d] = [];
    evtMap[d].push(e);
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = _dateStr(today);

  // First day of month (0=Sun…6=Sat), convert to Mon-start grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const startOffset = (firstDay === 0) ? 6 : firstDay - 1; // Mon=0
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const grid = document.getElementById('cal-grid');
  if(!grid) return;

  let html = '';
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for(let i = 0; i < totalCells; i++){
    let dayNum, dateStr, isCurrentMonth = true;
    if(i < startOffset){
      dayNum = prevDays - startOffset + i + 1;
      dateStr = _dateStr(new Date(year, month-1, dayNum));
      isCurrentMonth = false;
    } else if(i >= startOffset + daysInMonth){
      dayNum = i - startOffset - daysInMonth + 1;
      dateStr = _dateStr(new Date(year, month+1, dayNum));
      isCurrentMonth = false;
    } else {
      dayNum = i - startOffset + 1;
      dateStr = _dateStr(new Date(year, month, dayNum));
    }

    const isToday    = dateStr === todayStr;
    const isSelected = dateStr === _calSelected;
    const dayEvents  = evtMap[dateStr] || [];
    const isWeekend  = (i % 7 >= 5); // Sat/Sun

    html += `<div class="cal-cell ${isCurrentMonth?'':'other-month'} ${isToday?'is-today':''} ${isSelected?'is-selected':''} ${dayEvents.length?'has-events':''}" onclick="calSelectDate('${dateStr}')">
      <div class="cal-cell-num ${isWeekend?'weekend':''}">${dayNum}</div>
      <div class="cal-cell-events">
        ${dayEvents.slice(0,2).map(e=>`<div class="cal-evt-pill" onclick="event.stopPropagation();openCalDrawer(${JSON.stringify(JSON.stringify(e))})">${esc(e.title)}</div>`).join('')}
        ${dayEvents.length > 2 ? `<div class="cal-evt-more">+${dayEvents.length-2} more</div>` : ''}
      </div>
    </div>`;
  }
  grid.innerHTML = html;
}

// ── Render upcoming events sidebar ───────────────────────────
function _renderUpcomingEvents(){
  const events = (_calEvents || CAL_PLACEHOLDER_EVENTS).slice();
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = events
    .filter(e => { const d = new Date(e.date); return !isNaN(d) && d >= today; })
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(0, 8);

  const el = document.getElementById('cal-upcoming-list');
  if(!el) return;

  if(!upcoming.length){
    el.innerHTML = `<div class="cal-empty-upcoming">No upcoming events.</div>`;
    return;
  }

  const todayStr = _dateStr(today);
  el.innerHTML = upcoming.map(e => {
    const d = new Date(e.date);
    const dStr = e.date.slice(0,10);
    const isToday = dStr === todayStr;
    const diff = Math.round((new Date(dStr) - today) / 86400000);
    const diffLabel = isToday ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff}d`;
    const monthLabel = d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    return `<div class="cal-upcoming-item" onclick="openCalDrawer(${JSON.stringify(JSON.stringify(e))})">
      <div class="cal-upcoming-date ${isToday?'today':''}">
        <div class="cal-upcoming-day">${d.getDate()}</div>
        <div class="cal-upcoming-mon">${d.toLocaleDateString('en-US',{month:'short'})}</div>
      </div>
      <div class="cal-upcoming-info">
        <div class="cal-upcoming-title">${esc(e.title)}</div>
        <div class="cal-upcoming-meta">${esc(diffLabel)}${e.note ? ' · '+esc(e.note.slice(0,40)) : ''}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Navigation ────────────────────────────────────────────────
function calPrevMonth(){
  _calViewDate = new Date(_calViewDate.getFullYear(), _calViewDate.getMonth()-1, 1);
  _renderCalGrid();
  _renderUpcomingEvents();
}
function calNextMonth(){
  _calViewDate = new Date(_calViewDate.getFullYear(), _calViewDate.getMonth()+1, 1);
  _renderCalGrid();
  _renderUpcomingEvents();
}
function calGoToday(){
  _calViewDate = new Date();
  _calSelected = _dateStr(new Date());
  _renderCalGrid();
  _renderUpcomingEvents();
}
function calSelectDate(dateStr){
  _calSelected = dateStr;
  _renderCalGrid();
  // Open drawer if there are events on this date
  const events = (_calEvents || CAL_PLACEHOLDER_EVENTS).filter(e => e.date && e.date.slice(0,10) === dateStr);
  if(events.length) openCalDrawer(JSON.stringify(events[0]));
}

// ── Drawer ────────────────────────────────────────────────────
function openCalDrawer(evtJson){
  try{
    const evt = typeof evtJson === 'string' ? JSON.parse(evtJson) : evtJson;
    _calDrawerEvent = evt;
    const d = new Date(evt.date);
    const dateLabel = d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const inner = document.getElementById('cal-drawer-inner');
    if(inner) inner.innerHTML = `
      <div class="cal-drawer-header">
        <div class="cal-drawer-title">${esc(evt.title)}</div>
        <button class="cal-drawer-close" onclick="closeCalDrawer()">✕</button>
      </div>
      <div class="cal-drawer-date">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        ${esc(dateLabel)}
      </div>
      ${evt.note ? `<div class="cal-drawer-note">${esc(evt.note)}</div>` : ''}
      <div class="cal-drawer-meta">Posted by ${esc(evt.postedBy||'HR')}</div>
      ${canViewSensitive() ? `
      <div class="cal-drawer-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteCalEvent('${esc(evt.id)}')">Delete Event</button>
      </div>` : ''}
    `;
    const backdrop = document.getElementById('cal-drawer-backdrop');
    const drawer   = document.getElementById('cal-drawer');
    if(backdrop) backdrop.classList.remove('hidden');
    if(drawer)   drawer.classList.remove('hidden');
  }catch(e){ console.warn('openCalDrawer error:', e); }
}
function closeCalDrawer(){
  document.getElementById('cal-drawer-backdrop')?.classList.add('hidden');
  document.getElementById('cal-drawer')?.classList.add('hidden');
  _calDrawerEvent = null;
}

// ── Add Event Modal ───────────────────────────────────────────
function openCalEventModal(){
  if(!canViewSensitive()){ toast('Only HR/AGENCY or Owner can add events.','error'); return; }
  const overlay = document.getElementById('cal-event-modal');
  if(overlay){
    overlay.classList.remove('hidden');
    overlay.classList.add('open');
  }
  // Pre-fill date if a date is selected
  if(_calSelected){
    const dateEl = document.getElementById('cal-evt-date');
    if(dateEl) dateEl.value = _calSelected;
  }
  const msgEl = document.getElementById('cal-event-msg');
  if(msgEl) msgEl.textContent = '';
}
function closeCalEventModal(){
  const overlay = document.getElementById('cal-event-modal');
  if(overlay){ overlay.classList.remove('open'); overlay.classList.add('hidden'); }
}

async function saveCalEvent(){
  const title  = document.getElementById('cal-evt-title')?.value.trim();
  const date   = document.getElementById('cal-evt-date')?.value;
  const note   = document.getElementById('cal-evt-note')?.value.trim();
  const poster = document.getElementById('cal-evt-poster')?.value.trim() || currentUser?.name || 'HR';
  const msgEl  = document.getElementById('cal-event-msg');

  if(!title){ toast('Please enter a title.','error'); return; }
  if(!date){  toast('Please select a date.','error'); return; }

  const id = 'EVT-' + Date.now();
  const tsStr = new Date().toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  try{
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [[id, title, date, note, poster, 'TRUE']] }
    });
    if(msgEl) msgEl.textContent = '✓ Event saved!';
    // Invalidate cache and reload
    _calEvents = null;
    await loadCalendarEvents(true);
    closeCalEventModal();
    renderCalendarPage();
    toast('Event added to calendar','success');
  }catch(e){
    console.error('saveCalEvent error:', e);
    toast('Could not save event — check sheet permissions.','error');
  }
}

async function deleteCalEvent(id){
  if(!canViewSensitive()){ toast('Permission denied.','error'); return; }
  if(!confirm('Delete this event permanently?')) return;
  try{
    // Find the row
    const r = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EVENTS_SHEET}!A:A`
    });
    const rows = r.result.values || [];
    let rowNum = -1;
    for(let i = 1; i < rows.length; i++){
      if(String(rows[i][0]||'').trim() === String(id).trim()){ rowNum = i+1; break; }
    }
    if(rowNum < 0){ toast('Event not found in sheet.','error'); return; }
    const sheetId = await getSheetId(EVENTS_SHEET);
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource:{ requests:[{ deleteDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:rowNum-1, endIndex:rowNum } } }] }
    });
    _calEvents = null;
    closeCalDrawer();
    renderCalendarPage();
    toast('Event deleted.','success');
  }catch(e){ toast('Could not delete event.','error'); console.error(e); }
}

// ── Helpers ───────────────────────────────────────────────────
function _dateStr(d){ return d.toISOString().slice(0,10); }

// ── Styles ────────────────────────────────────────────────────
function _injectCalStyles(){
  if(document.getElementById('page-cal-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-cal-styles';
  s.textContent = `
  /* ═══ CALENDAR LAYOUT ═══════════════════════════════════════ */
  .cal-wrap {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 20px;
    padding: 20px 24px;
    height: calc(100vh - 58px);
    box-sizing: border-box;
    align-items: start;
  }
  .cal-loading {
    display: flex; align-items: center; justify-content: center;
    height: 60vh;
  }
  @media (max-width: 900px) {
    .cal-wrap { grid-template-columns: 1fr; height: auto; }
  }

  /* ═══ MAIN CALENDAR ═══════════════════════════════════════ */
  .cal-main {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex; flex-direction: column;
  }

  .cal-header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(0,200,170,0.03);
  }
  .cal-month-label {
    font-size: 16px; font-weight: 700; color: var(--text);
    min-width: 180px;
  }
  .cal-nav-btn {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--bg-frosted); border: 1px solid var(--border);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: var(--text2); transition: all .15s;
  }
  .cal-nav-btn:hover { background: rgba(0,200,170,.1); color: var(--accent); border-color: rgba(0,200,170,.3); }
  .cal-today-btn {
    padding: 5px 14px; border-radius: 20px; border: 1px solid var(--border);
    background: var(--bg-frosted); color: var(--text2); cursor: pointer;
    font-size: 12px; font-weight: 600; transition: all .15s;
    font-family: 'Inter', sans-serif;
  }
  .cal-today-btn:hover { border-color: var(--accent); color: var(--accent); }

  .cal-dow-row {
    display: grid; grid-template-columns: repeat(7, 1fr);
    background: rgba(0,200,170,.025);
    border-bottom: 1px solid var(--border);
  }
  .cal-dow {
    text-align: center; padding: 8px 4px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: var(--text3);
  }

  .cal-grid {
    display: grid; grid-template-columns: repeat(7, 1fr);
    flex: 1;
  }
  .cal-cell {
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 6px;
    min-height: 88px;
    cursor: pointer;
    transition: background .12s;
    display: flex; flex-direction: column; gap: 3px;
  }
  .cal-cell:hover { background: rgba(0,200,170,.04); }
  .cal-cell:nth-child(7n) { border-right: none; }
  .cal-cell.other-month .cal-cell-num { color: var(--text3); opacity: .4; }
  .cal-cell.is-today { background: rgba(0,200,170,.06); }
  .cal-cell.is-selected { background: rgba(0,200,170,.12); }
  .cal-cell.has-events .cal-cell-num::after {
    content: ''; display: inline-block; width: 5px; height: 5px;
    border-radius: 50%; background: var(--accent); margin-left: 4px;
    vertical-align: middle;
  }
  .cal-cell-num {
    font-size: 12px; font-weight: 600; color: var(--text2);
    line-height: 1.4;
  }
  .cal-cell-num.weekend { color: rgba(255,100,100,.7); }
  .cal-cell.is-today .cal-cell-num {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent); color: #000; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px;
  }
  .cal-cell-events { display: flex; flex-direction: column; gap: 2px; }
  .cal-evt-pill {
    background: rgba(0,200,170,.15); color: var(--accent);
    border-radius: 4px; padding: 2px 5px;
    font-size: 10px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    cursor: pointer; transition: background .1s;
  }
  .cal-evt-pill:hover { background: rgba(0,200,170,.28); }
  .cal-evt-more { font-size: 10px; color: var(--text3); padding: 1px 4px; }

  /* ═══ SIDEBAR PANELS ═══════════════════════════════════════ */
  .cal-sidebar { display: flex; flex-direction: column; gap: 14px; }

  .cal-upcoming-panel, .cal-legend-panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .cal-panel-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.2px; color: var(--text3);
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--border);
  }
  .cal-upcoming-item {
    display: flex; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background .12s;
  }
  .cal-upcoming-item:last-child { border-bottom: none; }
  .cal-upcoming-item:hover { background: rgba(0,200,170,.05); }
  .cal-upcoming-date {
    flex-shrink: 0; text-align: center; width: 34px;
    background: rgba(0,200,170,.08); border-radius: 8px;
    padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .cal-upcoming-date.today { background: rgba(0,200,170,.2); }
  .cal-upcoming-day { font-size: 16px; font-weight: 800; color: var(--accent); line-height: 1; }
  .cal-upcoming-mon { font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--text3); }
  .cal-upcoming-info { flex: 1; min-width: 0; }
  .cal-upcoming-title { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cal-upcoming-meta { font-size: 10.5px; color: var(--text3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cal-empty-upcoming { font-size: 12px; color: var(--text3); padding: 14px; font-style: italic; }

  /* Legend */
  .cal-legend { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
  .cal-legend-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
  .cal-leg-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .cal-leg-dot.today { background: var(--accent); }
  .cal-leg-dot.has-event { background: rgba(0,200,170,.5); border: 1px solid var(--accent); }
  .cal-leg-dot.selected { background: rgba(0,200,170,.3); border: 2px solid var(--accent); }

  /* Sheet info notice */
  .cal-sheet-notice {
    background: rgba(0,200,170,.04);
    border: 1px solid rgba(0,200,170,.15);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 11px; color: var(--text2); line-height: 1.6;
  }
  .cal-notice-icon { color: var(--accent); flex-shrink: 0; margin-top: 2px; }

  /* ═══ EVENT DRAWER ═══════════════════════════════════════ */
  .cal-drawer-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    z-index: 1000; transition: opacity .2s;
  }
  .cal-drawer {
    position: fixed; right: 0; top: 0; bottom: 0;
    width: 340px; max-width: 95vw;
    background: var(--bg-glass);
    backdrop-filter: blur(48px) saturate(1.8);
    -webkit-backdrop-filter: blur(48px) saturate(1.8);
    border-left: 1px solid var(--border2);
    z-index: 1001; overflow-y: auto;
    animation: drawerIn .22s ease-out;
  }
  @keyframes drawerIn { from { transform: translateX(40px); opacity:0; } to { transform: translateX(0); opacity:1; } }
  .cal-drawer.hidden, .cal-drawer-backdrop.hidden { display: none; }
  .cal-drawer-inner { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
  .cal-drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .cal-drawer-title { font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.3; }
  .cal-drawer-close {
    width: 28px; height: 28px; border-radius: 7px;
    background: none; border: 1px solid var(--border);
    cursor: pointer; color: var(--text2); font-size: 12px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .cal-drawer-date {
    display: flex; align-items: center; gap: 7px;
    font-size: 12.5px; color: var(--accent); font-weight: 600;
  }
  .cal-drawer-note {
    font-size: 13px; color: var(--text2); line-height: 1.6;
    background: rgba(0,200,170,.05); border: 1px solid rgba(0,200,170,.12);
    border-radius: 8px; padding: 10px 12px;
  }
  .cal-drawer-meta { font-size: 11px; color: var(--text3); }
  .cal-drawer-actions { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  `;
  document.head.appendChild(s);
}
