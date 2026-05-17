// ============================================================
// CONFIG
// ============================================================
// CLIENT_ID and SHEET_ID are loaded from config.js (gitignored).
// See config.example.js for setup instructions.
const SCOPES      = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';
const DISCOVERY   = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const ACTIVE_SHEET        = 'Active';
const INACTIVE_SHEET      = 'Inactive';
const LOG_SHEET           = 'Log';
const STORE_DETAILS_SHEET = 'Store Details';
const ROLE_LOG_SHEET      = 'Role Logs';
const PAGE_SIZE_DEFAULT   = 50;

const STATUSES = ['Active','Floating','Resigned','AWOL','Terminated','Backout'];
const STATUS_COLORS = { Active:'#4ecb71', Floating:'#f5c842', Resigned:'#e8a24a', AWOL:'#e05c5c', Terminated:'#a07ac4', Backout:'#e05c5c' };
const REGIONS = ['NCR','NORTH LUZON','CENTRAL LUZON','SOUTH LUZON','VISAYAS','MINDANAO'];

const HEADERS = [
  'Region','Infinix Employee ID','Full Name','First Name','Last Name','Middle Name','Employment Status','Store Assignment','Store ID','QR Scan Status',
  'Deployment Date','Deployment Status','RSS Name','RSS ID','Basic Wage Rate','Address','Mobile No.','Email Address','Date of Birth','Gender','Marital Status',
  'SSS Number','PhilHealth Number','Pag-IBIG Number','TIN Number','Bank Name','Bank Account Number','Contract Status','Contract Sent Date','Pre-Employment Forms','Job Offer',
  'Status Effective Date','Status Remarks','Last Updated','Notes','Medical Certificate','Government Numbers / IDs','NBI / Police / Barangay Clearance','2x2 ID Picture',
  'Valid IDs','Birth Certificate','Diploma / TOR','COE from Previous Employer'
];
const SHEET_LAST_COL = 'AQ';
const LOG_HEADERS = ['Timestamp','Employee ID','Employee Name','Action','From Status','To Status','Updated By'];
const ROLE_LOG_HEADERS = ['Email','Role','Password/PIN','Status','Timestamp'];
const BANK_OPTIONS = ['','CTBC Bank (Philippines)','Union Bank of the Philippines'];

const REQUIREMENT_FIELDS = [
  ['medicalCert','Medical Certificate (CBC, X-ray, Fecalysis, Urinalysis, Drug Test and PT)'],
  ['govForms','SSS, Pag-IBIG, PhilHealth and TIN (Number/ID or Government forms)'],
  ['clearance','NBI / Police Clearance / Barangay Certificate'],
  ['idPicture','2x2 ID Picture with white background, formal attire'],
  ['validIdCopy','Clear scanned copy of ALL Valid ID'],
  ['birthCert','Birth Certificate'],
  ['diplomaTor','Diploma or TOR (College)'],
  ['previousCoe','Certificate of Employment (optional — skip if no prev employer)'],
  ['preEmploymentForms','Pre-Employment Forms'],
  ['jobOffer','Job Offer']
];
// Required fields excluding optional COE — used for completion calculation
const REQUIRED_FIELDS = ['medicalCert','govForms','clearance','idPicture','validIdCopy','birthCert','diplomaTor','preEmploymentForms','jobOffer'];

const TABLE_COLUMNS = [
  { key:'fullName',        label:'Full Name',       always:true },
  { key:'infinixId',       label:'Infinix ID',      always:true },
  { key:'status',          label:'Status',          always:false },
  { key:'statusDate',      label:'Status Date',     always:false },
  { key:'deploymentDate',  label:'Deploy Date',     always:false },
  { key:'deploymentStatus',label:'Deploy Status',   always:false },
  { key:'requirements',    label:'Requirements',    always:false },
  { key:'qrStatus',        label:'QR Status',       always:false },
  { key:'region',          label:'Region',          always:false },
  { key:'storeAssignment', label:'Store',           always:false },
  { key:'storeId',         label:'Store ID',        always:false },
  { key:'rssName',         label:'RSS Name',        always:false },
  { key:'bankName',        label:'Bank',            always:false },
  { key:'contractStatus',  label:'Contract',        always:false },
];

// ============================================================
// STATE
// ============================================================
let tokenClient, gapiInited=false, gisInited=false;
let accessToken=null, currentUser=null;
let employees=[], currentView='dashboard', filterStatus=null, editingId=null;
let currentPage=1, pageSize=PAGE_SIZE_DEFAULT;
let sortCol=null, sortDir=1;
let selectedIds=new Set();
let filterRegion='', filterDeployStatus='', filterQR='', filterContractStatus='';
let detailEmpId=null;
let logCache=null;
let _charts={};
let storeCache={}, storeCacheLoaded=false;
let visibleCols=new Set(TABLE_COLUMNS.map(c=>c.key));
let missingFieldFilter=null;
let bulkMode=false;
let trackerDateFrom='', trackerDateTo='', trackerRegion='';

// ============================================================
// XSS-safe escape helper
// ============================================================
function esc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ============================================================
// THEME
// ============================================================
function initTheme(){
  const saved=localStorage.getItem('hr_theme')||'dark';
  document.documentElement.setAttribute('data-theme',saved);
  updateThemeIcon(saved);
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('hr_theme',next);
  updateThemeIcon(next);
  if(currentView==='dashboard') renderDashboard();
}
function updateThemeIcon(theme){
  document.getElementById('theme-icon-dark').style.display=theme==='dark'?'':'none';
  document.getElementById('theme-icon-light').style.display=theme==='light'?'':'none';
}
initTheme();

// ============================================================
// PREMIUM — SIDEBAR COLLAPSE
// ============================================================
let sidebarCollapsed = false;
function initSidebar(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  // Inject collapse button
  const btn = document.createElement('button');
  btn.className = 'sidebar-collapse-btn';
  btn.title = 'Collapse sidebar';
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  btn.onclick = toggleSidebar;
  sidebar.appendChild(btn);
  sidebarCollapsed = localStorage.getItem('hr_sidebar_collapsed') === '1';
  if(sidebarCollapsed) sidebar.classList.add('collapsed');
}
function toggleSidebar(){
  const sidebar = document.getElementById('sidebar');
  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  localStorage.setItem('hr_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
}

// ============================================================
// PREMIUM — KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', e => {
  // Ctrl+K or Cmd+K — focus search
  if((e.ctrlKey || e.metaKey) && e.key === 'k'){
    e.preventDefault();
    const si = document.getElementById('search-input');
    if(si && si.style.display !== 'none'){
      si.focus();
      si.select();
    }
  }
  // Escape — close modals / detail panel
  if(e.key === 'Escape'){
    if(document.getElementById('modal-overlay')?.classList.contains('open')){ closeModal(); return; }
    if(document.getElementById('confirm-overlay')?.classList.contains('open')){ closeConfirm(); return; }
    if(document.getElementById('pw-manager-overlay')?.classList.contains('open')){ closePwManager(); return; }
    if(document.getElementById('detail-panel')?.classList.contains('open')){ closeDetailPanel(); return; }
    if(!document.getElementById('role-overlay')?.classList.contains('hidden')){ closeRoleModal(); return; }
  }
  // Ctrl+S — save form if open
  if((e.ctrlKey || e.metaKey) && e.key === 's'){
    if(document.getElementById('modal-overlay')?.classList.contains('open')){
      e.preventDefault();
      saveEmployee();
    }
  }
});

