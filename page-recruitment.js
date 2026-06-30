// ============================================================
// page-recruitment.js — Recruitment & Training page
// Full Applicants pipeline tracker backed by the "Applicants"
// Google Sheet, with Store ID autofill (Store Details sheet)
// and auto-push to Active sheet on Deployed.
// ============================================================
'use strict';

// ── State ──────────────────────────────────────────────────
let applicants = [];
let applicantsLoaded = false;
let editingApplicantId = null;
let recSearchTerm = '';
let recStatusFilter = '';

const APPLICANT_POSITIONS = ['Promoter','RSS'];
const INTERVIEW_RESULTS = ['','PASSED','FAILED','BACKOUT'];
const FINAL_STATUSES = ['','Deployed','Backout'];
const UNIFORM_SIZES = ['','XS','S','M','L','XL','XXL'];

// ============================================================
// DATA — load / save
// ============================================================
function applicantRowToObj(r){
  r = r || [];
  return {
    id: r[0]||'',
    batchNo: r[1]||'',
    waveNo: r[2]||'',
    region: r[3]||'',
    rssName: r[4]||'',
    rssId: r[5]||'',
    storeAssignment: r[6]||'',
    storeId: r[7]||'',
    fullName: r[8]||'',
    firstName: r[9]||'',
    lastName: r[10]||'',
    middleName: r[11]||'',
    position: r[12]||'',
    mobile: r[13]||'',
    email: r[14]||'',
    initInterviewDate: r[15]||'',
    initInterviewResult: r[16]||'',
    initInterviewRemarks: r[17]||'',
    finalInterviewDate: r[18]||'',
    finalInterviewResult: r[19]||'',
    finalInterviewRemarks: r[20]||'',
    obtStartDate: r[21]||'',
    obtResult: r[22]||'',
    obtRemarks: r[23]||'',
    deploymentDate: r[24]||'',
    status: r[25]||'',
    completeRequirements: r[26]||'',
    uniformSize: r[27]||'',
    uniformDeliveredDate: r[28]||'',
    dateAdded: r[29]||'',
    lastUpdated: r[30]||'',
    addedBy: r[31]||'',
    _row: 0
  };
}
function applicantObjToRow(d){
  d = d||{};
  const fullName = (d.fullName || `${d.firstName||''} ${d.lastName||''}`.trim()).trim();
  return [
    d.id||'', d.batchNo||'', d.waveNo||'', d.region||'', d.rssName||'', d.rssId||'',
    d.storeAssignment||'', d.storeId||'', fullName, d.firstName||'', d.lastName||'', d.middleName||'',
    d.position||'', d.mobile||'', d.email||'',
    d.initInterviewDate||'', d.initInterviewResult||'', d.initInterviewRemarks||'',
    d.finalInterviewDate||'', d.finalInterviewResult||'', d.finalInterviewRemarks||'',
    d.obtStartDate||'', d.obtResult||'', d.obtRemarks||'',
    d.deploymentDate||'', d.status||'', d.completeRequirements||'',
    d.uniformSize||'', d.uniformDeliveredDate||'',
    d.dateAdded||ts(), ts(), d.addedBy||(ROLE_META[currentRole]?.label||'')
  ];
}
async function loadApplicants(force){
  if(applicantsLoaded && !force) return;
  try{
    const r = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `${APPLICANTS_SHEET}!A2:${APPLICANTS_LAST_COL}`
    });
    const rows = r.result.values||[];
    applicants = rows.map((row,i)=>{
      const obj = applicantRowToObj(row);
      obj._row = i+2;
      return obj;
    }).filter(a=>a.id);
    applicantsLoaded = true;
  }catch(e){
    console.warn('Applicants load failed:', e);
    toast('Could not load applicants — check the Applicants sheet exists.','error');
  }
}
function nextApplicantId(){
  let max = 0;
  applicants.forEach(a=>{
    const m = String(a.id).match(/APP-(\d+)/);
    if(m) max = Math.max(max, parseInt(m[1],10));
  });
  return `APP-${String(max+1).padStart(4,'0')}`;
}
async function saveApplicant(data){
  if(!canWrite()){denyWrite();return false;}
  try{
    showLoading(true,'Saving applicant…');
    if(editingApplicantId){
      // Refresh first to avoid acting on a stale row index
      await loadApplicants(true);
      const existing = applicants.find(a=>a.id===editingApplicantId);
      if(!existing) throw new Error('Applicant no longer exists in the sheet — it may have been deleted or edited elsewhere.');
      data.id = existing.id;
      data.dateAdded = existing.dateAdded;
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${APPLICANTS_SHEET}!A${existing._row}:${APPLICANTS_LAST_COL}${existing._row}`,
        valueInputOption:'RAW', resource:{ values:[applicantObjToRow(data)] }
      });
    } else {
      data.id = nextApplicantId();
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `${APPLICANTS_SHEET}!A:${APPLICANTS_LAST_COL}`,
        valueInputOption:'RAW', insertDataOption:'INSERT_ROWS', resource:{ values:[applicantObjToRow(data)] }
      });
    }
    // Auto-push to Active employee sheet when marked Deployed
    let pushFailed = false;
    if(normalizeFinalStatus(data.status)==='DEPLOYED'){
      pushFailed = !(await pushApplicantToActive(data));
    }
    await loadApplicants(true);
    if(pushFailed){
      toast((editingApplicantId?'Applicant updated':'Applicant added')+', but push to Active Workforce failed — see error above / add manually.','error');
    } else {
      toast(editingApplicantId?'Applicant updated':'Applicant added','success');
    }
    return true;
  }catch(e){
    console.error('Applicant save error:', e);
    const detail = e?.result?.error?.message || e?.message || 'check connection';
    toast('Save failed — '+detail,'error');
    return false;
  }finally{
    showLoading(false);
  }
}
function normalizeFinalStatus(s){ return String(s||'').trim().toUpperCase(); }

async function pushApplicantToActive(applicant){
  try{
    // Avoid duplicate push if already deployed previously
    const already = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `${ACTIVE_SHEET}!A2:${SHEET_LAST_COL}`
    });
    const existingIds = (already.result.values||[]).map(r=>String(r[1]||'').trim());
    if(existingIds.includes(applicant.id)) return true; // already pushed, not an error

    const empData = {
      region: applicant.region,
      infinixId: applicant.id, // placeholder until assigned a real Infinix ID
      fullName: applicant.fullName,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      middleName: applicant.middleName,
      storeAssignment: applicant.storeAssignment,
      storeId: applicant.storeId,
      status: 'Active',
      qrStatus: 'NOT SCANNED',
      deploymentDate: applicant.deploymentDate,
      deploymentStatus: 'DEPLOYED',
      rssName: applicant.rssName,
      rssId: applicant.rssId,
      mobile: applicant.mobile,
      email: applicant.email,
      contractStatus: 'NOT YET SENT',
      notes: `Promoted from Recruitment pipeline (${applicant.id})`
    };
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${ACTIVE_SHEET}!A:${SHEET_LAST_COL}`,
      valueInputOption:'RAW', insertDataOption:'INSERT_ROWS', resource:{ values:[objToRow(empData)] }
    });
    await writeLog(applicant.id, applicant.fullName, 'Deployed', 'Applicant', 'Active Workforce', `Promoted from Recruitment pipeline (${applicant.id})`);
    toast(`${applicant.fullName} pushed to Active Workforce`,'success');
    return true;
  }catch(e){
    console.error('Auto-push to Active failed:', e);
    const detail = e?.result?.error?.message || e?.message || 'unknown error — check connection';
    toast('Auto-push to Active failed — '+detail,'error');
    return false;
  }
}

