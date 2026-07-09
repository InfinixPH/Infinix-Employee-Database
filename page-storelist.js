// ============================================================
// page-storelist.js — Store List page
// Shows every store from the "Store Details" sheet, cross-referenced
// against the "Active" sheet to show whether a promoter is currently
// deployed (Column J) and how many (Column K).
// Data comes from storeDetailsList / computeStoreCoverage() in roles.js.
// ============================================================
'use strict';

let slSearchTerm = '';
let slRegionFilter = '';
let slStatusFilter = ''; // '' | 'YES' | 'NO'
let slSortCol = null;
let slSortDir = 1;
let slPage = 1;
let slPageSize = 25;

// Called from Home page drilldown links to jump straight into a filtered view.
function goToStoreList(statusFilter){
  slStatusFilter = statusFilter || '';
  slSearchTerm = '';
  slRegionFilter = '';
  slPage = 1;
  Router.go('storelist');
}

async function renderStoreListPage(){
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = 'Store List';

  document.getElementById('content').innerHTML = `
    <div class="sl-wrap">
      <div id="sl-kpi-row" class="sl-kpi-row">${_slKpiSkeleton()}</div>

      <div class="sl-section">
        <div class="sl-section-header">
          <div class="sl-section-title">Stores</div>
          <div class="sl-toolbar">
            <input type="text" id="sl-search" class="sl-search-input" placeholder="Search store, shop ID, RSS…" value="${esc(slSearchTerm)}">
            <select id="sl-region-filter" class="sl-filter-select">
              <option value="">All Regions</option>
              ${REGIONS.map(r=>`<option value="${esc(r)}" ${slRegionFilter===r?'selected':''}>${esc(r)}</option>`).join('')}
            </select>
            <select id="sl-status-filter" class="sl-filter-select">
              <option value="" ${slStatusFilter===''?'selected':''}>All Stores</option>
              <option value="YES" ${slStatusFilter==='YES'?'selected':''}>With Promoter</option>
              <option value="NO" ${slStatusFilter==='NO'?'selected':''}>Without Promoter</option>
            </select>
          </div>
        </div>
        <div id="sl-table-wrap" class="sl-table-wrap">${_slTableSkeleton()}</div>
        <div id="sl-pagination" class="pagination"></div>
      </div>
    </div>
  `;

  _injectStoreListStyles();

  let _slSearchDebounce = null;
  document.getElementById('sl-search').addEventListener('input', e=>{
    const val = e.target.value;
    clearTimeout(_slSearchDebounce);
    _slSearchDebounce = setTimeout(()=>{
      slSearchTerm = val;
      slPage = 1;
      _renderStoreListTable();
    }, 180);
  });
  document.getElementById('sl-region-filter').addEventListener('change', e=>{
    slRegionFilter = e.target.value;
    slPage = 1;
    _renderStoreListTable();
  });
  document.getElementById('sl-status-filter').addEventListener('change', e=>{
    slStatusFilter = e.target.value;
    slPage = 1;
    _renderStoreListTable();
  });

  if(!storeCacheLoaded) await loadStoreDetails();
  if(!storeCoverageComputed) computeStoreCoverage();
  _renderKpiRow();
  _renderStoreListTable();
}

// Home page calls this after a background refresh finishes, if the user is
// currently sitting on this page, so numbers update without a manual reload.
function refreshStoreListPageIfActive(){
  if(typeof currentView!=='undefined' && currentView==='storelist'){
    _renderKpiRow();
    _renderStoreListTable();
  }
}

function _renderKpiRow(){
  const el = document.getElementById('sl-kpi-row');
  if(!el) return;
  const stats = getStoreCoverageStats();
  el.innerHTML = `
    <div class="sl-kpi" onclick="goToStoreList('')" title="View all stores">
      <div class="sl-kpi-val">${stats.total}</div>
      <div class="sl-kpi-label">Total Stores</div>
    </div>
    <div class="sl-kpi" onclick="goToStoreList('YES')" title="View stores with a promoter">
      <div class="sl-kpi-val" style="color:#2E7D32">${stats.withPromoter}</div>
      <div class="sl-kpi-label">With Promoter</div>
    </div>
    <div class="sl-kpi" onclick="goToStoreList('NO')" title="View stores without a promoter">
      <div class="sl-kpi-val" style="color:#C62828">${stats.withoutPromoter}</div>
      <div class="sl-kpi-label">Without Promoter</div>
    </div>
    <div class="sl-kpi" title="Percentage of stores with a promoter deployed">
      <div class="sl-kpi-val">${stats.pct}%</div>
      <div class="sl-kpi-label">Coverage</div>
    </div>
  `;
}

function _slFilteredList(){
  let list = storeDetailsList.slice();
  if(slRegionFilter) list = list.filter(s=>s.region===slRegionFilter);
  if(slStatusFilter) list = list.filter(s=>s.promoterStatus===slStatusFilter);
  const q = slSearchTerm.trim().toLowerCase();
  if(q) list = list.filter(s =>
    (s.storeName||'').toLowerCase().includes(q) ||
    (s.shopId||'').toLowerCase().includes(q) ||
    (s.rssName||'').toLowerCase().includes(q) ||
    (s.city||'').toLowerCase().includes(q)
  );
  if(slSortCol){
    list.sort((a,b)=>{
      const av = String(a[slSortCol]??'').toLowerCase();
      const bv = String(b[slSortCol]??'').toLowerCase();
      if(slSortCol==='promoterCount') return (a.promoterCount-b.promoterCount)*slSortDir;
      return av.localeCompare(bv)*slSortDir;
    });
  }
  return list;
}

function slSortBy(col){
  if(slSortCol===col) slSortDir*=-1; else { slSortCol=col; slSortDir=1; }
  _renderStoreListTable();
}