// ============================================================
// PREMIUM — FORM DRAFT AUTOSAVE
// ============================================================
const DRAFT_KEY = 'hr_form_draft';
function saveDraft(){
  try{
    const data = gatherForm();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({data, editingId, ts: Date.now()}));
  }catch(e){}
}
function clearDraft(){ localStorage.removeItem(DRAFT_KEY); }
function loadDraft(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return null;
    const d = JSON.parse(raw);
    // Discard drafts older than 2 hours
    if(Date.now() - d.ts > 7200000){ clearDraft(); return null; }
    return d;
  }catch(e){ return null; }
}
function injectDraftBanner(draft){
  const body = document.getElementById('modal-body');
  if(!body || !draft) return;
  const name = `${draft.data.firstName||''} ${draft.data.lastName||''}`.trim() || 'Unsaved employee';
  const when = new Date(draft.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const banner = document.createElement('div');
  banner.className = 'draft-banner';
  banner.id = 'draft-banner';
  banner.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
    Draft restored for <b style="margin:0 4px">${esc(name)}</b> from ${esc(when)}
    <button class="btn btn-ghost btn-sm" onclick="clearDraft();document.getElementById('draft-banner')?.remove()">Discard</button>`;
  body.prepend(banner);
}
function restoreDraftToForm(draft){
  if(!draft?.data) return;
  const d = draft.data;
  Object.keys(d).forEach(k => {
    const el = document.getElementById('f_' + k);
    if(!el) return;
    if(el.type === 'checkbox') el.checked = !!d[k];
    else el.value = d[k] || '';
  });
  updateFullName();
}

// ============================================================
// EXPORT EXCEL (Owner & HR/AGENCY only)
// ============================================================
function exportXLSX(){
  if(!canViewSensitive()){ toast('Export is restricted to HR/AGENCY and Owner only.','error'); return; }
  if(typeof XLSX === 'undefined'){ toast('Excel library not loaded — please refresh and try again.','error'); return; }
  const type = currentView === 'inactive' ? 'inactive' : 'active';
  const list = filteredEmployees(type);
  if(!list.length){ toast('No records to export','error'); return; }

  const allKeys = [
    'infinixId','fullName','status','statusDate','statusRemarks',
    'region','storeAssignment','storeId','rssName','rssId',
    'deploymentDate','deploymentStatus','qrStatus','contractStatus','contractSentDate',
    'firstName','lastName','middleName','dob','gender','maritalStatus',
    'mobile','email','address',
    'sss','philhealth','pagibig','tin',
    'basicWage','bankName','bankAccount',
    'medicalCert','govForms','clearance','idPicture','validIdCopy',
    'birthCert','diplomaTor','previousCoe','preEmploymentForms','jobOffer',
    'notes','lastUpdated'
  ];
  const allLabels = {
    infinixId:'Infinix ID', fullName:'Full Name', status:'Status',
    statusDate:'Status Date', statusRemarks:'Status Remarks',
    region:'Region', storeAssignment:'Store', storeId:'Store ID',
    rssName:'RSS Name', rssId:'RSS ID',
    deploymentDate:'Deploy Date', deploymentStatus:'Deploy Status',
    qrStatus:'QR Status', contractStatus:'Contract Status', contractSentDate:'Contract Sent Date',
    firstName:'First Name', lastName:'Last Name', middleName:'Middle Name',
    dob:'Date of Birth', gender:'Gender', maritalStatus:'Marital Status',
    mobile:'Mobile No.', email:'Email', address:'Address',
    sss:'SSS Number', philhealth:'PhilHealth', pagibig:'Pag-IBIG', tin:'TIN',
    basicWage:'Basic Wage', bankName:'Bank', bankAccount:'Bank Account No.',
    medicalCert:'Medical Certificate', govForms:'Gov IDs/Forms',
    clearance:'NBI/Police/Brgy Clearance', idPicture:'2x2 ID Picture',
    validIdCopy:'Valid ID Copy', birthCert:'Birth Certificate',
    diplomaTor:'Diploma/TOR', previousCoe:'COE (Previous)',
    preEmploymentForms:'Pre-Employment Forms', jobOffer:'Job Offer',
    notes:'Notes', lastUpdated:'Last Updated'
  };

  const header = allKeys.map(k => allLabels[k] || k);
  const reqFields = ['medicalCert','govForms','clearance','idPicture','validIdCopy','birthCert','diplomaTor','previousCoe','preEmploymentForms','jobOffer'];
  const boolFields = new Set(reqFields);

  const rows = list.map(e => allKeys.map(k => {
    const v = e[k];
    if(boolFields.has(k)) return v ? 'YES' : '';
    if(v === true) return 'YES';
    if(v === false) return '';
    return v || '';
  }));

  const wsData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  const colWidths = allKeys.map(k => {
    const maxLen = Math.max(
      (allLabels[k]||k).length,
      ...rows.map(r => String(r[allKeys.indexOf(k)]||'').length).slice(0,50)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
  ws['!cols'] = colWidths;

  // Bold header row style
  const range = XLSX.utils.decode_range(ws['!ref']);
  for(let C = range.s.c; C <= range.e.c; C++){
    const cellAddr = XLSX.utils.encode_cell({r:0, c:C});
    if(!ws[cellAddr]) continue;
    ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D7FEFA' } } };
  }

  const wb = XLSX.utils.book_new();
  const label = filterStatus || (type==='active'?'Active':'Inactive');
  XLSX.utils.book_append_sheet(wb, ws, label.slice(0,31));
  const filename = `Infinix_Employees_${label}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast(`Exported ${list.length} records to Excel`, 'success');
}


// ============================================================
function setLoginStatus(msg,type){const el=document.getElementById('login-status');if(!el)return;el.textContent=msg;el.className='login-status'+(type?' '+type:'');}
function showGoogleButton(){document.getElementById('login-waiting').style.display='none';document.getElementById('btn-google-signin').style.display='flex';}
function hideGoogleButton(){document.getElementById('login-waiting').style.display='flex';document.getElementById('btn-google-signin').style.display='none';}

function doLogin(){
  if(!tokenClient){setLoginStatus('Auth not ready yet — please refresh the page.','error');return;}
  const btn=document.getElementById('btn-google-signin');
  if(btn){btn.classList.add('loading');btn.innerHTML='<span style="font-size:13px">Signing in…</span>';}
  tokenClient.requestAccessToken({prompt:'select_account'});
}

let _silentAuthTimer=setTimeout(()=>{
  if(document.getElementById('login-screen').style.display!=='none'){
    document.getElementById('login-waiting').style.display='none';
    document.getElementById('btn-google-signin').style.display='flex';
    setLoginStatus('','');
  }
},6000);

const GOOGLE_BTN_HTML=`<svg class="google-icon" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.8 2.5 30.2 0 24 0 14.8 0 6.9 5.4 3 13.3l7.8 6C12.8 13.3 17.9 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/><path fill="#FBBC05" d="M10.8 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.3-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.2-8.4 2.2-6.1 0-11.2-4-13-9.4l-8.3 6.1C6.9 42.6 14.8 48 24 48z"/></svg>Sign in with Google`;

function _onAuthReady(resp){
  const btn=document.getElementById('btn-google-signin');
  if(btn){btn.classList.remove('loading');btn.innerHTML=GOOGLE_BTN_HTML;}
  if(resp.error){
    clearTimeout(_silentAuthTimer);
    const silent=['user_closed_modal','interaction_required','immediate_failed','access_denied'];
    if(silent.includes(resp.error)){
      showGoogleButton();setLoginStatus('','');
    } else if(resp.error==='popup_closed_by_user'){
      showGoogleButton();setLoginStatus('Sign-in window closed — please try again.','');
    } else if(resp.error==='popup_blocked_by_browser'){
      showGoogleButton();
      setLoginStatus('Pop-up was blocked. Please allow pop-ups for this site, or try a different browser.','error');
    } else {
      showGoogleButton();
      setLoginStatus('Sign-in failed: '+resp.error+'. Please try again.','error');
    }
    return;
  }
  clearTimeout(_silentAuthTimer);
  accessToken=resp.access_token;
  gapi.client.setToken({access_token:accessToken});
  setLoginStatus('Signed in! Loading data…','info');
  (async()=>{
    const user=await fetchUserInfo(accessToken);
    if(user){
      currentUser=user;
      localStorage.setItem('hr_user',JSON.stringify({name:user.name,email:user.email,given_name:user.given_name,family_name:user.family_name}));
    } else {
      const stored=localStorage.getItem('hr_user');
      currentUser=stored?JSON.parse(stored):{name:'User',email:'',given_name:'U',family_name:'S'};
    }
    if(!gapi.client.sheets) await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');
    showApp();
    if(!window._headersChecked){window._headersChecked=true;await ensureHeaders();}
    await Promise.all([loadData(),loadStoreDetails()]);
  })();
}

window.onload=()=>{
  gapi.load('client',async()=>{
    await gapi.client.init({discoveryDocs:[DISCOVERY]});
    gapiInited=true;trySilentAuth();
  });
};
window.onGoogleLibraryLoad=()=>{
  gisInited=true;
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CLIENT_ID,
    scope:SCOPES,
    prompt:'',
    callback:_onAuthReady,
    error_callback:(err)=>{
      if(err.type==='popup_failed_to_open'||err.type==='popup_closed'){
        const btn=document.getElementById('btn-google-signin');
        if(btn){btn.classList.remove('loading');btn.innerHTML=GOOGLE_BTN_HTML;}
        showGoogleButton();
        setLoginStatus('Sign-in window could not open. Allow pop-ups for this site and try again.','error');
      }
    }
  });
  trySilentAuth();
};

function trySilentAuth(){
  if(!gapiInited||!gisInited||!tokenClient)return;
  const storedUser=localStorage.getItem('hr_user');
  if(!storedUser){clearTimeout(_silentAuthTimer);showLoginScreen(false);return;}
  try{
    const u=JSON.parse(storedUser);
    tokenClient.requestAccessToken({prompt:'',login_hint:u.email||''});
  } catch(e){
    clearTimeout(_silentAuthTimer);showLoginScreen(false);
  }
}
function showLoginScreen(showWaiting){
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app').style.display='none';
  if(showWaiting)hideGoogleButton();else{showGoogleButton();setLoginStatus('','');}
}

function signOut(){
  if(accessToken){try{google.accounts.oauth2.revoke(accessToken);}catch(e){}}
  localStorage.removeItem('hr_user');
  sessionStorage.removeItem('hr_role');
  accessToken=null;currentUser=null;window._headersChecked=false;
  currentRole=null;
  document.body.classList.remove('role-viewer','role-rssrsh');
  showLoginScreen(false);
}
async function fetchUserInfo(token){
  try{const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token}});if(!r.ok)return null;return await r.json();}
  catch(e){return null;}
}
function showApp(){
  document.getElementById('login-screen').style.display='none';
  const app=document.getElementById('app');app.style.display='flex';
  if(currentUser){
    const initials=((currentUser.given_name||'?')[0]+(currentUser.family_name||'?')[0]).toUpperCase();
    document.getElementById('user-avatar').textContent=initials;
    document.getElementById('user-name').textContent=currentUser.name||currentUser.email;
  }
  initSidebar();
  initRole();
}
function setOfflineBanner(visible,msg){
  const el=document.getElementById('offline-banner');
  if(visible){el.classList.add('visible');if(msg)el.innerHTML=`${esc(msg)} <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="refreshData()">Retry</button>`;}
  else el.classList.remove('visible');
}
window.addEventListener('offline',()=>setOfflineBanner(true,'You are offline — data may be stale.'));
window.addEventListener('online',()=>{setOfflineBanner(false);toast('Back online','success');});

