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
let slPageSize = 15;
let slRegionSortCol = null;
let slRegionSortDir = 1;

// Sheet region values can be mixed-case ("North Luzon") while REGIONS (used
// for the filter dropdown/summary) is upper-case ("NORTH LUZON"), so compare
// case/whitespace-insensitively rather than with a strict === everywhere.
function _regionEq(a, b){
  return String(a||'').trim().toUpperCase() === String(b||'').trim().toUpperCase();
}

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
          <div class="sl-section-title">By Region</div>
        </div>
        <div id="sl-region-summary"></div>
      </div>

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
  _renderRegionSummary();
  _renderStoreListTable();
}

// Home page calls this after a background refresh finishes, if the user is
// currently sitting on this page, so numbers update without a manual reload.
function refreshStoreListPageIfActive(){
  if(typeof currentView!=='undefined' && currentView==='storelist'){
    _renderKpiRow();
    _renderRegionSummary();
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

function _renderRegionSummary(){
  const el = document.getElementById('sl-region-summary');
  if(!el) return;

  let rows = REGIONS.map(region=>{
    const stores = storeDetailsList.filter(s=>_regionEq(s.region, region));
    const total = stores.length;
    const withPromoter = stores.filter(s=>s.promoterStatus==='YES').length;
    const withoutPromoter = total - withPromoter;
    const pct = total ? Math.round((withPromoter/total)*100) : 0;
    return { region, total, withPromoter, withoutPromoter, pct };
  });

  if(slRegionSortCol){
    rows.sort((a,b)=>{
      const av = a[slRegionSortCol], bv = b[slRegionSortCol];
      if(typeof av === 'string') return av.localeCompare(bv)*slRegionSortDir;
      return (av-bv)*slRegionSortDir;
    });
  }

  const arrow = c => slRegionSortCol===c ? (slRegionSortDir===1?' ▲':' ▼') : '';
  el.innerHTML = `
    <div class="sl-table-wrap">
      <table class="sl-table sl-region-table">
        <colgroup>
          <col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%">
        </colgroup>
        <thead>
          <tr>
            <th onclick="_slRegionSortBy('region')">Region${arrow('region')}</th>
            <th onclick="_slRegionSortBy('total')">Total Stores${arrow('total')}</th>
            <th onclick="_slRegionSortBy('withPromoter')">With Promoter${arrow('withPromoter')}</th>
            <th onclick="_slRegionSortBy('withoutPromoter')">Without Promoter${arrow('withoutPromoter')}</th>
            <th onclick="_slRegionSortBy('pct')">Coverage${arrow('pct')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`
            <tr class="${_regionEq(slRegionFilter, r.region)?'sl-region-active':''}" onclick="_slFilterByRegion('${esc(r.region)}')">
              <td style="font-weight:700">${esc(r.region)}</td>
              <td>${r.total}</td>
              <td style="color:#2E7D32;font-weight:700">${r.withPromoter}</td>
              <td style="color:#C62828;font-weight:700">${r.withoutPromoter}</td>
              <td>${r.pct}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _slRegionSortBy(col){
  if(slRegionSortCol===col) slRegionSortDir*=-1; else { slRegionSortCol=col; slRegionSortDir=1; }
  _renderRegionSummary();
}

function _slFilterByRegion(region){
  slRegionFilter = (slRegionFilter===region) ? '' : region;
  const sel = document.getElementById('sl-region-filter');
  if(sel) sel.value = slRegionFilter;
  slPage = 1;
  _renderRegionSummary();
  _renderStoreListTable();
  const stores = document.getElementById('sl-table-wrap');
  if(stores) stores.scrollIntoView({ behavior:'smooth', block:'start' });
}

function _slFilteredList(){
  let list = storeDetailsList.slice();
  if(slRegionFilter) list = list.filter(s=>_regionEq(s.region, slRegionFilter));
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
      <colgroup>
        <col style="width:8%">
        <col style="width:29%">
        <col style="width:10%">
        <col style="width:9%">
        <col style="width:20%">
        <col style="width:15%">
        <col style="width:9%">
      </colgroup>
      <thead>
        <tr>
          <th onclick="slSortBy('region')">Region${arrow('region')}</th>
          <th onclick="slSortBy('storeName')">Store Name${arrow('storeName')}</th>
          <th onclick="slSortBy('shopId')">Shop ID${arrow('shopId')}</th>
          <th onclick="slSortBy('storeType')">Type${arrow('storeType')}</th>
          <th onclick="slSortBy('rssName')">RSS${arrow('rssName')}</th>
          <th onclick="slSortBy('promoterStatus')">With Promoter${arrow('promoterStatus')}</th>
          <th onclick="slSortBy('promoterCount')">Count${arrow('promoterCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${pageItems.map(s=>`
          <tr>
            <td>${esc(s.region||'—')}</td>
            <td style="font-weight:600" title="${esc(s.storeName||'')}">${esc(s.storeName||'—')}</td>
            <td style="color:var(--text2);font-size:11px">${esc(s.shopId||'—')}</td>
            <td>${esc(s.storeType||'—')}</td>
            <td title="${esc(s.rssName||'')}">${esc(s.rssName||'—')}</td>
            <td><span class="sl-badge ${s.promoterStatus==='YES'?'sl-badge-yes':'sl-badge-no'}">${s.promoterStatus||'NO'}</span></td>
            <td>${s.promoterCount||0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  _renderStoreListPagination(list.length, totalPages);
}

function _renderStoreListPagination(total, totalPages){
  const pagEl = document.getElementById('sl-pagination');
  if(!pagEl) return;
  const start = total===0 ? 0 : (slPage-1)*slPageSize+1;
  const end = Math.min(slPage*slPageSize, total);
  let pages=[];
  if(totalPages<=7){ for(let i=1;i<=totalPages;i++) pages.push(i); }
  else{
    pages=[1];
    if(slPage>3) pages.push('...');
    for(let i=Math.max(2,slPage-1); i<=Math.min(totalPages-1,slPage+1); i++) pages.push(i);
    if(slPage<totalPages-2) pages.push('...');
    pages.push(totalPages);
  }
  pagEl.innerHTML = `
    <div class="pagination-info">${total===0?'No records':`${start}–${end} of ${total}`}</div>
    <div style="display:flex;align-items:center;gap:4px">
      <div class="pagination-controls">
        <button class="page-btn" onclick="_slGoPage(1)" ${slPage===1?'disabled':''}>«</button>
        <button class="page-btn" onclick="_slGoPage(${slPage-1})" ${slPage===1?'disabled':''}>‹</button>
        ${pages.map(p=>p==='...'?`<span style="color:var(--text3);padding:0 4px;font-size:12px">…</span>`:`<button class="page-btn ${p===slPage?'active':''}" onclick="_slGoPage(${p})">${p}</button>`).join('')}
        <button class="page-btn" onclick="_slGoPage(${slPage+1})" ${slPage===totalPages?'disabled':''}>›</button>
        <button class="page-btn" onclick="_slGoPage(${totalPages})" ${slPage===totalPages?'disabled':''}>»</button>
      </div>
      <select class="page-size-sel" onchange="_slChangePageSize(parseInt(this.value))">
        <option value="15" ${slPageSize===15?'selected':''}>15/page</option>
        <option value="25" ${slPageSize===25?'selected':''}>25/page</option>
        <option value="50" ${slPageSize===50?'selected':''}>50/page</option>
        <option value="100" ${slPageSize===100?'selected':''}>100/page</option>
      </select>
    </div>`;
}
function _slGoPage(p){
  const totalPages = Math.max(1, Math.ceil(_slFilteredList().length/slPageSize));
  slPage = Math.max(1, Math.min(p, totalPages));
  _renderStoreListTable();
}
function _slChangePageSize(s){
  slPageSize = s;
  slPage = 1;
  _renderStoreListTable();
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
    .sl-table { width:100%; min-width:820px; table-layout:fixed; border-collapse:collapse; font-size:12px; }
    .sl-table th { text-align:left; padding:9px 10px; color:var(--text2); font-weight:700; font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid var(--border); cursor:pointer; user-select:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sl-table th:hover { color:var(--accent); }
    .sl-table td { padding:9px 10px; border-bottom:1px solid var(--border); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sl-table tbody tr:hover { background:var(--bg-card-hover); }

    .sl-region-table tbody tr { cursor:pointer; }
    .sl-region-table tbody tr.sl-region-active { background:rgba(10,138,133,.12); }
    .sl-region-table tbody tr.sl-region-active td:first-child { color:var(--accent); }

    .sl-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10.5px; font-weight:800; letter-spacing:.3px; }
    .sl-badge-yes { background:rgba(46,125,50,.15); color:#2E7D32; }
    .sl-badge-no  { background:rgba(198,40,40,.15); color:#C62828; }

    .sl-empty { padding:40px; text-align:center; color:var(--text3); font-size:13px; }
    #sl-pagination.pagination { display:flex; align-items:center; justify-content:center; gap:12px; margin-top:14px; }
    #sl-pagination .page-info { font-size:12px; color:var(--text2); }
  `;
  document.head.appendChild(style);
}