async function deleteApplicant(id){
  if(!canDeleteRecords()){toast('You need HR/AGENCY or Owner access to delete records.','error');return;}
  const app = applicants.find(a=>a.id===id);
  if(!app) return;
  if(!confirm(`Delete applicant "${app.fullName||id}"? This cannot be undone.`)) return;
  try{
    showLoading(true,'Deleting…');
    const sheetMeta = await gapi.client.sheets.spreadsheets.get({spreadsheetId:SHEET_ID});
    const sheetObj = sheetMeta.result.sheets.find(s=>s.properties.title===APPLICANTS_SHEET);
    if(sheetObj){
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource:{ requests:[{ deleteDimension:{ range:{ sheetId:sheetObj.properties.sheetId, dimension:'ROWS', startIndex:app._row-1, endIndex:app._row } } }] }
      });
    }
    await loadApplicants(true);
    renderRecruitmentPage();
    toast('Applicant deleted','success');
  }catch(e){
    console.error(e);
    toast('Delete failed','error');
  }finally{
    showLoading(false);
  }
}

// ============================================================
// RENDER — Page shell
// ============================================================
async function renderRecruitmentPage(){
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = 'Recruitment & Training';

  document.getElementById('content').innerHTML = `
    <div class="rec-wrap">
      <div id="rec-kpi-row" class="rec-kpi-row">${_recKpiSkeleton()}</div>

      <div class="rec-section rec-section-full">
        <div class="rec-section-header">
          <div class="rec-section-title">Applicants</div>
          <div class="rec-toolbar">
            <input type="text" id="rec-search" class="rec-search-input" placeholder="Search name, batch, store…" value="${esc(recSearchTerm)}">
            <select id="rec-status-filter" class="rec-filter-select">
              <option value="">All Applicants</option>
              <option value="Initial Interview">Initial Interview</option>
              <option value="Final Interview">Final Interview</option>
              <option value="OBT">OBT</option>
              <option value="Backout">Backout</option>
            </select>
            <button class="rec-add-btn" id="rec-add-btn" onclick="openApplicantModal()">+ Add Applicant</button>
          </div>
        </div>
        <div id="rec-table-wrap" class="rec-table-wrap">${_recTableSkeleton()}</div>
      </div>

      <div class="rec-grid">
        <div class="rec-section">
          <div class="rec-section-header">
            <div class="rec-section-title">Training Schedule</div>
            <div class="rec-section-badge coming-soon">Coming Soon</div>
          </div>
          <div class="rec-placeholder-body">
            <div class="rec-ph-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
            </div>
            <div class="rec-ph-title">Training Calendar</div>
            <div class="rec-ph-sub">Schedule and track employee training sessions, product knowledge workshops, and onboarding batches.</div>
          </div>
        </div>

        <div class="rec-section">
          <div class="rec-section-header">
            <div class="rec-section-title">Recruitment Pipeline</div>
          </div>
          <div id="rec-pipeline" class="rec-pipeline-placeholder">${_recPipelineSkeleton()}</div>
        </div>
      </div>
    </div>

    <!-- Applicant Modal -->
    <div class="modal-overlay" id="rec-modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="rec-modal-title">Add Applicant</div>
          <button class="modal-close" onclick="closeApplicantModal()">&times;</button>
        </div>
        <div class="modal-body" id="rec-modal-body"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeApplicantModal()">Cancel</button>
          <button class="btn-primary" id="rec-modal-save-btn" onclick="submitApplicantForm()">Save Applicant</button>
        </div>
      </div>
    </div>
  `;

  _injectRecruitmentStyles();

  document.getElementById('rec-search').addEventListener('input', e=>{
    recSearchTerm = e.target.value;
    _renderApplicantsTable();
  });
  document.getElementById('rec-status-filter').addEventListener('change', e=>{
    recStatusFilter = e.target.value;
    _renderApplicantsTable();
  });

  if(!storeCacheLoaded) loadStoreDetails();
  await loadApplicants();
  _renderApplicantsTable();
  _renderKpis();
  _renderPipeline();
}