// ============================================================
// SHEET SETUP
// ============================================================
async function ensureHeaders(){
  try{
    const chk=async(sheet,hdrs,range)=>{
      const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${sheet}!${range}`});
      const vals=r.result.values;
      if(!vals||!vals[0]||vals[0].length<hdrs.length)
        await gapi.client.sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`${sheet}!A1`,valueInputOption:'RAW',resource:{values:[hdrs]}});
    };
    await chk(ACTIVE_SHEET,HEADERS,`A1:${SHEET_LAST_COL}1`);
    await chk(INACTIVE_SHEET,HEADERS,`A1:${SHEET_LAST_COL}1`);
    await chk(LOG_SHEET,LOG_HEADERS,'A1:G1');
    await chk(ROLE_LOG_SHEET,ROLE_LOG_HEADERS,'A1:E1');
  }catch(e){console.warn('Header setup:',e);}
}

// ============================================================
// DATA
// ============================================================
async function loadData(){
  showLoading(true,'Loading employees...');
  setOfflineBanner(false);
  try{
    const [aRes,iRes]=await Promise.all([
      gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${ACTIVE_SHEET}!A2:${SHEET_LAST_COL}`}),
      gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${INACTIVE_SHEET}!A2:${SHEET_LAST_COL}`})
    ]);
    employees=[];
    (aRes.result.values||[]).forEach((r,i)=>{
      const obj=rowToObj(r);
      const hasId=String(obj.infinixId||'').trim();
      const hasName=String(obj.fullName||obj.firstName||'').trim();
      // Include Active rows with no ID but a name (for missingInfinixId tracking)
      if(hasId || hasName)
        employees.push({...obj,_sheet:ACTIVE_SHEET,_row:i+2});
    });
    (iRes.result.values||[]).forEach((r,i)=>{const obj=rowToObj(r);if(String(obj.infinixId||'').trim())employees.push({...obj,_sheet:INACTIVE_SHEET,_row:i+2});});
    logCache=null;selectedIds.clear();
    renderSidebar();renderView();
    toast(`${employees.length} employees loaded`,'success');
  }catch(e){
    const status = e?.result?.error?.code || e?.status;
    let msg = 'Failed to load data.';
    if(status===403){
      msg = 'Access denied (403) — your Google account does not have permission to view this Sheet.';
    } else if(status===401){
      msg = 'Session expired — please sign out and sign in again.';
    } else if(e?.message){
      msg = 'Failed to load data: ' + e.message;
    }
    setOfflineBanner(true, msg);
    toast(msg, 'error');
    document.getElementById('content').innerHTML=`
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;text-align:center;padding:24px">
        <div style="font-size:32px;opacity:0.4">⚠️</div>
        <div style="font-family:'Poppins',sans-serif;font-size:16px;font-weight:700;color:var(--text)">Could Not Load Data</div>
        <div style="font-size:13px;color:var(--text2);max-width:440px;line-height:1.7">${esc(msg)}</div>
        <button class="btn btn-primary" onclick="refreshData()">Try Again</button>
        <button class="btn btn-ghost" onclick="signOut()">Sign Out &amp; Switch Account</button>
      </div>`;
  }finally{showLoading(false);}
}
async function refreshData(){
  const btn=document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  storeCacheLoaded=false;
  await Promise.all([loadData(),loadStoreDetails()]);
  setTimeout(()=>btn.classList.remove('spinning'),500);
}

// ============================================================
// DATA HELPERS
// ============================================================
function ts(){return new Date().toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function yes(v){ return ['YES','DONE','TRUE','✓','CHECKED','1'].includes(String(v||'').trim().toUpperCase()); }
function yn(v){ return yes(v) ? 'YES' : ''; }
function rowToObj(r){
  r = r || [];
  return {
    region:normalizeRegion(r[0]||''),
    infinixId:String(r[1]||''),
    fullName:r[2]||'',
    firstName:r[3]||'',
    lastName:r[4]||'',
    middleName:r[5]||'',
    status:normalizeStatus(r[6]||''),
    storeAssignment:r[7]||'',
    storeId:r[8]||'',
    qrStatus:r[9]||'NOT SCANNED',
    deploymentDate:r[10]||'',
    deploymentStatus:normalizeDeployStatus(r[11]||''),
    deploymentStatusColL:String(r[11]||''),
    rssName:r[12]||'',
    rssId:String(r[13]||''),
    basicWage:r[14]||'',
    address:r[15]||'',
    mobile:r[16]||'',
    email:r[17]||'',
    dob:r[18]||'',
    gender:r[19]||'',
    maritalStatus:r[20]||'',
    sss:r[21]||'',
    philhealth:r[22]||'',
    pagibig:r[23]||'',
    tin:r[24]||'',
    bankName:r[25]||'',
    bankAccount:r[26]||'',
    contractStatus:r[27]||'NOT YET SENT',
    contractSentDate:r[28]||'',
    preEmploymentForms:yes(r[29]),
    jobOffer:yes(r[30]),
    statusDate:r[31]||'',
    statusRemarks:r[32]||'',
    lastUpdated:r[33]||'',
    notes:r[34]||'',
    medicalCert:yes(r[35]),
    govForms:yes(r[36]),
    clearance:yes(r[37]),
    idPicture:yes(r[38]),
    validIdCopy:yes(r[39]),
    birthCert:yes(r[40]),
    diplomaTor:yes(r[41]),
    previousCoe:yes(r[42]),
    _raw:r
  };
}
function objToRow(d){
  d = {...(d||{})};
  if(normalizeDeployStatus(d.deploymentStatus)==='BACKOUT'){
    d.deploymentStatus='BACKOUT';
    d.status='-';
  }
  const fullName=(d.fullName||`${d.firstName||''} ${d.lastName||''}`.trim()).trim();
  return [
    d.region||'',d.infinixId||'',fullName,d.firstName||'',d.lastName||'',d.middleName||'',
    d.status||'Active',d.storeAssignment||'',d.storeId||'',d.qrStatus||'NOT SCANNED',
    d.deploymentDate||'',d.deploymentStatus||'-',d.rssName||'',d.rssId||'',d.basicWage||'',
    d.address||'',d.mobile||'',d.email||'',d.dob||'',d.gender||'',d.maritalStatus||'',
    d.sss||'',d.philhealth||'',d.pagibig||'',d.tin||'',d.bankName||'',d.bankAccount||'',
    d.contractStatus||'NOT YET SENT',d.contractSentDate||'',yn(d.preEmploymentForms),yn(d.jobOffer),
    d.statusDate||'',d.statusRemarks||'',ts(),d.notes||'',
    yn(d.medicalCert),yn(d.govForms),yn(d.clearance),yn(d.idPicture),yn(d.validIdCopy),
    yn(d.birthCert),yn(d.diplomaTor),yn(d.previousCoe)
  ];
}
function normalizeStatus(status){
  const s=String(status||'').trim().toUpperCase().replace(/\s+/g,' ');
  if(s==='-'||s==='N/A'||s==='NA')return '-';
  if(s==='ACTIVE')return 'Active';
  if(s==='FLOATING')return 'Floating';
  if(s==='RESIGNED')return 'Resigned';
  if(s==='AWOL')return 'AWOL';
  if(s==='TERMINATED')return 'Terminated';
  if(s==='BACKOUT'||s==='BACK OUT'||s==='BACK-OUT')return 'Backout';
  return '';
}
function normalizeRegion(region){
  const raw=String(region||'').trim();
  const s=raw.toUpperCase().replace(/[\-_]+/g,' ').replace(/\s+/g,' ');
  if(!s)return '';
  if(s==='NCR'||s.includes('NATIONAL CAPITAL'))return 'NCR';
  if(s==='NL'||s.includes('NORTH LUZON')||s.includes('NORTH'))return 'NORTH LUZON';
  if(s==='CL'||s.includes('CENTRAL LUZON')||s.includes('CENTRAL'))return 'CENTRAL LUZON';
  if(s==='SL'||s.includes('SOUTH LUZON')||s.includes('SOUTH'))return 'SOUTH LUZON';
  if(s.includes('VISAYA'))return 'VISAYAS';
  if(s.includes('MINDANAO'))return 'MINDANAO';
  return raw.toUpperCase();
}
function prettyRegionName(region){
  const r=normalizeRegion(region);
  const map={
    'NCR':'NCR',
    'NORTH LUZON':'North Luzon',
    'CENTRAL LUZON':'Central Luzon',
    'SOUTH LUZON':'South Luzon',
    'VISAYAS':'Visayas',
    'MINDANAO':'Mindanao'
  };
  return map[r]||String(region||r||'').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
}
function normalizeDeployStatus(status){
  const raw=String(status||'').trim();
  const s=raw.toUpperCase().replace(/[\-_]+/g,' ').replace(/\s+/g,' ');
  if(!s)return '';
  if(s==='-')return '-';
  if(s==='DEPLOYED')return 'DEPLOYED';
  if(s==='BACKOUT'||s==='BACK OUT'||s==='BACKOUT PROMOTER')return 'BACKOUT';
  if(s==='NOT YET DEPLOYED'||s==='NOT DEPLOYED')return 'NOT YET DEPLOYED';
  return s;
}
function isNotYetDeployedColL(value){return normalizeDeployStatus(value)==='NOT YET DEPLOYED';}
function isInactiveStatus(status){return ['Floating','Resigned','AWOL','Terminated','Backout'].includes(normalizeStatus(status));}
function isBackoutDeployment(deploymentStatus){return normalizeDeployStatus(deploymentStatus)==='BACKOUT';}
function getTargetSheet(status,deploymentStatus){
  if(isBackoutDeployment(deploymentStatus))return INACTIVE_SHEET;
  const st=normalizeStatus(status);
  if(st==='Active')return ACTIVE_SHEET;
  if(isInactiveStatus(st)||st==='-')return INACTIVE_SHEET;
  return null;
}

async function writeLog(empId,name,action,from,to){
  try{
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId:SHEET_ID,range:`${LOG_SHEET}!A:G`,
      valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',
      resource:{values:[[ts(),empId,name,action,from,to,currentUser?.email||'Unknown']]}
    });
    logCache=null;
  }catch(e){console.warn('Log write failed:',e);}
}
// Safe row finder: uses cached _row from loadData, then does a single-cell
// verify to confirm it hasn't shifted (concurrent edit / delete by another user).
// If the cached row no longer matches, falls back to a full column-B scan.
async function findEmployeeRowInSheet(infinixId, sheetName, cachedRow){
  const id = String(infinixId).trim();

  // Fast path: verify the cached row number from loadData
  if(cachedRow && cachedRow >= 2){
    try{
      const check = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!B${cachedRow}`
      });
      const cellVal = String((check.result.values||[['']])[0][0]||'').trim();
      if(cellVal === id) return cachedRow; // still correct
    }catch(e){ /* fall through to scan */ }
  }

  // Fallback: full scan of column B (handles row shifts from concurrent edits)
  const r = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!B:B`
  });
  const vals = r.result.values || [];
  for(let i = 1; i < vals.length; i++){
    if(String(vals[i][0]||'').trim() === id) return i + 1;
  }
  return -1;
}

// ============================================================
// CRUD
// ============================================================
async function apiAddEmployee(data){
  const exists=employees.some(e=>String(e.infinixId).trim()===String(data.infinixId).trim());
  if(exists)return{ok:false,msg:'Infinix Employee ID already exists.'};
  const sheet=getTargetSheet(data.status,data.deploymentStatus)||ACTIVE_SHEET;
  await gapi.client.sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`${sheet}!A:${SHEET_LAST_COL}`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',resource:{values:[objToRow(data)]}});
  await writeLog(data.infinixId,`${data.firstName} ${data.lastName}`,'Added','—',data.status);
  return{ok:true,msg:`${data.firstName} ${data.lastName} added successfully.`};
}
async function apiUpdateEmployee(data){
  const emp=employees.find(e=>String(e.infinixId).trim()===String(data.infinixId).trim());
  if(!emp)return{ok:false,msg:'Employee not found.'};
  const oldStatus=emp.status||'Active';
  if(normalizeDeployStatus(data.deploymentStatus)==='BACKOUT'){data.deploymentStatus='BACKOUT';data.status='-';}
  const newStatus=data.status||'Active';
  const oldSheet=emp._sheet||getTargetSheet(oldStatus);
  const newSheet=getTargetSheet(newStatus,data.deploymentStatus)||oldSheet;

  // Staleness check: re-read the sheet row and compare lastUpdated.
  // If it changed since we loaded, someone else edited this record concurrently.
  if(emp._row && emp._row >= 2){
    try{
      const fresh = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${oldSheet}!AH${emp._row}` // col AH = index 33 = lastUpdated
      });
      const liveTS = String((fresh.result.values||[['']])[0][0]||'').trim();
      const cachedTS = String(emp.lastUpdated||'').trim();
      if(liveTS && cachedTS && liveTS !== cachedTS){
        return{ok:false,msg:`⚠ Conflict: ${emp.fullName||emp.firstName} was edited by someone else while you had it open. Please refresh and re-apply your changes.`};
      }
    }catch(e){ /* non-fatal — proceed without check if read fails */ }
  }

  const row=await findEmployeeRowInSheet(data.infinixId,oldSheet,emp._row);
  if(row<0)return{ok:false,msg:`Could not find employee row in ${oldSheet} sheet.`};
  if(oldSheet!==newSheet){
    await gapi.client.sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`${newSheet}!A:${SHEET_LAST_COL}`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',resource:{values:[objToRow(data)]}});
    const sheetMeta=await gapi.client.sheets.spreadsheets.get({spreadsheetId:SHEET_ID});
    const sheetObj=sheetMeta.result.sheets.find(s=>s.properties.title===oldSheet);
    if(sheetObj)await gapi.client.sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,resource:{requests:[{deleteDimension:{range:{sheetId:sheetObj.properties.sheetId,dimension:'ROWS',startIndex:row-1,endIndex:row}}}]}});
    await writeLog(data.infinixId,`${data.firstName} ${data.lastName}`,'Status Changed / Moved',oldStatus,newStatus);
  }else{
    await gapi.client.sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`${oldSheet}!A${row}:${SHEET_LAST_COL}${row}`,valueInputOption:'RAW',resource:{values:[objToRow(data)]}});
    await writeLog(data.infinixId,`${data.firstName} ${data.lastName}`,'Updated',oldStatus,newStatus);
  }
  return{ok:true,msg:`${data.firstName} ${data.lastName} updated successfully.`};
}
async function apiDeleteEmployee(infinixId){
  const emp=employees.find(e=>String(e.infinixId).trim()===String(infinixId).trim());
  if(!emp)return{ok:false,msg:'Employee not found.'};
  const sheet=emp._sheet||getTargetSheet(emp.status,emp.deploymentStatus);
  const row=await findEmployeeRowInSheet(infinixId,sheet,emp._row);
  if(row<0)return{ok:false,msg:`Could not find employee row in ${sheet} sheet.`};
  const sheetMeta=await gapi.client.sheets.spreadsheets.get({spreadsheetId:SHEET_ID});
  const sheetObj=sheetMeta.result.sheets.find(s=>s.properties.title===sheet);
  if(sheetObj)await gapi.client.sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,resource:{requests:[{deleteDimension:{range:{sheetId:sheetObj.properties.sheetId,dimension:'ROWS',startIndex:row-1,endIndex:row}}}]}});
  await writeLog(infinixId,emp.fullName||`${emp.firstName} ${emp.lastName}`,'Deleted',emp.status,'—');
  return{ok:true,msg:`${emp.fullName||emp.firstName+' '+emp.lastName} deleted.`};
}
async function apiBulkUpdateStatus(ids,newStatus){
  showLoading(true,`Updating ${ids.length} employees...`);
  let ok=0,fail=0;
  for(const id of ids){
    try{const emp=employees.find(e=>String(e.infinixId)===String(id));if(!emp)continue;const res=await apiUpdateEmployee({...emp,status:newStatus});if(res.ok)ok++;else fail++;}
    catch(e){fail++;}
  }
  showLoading(false);
  if(ok>0)toast(`Updated ${ok} employee(s) to ${newStatus}`,'success');
  if(fail>0)toast(`${fail} update(s) failed`,'error');
  selectedIds.clear();await loadData();
}