function _renderStoreListTable(){
  const wrap = document.getElementById('sl-table-wrap');
  const pagEl = document.getElementById('sl-pagination');
  if(!wrap) return;

  if(!storeCacheLoaded){ wrap.innerHTML = _slTableSkeleton(); return; }

  const list = _slFilteredList();
  const totalPages = Math.max(1, Math.ceil(list.length/slPageSize));
  if(slPage>totalPages) slPage = totalPages;
  const pageItems = list.slice((slPage-1)*slPageSize, slPage*slPageSize);

  if(!list.length){
    wrap.innerHTML = `<div class="sl-empty">No stores match these filters.</div>`;
    if(pagEl) pagEl.innerHTML = '';
    return;
  }

  const arrow = c => slSortCol===c ? (slSortDir===1?' ▲':' ▼') : '';
  wrap.innerHTML = `
    <table class="sl-table">
      <thead>
        <tr>
          <th onclick="slSortBy('region')">Region${arrow('region')}</th>
          <th onclick="slSortBy('storeName')">Store Name${arrow('storeName')}</th>
          <th onclick="slSortBy('shopId')">Shop ID${arrow('shopId')}</th>
          <th onclick="slSortBy('storeType')">Type${arrow('storeType')}</th>
          <th onclick="slSortBy('rssName')">RSS${arrow('rssName')}</th>
          <th onclick="slSortBy('promoterStatus')">Promoter?${arrow('promoterStatus')}</th>
          <th onclick="slSortBy('promoterCount')">Count${arrow('promoterCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${pageItems.map(s=>`
          <tr>
            <td>${esc(s.region||'—')}</td>
            <td style="font-weight:600">${esc(s.storeName||'—')}</td>
            <td style="color:var(--text2);font-size:11px">${esc(s.shopId||'—')}</td>
            <td>${esc(s.storeType||'—')}</td>
            <td>${esc(s.rssName||'—')}</td>
            <td><span class="sl-badge ${s.promoterStatus==='YES'?'sl-badge-yes':'sl-badge-no'}">${s.promoterStatus||'NO'}</span></td>
            <td>${s.promoterCount||0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  if(pagEl){
    pagEl.innerHTML = totalPages<=1 ? '' : `
      <button class="page-btn" ${slPage<=1?'disabled':''} onclick="slPage--;_renderStoreListTable()">‹ Prev</button>
      <span class="page-info">Page ${slPage} of ${totalPages}</span>
      <button class="page-btn" ${slPage>=totalPages?'disabled':''} onclick="slPage++;_renderStoreListTable()">Next ›</button>
    `;
  }
}

function _slKpiSkeleton(){
  return Array(4).fill('<div class="sl-kpi"><div class="skeleton-base" style="width:50px;height:26px;margin-bottom:6px"></div><div class="skeleton-base" style="width:80px;height:11px"></div></div>').join('');
}
function _slTableSkeleton(){
  return `<div class="sl-empty">Loading store list…</div>`;
}

// ── Scoped styles (injected once, mirrors page-recruitment.js pattern) ──
function _injectStoreListStyles(){
  if(document.getElementById('sl-styles')) return;
  const style = document.createElement('style');
  style.id = 'sl-styles';
  style.textContent = `
    .sl-wrap { padding: 20px 24px 40px; display:flex; flex-direction:column; gap:20px; }
    .sl-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
    @media (max-width:768px){ .sl-kpi-row{ grid-template-columns:1fr 1fr; } }
    .sl-kpi { background:var(--bg-mid); border:1px solid var(--border); border-radius:10px; padding:16px 18px; cursor:pointer; transition:background .15s; }
    .sl-kpi:hover { background:var(--bg-card-hover); }
    .sl-kpi-val { font-size:24px; font-weight:900; color:var(--accent); line-height:1.1; }
    .sl-kpi-label { font-size:11px; font-weight:700; color:var(--text2); text-transform:uppercase; letter-spacing:.5px; margin-top:4px; }

    .sl-section { background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:18px; }
    .sl-section-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:14px; }
    .sl-section-title { font-size:15px; font-weight:800; color:var(--text); }
    .sl-toolbar { display:flex; gap:8px; flex-wrap:wrap; }
    .sl-search-input, .sl-filter-select {
      background:var(--bg-mid); border:1px solid var(--border); border-radius:8px;
      color:var(--text); font-size:12.5px; padding:8px 10px; outline:none;
    }
    .sl-search-input { min-width:220px; }
    .sl-search-input:focus, .sl-filter-select:focus { border-color:var(--accent); }

    .sl-table-wrap { overflow-x:auto; }
    .sl-table { width:100%; border-collapse:collapse; font-size:12.5px; }
    .sl-table th { text-align:left; padding:10px 12px; color:var(--text2); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid var(--border); cursor:pointer; user-select:none; white-space:nowrap; }
    .sl-table th:hover { color:var(--accent); }
    .sl-table td { padding:10px 12px; border-bottom:1px solid var(--border); color:var(--text); }
    .sl-table tbody tr:hover { background:var(--bg-card-hover); }

    .sl-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10.5px; font-weight:800; letter-spacing:.3px; }
    .sl-badge-yes { background:rgba(46,125,50,.15); color:#2E7D32; }
    .sl-badge-no  { background:rgba(198,40,40,.15); color:#C62828; }

    .sl-empty { padding:40px; text-align:center; color:var(--text3); font-size:13px; }
    #sl-pagination.pagination { display:flex; align-items:center; justify-content:center; gap:12px; margin-top:14px; }
    #sl-pagination .page-info { font-size:12px; color:var(--text2); }
  `;
  document.head.appendChild(style);
}