function _recKpiSkeleton(){
  return ['Total Applicants','Shortlisted','In Training','Onboarded'].map(label=>`
    <div class="rec-kpi-card">
      <div class="rec-kpi-body">
        <div class="rec-kpi-val">—</div>
        <div class="rec-kpi-label">${label}</div>
      </div>
    </div>`).join('');
}
function _recTableSkeleton(){
  return `<div class="rec-placeholder-body"><div class="rec-ph-sub">Loading applicants…</div></div>`;
}
function _recPipelineSkeleton(){
  return ['Screening','Interview','Job Offer','Pre-Employment','Onboarding'].map((stage,i)=>`
    <div class="rec-pipeline-stage">
      <div class="rec-stage-header"><div class="rec-stage-num">${String(i+1).padStart(2,'0')}</div><div class="rec-stage-name">${stage}</div></div>
      <div class="rec-stage-empty">—</div>
    </div>`).join('');
}

// ============================================================
// KPIs
// ============================================================
function _renderKpis(){
  // Pipeline KPIs reflect applicants still in the recruitment funnel — once
  // someone is Deployed they've moved on to Active Workforce and shouldn't
  // keep inflating these counts. "Onboarded" is the exception: it's meant
  // to track total successful conversions, so it counts all Deployed.
  const pipeline = applicants.filter(a=>normalizeFinalStatus(a.status)!=='DEPLOYED');
  const total = pipeline.length;
  const shortlisted = pipeline.filter(a=>normalizeFinalStatus(a.initInterviewResult)==='PASSED').length;
  const inTraining = pipeline.filter(a=>a.obtStartDate && normalizeFinalStatus(a.obtResult)!=='PASSED' && normalizeFinalStatus(a.obtResult)!=='FAILED' && normalizeFinalStatus(a.obtResult)!=='BACKOUT').length;
  const onboarded = applicants.filter(a=>normalizeFinalStatus(a.status)==='DEPLOYED').length;

  const cards = [
    {val:total, label:'Total Applicants', color:'var(--accent)'},
    {val:shortlisted, label:'Shortlisted', color:'#378ADD'},
    {val:inTraining, label:'In Training', color:'#FFD740'},
    {val:onboarded, label:'Onboarded', color:'#00E676'}
  ];
  document.getElementById('rec-kpi-row').innerHTML = cards.map(c=>`
    <div class="rec-kpi-card">
      <div class="rec-kpi-body">
        <div class="rec-kpi-val" style="color:${c.color}">${c.val}</div>
        <div class="rec-kpi-label">${c.label}</div>
      </div>
    </div>`).join('');
}

function _renderPipeline(){
  const stages = [
    {name:'Screening', count: applicants.filter(a=>!a.initInterviewDate).length},
    {name:'Interview', count: applicants.filter(a=>a.initInterviewDate && !a.finalInterviewDate).length},
    {name:'Job Offer', count: applicants.filter(a=>normalizeFinalStatus(a.finalInterviewResult)==='PASSED' && !a.obtStartDate).length},
    {name:'Pre-Employment', count: applicants.filter(a=>a.obtStartDate && normalizeFinalStatus(a.completeRequirements)!=='YES').length},
    {name:'Onboarding', count: applicants.filter(a=>normalizeFinalStatus(a.status)==='DEPLOYED').length}
  ];
  document.getElementById('rec-pipeline').innerHTML = stages.map((s,i)=>`
    <div class="rec-pipeline-stage">
      <div class="rec-stage-header"><div class="rec-stage-num">${String(i+1).padStart(2,'0')}</div><div class="rec-stage-name">${s.name}</div></div>
      <div class="rec-stage-count">${s.count}</div>
    </div>`).join('');
}