async function saveNotes(infinixId, notesVal){
  if(!canWrite()){denyWrite();return;}
  const emp=employees.find(e=>String(e.infinixId)===String(infinixId));
  if(!emp)return;
  showLoading(true,'Saving notes...');
  try{
    const res=await apiUpdateEmployee({...emp,notes:notesVal});
    if(res.ok){toast('Notes saved','success');await loadData();}
    else toast(res.msg||'Failed to save notes','error');
  }catch(e){toast('Error: '+e.message,'error');}
  finally{showLoading(false);}
}

function renderSkeletonRows(count=8){
  const tbody=document.getElementById('emp-tbody');
  if(!tbody)return;
  const cols=TABLE_COLUMNS.filter(c=>visibleCols.has(c.key)).length + 2; // +check +actions
  const widths=['60%','35%','55%','40%','45%','50%','38%','62%'];
  tbody.innerHTML=Array.from({length:count},(_,i)=>`
    <tr class="skeleton-row">
      ${Array.from({length:cols},(__,ci)=>`<td><div class="skeleton skeleton-cell" style="width:${widths[(i+ci)%widths.length]}"></div></td>`).join('')}
    </tr>`).join('');
}


// ============================================================
function sortEmployees(list){
  if(!sortCol)return list;
  return [...list].sort((a,b)=>{
    const av=String(a[sortCol]||'').toLowerCase();
    const bv=String(b[sortCol]||'').toLowerCase();
    if(av<bv)return -1*sortDir;if(av>bv)return 1*sortDir;return 0;
  });
}
function toggleSort(colKey){
  if(sortCol===colKey)sortDir*=-1;else{sortCol=colKey;sortDir=1;}
  currentPage=1;
  renderTableRows(currentView==='inactive'?'inactive':'active');
  updateSortHeaders();
}
function updateSortHeaders(){
  document.querySelectorAll('thead th[data-sort]').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    if(th.dataset.sort===sortCol)th.classList.add(sortDir===1?'sort-asc':'sort-desc');
  });
}

function filteredEmployees(type){
  const isActive=type==='active';
  let list;

  if(filterStatus){
    if(filterStatus==='Active'){
      list=employees.filter(e=>normalizeStatus(e.status)==='Active' && normalizeDeployStatus(e.deploymentStatus)!=='BACKOUT');
    } else {
      list=employees.filter(e=>normalizeStatus(e.status)===filterStatus || (filterStatus==='Backout'&&normalizeDeployStatus(e.deploymentStatus)==='BACKOUT'));
    }
  } else {
    list=employees.filter(e=>isActive
      ?(normalizeStatus(e.status)==='Active' && normalizeDeployStatus(e.deploymentStatus)!=='BACKOUT')
      :(normalizeStatus(e.status)!=='Active' || normalizeDeployStatus(e.deploymentStatus)==='BACKOUT')
    );
  }

  if(missingFieldFilter){
    list=list.filter(e=>normalizeStatus(e.status)==='Active');
    if(missingFieldFilter==='notDeployed')list=list.filter(e=>e._sheet===ACTIVE_SHEET && isNotYetDeployedColL(e.deploymentStatusColL));
    else if(missingFieldFilter==='notScanned')list=list.filter(e=>!e.qrStatus||e.qrStatus==='NOT SCANNED');
    else if(missingFieldFilter==='contractPending')list=list.filter(e=>!e.contractStatus||e.contractStatus==='NOT YET SENT');
    else if(missingFieldFilter==='missingGovIds')list=list.filter(e=>isMissing(e.sss)||isMissing(e.philhealth)||isMissing(e.pagibig)||isMissing(e.tin));
    else if(missingFieldFilter==='missingBank')list=list.filter(e=>isMissing(e.bankAccount));
    else if(missingFieldFilter==='missingMobile')list=list.filter(e=>isMissing(e.mobile));
    else if(missingFieldFilter==='missingRequirements')list=list.filter(e=>!requirementsComplete(e));
    else if(missingFieldFilter==='missingInfinixId')list=employees.filter(e=>e._sheet===ACTIVE_SHEET && !String(e.infinixId||'').trim());
    else if(missingFieldFilter==='missingStore')list=employees.filter(e=>e._sheet===ACTIVE_SHEET && normalizeStatus(e.status)==='Active' && isMissing(e.storeAssignment));
  }

  const q=(document.getElementById('search-input')?.value||'').toLowerCase().trim();
  if(q)list=list.filter(e=>(e.fullName||'').toLowerCase().includes(q)||String(e.infinixId).toLowerCase().includes(q)||(e.storeAssignment||'').toLowerCase().includes(q)||(e.storeId||'').toLowerCase().includes(q)||(e.region||'').toLowerCase().includes(q)||(e.rssName||'').toLowerCase().includes(q)||(e.email||'').toLowerCase().includes(q));
  if(filterRegion)list=list.filter(e=>normalizeRegion(e.region)===normalizeRegion(filterRegion));
  if(filterDeployStatus)list=list.filter(e=>e.deploymentStatus===filterDeployStatus);
  if(filterQR)list=list.filter(e=>e.qrStatus===filterQR);
  if(filterContractStatus)list=list.filter(e=>e.contractStatus===filterContractStatus);
  return sortEmployees(list);
}

function onSearch(){
  const q=(document.getElementById('search-input')?.value||'').trim();
  if(currentView==='dashboard'){if(q)showView('active');return;}
  if(currentView!=='active'&&currentView!=='inactive'){if(q)showView('active');return;}
  currentPage=1;selectedIds.clear();
  renderTableRows(currentView==='inactive'?'inactive':'active');
}
function onFilterChange(){currentPage=1;selectedIds.clear();renderTableRows(currentView==='inactive'?'inactive':'active');}
function resetFilters(){filterRegion='';filterDeployStatus='';filterQR='';filterContractStatus='';missingFieldFilter=null;document.querySelectorAll('.filter-bar select').forEach(s=>s.value='');onFilterChange();}
function activeFilterCount(){return [filterRegion,filterDeployStatus,filterQR,filterContractStatus,missingFieldFilter].filter(Boolean).length;}

// ============================================================
// COLUMN VISIBILITY
// ============================================================
function toggleColVisibility(key, checked){
  if(checked)visibleCols.add(key);else visibleCols.delete(key);
  renderTableRows(currentView==='inactive'?'inactive':'active');
}

// ============================================================
// BIRTHDAYS
// ============================================================
function getBirthdaysThisMonth(){
  const now=new Date();
  const thisMonth=now.getMonth();
  const today=now.getDate();
  const result=[];
  employees.forEach(emp=>{
    if(!emp.dob)return;
    const d=new Date(emp.dob);
    if(isNaN(d))return;
    if(d.getMonth()===thisMonth){
      const daysUntil=d.getDate()-today;
      result.push({emp,day:d.getDate(),daysUntil});
    }
  });
  result.sort((a,b)=>a.day-b.day);
  return result;
}

// ============================================================
// DATA HELPERS
// ============================================================
function isMissing(v){return String(v||'').trim()==='';}
function isYesField(v){return v===true || yes(v);}

function requirementsComplete(e){
  return REQUIRED_FIELDS.every(k=>isYesField(e[k]));
}
function reqDoneCount(e){ return REQUIRED_FIELDS.filter(k=>isYesField(e[k])).length; }
function reqProgressHTML(e){
  const done=reqDoneCount(e), total=REQUIRED_FIELDS.length, pct=Math.round((done/total)*100);
  return `<span class="req-progress"><span>${done}/${total}</span><span class="req-progress-bar"><span class="req-progress-fill" style="width:${pct}%"></span></span></span>`;
}

function activePromotersOnly(){return employees.filter(e=>normalizeStatus(e.status)==='Active' && normalizeDeployStatus(e.deploymentStatus)!=='BACKOUT');}

function getStats(){
  const s={Active:0,Floating:0,Resigned:0,AWOL:0,Terminated:0,Backout:0};
  employees.forEach(e=>{
    const st=normalizeDeployStatus(e.deploymentStatus)==='BACKOUT' ? 'Backout' : normalizeStatus(e.status);
    if(s[st]!==undefined)s[st]++;
  });
  return s;
}

// Safe badge helper — returns .b-none for '-' or empty
function badgeHTML(val, cls){
  if(!val||val==='-') return `<span class="badge b-none">—</span>`;
  const safeClass=cls||(val.replace(/ /g,'-'));
  return `<span class="badge b-${esc(safeClass)}">${esc(val)}</span>`;
}

function renderSidebar(){
  const s=getStats();
  document.getElementById('badge-active').textContent=s.Active;
  document.getElementById('badge-inactive').textContent=employees.filter(e=>normalizeStatus(e.status)!=='Active' || normalizeDeployStatus(e.deploymentStatus)==='BACKOUT').length;
  document.getElementById('status-filters').innerHTML=STATUSES.map(st=>`
    <div class="sf-item ${filterStatus===st?'active':''}" onclick="filterByStatus('${esc(st)}')">
      <span class="sf-dot" style="background:${STATUS_COLORS[st]}"></span>${esc(st)}
      <span class="sf-count">${s[st]||0}</span>
    </div>`).join('');
}

function filterByStatus(s){
  filterStatus=filterStatus===s?null:s;
  missingFieldFilter=null;
  currentView=(s==='Active')?'active':'inactive';
  currentPage=1;selectedIds.clear();
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const navEl=document.getElementById('nav-'+(s==='Active'?'active':'inactive'));
  if(navEl)navEl.classList.add('active');
  renderSidebar();renderView();
}

function showView(v){
  currentView=v;
  bulkMode=false;
  selectedIds.clear();
  if(v!=='active'&&v!=='inactive'){filterStatus=null;missingFieldFilter=null;}
  currentPage=1;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const el=document.getElementById('nav-'+v);if(el)el.classList.add('active');
  renderSidebar();renderView();
}

function renderView(){
  const si=document.getElementById('search-input');
  const sicon=document.getElementById('topbar-search-icon');
  if(currentView==='dashboard'){si.style.display='none';if(sicon)sicon.style.display='none';}
  else if(currentView==='active'||currentView==='inactive'){si.style.display='';if(sicon)sicon.style.display='';}
  else{si.style.display='none';if(sicon)sicon.style.display='none';}

  if(currentView==='dashboard')renderDashboard();
  else if(currentView==='active')renderEmployeeTable('active');
  else if(currentView==='inactive')renderEmployeeTable('inactive');
  else if(currentView==='tracker')renderTracker();
  else if(currentView==='log')renderLog();
}

