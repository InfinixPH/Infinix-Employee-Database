// ============================================================
// page-calendar.js — Calendar page
// Full UI structure — Google Sheets integration ready
// Connect a "Calendar" sheet tab when ready; format:
//   Date | Title | Description | Type | Location | Time
// ============================================================
'use strict';

let _calPageDate = new Date(); // current view month
const CAL_EVENT_TYPES = {
  'Meeting':    { color: '#378ADD', bg: 'rgba(55,138,221,.15)' },
  'Training':   { color: '#00C8AA', bg: 'rgba(0,200,170,.15)' },
  'Holiday':    { color: '#FF7043', bg: 'rgba(255,112,67,.15)' },
  'Deployment': { color: '#AB47BC', bg: 'rgba(171,71,188,.15)' },
  'Event':      { color: '#FFD740', bg: 'rgba(255,215,64,.15)' },
  'Other':      { color: '#78909C', bg: 'rgba(120,144,156,.15)' },
};

function renderCalendarPage(){
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = 'Calendar';

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="cal-page">

      <!-- Sidebar: mini calendar + upcoming events -->
      <div class="cal-sidebar">
        <div class="cal-mini-wrap">
          <div class="cal-mini-header">
            <button class="cal-nav-btn" onclick="calShiftMonth(-1)" title="Previous month">
              <i class="fi fi-sr-angle-left"></i>
            </button>
            <span class="cal-mini-month" id="cal-mini-month"></span>
            <button class="cal-nav-btn" onclick="calShiftMonth(1)" title="Next month">
              <i class="fi fi-sr-angle-right"></i>
            </button>
          </div>
          <div class="cal-mini-grid" id="cal-mini-grid"></div>
        </div>

        <div class="cal-upcoming">
          <div class="cal-section-title">Upcoming Events</div>
          <div id="cal-upcoming-list" class="cal-upcoming-list">
            <div class="cal-placeholder-msg">
              <i class="fi fi-sr-calendar" style="font-size:28px;opacity:.25"></i>
              <p>Connect a <strong>Calendar</strong> sheet tab to load events.</p>
            </div>
          </div>
        </div>

        <div class="cal-legend">
          <div class="cal-section-title">Event Types</div>
          ${Object.entries(CAL_EVENT_TYPES).map(([type, meta])=>`
            <div class="cal-legend-row">
              <span class="cal-legend-dot" style="background:${meta.color}"></span>
              <span>${type}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Main calendar grid -->
      <div class="cal-main">
        <div class="cal-main-header">
          <div class="cal-main-title" id="cal-main-title"></div>
          <div class="cal-view-btns">
            <button class="cal-view-btn active" id="cal-btn-month" onclick="setCalView('month',this)">Month</button>
            <button class="cal-view-btn" id="cal-btn-week" onclick="setCalView('week',this)">Week</button>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="calGoToday()" style="margin-left:8px">Today</button>
        </div>

        <div class="cal-grid-wrap" id="cal-grid-wrap">
          <!-- Injected by renderCalGrid() -->
        </div>

        <div class="cal-integration-note">
          <i class="fi fi-sr-info" style="font-size:12px;opacity:.5"></i>
          Calendar events will appear here once a <strong>Calendar</strong> Google Sheet tab is connected.
          Expected columns: <code>Date | Title | Description | Type | Location | Time</code>
        </div>
      </div>

    </div>
  `;

  renderCalGrid();
}

let _calView = 'month';
function setCalView(v, btn){
  _calView = v;
  document.querySelectorAll('.cal-view-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderCalGrid();
}

function calShiftMonth(dir){
  _calPageDate = new Date(_calPageDate.getFullYear(), _calPageDate.getMonth() + dir, 1);
  renderCalGrid();
}

function calGoToday(){
  _calPageDate = new Date();
  renderCalGrid();
}

function renderCalGrid(){
  const miniMonthEl = document.getElementById('cal-mini-month');
  const mainTitleEl = document.getElementById('cal-main-title');
  const gridWrap    = document.getElementById('cal-grid-wrap');
  if(!gridWrap) return;

  const yr  = _calPageDate.getFullYear();
  const mo  = _calPageDate.getMonth();
  const today = new Date();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayAbbr    = ['S','M','T','W','T','F','S'];

  if(miniMonthEl) miniMonthEl.textContent = `${monthNames[mo]} ${yr}`;
  if(mainTitleEl) mainTitleEl.textContent = `${monthNames[mo]} ${yr}`;

  // Try to load events from _calEventsCache (shared with page-home.js) or empty
  const events = Array.isArray(typeof _calEventsCache !== 'undefined' ? _calEventsCache : null) ? _calEventsCache : [];

  if(_calView === 'month'){
    const firstDay = new Date(yr, mo, 1).getDay();
    const daysInMonth = new Date(yr, mo+1, 0).getDate();
    const daysInPrev  = new Date(yr, mo, 0).getDate();

    let cells = '';
    // Day headers
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    cells += `<div class="cal-grid-month"><div class="cal-day-headers">${dayNames.map(d=>`<div class="cal-day-hdr">${d}</div>`).join('')}</div><div class="cal-days-grid">`;

    // Prev month overflow
    for(let i=0;i<firstDay;i++){
      const d = daysInPrev - firstDay + i + 1;
      cells += `<div class="cal-day cal-day-other"><span class="cal-day-num">${d}</span></div>`;
    }

    // Current month days
    for(let d=1;d<=daysInMonth;d++){
      const isToday = d===today.getDate()&&mo===today.getMonth()&&yr===today.getFullYear();
      const dateStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayEvents = events.filter(e=>String(e.date||'').startsWith(dateStr));
      const eventDots = dayEvents.slice(0,3).map(e=>{
        const meta = CAL_EVENT_TYPES[e.type]||CAL_EVENT_TYPES['Other'];
        return `<div class="cal-event-chip" style="background:${meta.bg};color:${meta.color};border-left:2px solid ${meta.color}">${esc(e.title||'Event')}</div>`;
      }).join('');
      cells += `<div class="cal-day${isToday?' cal-day-today':''}">
        <span class="cal-day-num${isToday?' cal-today-num':''}">${d}</span>
        <div class="cal-event-chips">${eventDots}</div>
      </div>`;
    }

    // Next month overflow (fill to complete row)
    const total = firstDay + daysInMonth;
    const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
    for(let d=1;d<=remaining;d++){
      cells += `<div class="cal-day cal-day-other"><span class="cal-day-num">${d}</span></div>`;
    }

    cells += '</div></div>';
    gridWrap.innerHTML = cells;
  } else {
    // Week view
    const curr = new Date(_calPageDate);
    const dayOfWeek = curr.getDay();
    const weekStart = new Date(curr); weekStart.setDate(curr.getDate()-dayOfWeek);
    const hours = [];
    for(let h=7;h<=21;h++) hours.push(h);

    let cols = '';
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for(let i=0;i<7;i++){
      const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
      const isToday = d.toDateString()===today.toDateString();
      cols += `<div class="cal-week-col${isToday?' cal-week-today':''}">
        <div class="cal-week-col-hdr">
          <span class="cal-week-day-name">${dayNames[d.getDay()]}</span>
          <span class="cal-week-day-num${isToday?' cal-today-num':''}">${d.getDate()}</span>
        </div>
        <div class="cal-week-col-body">
          ${hours.map(h=>`<div class="cal-week-hour-cell"></div>`).join('')}
        </div>
      </div>`;
    }

    const timeLabels = hours.map(h=>`<div class="cal-week-time-label">${h===12?'12 PM':h<12?h+' AM':(h-12)+' PM'}</div>`).join('');

    gridWrap.innerHTML = `
      <div class="cal-grid-week">
        <div class="cal-week-time-col">${timeLabels}</div>
        <div class="cal-week-cols">${cols}</div>
      </div>
    `;
  }

  // Render mini grid
  _renderMiniGrid(yr, mo, today);
}

function _renderMiniGrid(yr, mo, today){
  const el = document.getElementById('cal-mini-grid');
  if(!el) return;
  const dayAbbr = ['S','M','T','W','T','F','S'];
  const firstDay = new Date(yr,mo,1).getDay();
  const daysInMonth = new Date(yr,mo+1,0).getDate();
  const daysInPrev  = new Date(yr,mo,0).getDate();
  let html = `<div class="cal-mini-day-headers">${dayAbbr.map(d=>`<span>${d}</span>`).join('')}</div><div class="cal-mini-days">`;

  for(let i=0;i<firstDay;i++){
    html += `<span class="cal-mini-day cal-mini-other">${daysInPrev-firstDay+i+1}</span>`;
  }
  for(let d=1;d<=daysInMonth;d++){
    const isToday = d===today.getDate()&&mo===today.getMonth()&&yr===today.getFullYear();
    html += `<span class="cal-mini-day${isToday?' cal-mini-today':''}" onclick="calJumpDay(${yr},${mo},${d})">${d}</span>`;
  }
  const total = firstDay+daysInMonth;
  const rem = total%7===0?0:7-(total%7);
  for(let d=1;d<=rem;d++) html+=`<span class="cal-mini-day cal-mini-other">${d}</span>`;
  html += '</div>';
  el.innerHTML = html;
}

function calJumpDay(yr, mo, d){
  _calPageDate = new Date(yr, mo, d);
  renderCalGrid();
}