// ============================================================
// TABLE
// ============================================================
function _filteredApplicants(){
  let list = applicants.slice();
  if(recSearchTerm){
    const q = recSearchTerm.toLowerCase();
    list = list.filter(a =>
      String(a.fullName).toLowerCase().includes(q) ||
      String(a.batchNo).toLowerCase().includes(q) ||
      String(a.waveNo).toLowerCase().includes(q) ||
      String(a.storeAssignment).toLowerCase().includes(q) ||
      String(a.storeId).toLowerCase().includes(q) ||
      String(a.rssName).toLowerCase().includes(q)
    );
  }
  if(recStatusFilter) list = list.filter(a=>_applicantStage(a)===recStatusFilter);
  else {
    // Default view ("All Applicants"): Deployed applicants already live in
    // Active Workforce now, so keep them out of the day-to-day pipeline list.
    list = list.filter(a=>_applicantStage(a)!=='Deployed');
  }
  return list.sort((a,b)=>String(b.dateAdded).localeCompare(String(a.dateAdded)));
}
function _applicantStage(a){
  const status = normalizeFinalStatus(a.status);
  const initR = normalizeFinalStatus(a.initInterviewResult);
  const finalR = normalizeFinalStatus(a.finalInterviewResult);
  const obtR = normalizeFinalStatus(a.obtResult);
  if(status==='DEPLOYED') return 'Deployed';
  if(status==='BACKOUT' || initR==='BACKOUT' || finalR==='BACKOUT' || obtR==='BACKOUT') return 'Backout';
  if(a.obtStartDate || a.obtResult) return 'OBT';
  if(a.finalInterviewDate || a.finalInterviewResult) return 'Final Interview';
  return 'Initial Interview';
}
function _statusBadgeClass(status){
  const s = normalizeFinalStatus(status);
  if(s==='DEPLOYED') return 'rec-badge-success';
  if(s==='BACKOUT') return 'rec-badge-danger';
  return 'rec-badge-pending';
}
function _resultBadge(result){
  const r = normalizeFinalStatus(result);
  if(!r) return '<span class="rec-result-dash">—</span>';
  if(r==='PASSED') return '<span class="rec-result rec-result-pass">PASSED</span>';
  if(r==='FAILED') return '<span class="rec-result rec-result-fail">FAILED</span>';
  if(r==='BACKOUT') return '<span class="rec-result rec-result-backout">BACKOUT</span>';
  return esc(result);
}
function _applicantsHeaderRow(){
  return `<div class="rec-grid-row rec-grid-head">
    <div>Applicant</div>
    <div>Batch / Wave</div>
    <div>Store</div>
    <div>Initial Int.</div>
    <div>Final Int.</div>
    <div>OBT</div>
    <div>Status</div>
    <div></div>
  </div>`;
}
function _renderApplicantsTable(){
  const wrap = document.getElementById('rec-table-wrap');
  if(!wrap) return;
  const list = _filteredApplicants();

  if(!list.length){
    wrap.innerHTML = `<div class="rec-placeholder-body">
      <div class="rec-ph-title">No applicants yet</div>
      <div class="rec-ph-sub">Click "+ Add Applicant" to start tracking your recruitment pipeline.</div>
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="rec-table-scroll">
      <div class="rec-applist">
        ${_applicantsHeaderRow()}
        ${list.map(a=>`
          <div class="rec-grid-row rec-grid-body" onclick="openApplicantModal('${esc(a.id)}')">
            <div>
              <div class="rec-cell-name" title="${esc(a.fullName)}">${esc(a.fullName)||'—'}</div>
              <div class="rec-cell-sub">${esc(a.position)||''}${a.mobile?' · '+esc(a.mobile):''}</div>
            </div>
            <div>${esc(a.batchNo)}${a.waveNo?'-'+esc(a.waveNo):''}</div>
            <div>
              <div class="rec-cell-name" title="${esc(a.storeAssignment)}">${esc(a.storeAssignment)||'—'}</div>
              <div class="rec-cell-sub">${esc(a.storeId)||''}</div>
            </div>
            <div>${_resultBadge(a.initInterviewResult)}</div>
            <div>${_resultBadge(a.finalInterviewResult)}</div>
            <div>${_resultBadge(a.obtResult)}</div>
            <div><span class="rec-badge ${_statusBadgeClass(a.status)}">${esc(a.status)||'In Progress'}</span></div>
            <div class="rec-cell-actions">
              <button class="rec-icon-btn" title="Edit" onclick="event.stopPropagation();openApplicantModal('${esc(a.id)}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button class="rec-icon-btn rec-icon-danger" title="Delete" onclick="event.stopPropagation();deleteApplicant('${esc(a.id)}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
              </button>
            </div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

// ============================================================
// FORM / MODAL
// ============================================================
function openApplicantModal(id){
  if(id && !canWrite()){denyWrite();return;}
  editingApplicantId = id||null;
  const a = id ? applicants.find(x=>x.id===id) : null;
  document.getElementById('rec-modal-title').textContent = a ? `Edit — ${a.fullName||a.id}` : 'Add Applicant';
  document.getElementById('rec-modal-save-btn').textContent = a ? 'Update Applicant' : 'Save Applicant';
  document.getElementById('rec-modal-body').innerHTML = _applicantFormHTML(a);
  document.getElementById('rec-modal-overlay').classList.add('open');

  const storeIdEl = document.getElementById('raf_storeId');
  if(storeIdEl) storeIdEl.addEventListener('input', _onApplicantStoreIdInput);
  if(a && a.storeId) _onApplicantStoreIdInput();

  ['raf_firstName','raf_lastName','raf_middleName'].forEach(fid=>{
    const el = document.getElementById(fid);
    if(!el) return;
    el.addEventListener('input', _updateApplicantFullName);
    el.addEventListener('blur', ()=>{ el.value = _toTitleCase(el.value.trim()); _updateApplicantFullName(); });
  });
  _updateApplicantFullName();

  const mobileEl = document.getElementById('raf_mobile');
  if(mobileEl){
    mobileEl.addEventListener('blur', ()=>{
      const formatted = _formatMobile(mobileEl.value);
      mobileEl.value = formatted;
      mobileEl.classList.toggle('err', !!formatted && !_isValidMobile(formatted));
    });
  }
  const emailEl = document.getElementById('raf_email');
  if(emailEl){
    emailEl.addEventListener('blur', ()=>{
      const v = emailEl.value.trim().toLowerCase();
      emailEl.value = v;
      emailEl.classList.toggle('err', !!v && !_isValidEmail(v));
    });
  }

  document.querySelectorAll('#raf-tabs .rec-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>_switchApplicantTab(btn.dataset.tab));
  });
  _switchApplicantTab(_defaultApplicantTab(a));
}
function _toTitleCase(s){
  return String(s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase());
}
function _formatMobile(raw){
  let digits = String(raw||'').replace(/\D/g,'');
  // Convert +63XXXXXXXXXX or 63XXXXXXXXXX to 09XXXXXXXXX
  if(digits.startsWith('63') && digits.length===12) digits = '0'+digits.slice(2);
  if(digits.length===10 && digits.startsWith('9')) digits = '0'+digits;
  return digits;
}
function _isValidMobile(v){
  return /^09\d{9}$/.test(v);
}
function _isValidEmail(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function _updateApplicantFullName(){
  const first = document.getElementById('raf_firstName')?.value.trim() || '';
  const last = document.getElementById('raf_lastName')?.value.trim() || '';
  const middle = document.getElementById('raf_middleName')?.value.trim() || '';
  const fullNameEl = document.getElementById('raf_fullName');
  if(!fullNameEl) return;
  const middleInitial = middle ? middle.charAt(0).toUpperCase()+'.' : '';
  fullNameEl.value = [first, middleInitial, last].filter(Boolean).join(' ');
}
function closeApplicantModal(){
  document.getElementById('rec-modal-overlay').classList.remove('open');
  editingApplicantId = null;
}
function _onApplicantStoreIdInput(){
  const idEl = document.getElementById('raf_storeId');
  const storeEl = document.getElementById('raf_storeAssignment');
  const regionEl = document.getElementById('raf_region');
  const rssNameEl = document.getElementById('raf_rssName');
  const rssIdEl = document.getElementById('raf_rssId');
  const statusEl = document.getElementById('raf-store-status');
  if(!idEl) return;
  const shopId = idEl.value.trim();
  if(!shopId){
    statusEl.textContent = '';
    [storeEl,regionEl,rssNameEl,rssIdEl].forEach(el=>{ if(el) el.readOnly=false; });
    return;
  }
  const found = lookupStore(shopId);
  if(found){
    if(storeEl){ storeEl.value = found.storeName; storeEl.readOnly = !!found.storeName; }
    if(regionEl){ regionEl.value = found.region; regionEl.readOnly = !!found.region; }
    if(rssNameEl){ rssNameEl.value = found.rssName; rssNameEl.readOnly = !!found.rssName; }
    if(rssIdEl){ rssIdEl.value = found.rssId; rssIdEl.readOnly = !!found.rssId; }
    statusEl.textContent = `Store found: ${found.storeName}${found.region?' · '+found.region:''}`;
    statusEl.className = 'store-lookup-status found';
  } else {
    [storeEl,regionEl,rssNameEl,rssIdEl].forEach(el=>{ if(el) el.readOnly=false; });
    statusEl.textContent = storeCacheLoaded ? 'Store ID not found — enter fields manually' : 'Store list loading…';
    statusEl.className = 'store-lookup-status '+(storeCacheLoaded?'notfound':'searching');
  }
}
function _opt(list, current){
  return list.map(v=>`<option value="${esc(v)}" ${String(v)===String(current||'')?'selected':''}>${v||'— Select —'}</option>`).join('');
}
function _applicantFormHTML(a){
  a = a || {};
  return `
    <div class="rec-form">

      <div class="rec-form-section-label">Batch & Assignment</div>
      <div class="rec-form-row">
        <div class="field"><label>Batch No. <span class="req">*</span></label><input id="raf_batchNo" type="text" placeholder="e.g. 9" value="${esc(a.batchNo)}"></div>
        <div class="field"><label>Wave No.</label><input id="raf_waveNo" type="text" placeholder="e.g. 1" value="${esc(a.waveNo)}"></div>
      </div>
      <div class="rec-form-row">
        <div class="field">
          <label>Store ID (Shop ID) <span class="req">*</span></label>
          <input id="raf_storeId" type="text" placeholder="Type Shop ID to auto-fill" value="${esc(a.storeId)}">
          <div class="store-lookup-status" id="raf-store-status">${storeCacheLoaded?'Enter Store ID to auto-fill':'Loading store list…'}</div>
        </div>
        <div class="field"><label>Store Assignment</label><input id="raf_storeAssignment" type="text" placeholder="Auto-filled or enter manually" value="${esc(a.storeAssignment)}"></div>
      </div>
      <div class="rec-form-row">
        <div class="field"><label>Region</label><input id="raf_region" type="text" placeholder="Auto-filled" value="${esc(a.region)}"></div>
      </div>
      <div class="rec-form-row">
        <div class="field"><label>RSS Name</label><input id="raf_rssName" type="text" placeholder="Auto-filled" value="${esc(a.rssName)}"></div>
        <div class="field"><label>RSS ID</label><input id="raf_rssId" type="text" placeholder="Auto-filled" value="${esc(a.rssId)}"></div>
      </div>

      <div class="rec-form-section-label">Applicant Info</div>
      <div class="rec-form-row">
        <div class="field"><label>First Name <span class="req">*</span></label><input id="raf_firstName" type="text" value="${esc(a.firstName)}"></div>
        <div class="field"><label>Last Name <span class="req">*</span></label><input id="raf_lastName" type="text" value="${esc(a.lastName)}"></div>
      </div>
      <div class="rec-form-row">
        <div class="field"><label>Middle Name</label><input id="raf_middleName" type="text" value="${esc(a.middleName)}"></div>
        <div class="field"><label>Full Name</label><input id="raf_fullName" type="text" readonly placeholder="Auto-filled from name fields" value="${esc(a.fullName)}"></div>
      </div>
      <div class="rec-form-row">
        <div class="field"><label>Position <span class="req">*</span></label><select id="raf_position">${_opt(['',...APPLICANT_POSITIONS], a.position)}</select></div>
        <div class="field"><label>Mobile No. <span class="req">*</span></label><input id="raf_mobile" type="text" placeholder="09XXXXXXXXX" value="${esc(a.mobile)}"></div>
      </div>
      <div class="rec-form-row">
        <div class="field"><label>Email Address</label><input id="raf_email" type="email" value="${esc(a.email)}"></div>
      </div>

      <div class="rec-form-section-label">Pipeline Stage</div>
      <div class="rec-tabs" id="raf-tabs">
        <button type="button" class="rec-tab" data-tab="init">Initial Interview${(a.initInterviewDate||a.initInterviewResult)?' <span class=\"rec-tab-dot\"></span>':''}</button>
        <button type="button" class="rec-tab" data-tab="final">Final Interview${(a.finalInterviewDate||a.finalInterviewResult)?' <span class=\"rec-tab-dot\"></span>':''}</button>
        <button type="button" class="rec-tab" data-tab="obt">OBT${(a.obtStartDate||a.obtResult)?' <span class=\"rec-tab-dot\"></span>':''}</button>
        <button type="button" class="rec-tab" data-tab="deploy">Deployment &amp; Uniform${(a.deploymentDate||a.status)?' <span class=\"rec-tab-dot\"></span>':''}</button>
      </div>

      <div class="rec-tab-panel" data-panel="init">
        <div class="rec-form-row">
          <div class="field"><label>Date</label><input id="raf_initInterviewDate" type="date" value="${esc(a.initInterviewDate)}"></div>
          <div class="field"><label>Result</label><select id="raf_initInterviewResult">${_opt(INTERVIEW_RESULTS, a.initInterviewResult)}</select></div>
        </div>
        <div class="field"><label>Remarks</label><input id="raf_initInterviewRemarks" type="text" value="${esc(a.initInterviewRemarks)}"></div>
      </div>

      <div class="rec-tab-panel" data-panel="final">
        <div class="rec-form-row">
          <div class="field"><label>Date</label><input id="raf_finalInterviewDate" type="date" value="${esc(a.finalInterviewDate)}"></div>
          <div class="field"><label>Result</label><select id="raf_finalInterviewResult">${_opt(INTERVIEW_RESULTS, a.finalInterviewResult)}</select></div>
        </div>
        <div class="field"><label>Remarks</label><input id="raf_finalInterviewRemarks" type="text" value="${esc(a.finalInterviewRemarks)}"></div>
      </div>

      <div class="rec-tab-panel" data-panel="obt">
        <div class="rec-form-row">
          <div class="field"><label>Start Date</label><input id="raf_obtStartDate" type="date" value="${esc(a.obtStartDate)}"></div>
          <div class="field"><label>Result</label><select id="raf_obtResult">${_opt(INTERVIEW_RESULTS, a.obtResult)}</select></div>
        </div>
        <div class="field"><label>Remarks</label><input id="raf_obtRemarks" type="text" value="${esc(a.obtRemarks)}"></div>
      </div>

      <div class="rec-tab-panel" data-panel="deploy">
        <div class="rec-form-row">
          <div class="field"><label>Deployment Date</label><input id="raf_deploymentDate" type="date" value="${esc(a.deploymentDate)}"></div>
          <div class="field"><label>Status</label><select id="raf_status">${_opt(FINAL_STATUSES, a.status)}</select></div>
        </div>
        <div class="field">
          <label>Complete Requirements</label>
          <select id="raf_completeRequirements">${_opt(['','Yes','No'], a.completeRequirements)}</select>
        </div>
        <div class="rec-form-row">
          <div class="field"><label>Uniform Size</label><select id="raf_uniformSize">${_opt(UNIFORM_SIZES, a.uniformSize)}</select></div>
          <div class="field"><label>Uniform Delivered Date</label><input id="raf_uniformDeliveredDate" type="date" value="${esc(a.uniformDeliveredDate)}"></div>
        </div>
      </div>

    </div>
  `;
}
function _defaultApplicantTab(a){
  a = a||{};
  if(a.deploymentDate || a.status || a.completeRequirements || a.uniformSize) return 'deploy';
  if(a.obtStartDate || a.obtResult) return 'obt';
  if(a.finalInterviewDate || a.finalInterviewResult) return 'final';
  return 'init';
}
function _switchApplicantTab(tab){
  document.querySelectorAll('#raf-tabs .rec-tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tab===tab);
  });
  document.querySelectorAll('.rec-tab-panel').forEach(panel=>{
    panel.classList.toggle('active', panel.dataset.panel===tab);
  });
}
async function submitApplicantForm(){
  if(!canWrite()){denyWrite();return;}
  const g = id => document.getElementById(id)?.value?.trim() || '';

  // Clear previous error states
  document.querySelectorAll('.rec-form .field input.err, .rec-form .field select.err').forEach(el=>el.classList.remove('err'));

  const firstName = _toTitleCase(g('raf_firstName'));
  const lastName = _toTitleCase(g('raf_lastName'));
  const middleName = _toTitleCase(g('raf_middleName'));
  const batchNo = g('raf_batchNo');
  const storeId = g('raf_storeId');
  const position = g('raf_position');
  const mobile = _formatMobile(g('raf_mobile'));
  const email = g('raf_email').toLowerCase();
  const status = g('raf_status');
  const deploymentDate = g('raf_deploymentDate');

  const errors = [];
  if(!batchNo) errors.push({id:'raf_batchNo', msg:'Batch No. is required'});
  if(!storeId) errors.push({id:'raf_storeId', msg:'Store ID is required'});
  if(!firstName) errors.push({id:'raf_firstName', msg:'First Name is required'});
  if(!lastName) errors.push({id:'raf_lastName', msg:'Last Name is required'});
  if(!position) errors.push({id:'raf_position', msg:'Position is required'});
  if(!mobile) errors.push({id:'raf_mobile', msg:'Mobile No. is required'});
  else if(!_isValidMobile(mobile)) errors.push({id:'raf_mobile', msg:'Mobile No. must be a valid PH number (e.g. 09171234567)'});
  if(email && !_isValidEmail(email)) errors.push({id:'raf_email', msg:'Email Address format is invalid'});
  if(normalizeFinalStatus(status)==='DEPLOYED' && !deploymentDate){
    errors.push({id:'raf_deploymentDate', msg:'Deployment Date is required when Status is Deployed', tab:'deploy'});
  }

  if(errors.length){
    errors.forEach(err=>{
      const el = document.getElementById(err.id);
      if(el) el.classList.add('err');
    });
    const first = errors[0];
    if(first.tab) _switchApplicantTab(first.tab);
    document.getElementById(first.id)?.scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById(first.id)?.focus();
    toast(first.msg,'error');
    return;
  }

  const fullName = g('raf_fullName');

  const data = {
    batchNo, waveNo: g('raf_waveNo'),
    region: g('raf_region'), rssName: g('raf_rssName'), rssId: g('raf_rssId'),
    storeAssignment: g('raf_storeAssignment'), storeId,
    fullName, firstName, lastName, middleName,
    position, mobile, email,
    initInterviewDate: g('raf_initInterviewDate'), initInterviewResult: g('raf_initInterviewResult'), initInterviewRemarks: g('raf_initInterviewRemarks'),
    finalInterviewDate: g('raf_finalInterviewDate'), finalInterviewResult: g('raf_finalInterviewResult'), finalInterviewRemarks: g('raf_finalInterviewRemarks'),
    obtStartDate: g('raf_obtStartDate'), obtResult: g('raf_obtResult'), obtRemarks: g('raf_obtRemarks'),
    deploymentDate, status, completeRequirements: g('raf_completeRequirements'),
    uniformSize: g('raf_uniformSize'), uniformDeliveredDate: g('raf_uniformDeliveredDate')
  };

  const ok = await saveApplicant(data);
  if(ok){
    closeApplicantModal();
    _renderApplicantsTable();
    _renderKpis();
    _renderPipeline();
  }
}

// ============================================================
// STYLES
// ============================================================
function _injectRecruitmentStyles(){
  if(document.getElementById('page-rec-styles')) document.getElementById('page-rec-styles').remove();
  const s = document.createElement('style');
  s.id = 'page-rec-styles';
  s.textContent = `
  .rec-wrap { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }

  .rec-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  @media(max-width:900px){ .rec-kpi-row { grid-template-columns: 1fr 1fr; } }
  @media(max-width:560px){ .rec-kpi-row { grid-template-columns: 1fr; } }
  .rec-kpi-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; transition: transform .15s, border-color .15s; }
  .rec-kpi-card:hover { transform: translateY(-2px); border-color: var(--border2); }
  .rec-kpi-val { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.1; }
  .rec-kpi-label { font-size: 11px; color: var(--text3); margin-top: 3px; }

  .rec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media(max-width:1100px){ .rec-grid { grid-template-columns: 1fr; } }

  .rec-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .rec-section-full { width: 100%; }

  .rec-section-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); background: rgba(0,200,170,.03); }
  .rec-section-title { font-size: 12px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: .5px; }
  .rec-section-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: .5px; }
  .rec-section-badge.coming-soon { background: rgba(255,215,64,.1); color: #FFD740; border: 1px solid rgba(255,215,64,.3); }

  .rec-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .rec-search-input, .rec-filter-select {
    background: var(--bg-frosted); border: 1px solid var(--border); color: var(--text);
    border-radius: 8px; padding: 7px 10px; font-size: 12px; outline: none;
  }
  .rec-search-input { width: 200px; }
  .rec-search-input:focus, .rec-filter-select:focus { border-color: var(--accent); }

  .rec-add-btn {
    background: var(--accent); color: #fff; border: none; border-radius: 8px;
    padding: 8px 16px; font-size: 12px; font-weight: 700; letter-spacing: -0.1px;
    cursor: pointer; transition: filter .15s, transform .15s; white-space: nowrap;
  }
  .rec-add-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .rec-add-btn:active { transform: translateY(0); }

  .rec-placeholder-body { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 20px; text-align: center; gap: 10px; }
  .rec-ph-icon { color: var(--text3); opacity: .5; margin-bottom: 4px; }
  .rec-ph-title { font-size: 13px; font-weight: 700; color: var(--text2); }
  .rec-ph-sub { font-size: 12px; color: var(--text3); line-height: 1.6; max-width: 280px; }

  .rec-pipeline-placeholder { display: flex; flex-direction: column; padding: 12px; gap: 8px; }
  .rec-pipeline-stage { background: var(--bg-frosted); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; }
  .rec-stage-header { display: flex; align-items: center; gap: 8px; }
  .rec-stage-num { font-size: 10px; font-weight: 700; color: var(--text3); }
  .rec-stage-name { font-size: 11px; font-weight: 700; color: var(--text); }
  .rec-stage-empty { font-size: 11px; color: var(--text3); font-style: italic; }
  .rec-stage-count { font-size: 16px; font-weight: 800; color: var(--accent); }

  .rec-table-wrap { overflow: hidden; }
  .rec-table-scroll { overflow-x: auto; }
  .rec-applist { min-width: 760px; font-size: 12px; }
  .rec-grid-row {
    display: grid;
    grid-template-columns: 1.8fr 0.8fr 1.8fr 0.85fr 0.85fr 0.7fr 0.85fr 76px;
    align-items: center;
    column-gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  .rec-grid-row > div:nth-child(4),
  .rec-grid-row > div:nth-child(5),
  .rec-grid-row > div:nth-child(6),
  .rec-grid-row > div:nth-child(7) { text-align: center; }
  .rec-grid-head { color: var(--text3); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: .4px; }
  .rec-grid-body { cursor: pointer; }
  .rec-grid-body:hover { background: rgba(0,200,170,.03); }
  .rec-cell-name { font-weight: 600; color: var(--text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec-cell-sub { font-size: 11px; color: var(--text3); margin-top: 2px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec-cell-actions { display: flex; gap: 6px; justify-content: flex-end; }

  .rec-icon-btn { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg-frosted); color: var(--text2); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; }
  .rec-icon-btn:hover { border-color: var(--accent); color: var(--accent); }
  .rec-icon-btn.rec-icon-danger:hover { border-color: #C62828; color: #C62828; }

  .rec-badge { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 20px; text-transform: uppercase; letter-spacing: .3px; }
  .rec-badge-success { background: rgba(0,230,118,.12); color: #00E676; border: 1px solid rgba(0,230,118,.3); }
  .rec-badge-danger { background: rgba(198,40,40,.12); color: #EF5350; border: 1px solid rgba(198,40,40,.3); }
  .rec-badge-pending { background: rgba(255,215,64,.12); color: #FFD740; border: 1px solid rgba(255,215,64,.3); }

  .rec-result { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
  .rec-result-pass { background: rgba(0,230,118,.12); color: #00E676; }
  .rec-result-fail { background: rgba(198,40,40,.12); color: #EF5350; }
  .rec-result-backout { background: rgba(255,152,0,.12); color: #FFA726; }
  .rec-result-dash { color: var(--text3); }

  /* Modal form */
  #rec-modal-overlay.modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; }
  #rec-modal-overlay.modal-overlay.open { display:flex; }
  #rec-modal-overlay .modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); width: 560px; max-width: 92vw; max-height: 88vh; display: flex; flex-direction: column; }
  #rec-modal-overlay .modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); }
  #rec-modal-overlay .modal-title { font-size:14px; font-weight:700; color:var(--text); }
  #rec-modal-overlay .modal-close { background:none; border:none; color:var(--text3); font-size:20px; cursor:pointer; line-height:1; }
  #rec-modal-overlay .modal-body { padding:18px 20px; overflow-y:auto; flex:1; }
  #rec-modal-overlay .modal-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid var(--border); }

  .rec-form-section-label { font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
  .rec-form-section-label:first-child { margin-top: 0; }

  .rec-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; flex-wrap: nowrap; overflow-x: auto; }
  .rec-tab {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--text3); font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .3px; padding: 8px 10px; cursor: pointer; transition: color .15s, border-color .15s;
    white-space: nowrap; flex-shrink: 0;
  }
  .rec-tab:hover { color: var(--text2); }
  .rec-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .rec-tab-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); margin-left: 3px; vertical-align: middle; }
  .rec-tab-panel { display: none; }
  .rec-tab-panel.active { display: block; }
  .rec-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
  @media(max-width:480px){ .rec-form-row { grid-template-columns: 1fr; } }
  .rec-form .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
  .rec-form .field label { font-size: 11px; color: var(--text3); font-weight: 600; }
  .rec-form .field input, .rec-form .field select {
    background: var(--bg-frosted); border: 1px solid var(--border); color: var(--text);
    border-radius: 8px; padding: 8px 10px; font-size: 12px; outline: none;
  }
  .rec-form .field input:focus, .rec-form .field select:focus { border-color: var(--accent); }
  .rec-form .field input[readonly] { opacity: .7; cursor: not-allowed; }
  .rec-form .field input.err, .rec-form .field select.err { border-color: #EF5350; box-shadow: 0 0 0 1px rgba(239,83,80,.25); }
  .req { color: #EF5350; font-weight: 700; }

  .store-lookup-status { font-size: 11px; margin-top: 2px; }
  .store-lookup-status.found { color: #00E676; }
  .store-lookup-status.notfound { color: #EF5350; }
  .store-lookup-status.searching { color: var(--text3); }
  `;
  document.head.appendChild(s);
}