function drillDown(filterKey){
  missingFieldFilter=filterKey;
  filterStatus=null;
  bulkMode=false;
  selectedIds.clear();
  currentView='active';
  currentPage=1;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('nav-active')?.classList.add('active');
  renderSidebar();renderView();
}

function dashSearch(q){
  if(!q.trim())return;
  document.getElementById('search-input').value=q;
  showView('active');
}

// ============================================================
// EMPLOYEE TABLE
// ============================================================
function renderEmployeeTable(type){
  const isActive=type==='active';
  let label=filterStatus?filterStatus+' Employees':(isActive?'Active Employees':'Inactive Employees');
  if(missingFieldFilter){
    const labels={notDeployed:'Not Yet Deployed',notScanned:'QR Not Scanned',contractPending:'Contract Pending',missingRequirements:'Requirements Incomplete',missingGovIds:'Missing Gov IDs',missingBank:'Missing Bank Account',missingMobile:'Missing Mobile',missingInfinixId:'Missing Infinix ID',missingStore:'No Store Assignment'};
    label=(labels[missingFieldFilter]||'Filtered')+' Employees';
  }
  document.getElementById('topbar-title').textContent=label;
  document.getElementById('topbar-sub').textContent='Click a row to view details';

  const afc=activeFilterCount();
  document.getElementById('content').innerHTML=`
    <div class="table-wrap">
      <div class="table-head">
        <h3>${esc(label)}</h3>
        <span class="rec" id="emp-count"></span>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          ${filterStatus?`<button class="btn btn-ghost btn-sm" onclick="filterStatus=null;currentPage=1;renderView()">Clear Status</button>`:''}
          ${missingFieldFilter?`<button class="btn btn-ghost btn-sm" onclick="missingFieldFilter=null;currentPage=1;renderView()">Clear Filter</button>`:''}
        </div>
      </div>
      <div class="filter-bar">
        <span class="filter-label">Filter</span>
        <select onchange="filterRegion=this.value;onFilterChange()">
          <option value="">All Regions</option>
          ${REGIONS.map(r=>`<option value="${esc(r)}" ${filterRegion===r?'selected':''}>${esc(r)}</option>`).join('')}
        </select>
        <select onchange="filterDeployStatus=this.value;onFilterChange()">
          <option value="">All Deploy Status</option>
          ${['DEPLOYED','NOT YET DEPLOYED','BACKOUT','-'].map(s=>`<option value="${esc(s)}" ${filterDeployStatus===s?'selected':''}>${esc(s)}</option>`).join('')}
        </select>
        <select onchange="filterQR=this.value;onFilterChange()">
          <option value="">All QR</option>
          <option value="SCANNED" ${filterQR==='SCANNED'?'selected':''}>Scanned</option>
          <option value="NOT SCANNED" ${filterQR==='NOT SCANNED'?'selected':''}>Not Scanned</option>
        </select>
        <select onchange="filterContractStatus=this.value;onFilterChange()">
          <option value="">All Contracts</option>
          <option value="SENT" ${filterContractStatus==='SENT'?'selected':''}>Sent</option>
          <option value="NOT YET SENT" ${filterContractStatus==='NOT YET SENT'?'selected':''}>Not Yet Sent</option>
        </select>
        ${afc>0?`<span class="filter-active-count">${afc} filter${afc!==1?'s':''} active</span><button class="btn btn-ghost btn-sm" onclick="resetFilters()">Reset</button>`:''}
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          ${canViewSensitive()?`<button class="btn btn-export btn-sm" onclick="exportXLSX()" title="Export current view to Excel">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Excel
          </button>`:''}
          <button class="btn btn-ghost btn-sm" id="bulk-toggle-btn" onclick="toggleBulkMode()" style="display:flex;align-items:center;gap:5px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="5" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><line x1="10" y1="7" x2="21" y2="7"/><line x1="10" y1="13" x2="21" y2="13"/><line x1="10" y1="19" x2="21" y2="19"/></svg>
            Select
          </button>
        </div>
      </div>
      <div class="bulk-bar hidden" id="bulk-bar">
        <span class="bulk-count" id="bulk-count">0 selected</span>
        <div class="bulk-sep"></div>
        <span class="bulk-label">Change status to:</span>
        <select class="bulk-status-sel" id="bulk-status-sel">
          ${STATUSES.map(st=>`<option value="${esc(st)}">${esc(st)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="doBulkStatusChange()">Apply</button>
        <button class="btn btn-ghost btn-sm" onclick="clearSelection()">Deselect All</button>
        <button class="btn btn-danger btn-sm" onclick="doBulkDelete()">Delete Selected</button>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="toggleBulkMode()">✕ Cancel</button>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="td-check no-sort" id="col-check-header" style="display:none"><input type="checkbox" id="chk-all" onchange="toggleSelectAll(this.checked)"></th>
              ${TABLE_COLUMNS.filter(c=>visibleCols.has(c.key)).map(c=>`<th data-sort="${esc(c.key)}" onclick="toggleSort('${esc(c.key)}')">${esc(c.label)}</th>`).join('')}
              <th class="no-sort">Actions</th>
            </tr>
          </thead>
          <tbody id="emp-tbody"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>`;
  updateSortHeaders();
  if(!employees.length) renderSkeletonRows();
  else renderTableRows(type);
}

function renderTableRows(type){
  const list=filteredEmployees(type);
  const total=list.length;
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  if(currentPage>totalPages)currentPage=totalPages;
  const start=(currentPage-1)*pageSize;
  const end=Math.min(start+pageSize,total);
  const page=list.slice(start,end);

  const cnt=document.getElementById('emp-count');
  if(cnt)cnt.textContent=total+' records';

  const tbody=document.getElementById('emp-tbody');
  if(!tbody)return;

  const colRender={
    fullName:e=>`<td><div class="td-name">${esc(e.fullName||'')}</div><div class="td-sub">${esc(e.email||'')}</div></td>`,
    infinixId:e=>`<td><span class="td-id">${esc(e.infinixId)}</span></td>`,
    status:e=>`<td>${badgeHTML(e.status)}</td>`,
    statusDate:e=>`<td style="color:var(--text2);font-size:12px">${esc(e.statusDate||'—')}</td>`,
    deploymentDate:e=>`<td style="color:var(--text2);font-size:12px">${esc(e.deploymentDate||'—')}</td>`,
    deploymentStatus:e=>`<td>${badgeHTML(e.deploymentStatus,e.deploymentStatus?e.deploymentStatus.replace(/ /g,'-'):null)}</td>`,
    requirements:e=>`<td>${reqProgressHTML(e)}</td>`,
    qrStatus:e=>{const qr=e.qrStatus||'NOT SCANNED';return`<td>${badgeHTML(qr,qr.replace(/ /g,'-'))}</td>`},
    region:e=>`<td style="color:var(--text2)">${esc(e.region||'—')}</td>`,
    storeAssignment:e=>`<td style="color:var(--text2)">${esc(e.storeAssignment||'—')}</td>`,
    storeId:e=>`<td style="color:var(--text3);font-size:11px">${esc(e.storeId||'—')}</td>`,
    rssName:e=>`<td style="color:var(--text2)">${esc(e.rssName||'—')}</td>`,
    bankName:e=>`<td style="color:var(--text2)">${esc(e.bankName||'—')}</td>`,
    contractStatus:e=>`<td>${badgeHTML(e.contractStatus||'NOT YET SENT',(e.contractStatus||'NOT YET SENT').replace(/ /g,'-'))}</td>`,
  };

  if(!page.length){
    const q=(document.getElementById('search-input')?.value||'').trim();
    const hasFilters=activeFilterCount()>0||!!filterStatus||!!missingFieldFilter||!!q;
    const msg=hasFilters
      ?{title:'No matches found',sub:'Try adjusting your filters or search term.',icon:`<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`}
      :{title:'No employees here',sub:'Add your first employee using the button above.',icon:`<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>`};
    tbody.innerHTML=`<tr><td colspan="20"><div class="empty-state">${msg.icon}<div class="es-title">${msg.title}</div><div class="es-sub">${msg.sub}</div></div></td></tr>`;
  }else{
    const visibleColKeys=TABLE_COLUMNS.filter(c=>visibleCols.has(c.key)).map(c=>c.key);
    tbody.innerHTML=page.map(e=>`
      <tr class="${selectedIds.has(e.infinixId)?'selected':''}" onclick="handleRowClick(event,'${esc(e.infinixId)}')">
        <td class="td-check" style="display:${bulkMode?'':'none'}" onclick="event.stopPropagation()">
          <input type="checkbox" ${selectedIds.has(e.infinixId)?'checked':''} onchange="toggleSelect(event,'${esc(e.infinixId)}',this.checked)">
        </td>
        ${visibleColKeys.map(k=>(colRender[k]||(() =>`<td>—</td>`))(e)).join('')}
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick="openEditModal('${esc(e.infinixId)}')">Edit</button>
          <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="confirmDelete('${esc(e.infinixId)}','${esc(e.fullName||'')}')">Delete</button>
        </td>
      </tr>`).join('');
  }
  renderPagination(total,totalPages);
  const chkAll=document.getElementById('chk-all');
  if(chkAll){
    const pageIds=page.map(e=>e.infinixId);
    const allSelected=pageIds.length>0&&pageIds.every(id=>selectedIds.has(id));
    chkAll.checked=allSelected;
    chkAll.indeterminate=!allSelected&&pageIds.some(id=>selectedIds.has(id));
  }
  updateBulkBar();
}

function renderPagination(total,totalPages){
  const pg=document.getElementById('pagination');if(!pg)return;
  const start=(currentPage-1)*pageSize+1;
  const end=Math.min(currentPage*pageSize,total);
  let pages=[];
  if(totalPages<=7){for(let i=1;i<=totalPages;i++)pages.push(i);}
  else{pages=[1];if(currentPage>3)pages.push('...');for(let i=Math.max(2,currentPage-1);i<=Math.min(totalPages-1,currentPage+1);i++)pages.push(i);if(currentPage<totalPages-2)pages.push('...');pages.push(totalPages);}
  pg.innerHTML=`
    <div class="pagination-info">${total===0?'No records':`${start}–${end} of ${total}`}</div>
    <div style="display:flex;align-items:center;gap:4px">
      <div class="pagination-controls">
        <button class="page-btn" onclick="goPage(1)" ${currentPage===1?'disabled':''}>«</button>
        <button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>
        ${pages.map(p=>p==='...'?`<span style="color:var(--text3);padding:0 4px;font-size:12px">…</span>`:`<button class="page-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`).join('')}
        <button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>
        <button class="page-btn" onclick="goPage(${totalPages})" ${currentPage===totalPages?'disabled':''}>»</button>
      </div>
      <select class="page-size-sel" onchange="changePageSize(parseInt(this.value))">
        <option value="25" ${pageSize===25?'selected':''}>25/page</option>
        <option value="50" ${pageSize===50?'selected':''}>50/page</option>
        <option value="100" ${pageSize===100?'selected':''}>100/page</option>
      </select>
    </div>`;
}

function goPage(p){currentPage=p;renderTableRows(currentView==='inactive'?'inactive':'active');}
function changePageSize(s){pageSize=s;currentPage=1;renderTableRows(currentView==='inactive'?'inactive':'active');}

// ============================================================
// BULK MODE TOGGLE
// ============================================================
function toggleBulkMode(){
  bulkMode=!bulkMode;
  if(!bulkMode){selectedIds.clear();}
  // Show/hide checkbox header column
  const chkHeader=document.getElementById('col-check-header');
  if(chkHeader)chkHeader.style.display=bulkMode?'':'none';
  // Show/hide checkbox cells in rows
  document.querySelectorAll('.td-check').forEach(td=>td.style.display=bulkMode?'':'none');
  // Toggle Select button active state
  const btn=document.getElementById('bulk-toggle-btn');
  if(btn){
    btn.style.background=bulkMode?'var(--accent-dim)':'';
    btn.style.borderColor=bulkMode?'var(--border2)':'';
    btn.style.color=bulkMode?'var(--text)':'';
  }
  if(!bulkMode){
    const bar=document.getElementById('bulk-bar');
    if(bar)bar.classList.add('hidden');
  }
  updateBulkBar();
}

// ============================================================
// SELECTION & BULK
// ============================================================
function handleRowClick(event,id){if(event.target.type==='checkbox')return;openDetailPanel(id);}
function toggleSelect(evt,id,checked){
  if(checked)selectedIds.add(id);else selectedIds.delete(id);
  const row=evt.target.closest('tr');if(row)row.classList.toggle('selected',checked);
  updateBulkBar();
  const chkAll=document.getElementById('chk-all');
  if(chkAll){
    const list=filteredEmployees(currentView==='inactive'?'inactive':'active');
    const page=list.slice((currentPage-1)*pageSize,currentPage*pageSize);
    const pageIds=page.map(e=>e.infinixId);
    const allSelected=pageIds.every(id=>selectedIds.has(id));
    chkAll.checked=allSelected;chkAll.indeterminate=!allSelected&&pageIds.some(id=>selectedIds.has(id));
  }
}
function toggleSelectAll(checked){
  const list=filteredEmployees(currentView==='inactive'?'inactive':'active');
  const page=list.slice((currentPage-1)*pageSize,currentPage*pageSize);
  page.forEach(e=>{if(checked)selectedIds.add(e.infinixId);else selectedIds.delete(e.infinixId);});
  renderTableRows(currentView==='inactive'?'inactive':'active');
}
function clearSelection(){selectedIds.clear();renderTableRows(currentView==='inactive'?'inactive':'active');}
function updateBulkBar(){
  const bar=document.getElementById('bulk-bar');const cnt=document.getElementById('bulk-count');if(!bar)return;
  if(selectedIds.size>0){bar.classList.remove('hidden');if(cnt)cnt.textContent=`${selectedIds.size} selected`;}else bar.classList.add('hidden');
}
function doBulkStatusChange(){
  if(!canWrite()){denyWrite();return;}
  const sel=document.getElementById('bulk-status-sel');const newStatus=sel?.value;
  if(!newStatus||selectedIds.size===0)return;
  const ids=[...selectedIds];
  document.getElementById('confirm-title').textContent='Bulk Status Update';
  document.getElementById('confirm-msg').textContent=`Change ${ids.length} employee(s) status to "${newStatus}"?`;
  document.getElementById('confirm-ok').textContent='Update';
  document.getElementById('confirm-ok').onclick=()=>{closeConfirm();apiBulkUpdateStatus(ids,newStatus);};
  document.getElementById('confirm-overlay').classList.add('open');
}
function doBulkDelete(){
  if(!canDeleteRecords()){toast('Only Owner or HR/AGENCY can delete records.','error');return;}
  const ids=[...selectedIds];if(ids.length===0)return;
  document.getElementById('confirm-title').textContent='Bulk Delete';
  document.getElementById('confirm-msg').textContent=`Permanently delete ${ids.length} employee(s)? This cannot be undone.`;
  document.getElementById('confirm-ok').textContent='Delete All';
  document.getElementById('confirm-ok').onclick=async()=>{
    closeConfirm();showLoading(true,`Deleting ${ids.length} employees...`);
    let ok=0,fail=0;
    for(const id of ids){try{const r=await apiDeleteEmployee(id);if(r.ok)ok++;else fail++;}catch(e){fail++;}}
    showLoading(false);
    if(ok>0)toast(`Deleted ${ok} employee(s)`,'success');
    if(fail>0)toast(`${fail} deletion(s) failed`,'error');
    selectedIds.clear();await loadData();
  };
  document.getElementById('confirm-overlay').classList.add('open');
}

// ============================================================
// DETAIL PANEL
// ============================================================
function openDetailPanel(id){
  const emp=employees.find(e=>String(e.infinixId)===String(id));if(!emp)return;
  detailEmpId=id;
  document.getElementById('dp-title').textContent=emp.fullName||`${emp.firstName} ${emp.lastName}`;
  document.getElementById('dp-body').innerHTML=buildDetailHTML(emp);
  document.getElementById('detail-panel').classList.add('open');
  document.body.classList.add('panel-open');
  loadEmployeeAudit(id);
}
function closeDetailPanel(){document.getElementById('detail-panel').classList.remove('open');document.body.classList.remove('panel-open');detailEmpId=null;}
function dpEdit(){
  if(!canWrite()){denyWrite();return;}const id=detailEmpId;if(!id)return;closeDetailPanel();openEditModal(id);}
function dpDelete(){
  if(!canDeleteRecords()){toast('Only Owner or HR/AGENCY can delete records.','error');return;}
  if(!detailEmpId)return;
  const emp=employees.find(e=>String(e.infinixId)===String(detailEmpId));
  if(emp)confirmDelete(detailEmpId,emp.fullName||emp.firstName+' '+emp.lastName);
}

function buildDetailHTML(e){
  const row=(label,val)=>`<div class="detail-row"><div class="detail-label">${esc(label)}</div><div class="detail-val">${val||'—'}</div></div>`;
  const rowSensitive=(label,val)=>`<div class="detail-row"><div class="detail-label">${esc(label)}</div><div class="detail-val sensitive">${val||'—'}</div></div>`;

  let bdayNote='';
  if(e.dob){
    const d=new Date(e.dob);const now=new Date();
    if(!isNaN(d)&&d.getMonth()===now.getMonth()){
      const diff=d.getDate()-now.getDate();
      if(diff===0)bdayNote=`<div style="background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.3);border-radius:8px;padding:7px 12px;font-size:11.5px;color:var(--warning);margin-bottom:10px">🎉 Birthday today!</div>`;
      else if(diff>0&&diff<=7)bdayNote=`<div style="background:rgba(46,196,190,0.08);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:11.5px;color:var(--teal-deep);margin-bottom:10px">🎂 Birthday in ${diff} day${diff!==1?'s':''}</div>`;
    }
  }

  const checks = [
    { label: 'Employment Status',  done: !!e.status && e.status !== '-' },
    { label: 'Deployment Status',  done: e.deploymentStatus === 'DEPLOYED' },
    { label: 'QR Scanned',         done: e.qrStatus === 'SCANNED' },
    { label: 'Contract Sent',      done: e.contractStatus === 'SENT' },
    { label: 'Mobile Number',      done: !isMissing(e.mobile) },
    { label: 'Email Address',      done: !isMissing(e.email) },
    { label: 'SSS Number',         done: !isMissing(e.sss) },
    { label: 'PhilHealth',         done: !isMissing(e.philhealth) },
    { label: 'Pag-IBIG',           done: !isMissing(e.pagibig) },
    { label: 'Bank Account',       done: !isMissing(e.bankAccount) },
    { label: 'Date of Birth',      done: !isMissing(e.dob) },
    { label: 'Region Assigned',    done: !isMissing(e.region) },
  ];
  const doneCount = checks.filter(c => c.done).length;
  const pct = Math.round(doneCount / checks.length * 100);
  const barColor = pct === 100 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';

  const onboardingHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Profile Completion</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="flex:1;height:7px;background:rgba(136,144,99,0.12);border-radius:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width .6s cubic-bezier(.4,0,.2,1)"></div>
        </div>
        <span style="font-size:13px;font-weight:800;color:${barColor};min-width:36px;text-align:right">${pct}%</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px">
        ${checks.map(c=>`
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${c.done?'var(--text2)':'var(--danger)'}">
            <span style="width:14px;height:14px;border-radius:50%;background:${c.done?'var(--success-bg)':'var(--danger-bg)'};border:1px solid ${c.done?'rgba(122,184,148,0.3)':'rgba(196,122,122,0.3)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:8px">${c.done?'✓':'!'}</span>
            ${esc(c.label)}
          </div>`).join('')}
      </div>
    </div>`;

  return `
    ${bdayNote}
    ${onboardingHTML}
    <div class="detail-section">
      <div class="detail-section-title">Key Info</div>
      ${row('Infinix ID',`<span class="td-id">${esc(e.infinixId)}</span>`)}
      ${row('Full Name',`<b>${esc(e.fullName||'')}</b>`)}
      ${row('Status',badgeHTML(e.status))}
      ${row('Status Date',esc(e.statusDate))}${row('Status Remarks',esc(e.statusRemarks))}
      ${row('QR Status',badgeHTML(e.qrStatus||'NOT SCANNED',(e.qrStatus||'NOT SCANNED').replace(/ /g,'-')))}
      ${row('Deploy Status',badgeHTML(e.deploymentStatus,e.deploymentStatus?(e.deploymentStatus).replace(/ /g,'-'):null))}
      ${row('Deploy Date',esc(e.deploymentDate))}
      ${row('Contract',badgeHTML(e.contractStatus||'NOT YET SENT',(e.contractStatus||'NOT YET SENT').replace(/ /g,'-')))}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Personal</div>
      ${row('First Name',esc(e.firstName))}${row('Last Name',esc(e.lastName))}
      ${row('Middle Name',esc(e.middleName))}${rowSensitive('Date of Birth',esc(e.dob))}
      ${row('Gender',esc(e.gender))}${row('Marital Status',esc(e.maritalStatus))}
      ${rowSensitive('Mobile',esc(e.mobile))}${rowSensitive('Email',esc(e.email))}${rowSensitive('Address',esc(e.address))}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Assignment</div>
      ${row('Region',esc(e.region))}${row('Store',esc(e.storeAssignment))}
      ${row('Store ID',esc(e.storeId))}${row('RSS Name',esc(e.rssName))}${row('RSS ID',esc(e.rssId))}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Government IDs</div>
      ${rowSensitive('SSS',e.sss?esc(e.sss):'<span style="color:var(--danger);font-size:10px">⚠ Missing</span>')}
      ${rowSensitive('PhilHealth',e.philhealth?esc(e.philhealth):'<span style="color:var(--danger);font-size:10px">⚠ Missing</span>')}
      ${rowSensitive('Pag-IBIG',esc(e.pagibig))}${rowSensitive('TIN',esc(e.tin))}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Payroll</div>
      ${rowSensitive('Basic Wage',e.basicWage?'₱'+Number(e.basicWage).toLocaleString():'')}
      ${rowSensitive('Bank',esc(e.bankName))}
      ${rowSensitive('Account No.',e.bankAccount?esc(e.bankAccount):'<span style="color:var(--danger);font-size:10px">⚠ Missing</span>')}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Requirements</div>
      ${REQUIREMENT_FIELDS.map(([k,label])=>row(label,e[k]?'✅ Done':'—')).join('')}
      ${row('Progress (Required 9)',reqProgressHTML(e))}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Notes / Remarks</div>
      <textarea class="notes-area" id="dp-notes-area" placeholder="Add notes or remarks about this employee…">${esc(e.notes||'')}</textarea>
      <button class="btn btn-ghost btn-sm notes-save-btn" onclick="saveNotes('${esc(e.infinixId)}',document.getElementById('dp-notes-area').value)">Save Notes</button>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Audit Trail</div>
      <div id="dp-audit-inner" style="padding:6px 0;font-size:12px;color:var(--text3)">Loading…</div>
    </div>`;
}

async function loadEmployeeAudit(infinixId){
  try{
    // FIX: Use spread copy to avoid mutating logCache when reversing
    if(!logCache){const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${LOG_SHEET}!A2:G`});logCache=r.result.values||[];}
    const entries=[...logCache].filter(r=>String(r[1]||'').trim()===String(infinixId).trim()).reverse();
    const el=document.getElementById('dp-audit-inner');if(!el)return;
    if(!entries.length){el.innerHTML=`<div class="audit-empty">No activity recorded yet</div>`;return;}
    const colorMap={Added:'#4ecb71','Status Changed':'#f5c842',Deleted:'#e05c5c',Updated:'var(--moss-green)'};
    el.innerHTML=entries.map(r=>`<div class="audit-item">
      <div class="audit-dot" style="background:${colorMap[r[3]]||'rgba(136,144,99,0.5)'}"></div>
      <div class="audit-meta"><b>${esc(r[3]||'Updated')}</b>
        ${r[4]&&r[4]!=='—'?`<span style="color:var(--text3)"> · ${esc(r[4])} → <b style="color:var(--text)">${esc(r[5]||'')}</b></span>`:''}
        <div class="audit-time">${esc(r[0]||'')} · by ${esc(r[6]||'')}</div>
      </div>
    </div>`).join('');
  }catch(e){const el=document.getElementById('dp-audit-inner');if(el)el.innerHTML=`<div class="audit-empty">Could not load audit trail</div>`;}
}

// ============================================================
// ACTIVITY LOG
// ============================================================
async function renderLog(){
  document.getElementById('topbar-title').textContent='Activity Log';
  document.getElementById('topbar-sub').textContent='All changes recorded automatically';
  document.getElementById('content').innerHTML=`<div class="table-wrap"><div class="table-head"><h3>Activity Log</h3></div><div id="log-list" style="padding:6px 18px 16px">Loading...</div></div>`;
  showLoading(true,'Loading log...');
  try{
    const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${LOG_SHEET}!A2:G`});
    logCache=r.result.values||[];
    // FIX: Use spread copy to avoid mutating logCache
    const rows=[...logCache].reverse();
    const el=document.getElementById('log-list');
    if(!rows.length){el.innerHTML='<div class="empty-state"><div class="ei">—</div><p>No activity yet</p></div>';return;}
    const iconMap={Added:'log-added','Status Changed':'log-changed',Deleted:'log-deleted',Updated:'log-updated'};
    const svgMap={
      Added:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      'Status Changed':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
      Deleted:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
      Updated:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
    };
    el.innerHTML=rows.map(r=>`<div class="log-item">
      <div class="log-icon ${iconMap[r[3]]||'log-updated'}">${svgMap[r[3]]||svgMap['Updated']}</div>
      <div class="log-meta"><b>${esc(r[2]||'')}</b> (${esc(r[1]||'')}) — ${esc(r[3]||'')}
        ${r[4]&&r[4]!=='—'?` · <span style="color:var(--text3)">${esc(r[4])}</span> → <b>${esc(r[5]||'')}</b>`:''}
        <div class="log-time">${esc(r[0]||'')} · by ${esc(r[6]||'')}</div>
      </div>
    </div>`).join('');
  }catch(e){toast('Failed to load log: '+e.message,'error');}
  finally{showLoading(false);}
}

