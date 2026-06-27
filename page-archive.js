// ============================================================
// page-archive.js — Workforce Archive sub-pages
// Resigned | AWOL | Floating | Terminated | Backout
// Uses existing employee data — no separate database needed
// ============================================================
'use strict';

const ARCHIVE_META = {
  'Resigned':   { icon:'fi-sr-user-slash',  color:'#FF5252', bg:'rgba(255,82,82,.12)',   label:'Resigned',   desc:'Employees who have formally resigned.' },
  'AWOL':       { icon:'fi-sr-user-xmark',  color:'#FFD740', bg:'rgba(255,215,64,.12)',  label:'AWOL',       desc:'Absent without official leave.' },
  'Floating':   { icon:'fi-sr-arrows-repeat',color:'#378ADD',bg:'rgba(55,138,221,.12)',  label:'Floating',   desc:'Awaiting new store assignment.' },
  'Terminated': { icon:'fi-sr-ban',          color:'#FF7043', bg:'rgba(255,112,67,.12)', label:'Terminated', desc:'Employment has been terminated.' },
  'Backout':    { icon:'fi-sr-undo',         color:'#AB47BC', bg:'rgba(171,71,188,.12)', label:'Backout',    desc:'Backed out before deployment.' },
};

function renderArchivePage(statusLabel){
  const meta = ARCHIVE_META[statusLabel] || { icon:'fi-sr-user-minus', color:'var(--accent)', bg:'var(--accent-dim)', label:statusLabel, desc:'' };

  // Normalise status matching — check both status and deploymentStatus
  const list = (typeof employees !== 'undefined' ? employees : []).filter(emp => {
    const st  = String(emp.status || '').trim();
    const dst = String(emp.deploymentStatus || '').trim();
    const sl  = statusLabel.toLowerCase();
    if(statusLabel === 'Backout') return normalizeDeployStatus(dst) === 'BACKOUT';
    if(statusLabel === 'AWOL') return st.toLowerCase() === 'awol';
    if(statusLabel === 'Floating') return st.toLowerCase() === 'floating' || dst.toLowerCase() === 'floating';
    return st.toLowerCase() === sl;
  });

  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = meta.label;

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="archive-page">

      <!-- Header strip -->
      <div class="archive-header">
        <div class="archive-hdr-icon" style="color:${meta.color};background:${meta.bg}">
          <i class="fi ${meta.icon}"></i>
        </div>
        <div class="archive-hdr-body">
          <div class="archive-hdr-title">${esc(meta.label)}</div>
          <div class="archive-hdr-desc">${esc(meta.desc)} <strong style="color:${meta.color}">${list.length}</strong> record${list.length!==1?'s':''} found.</div>
        </div>
        ${(typeof canWrite === 'function' && canWrite()) ? `
        <button class="btn btn-ghost btn-sm" onclick="exportArchive('${esc(statusLabel)}')" style="margin-left:auto;flex-shrink:0">
          <i class="fi fi-sr-download"></i> Export
        </button>` : ''}
      </div>

      <!-- Toolbar / search -->
      <div class="archive-toolbar">
        <input class="archive-search" type="text" id="archive-search-${esc(statusLabel)}"
          placeholder="Search by name, ID, or store…"
          oninput="filterArchiveTable('${esc(statusLabel)}')" autocomplete="off">
        <select class="archive-filter-sel" id="archive-area-${esc(statusLabel)}"
          onchange="filterArchiveTable('${esc(statusLabel)}')">
          <option value="">All Areas</option>
          ${[...new Set(list.map(e=>e.area||e.region||'').filter(Boolean))].sort().map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('')}
        </select>
      </div>

      <!-- Table -->
      <div class="archive-table-wrap">
        <table class="archive-table" id="archive-table-${esc(statusLabel)}">
          <thead>
            <tr>
              <th>ID</th>
              <th>Full Name</th>
              <th>Position</th>
              <th>Store / Outlet</th>
              <th>Area</th>
              <th>Date Hired</th>
              <th>${statusLabel === 'Backout' ? 'Deployment Status' : 'Status'}</th>
            </tr>
          </thead>
          <tbody id="archive-tbody-${esc(statusLabel)}">
            ${_buildArchiveRows(list, statusLabel, meta.color)}
          </tbody>
        </table>
        ${list.length === 0 ? `<div class="archive-empty"><i class="fi fi-sr-check-circle" style="font-size:32px;opacity:.3"></i><p>No ${esc(meta.label)} records found.</p></div>` : ''}
      </div>
    </div>
  `;
}

function _buildArchiveRows(list, statusLabel, color){
  if(!list.length) return '';
  return list.map(emp => {
    const id   = esc(emp.infinixId || '—');
    const name = esc(emp.fullName || `${emp.firstName||''} ${emp.lastName||''}`.trim() || '—');
    const pos  = esc(emp.position || emp.jobTitle || '—');
    const store= esc(emp.storeName || emp.store || emp.outlet || '—');
    const area = esc(emp.area || emp.region || '—');
    const hired= esc(emp.dateHired || emp.startDate || '—');
    const st   = esc(statusLabel === 'Backout' ? (emp.deploymentStatus || '—') : (emp.status || '—'));
    return `<tr onclick="openDetailPanel('${emp.infinixId}')" style="cursor:pointer" class="archive-row">
      <td class="td-id">${id}</td>
      <td><strong>${name}</strong></td>
      <td>${pos}</td>
      <td>${store}</td>
      <td>${area}</td>
      <td>${hired}</td>
      <td><span class="archive-status-pill" style="color:${color};background:${color}1F;border:1px solid ${color}40">${st}</span></td>
    </tr>`;
  }).join('');
}

function filterArchiveTable(statusLabel){
  const meta = ARCHIVE_META[statusLabel] || {};
  const query = (document.getElementById('archive-search-'+statusLabel)?.value||'').toLowerCase();
  const area  = (document.getElementById('archive-area-'+statusLabel)?.value||'').toLowerCase();

  const list = (typeof employees !== 'undefined' ? employees : []).filter(emp => {
    const st  = String(emp.status || '').trim();
    const dst = String(emp.deploymentStatus || '').trim();
    const sl  = statusLabel.toLowerCase();
    let match = false;
    if(statusLabel === 'Backout') match = normalizeDeployStatus(dst) === 'BACKOUT';
    else if(statusLabel === 'AWOL') match = st.toLowerCase() === 'awol';
    else if(statusLabel === 'Floating') match = st.toLowerCase() === 'floating' || dst.toLowerCase() === 'floating';
    else match = st.toLowerCase() === sl;
    if(!match) return false;

    if(query){
      const searchStr = [emp.infinixId, emp.fullName, emp.firstName, emp.lastName, emp.storeName, emp.store].join(' ').toLowerCase();
      if(!searchStr.includes(query)) return false;
    }
    if(area){
      const empArea = (emp.area || emp.region || '').toLowerCase();
      if(!empArea.includes(area)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('archive-tbody-'+statusLabel);
  if(tbody){
    tbody.innerHTML = _buildArchiveRows(list, statusLabel, meta.color || 'var(--accent)');
    if(!list.length){
      tbody.parentElement.insertAdjacentHTML('afterend',
        `<div class="archive-empty" id="archive-empty-filter"><p>No matching records.</p></div>`);
    } else {
      document.getElementById('archive-empty-filter')?.remove();
    }
  }
}

function exportArchive(statusLabel){
  const list = (typeof employees !== 'undefined' ? employees : []).filter(emp => {
    const st = String(emp.status||'').trim().toLowerCase();
    const dst= String(emp.deploymentStatus||'').trim();
    if(statusLabel==='Backout') return normalizeDeployStatus(dst)==='BACKOUT';
    if(statusLabel==='AWOL') return st==='awol';
    if(statusLabel==='Floating') return st==='floating'||dst.toLowerCase()==='floating';
    return st===statusLabel.toLowerCase();
  });
  if(!list.length){toast('No records to export.','warning');return;}
  const rows = [['ID','Full Name','Position','Store','Area','Date Hired','Status']].concat(
    list.map(e=>[e.infinixId||'',e.fullName||'',e.position||'',e.storeName||'',e.area||'',e.dateHired||'',e.status||''])
  );
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=`Archive_${statusLabel}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast(`Exported ${list.length} ${statusLabel} records.`,'success');
}