// ============================================================
// FORM
// ============================================================
function getFormHTML(emp){
  const v=k=>emp?(emp[k]||''):'';
  const toDateInput=val=>{if(!val)return'';const d=new Date(val);if(isNaN(d))return'';return d.toISOString().split('T')[0];};
  const inp=(k,type,ph,extra)=>`<input id="f_${k}" type="${type||'text'}" value="${esc(v(k))}" placeholder="${esc(ph||'')}" ${extra||''}>`;
  const dateInp=k=>`<input id="f_${k}" type="date" value="${esc(toDateInput(v(k)))}">`;
  const sel=(k,opts)=>`<select id="f_${k}">${opts.map(o=>`<option value="${esc(o)}" ${v(k)===o?'selected':''}>${esc(o)||'—'}</option>`).join('')}</select>`;
  const fn=emp?`${emp.firstName||''} ${emp.lastName||''}`.trim():'';

  return `
  <div class="section-label key-section">Key Fields</div>
  <div class="form-grid">
    <div class="field req"><label>Full Name (Auto)</label>
      <div class="fullname-preview" id="fullname-preview">${fn?esc(fn):'— Enter First &amp; Last Name —'}</div>
    </div>
    <div class="field req"><label>Infinix Employee ID</label>
      ${inp('infinixId','text','1700XXXX',emp?'readonly style="opacity:.5"':'oninput="validateInfinixId();checkDuplicate()"')}
      <div class="field-hint" id="hint-infinixId">Must start with 1700</div>
      <div class="dup-warning" id="dup-warning">⚠ This ID already exists in the system. Check before saving.</div>
    </div>
    <div class="field req"><label>Employment Status</label>${sel('status',['Active','Floating','Resigned','AWOL','Terminated','Backout','-'])}</div>
    <div class="field"><label>Status Effective Date</label>${dateInp('statusDate')}</div>
    <div class="field"><label>Status Remarks</label>${inp('statusRemarks')}</div>
    <div class="field"><label>Deployment Date</label>${dateInp('deploymentDate')}</div>
    <div class="field"><label>Deployment Status</label>${sel('deploymentStatus',['NOT YET DEPLOYED','DEPLOYED','BACKOUT','-'])}</div>
    <div class="field"><label>QR Scan Status</label>${sel('qrStatus',['NOT SCANNED','SCANNED'])}</div>
  </div>

  <div class="section-label">Personal Information</div>
  <div class="form-grid cols3">
    <div class="field req"><label>First Name</label>${inp('firstName','text','Juan','oninput="updateFullName()"')}</div>
    <div class="field req"><label>Last Name</label>${inp('lastName','text','Dela Cruz','oninput="updateFullName()"')}</div>
    <div class="field"><label>Middle Name</label>${inp('middleName','text','Santos')}</div>
  </div>
  <div class="form-grid">
    <div class="field form-sensitive-control"><label>Date of Birth</label>${dateInp('dob')}</div>
    <div class="field"><label>Gender</label>${sel('gender',['','Male','Female','N/A'])}</div>
    <div class="field"><label>Marital Status</label>${sel('maritalStatus',['','Single','Married'])}</div>
    <div class="field form-sensitive-control"><label>Mobile No.</label>${inp('mobile','text','+63','oninput="checkDupMobile()"')}
      <div class="dup-warning" id="dup-warning-mobile">⚠ This mobile number is already used by another employee.</div>
    </div>
    <div class="field form-full form-sensitive-control"><label>Email Address</label>${inp('email','email','juan@email.com','oninput="checkDupEmail()"')}
      <div class="dup-warning" id="dup-warning-email">⚠ This email is already used by another employee.</div>
    </div>
    <div class="field form-full form-sensitive-control"><label>Address</label>${inp('address','text','Complete address')}</div>
  </div>

  <div class="section-label">Store &amp; Deployment</div>
  <div class="form-grid">
    <div class="field"><label>Region</label>${sel('region',['',...REGIONS])}</div>
    <div class="field">
      <label>Store ID</label>
      ${inp('storeId','text','PH0XXXX','oninput="onStoreIdInput()"')}
      <div class="field-hint" id="hint-storeId">Must start with PH0</div>
      <div class="store-lookup-status" id="store-lookup-status">${storeCacheLoaded?'Enter Store ID to auto-fill name':'Loading store list…'}</div>
    </div>
    <div class="field form-full">
      <label>Store Assignment <span style="color:var(--text3);font-weight:400;font-size:10px">(auto-filled from Store ID)</span></label>
      <input id="f_storeAssignment" type="text" value="${esc(v('storeAssignment'))}" placeholder="Auto-filled or enter manually" ${v('storeId')&&lookupStore(v('storeId'))?.storeName?'readonly':''}>
    </div>
    <div class="field"><label>RSS Name</label>${inp('rssName','text','RSS Name')}</div>
    <div class="field"><label>RSS ID</label>${inp('rssId','text','1700XXXX','oninput="validateRssId()"')}
      <div class="field-hint" id="hint-rssId">Must start with 1700</div>
    </div>
  </div>

  <div class="section-label">Government Numbers</div>
  <div class="form-grid cols3">
    <div class="field form-sensitive-control"><label>SSS Number</label>${inp('sss','text','XX-XXXXXXX-X')}</div>
    <div class="field form-sensitive-control"><label>PhilHealth Number</label>${inp('philhealth','text','XXXX-XXXX-XXXX')}</div>
    <div class="field form-sensitive-control"><label>Pag-IBIG Number</label>${inp('pagibig','text','XXXX-XXXX-XXXX')}</div>
    <div class="field form-sensitive-control"><label>TIN Number</label>${inp('tin','text','XXX-XXX-XXX-XXX')}</div>
  </div>

  <div class="section-label">Payroll &amp; Banking</div>
  <div class="form-grid">
    <div class="field form-sensitive-control"><label>Basic Wage Rate (PHP)</label>${inp('basicWage','text','0.00')}</div>
    <div class="field form-sensitive-control"><label>Bank Name</label>${sel('bankName',BANK_OPTIONS)}</div>
    <div class="field form-sensitive-control"><label>Bank Account Number</label>${inp('bankAccount','text','Account number','oninput="checkDupBank()"')}
      <div class="dup-warning" id="dup-warning-bank">⚠ This bank account number is already used by another employee.</div>
    </div>
  </div>

  <div class="section-label">Contract</div>
  <div class="form-grid">
    <div class="field"><label>Contract Status</label>${sel('contractStatus',['NOT YET SENT','SENT'])}</div>
    <div class="field"><label>Contract Sent Date</label>${dateInp('contractSentDate')}</div>
  </div>

  <div class="section-label">Requirements Checklist</div>
  <div class="req-check-grid">
    ${REQUIREMENT_FIELDS.map(([k,label])=>`<label class="req-check"><input id="f_${k}" type="checkbox" ${v(k)?'checked':''}> <span>${esc(label)}</span></label>`).join('')}
  </div>

  <div class="section-label">Notes / Remarks</div>
  <div class="field form-full">
    <label>Notes</label>
    <textarea id="f_notes" style="height:80px;resize:vertical;width:100%;padding:7px 11px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12.5px;font-family:'Poppins',sans-serif;color:var(--text);background:rgba(136,144,99,0.05);outline:none" placeholder="Optional remarks…">${esc(v('notes'))}</textarea>
  </div>`;
}

function updateFullName(){
  const fn=document.getElementById('f_firstName')?.value.trim()||'';
  const ln=document.getElementById('f_lastName')?.value.trim()||'';
  const p=document.getElementById('fullname-preview');
  if(p)p.textContent=(fn+' '+ln).trim()||'— Enter First & Last Name —';
}
function validateInfinixId(){
  const val=document.getElementById('f_infinixId')?.value.trim()||'';
  const hint=document.getElementById('hint-infinixId');
  const el=document.getElementById('f_infinixId');
  if(val&&!val.startsWith('1700')){hint?.classList.add('visible');el?.classList.add('err');}
  else{hint?.classList.remove('visible');el?.classList.remove('err');}
}
function checkDuplicate(){
  if(editingId)return;
  const val=document.getElementById('f_infinixId')?.value.trim()||'';
  const warn=document.getElementById('dup-warning');
  if(!warn)return;
  if(val&&employees.some(e=>String(e.infinixId).trim()===val)){
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
}
function checkDupMobile(){
  const val=document.getElementById('f_mobile')?.value.trim()||'';
  const warn=document.getElementById('dup-warning-mobile');
  if(!warn||!val)return;
  const isDup=employees.some(e=>String(e.mobile||'').trim()===val&&String(e.infinixId)!==(editingId||''));
  warn.classList.toggle('visible',isDup);
}
function checkDupEmail(){
  const val=document.getElementById('f_email')?.value.trim()||'';
  const warn=document.getElementById('dup-warning-email');
  if(!warn||!val)return;
  const isDup=employees.some(e=>String(e.email||'').trim().toLowerCase()===val.toLowerCase()&&String(e.infinixId)!==(editingId||''));
  warn.classList.toggle('visible',isDup);
}
function checkDupBank(){
  const val=document.getElementById('f_bankAccount')?.value.trim()||'';
  const warn=document.getElementById('dup-warning-bank');
  if(!warn||!val)return;
  const isDup=employees.some(e=>String(e.bankAccount||'').trim()===val&&String(e.infinixId)!==(editingId||''));
  warn.classList.toggle('visible',isDup);
}
function validateRssId(){
  const val=document.getElementById('f_rssId')?.value.trim()||'';
  const hint=document.getElementById('hint-rssId');
  const el=document.getElementById('f_rssId');
  if(val&&!val.startsWith('1700')){hint?.classList.add('visible');el?.classList.add('err');}
  else{hint?.classList.remove('visible');el?.classList.remove('err');}
}
function gatherForm(){
  const f=k=>document.getElementById('f_'+k)?.value.trim()||'';
  const c=k=>!!document.getElementById('f_'+k)?.checked;
  const data={
    firstName:f('firstName'),lastName:f('lastName'),middleName:f('middleName'),
    infinixId:f('infinixId'),qrStatus:f('qrStatus'),status:f('status'),
    statusDate:f('statusDate'),statusRemarks:f('statusRemarks'),
    deploymentDate:f('deploymentDate'),deploymentStatus:f('deploymentStatus'),
    region:f('region'),storeAssignment:f('storeAssignment'),storeId:f('storeId'),
    rssName:f('rssName'),rssId:f('rssId'),address:f('address'),mobile:f('mobile'),
    dob:f('dob'),email:f('email'),gender:f('gender'),maritalStatus:f('maritalStatus'),
    sss:f('sss'),philhealth:f('philhealth'),pagibig:f('pagibig'),tin:f('tin'),
    basicWage:f('basicWage'),bankName:f('bankName'),bankAccount:f('bankAccount'),
    contractStatus:f('contractStatus'),contractSentDate:f('contractSentDate'),
    preEmploymentForms:c('preEmploymentForms'),jobOffer:c('jobOffer'),
    medicalCert:c('medicalCert'),govForms:c('govForms'),clearance:c('clearance'),
    idPicture:c('idPicture'),validIdCopy:c('validIdCopy'),birthCert:c('birthCert'),
    diplomaTor:c('diplomaTor'),previousCoe:c('previousCoe'),notes:f('notes')
  };
  if(normalizeDeployStatus(data.deploymentStatus)==='BACKOUT'){data.deploymentStatus='BACKOUT';data.status='-';}
  return data;
}

function validate(data){
  let ok=true;
  ['firstName','lastName','infinixId','status'].forEach(k=>{
    const el=document.getElementById('f_'+k);
    if(!data[k]){el?.classList.add('err');ok=false;}else el?.classList.remove('err');
  });
  if(!editingId&&data.infinixId){
    if(employees.some(e=>String(e.infinixId).trim()===String(data.infinixId).trim())){
      document.getElementById('f_infinixId')?.classList.add('err');
      const h=document.getElementById('hint-infinixId');
      if(h){h.textContent='This ID already exists.';h.classList.add('visible');}
      ok=false;
    }
  }
  if(data.infinixId&&!data.infinixId.startsWith('1700'))ok=false;
  if(data.storeId&&!data.storeId.startsWith('PH0')){
    document.getElementById('f_storeId')?.classList.add('err');
    const h=document.getElementById('hint-storeId');if(h)h.classList.add('visible');
    ok=false;
  } else {
    document.getElementById('f_storeId')?.classList.remove('err');
    document.getElementById('hint-storeId')?.classList.remove('visible');
  }
  if(data.rssId&&!data.rssId.startsWith('1700')){
    document.getElementById('f_rssId')?.classList.add('err');
    const h=document.getElementById('hint-rssId');if(h)h.classList.add('visible');
    ok=false;
  } else {
    document.getElementById('f_rssId')?.classList.remove('err');
    document.getElementById('hint-rssId')?.classList.remove('visible');
  }

  // Only require statusDate+statusRemarks for true inactive statuses (not Backout deployment)
  const trueInactiveStatuses=['Floating','Resigned','AWOL','Terminated'];
  if(trueInactiveStatuses.includes(data.status)){
    ['statusDate','statusRemarks'].forEach(k=>{
      const el=document.getElementById('f_'+k);
      if(!data[k]){el?.classList.add('err');ok=false;}else el?.classList.remove('err');
    });
  }
  return ok;
}

function openAddModal(){
  if(!canWrite()){denyWrite();return;}
  editingId=null;
  document.getElementById('modal-title').textContent='Add New Employee';
  document.getElementById('modal-save-btn').textContent='Save Employee';
  document.getElementById('modal-body').innerHTML=getFormHTML(null);
  lockSensitiveFormFields();
  // Restore draft if exists (for Add only, not Edit)
  const draft=loadDraft();
  if(draft && !draft.editingId){
    restoreDraftToForm(draft);
    injectDraftBanner(draft);
  }
  // Autosave draft on input
  document.getElementById('modal-body').addEventListener('input',saveDraft);
  document.getElementById('modal-overlay').classList.add('open');
}
function openEditModal(id){
  if(!canWrite()){denyWrite();return;}
  const emp=employees.find(e=>String(e.infinixId)===String(id));if(!emp)return;
  editingId=id;
  document.getElementById('modal-title').textContent=`Edit — ${esc(emp.fullName||emp.firstName+' '+emp.lastName)}`;
  document.getElementById('modal-save-btn').textContent='Update Employee';
  document.getElementById('modal-body').innerHTML=getFormHTML(emp);
  lockSensitiveFormFields();
  document.getElementById('modal-overlay').classList.add('open');
  if(emp.storeId&&storeCacheLoaded){
    const found=lookupStore(emp.storeId);
    const statusEl=document.getElementById('store-lookup-status');
    if(statusEl){
      statusEl.textContent=found?`Store: ${found.storeName}${found.rssName?' · RSS: '+found.rssName:''}`:'Store ID not in lookup — fields entered manually';
      statusEl.className='store-lookup-status '+(found?'found':'notfound');
    }
    const storeEl=document.getElementById('f_storeAssignment');
    if(storeEl&&found&&found.storeName)storeEl.readOnly=true;
    const rssNameEl=document.getElementById('f_rssName');
    const rssIdEl=document.getElementById('f_rssId');
    if(found){
      if(rssNameEl&&found.rssName){rssNameEl.value=found.rssName;rssNameEl.readOnly=true;}
      if(rssIdEl&&found.rssId){rssIdEl.value=found.rssId;rssIdEl.readOnly=true;}
    }
  }
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}
async function saveEmployee(){
  if(!canWrite()){denyWrite();return;}
  // Guard: only run if the add/edit modal is actually open
  if(!document.getElementById('modal-overlay')?.classList.contains('open')) return;
  const data=protectSensitiveDataBeforeSave(gatherForm());
  if(!validate(data)){toast('Please review required fields — some entries are missing or invalid.','error');return;}

  // Extra confirmation for high-impact statuses
  const highImpact=['Terminated','AWOL','Floating','Resigned'];
  if(highImpact.includes(data.status)){
    const oldEmp=editingId?employees.find(e=>String(e.infinixId)===String(editingId)):null;
    const oldStatus=oldEmp?.status||'Active';
    if(data.status!==oldStatus){
      const proceed=await new Promise(resolve=>{
        document.getElementById('confirm-title').textContent=`⚠ Confirm: Set to ${data.status}?`;
        document.getElementById('confirm-msg').textContent=`You are about to mark ${data.firstName} ${data.lastName} as "${data.status}". This is a significant status change. Are you sure?`;
        document.getElementById('confirm-ok').textContent=`Yes, set to ${data.status}`;
        document.getElementById('confirm-ok').onclick=()=>{closeConfirm();resolve(true);};
        const cancelBtn=document.getElementById('confirm-overlay').querySelector('.btn-ghost');
        const origOnClick=cancelBtn.onclick;
        cancelBtn.onclick=()=>{closeConfirm();cancelBtn.onclick=origOnClick;resolve(false);};
        document.getElementById('confirm-overlay').classList.add('open');
      });
      if(!proceed)return;
    }
  }

  closeModal();showLoading(true,editingId?'Updating employee...':'Adding employee...');
  try{
    const result=editingId?await apiUpdateEmployee(data):await apiAddEmployee(data);
    if(result.ok){clearDraft();toast(result.msg,'success');await loadData();}
    else toast(result.msg||'Operation failed','error');
  }catch(e){toast('Error: '+e.message,'error');}
  finally{showLoading(false);}
}
function confirmDelete(id,name){
  if(!canDeleteRecords()){toast('Only Owner or HR/AGENCY can delete records.','error');return;}
  document.getElementById('confirm-title').textContent='Delete Employee?';
  document.getElementById('confirm-msg').textContent=`This will permanently delete ${name} (${id}).`;
  document.getElementById('confirm-ok').textContent='Delete';
  document.getElementById('confirm-ok').onclick=()=>{closeConfirm();doDelete(id);};
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm(){document.getElementById('confirm-overlay').classList.remove('open');}
async function doDelete(id){
  if(!canDeleteRecords()){toast('Only Owner or HR/AGENCY can delete records.','error');return;}
  showLoading(true,'Deleting employee...');
  try{
    const result=await apiDeleteEmployee(id);
    if(result.ok){toast(result.msg,'success');if(detailEmpId===id)closeDetailPanel();await loadData();}
    else toast(result.msg||'Delete failed','error');
  }catch(e){toast('Error: '+e.message,'error');}
  finally{showLoading(false);}
}

// ============================================================
// UTILITIES
// ============================================================
function toast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.className='toast show '+type;
  setTimeout(()=>el.classList.remove('show'),3500);
}
function showLoading(v,text='Loading...'){
  const el=document.getElementById('loading');el.style.display=v?'flex':'none';
  const t=document.getElementById('loading-text');if(t)t.textContent=text;
}

