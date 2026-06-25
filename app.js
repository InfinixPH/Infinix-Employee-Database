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
const ANNOUNCEMENTS_SHEET = 'Announcements';
const EVENTS_SHEET_APP    = 'Events'; // calendar events — mirrors EVENTS_SHEET in page-home.js
const PAGE_SIZE_DEFAULT   = 50;

const STATUSES = ['Active','Floating','Resigned','AWOL','Terminated','Backout'];
const STATUS_COLORS = { Active:'#2E7D32', Floating:'#D4AF37', Resigned:'#CD7F32', AWOL:'#C62828', Terminated:'#7B5EA7', Backout:'#C62828' };
const REGIONS = ['NCR','NORTH LUZON','CENTRAL LUZON','SOUTH LUZON','VISAYAS','MINDANAO'];

const HEADERS = [
  'Region','Infinix Employee ID','Full Name','First Name','Last Name','Middle Name','Employment Status','Store Assignment','Store ID','QR Scan Status',
  'Deployment Date','Deployment Status','RSS Name','RSS ID','Basic Wage Rate','Address','Mobile No.','Email Address','Date of Birth','Gender','Marital Status',
  'SSS Number','PhilHealth Number','Pag-IBIG Number','TIN Number','Bank Name','Bank Account Number','Contract Status','Contract Sent Date','Pre-Employment Forms','Job Offer',
  'Status Effective Date','Status Remarks','Last Updated','Notes','Medical Certificate','Government Numbers / IDs','NBI / Police / Barangay Clearance','2x2 ID Picture',
  'Valid IDs','Birth Certificate','Diploma / TOR','COE from Previous Employer'
];
const SHEET_LAST_COL = 'AQ';
const LOG_HEADERS = ['Timestamp','Employee ID','Employee Name','Action','From Status','To Status','Updated By','Detail'];
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
  { key:'contractEndDate', label:'Contract End',    always:false },
  { key:'tags',            label:'Tags',            always:false },
];

// ============================================================
// STATE
// ============================================================
let tokenClient, gapiInited=false, gisInited=false;
let accessToken=null, currentUser=null;
let employees=[], currentView='home', filterStatus=null, editingId=null;
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
  if(currentView==='dashboard'||currentView==='analytics'||currentView==='home') renderView();
}
function updateThemeIcon(theme){
  // Support both sidebar (old) and topbar (new) theme icons
  ['theme-icon-dark','theme-icon-light'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display=(id==='theme-icon-dark'?theme==='dark':theme==='light')?'':'none';
  });
}

// Relative time helper — e.g. "2m ago", "3h ago", "5d ago"
function timeAgo(dateStr){
  if(!dateStr) return '';
  const d=new Date(dateStr);
  if(isNaN(d.getTime())) return '';
  const diff=Math.floor((Date.now()-d.getTime())/1000);
  if(diff<60) return 'just now';
  if(diff<3600) return Math.floor(diff/60)+'m ago';
  if(diff<86400) return Math.floor(diff/3600)+'h ago';
  if(diff<604800) return Math.floor(diff/86400)+'d ago';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
initTheme();
// Activate static Lucide icons in sidebar/topbar on first paint
document.addEventListener('DOMContentLoaded', () => {
  if(typeof lucide !== 'undefined') lucide.createIcons();
});

// ============================================================
// SIDEBAR INIT
// ============================================================
function initSidebar(){
  const collapsed = localStorage.getItem('hr_sidebar_collapsed') === 'true';
  if(collapsed){
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.add('collapsed');
  }
}

function toggleSidebar(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem('hr_sidebar_collapsed', isCollapsed ? 'true' : 'false');
  // IX icons: rotation is handled by CSS (.sidebar.collapsed ~ .main .ix-toggle-icon)
  // No DOM swap needed — just ensure icons are rendered
  if(typeof IX !== 'undefined') IX.createIcons();
}

// ============================================================
// KEYBOARD SHORTCUTS
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
    if(document.getElementById('notif-drawer')?.classList.contains('open')){ closeNotifDrawer(); return; }
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

// Close search dropdown when clicking outside
document.addEventListener('click', e => {
  const wrap = document.getElementById('topbar-search-wrap');
  if (wrap && !wrap.contains(e.target)) closeSearchDropdown();
});

// ============================================================
// FORM DRAFT AUTOSAVE
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
    await Promise.all([loadData(),loadStoreDetails(),loadAnnouncements()]);
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
    await chk(LOG_SHEET,LOG_HEADERS,'A1:H1');
    await chk(ROLE_LOG_SHEET,ROLE_LOG_HEADERS,'A1:E1');
    await chk(ANNOUNCEMENTS_SHEET,['ID','Title','Body','PostedBy','Timestamp','Active'],'A1:F1');
    await chk(EVENTS_SHEET_APP,['ID','Title','Date','Note','PostedBy','Active'],'A1:F1');
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
    renderSidebar();
    // Let the router decide the view based on the current URL hash
    if(typeof Router !== 'undefined' && window.location.hash && window.location.hash !== '#'){
      Router.init();
    } else {
      renderView();
    }
    updateNotifBadge();
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
        <div style="font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:var(--text)">Could Not Load Data</div>
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

async function writeLog(empId,name,action,from,to,detail){
  try{
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId:SHEET_ID,range:`${LOG_SHEET}!A:H`,
      valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',
      resource:{values:[[ts(),empId,name,action,from,to,currentUser?.email||'Unknown',(detail||'')]]}
    });
    logCache=null;
  }catch(e){console.warn('Log write failed:',e);}
}

// Compute a human-readable summary of what changed between old and new employee data
function diffEmployeeChanges(oldEmp, newData){
  const changes=[];
  // Status change
  if(oldEmp.status !== newData.status && newData.status){
    changes.push(`Status: ${oldEmp.status||'—'} → ${newData.status}`);
  }
  // Deployment status
  if(normalizeDeployStatus(oldEmp.deploymentStatus) !== normalizeDeployStatus(newData.deploymentStatus) && newData.deploymentStatus){
    changes.push(`Deployment: ${oldEmp.deploymentStatus||'—'} → ${newData.deploymentStatus}`);
  }
  // Mobile number
  if(!oldEmp.mobile && newData.mobile) changes.push('Added mobile number');
  else if(oldEmp.mobile && !newData.mobile) changes.push('Removed mobile number');
  else if(oldEmp.mobile && newData.mobile && oldEmp.mobile!==newData.mobile) changes.push('Updated mobile number');
  // Email
  if(!oldEmp.email && newData.email) changes.push('Added email address');
  else if(oldEmp.email && newData.email && oldEmp.email!==newData.email) changes.push('Updated email address');
  // Bank account
  if(!oldEmp.bankAccount && newData.bankAccount) changes.push('Added bank account');
  else if(oldEmp.bankAccount && !newData.bankAccount) changes.push('Removed bank account');
  // Gov IDs
  const govFields=[['sss','SSS'],['philhealth','PhilHealth'],['pagibig','Pag-IBIG'],['tin','TIN']];
  govFields.forEach(([k,label])=>{
    if(!oldEmp[k] && newData[k]) changes.push(`Added ${label} number`);
    else if(oldEmp[k] && !newData[k]) changes.push(`Removed ${label} number`);
  });
  // Requirements (boolean fields)
  const reqMap={medicalCert:'Medical Certificate',govForms:'Government IDs/Forms',clearance:'NBI/Clearance',idPicture:'2x2 ID Picture',validIdCopy:'Valid ID Copy',birthCert:'Birth Certificate',diplomaTor:'Diploma/TOR',previousCoe:'COE',preEmploymentForms:'Pre-Employment Forms',jobOffer:'Job Offer'};
  Object.entries(reqMap).forEach(([k,label])=>{
    if(!oldEmp[k] && newData[k]) changes.push(`Submitted: ${label}`);
    else if(oldEmp[k] && !newData[k]) changes.push(`Unsubmitted: ${label}`);
  });
  // QR status
  if(oldEmp.qrStatus !== newData.qrStatus && newData.qrStatus) changes.push(`QR: ${newData.qrStatus}`);
  // Contract status
  if(oldEmp.contractStatus !== newData.contractStatus && newData.contractStatus) changes.push(`Contract: ${newData.contractStatus}`);
  // Store assignment
  if(!oldEmp.storeAssignment && newData.storeAssignment) changes.push(`Assigned to store: ${newData.storeAssignment}`);
  else if(oldEmp.storeAssignment && newData.storeAssignment && oldEmp.storeAssignment!==newData.storeAssignment) changes.push(`Store changed to: ${newData.storeAssignment}`);
  // Region
  if(oldEmp.region !== newData.region && newData.region) changes.push(`Region: ${newData.region}`);
  // Notes
  if((!oldEmp.notes||oldEmp.notes==='') && newData.notes) changes.push('Added notes');
  else if(oldEmp.notes && newData.notes && oldEmp.notes!==newData.notes) changes.push('Updated notes');

  return changes.length ? changes.slice(0,4).join('; ') : '';
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
  const oldSheet=emp._sheet||getTargetSheet(oldStatus,emp.deploymentStatus)||ACTIVE_SHEET;
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
    const detail1=diffEmployeeChanges(emp,data);
    await writeLog(data.infinixId,`${data.firstName} ${data.lastName}`,'Status Changed / Moved',oldStatus,newStatus,detail1);
  }else{
    await gapi.client.sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`${oldSheet}!A${row}:${SHEET_LAST_COL}${row}`,valueInputOption:'RAW',resource:{values:[objToRow(data)]}});
    const detail2=diffEmployeeChanges(emp,data);
    await writeLog(data.infinixId,`${data.firstName} ${data.lastName}`,'Updated',oldStatus,newStatus,detail2);
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
async function apiBulkUpdateStatus(ids, newStatus, newDeployStatus){
  showLoading(true,`Updating ${ids.length} employees...`);
  let ok=0,fail=0;
  for(const id of ids){
    try{
      const emp=employees.find(e=>String(e.infinixId)===String(id));
      if(!emp)continue;
      const updated={...emp};
      if(newStatus) updated.status=newStatus;
      if(newDeployStatus) updated.deploymentStatus=newDeployStatus;
      const res=await apiUpdateEmployee(updated);
      if(res.ok)ok++;else fail++;
    }
    catch(e){fail++;}
  }
  showLoading(false);
  const label=newDeployStatus?`deployment → ${newDeployStatus}`:`status → ${newStatus}`;
  if(ok>0)toast(`Updated ${ok} employee(s): ${label}`,'success');
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
  const visColKeys = TABLE_COLUMNS.filter(c=>visibleCols.has(c.key)).map(c=>c.key);
  // Map column keys to appropriate skeleton cell widths and types
  const skMap = {
    fullName: `<div class="skeleton-base sk-cell sk-name" style="margin-bottom:3px"></div><div class="skeleton-base sk-cell" style="width:90px;height:10px;margin-top:4px;opacity:.6"></div>`,
    infinixId: `<div class="skeleton-base sk-cell sk-id"></div>`,
    status: `<div class="skeleton-base sk-badge"></div>`,
    statusDate: `<div class="skeleton-base sk-cell sk-short"></div>`,
    deploymentDate: `<div class="skeleton-base sk-cell sk-short"></div>`,
    deploymentStatus: `<div class="skeleton-base sk-badge"></div>`,
    requirements: `<div class="skeleton-base sk-cell sk-med"></div>`,
    qrStatus: `<div class="skeleton-base sk-badge"></div>`,
    region: `<div class="skeleton-base sk-cell sk-short"></div>`,
    storeAssignment: `<div class="skeleton-base sk-cell sk-med"></div>`,
    storeId: `<div class="skeleton-base sk-cell" style="width:65px"></div>`,
    rssName: `<div class="skeleton-base sk-cell sk-med"></div>`,
    bankName: `<div class="skeleton-base sk-cell sk-short"></div>`,
    contractStatus: `<div class="skeleton-base sk-badge"></div>`,
  };
  tbody.innerHTML=Array.from({length:count},()=>`
    <tr class="skeleton-row">
      ${visColKeys.map(k=>`<td>${skMap[k]||`<div class="skeleton-base sk-cell sk-short"></div>`}</td>`).join('')}
      <td><div class="skeleton-base sk-cell" style="width:80px"></div></td>
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
    else if(missingFieldFilter==='backout')list=employees.filter(e=>isBackoutDeployment(e.deploymentStatus)||isBackoutDeployment(e.deploymentStatusColL));
  }

  const q=(document.getElementById('search-input')?.value||'').toLowerCase().trim();
  if(q)list=list.filter(e=>(e.fullName||'').toLowerCase().includes(q)||String(e.infinixId).toLowerCase().includes(q)||(e.storeAssignment||'').toLowerCase().includes(q)||(e.storeId||'').toLowerCase().includes(q)||(e.region||'').toLowerCase().includes(q)||(e.rssName||'').toLowerCase().includes(q)||(e.email||'').toLowerCase().includes(q));
  if(filterRegion)list=list.filter(e=>normalizeRegion(e.region)===normalizeRegion(filterRegion));
  if(filterDeployStatus)list=list.filter(e=>e.deploymentStatus===filterDeployStatus);
  if(filterQR)list=list.filter(e=>e.qrStatus===filterQR);
  if(filterContractStatus)list=list.filter(e=>e.contractStatus===filterContractStatus);
  return sortEmployees(list);
}

// ============================================================
// SEARCH AUTOCOMPLETE — debounced, fuzzy, glassmorphism dropdown
// ============================================================
let _searchDebounce = null;
let _searchSuggestionIndex = -1;

function fuzzyMatch(str, query) {
  str = str.toLowerCase();
  query = query.toLowerCase();
  if (str.includes(query)) return { match: true, score: str.indexOf(query) === 0 ? 100 : 50 };
  // character-by-character fuzzy
  let si = 0, qi = 0, score = 0;
  while (si < str.length && qi < query.length) {
    if (str[si] === query[qi]) { score += (si === qi ? 3 : 1); qi++; }
    si++;
  }
  return { match: qi === query.length, score };
}

function getSearchSuggestions(q) {
  if (!q || q.length < 1) return [];
  const results = [];
  for (const e of employees) {
    const fields = [
      { v: e.fullName || '', type: 'name' },
      { v: String(e.infinixId || ''), type: 'id' },
      { v: e.storeAssignment || '', type: 'store' },
      { v: e.storeId || '', type: 'store' },
    ];
    let best = { match: false, score: -1 };
    let matchType = '';
    for (const f of fields) {
      if (!f.v) continue;
      const r = fuzzyMatch(f.v, q);
      if (r.match && r.score > best.score) { best = r; matchType = f.type; }
    }
    if (best.match) results.push({ emp: e, score: best.score, matchType });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

function highlightMatch(text, query) {
  if (!text || !query) return esc(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) +
    `<mark style="background:rgba(46,196,190,0.25);color:var(--teal-deep);border-radius:2px;padding:0 1px">${esc(text.slice(idx, idx + query.length))}</mark>` +
    esc(text.slice(idx + query.length));
}

function renderSearchDropdown(suggestions, q) {
  let dd = document.getElementById('search-dropdown');
  if (!dd) return;
  if (!suggestions.length) { closeSearchDropdown(); return; }

  // Position under the search input
  const input = document.getElementById('search-input');
  if (input) {
    const rect = input.getBoundingClientRect();
    dd.style.top    = (rect.bottom + 8) + 'px';
    dd.style.left   = rect.left + 'px';
    dd.style.width  = rect.width + 'px';
  }

  const STATUS_DOT = { Active:'#2E7D32', Floating:'#D4AF37', Resigned:'#CD7F32', AWOL:'#C62828', Terminated:'#7B5EA7', Backout:'#C62828' };
  _searchSuggestionIndex = -1;

  dd.innerHTML = suggestions.map((s, i) => {
    const e = s.emp;
    const initials = ((e.firstName || e.fullName || '?')[0] || '?').toUpperCase();
    const dot = STATUS_DOT[e.status] || 'var(--text3)';
    const subLabel = s.matchType === 'id' ? `ID: ${esc(String(e.infinixId))}` :
                     s.matchType === 'store' ? `Store: ${esc(e.storeAssignment || e.storeId || '')}` :
                     esc(e.storeAssignment || String(e.infinixId) || '');
    return `<div class="sd-item" data-id="${esc(String(e.infinixId))}" data-idx="${i}"
      onmousedown="selectSearchSuggestion('${esc(String(e.infinixId))}')"
      onmouseenter="highlightSuggestion(${i})">
      <div class="sd-avatar">${initials}</div>
      <div class="sd-info">
        <div class="sd-name">${highlightMatch(e.fullName || '', q)}</div>
        <div class="sd-sub">${subLabel}</div>
      </div>
      <div class="sd-right">
        <span class="sd-status-dot" style="background:${dot}"></span>
        <span class="sd-status-label" style="color:${dot}">${esc(e.status||'')}</span>
      </div>
    </div>`;
  }).join('');

  dd.classList.add('open');
}

function closeSearchDropdown() {
  const dd = document.getElementById('search-dropdown');
  if (dd) dd.classList.remove('open');
  _searchSuggestionIndex = -1;
}

function highlightSuggestion(idx) {
  document.querySelectorAll('.sd-item').forEach((el, i) => {
    el.classList.toggle('sd-active', i === idx);
  });
  _searchSuggestionIndex = idx;
}

function selectSearchSuggestion(id) {
  closeSearchDropdown();
  document.getElementById('search-input').value = '';
  openDetailPanel(id);
}

function onSearch() {
  clearTimeout(_searchDebounce);
  const q = (document.getElementById('search-input')?.value || '').trim();
  if (!q) {
    closeSearchDropdown();
    if(currentView==='active'||currentView==='inactive'){
      currentPage=1;
      renderTableRows(currentView==='inactive'?'inactive':'active');
    }
    return;
  }
  _searchDebounce = setTimeout(() => {
    const suggestions = getSearchSuggestions(q);
    renderSearchDropdown(suggestions, q);
  }, 300);
}

function onSearchKeydown(e) {
  const dd = document.getElementById('search-dropdown');
  const items = dd ? dd.querySelectorAll('.sd-item') : [];
  if (!dd || !dd.classList.contains('open') || !items.length) {
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = Math.min(_searchSuggestionIndex + 1, items.length - 1);
    highlightSuggestion(next);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = Math.max(_searchSuggestionIndex - 1, 0);
    highlightSuggestion(prev);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_searchSuggestionIndex >= 0 && items[_searchSuggestionIndex]) {
      const id = items[_searchSuggestionIndex].dataset.id;
      selectSearchSuggestion(id);
    } else if (items.length > 0) {
      const id = items[0].dataset.id;
      selectSearchSuggestion(id);
    }
  } else if (e.key === 'Escape') {
    closeSearchDropdown();
    document.getElementById('search-input').blur();
  }
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
    <div class="sf-item ${filterStatus===st?'active':''}" onclick="filterByStatus('${esc(st)}')" title="${esc(st)}">
      <span class="sf-dot" style="background:${STATUS_COLORS[st]}"></span><span class="sf-label">${esc(st)}</span>
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
  filterStatus=null;
  missingFieldFilter=null;
  currentPage=1;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  // Map view names to nav element ids
  const navMap={home:'nav-dashboard',dashboard:'nav-dashboard',active:'nav-active',inactive:'nav-inactive',
    'archive-resigned':'nav-archive-resigned','archive-awol':'nav-archive-awol',
    'archive-floating':'nav-archive-floating','archive-terminated':'nav-archive-terminated',
    'archive-backout':'nav-archive-backout',
    recruitment:'nav-recruitment',calendar:'nav-calendar',
    tracker:'nav-tracker',log:'nav-log',analytics:'nav-analytics',settings:'nav-settings'};
  const el=document.getElementById(navMap[v]||'nav-'+v);if(el)el.classList.add('active');
  const archiveSubs=['archive-resigned','archive-awol','archive-floating','archive-terminated','archive-backout'];
  const archiveParent=document.getElementById('nav-archive-group');
  if(archiveSubs.includes(v)&&archiveParent){archiveParent.classList.add('expanded');}
  renderSidebar();renderView();
}

function renderView(){
  // Page fade transition
  const contentEl=document.getElementById('content');
  if(contentEl){ contentEl.classList.remove('page-fade'); void contentEl.offsetWidth; contentEl.classList.add('page-fade'); }

  // Search visible on table/people views only
  const sw=document.getElementById('topbar-search-wrap');
  if(sw) sw.style.visibility=(currentView==='active'||currentView==='inactive')?'visible':'hidden';

  if(currentView==='home')renderHome();
  else if(currentView==='dashboard')renderAnalyticsPage();
  else if(currentView==='analytics')renderAnalyticsPage();
  else if(currentView==='active')renderEmployeeTable('active');
  else if(currentView==='inactive')renderEmployeeTable('inactive');
  else if(currentView==='archive-resigned')renderArchivePage('Resigned');
  else if(currentView==='archive-awol')renderArchivePage('AWOL');
  else if(currentView==='archive-floating')renderArchivePage('Floating');
  else if(currentView==='archive-terminated')renderArchivePage('Terminated');
  else if(currentView==='archive-backout')renderArchivePage('Backout');
  else if(currentView==='recruitment')renderRecruitmentPage();
  else if(currentView==='calendar')renderCalendarPage();
  else if(currentView==='tracker')renderTracker();
  else if(currentView==='log')renderLog();
  else if(currentView==='settings')renderSettingsPage();

  // Activate any Lucide icons injected by page renderers
  if(typeof lucide !== 'undefined') lucide.createIcons();
}

function drillDown(filterKey){
  missingFieldFilter=filterKey;
  filterStatus=null;
  bulkMode=false;
  selectedIds.clear();
  currentPage=1;
  Router.navigate('/people');
}

function dashSearch(q){
  if(!q.trim())return;
  document.getElementById('search-input').value=q;
  Router.navigate('/people');
}

// ============================================================
// EMPLOYEE TABLE
// ============================================================
function renderEmployeeTable(type){
  const isActive=type==='active';
  let label=filterStatus?filterStatus+' Employees':(isActive?'Active Employees':'Inactive Employees');
  if(missingFieldFilter){
    const labels={notDeployed:'Not Yet Deployed',notScanned:'QR Not Scanned',contractPending:'Contract Pending',missingRequirements:'Requirements Incomplete',missingGovIds:'Missing Gov IDs',missingBank:'Missing Bank Account',missingMobile:'Missing Mobile',missingInfinixId:'Missing Infinix ID',missingStore:'No Store Assignment',backout:'Backout Cases'};
    label=(labels[missingFieldFilter]||'Filtered')+' Employees';
  }
  document.getElementById('topbar-title').textContent=label;
  const _sub1=document.getElementById('topbar-sub'); if(_sub1) _sub1.textContent='Click a row to view details';

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
            <i class="fi fi-sr-download"></i>
            Export Excel
          </button>`:''}
          <button class="btn btn-ghost btn-sm" id="bulk-toggle-btn" onclick="toggleBulkMode()" style="display:flex;align-items:center;gap:5px">
            <i class="fi fi-sr-list"></i>
            Select
          </button>
        </div>
      </div>
      <div class="bulk-bar hidden" id="bulk-bar">
        <span class="bulk-count" id="bulk-count">0 selected</span>
        <div class="bulk-sep"></div>
        <span class="bulk-label">Employment status:</span>
        <select class="bulk-status-sel" id="bulk-status-sel">
          ${STATUSES.map(st=>`<option value="${esc(st)}">${esc(st)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="doBulkStatusChange()">Apply</button>
        <div class="bulk-sep"></div>
        <span class="bulk-label">Deploy status:</span>
        <select class="bulk-status-sel" id="bulk-deploy-sel">
          <option value="NOT YET DEPLOYED">Not Yet Deployed</option>
          <option value="DEPLOYED">Deployed</option>
          <option value="BACKOUT">Backout</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="doBulkDeployChange()">Apply</button>
        <div class="bulk-sep"></div>
        <button class="btn btn-ghost btn-sm" onclick="clearSelection()">Deselect All</button>
        <button class="btn btn-danger btn-sm" onclick="doBulkDelete()">Delete Selected</button>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="toggleBulkMode()">✕ Cancel</button>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="td-check no-sort" id="col-check-header" style="display:none"><input type="checkbox" id="chk-all" onchange="toggleSelectAll(this.checked)"></th>
              <th class="no-sort td-actions-col">Actions</th>
              ${TABLE_COLUMNS.filter(c=>visibleCols.has(c.key)).map(c=>`<th class="col-${esc(c.key)}" data-sort="${esc(c.key)}" onclick="toggleSort('${esc(c.key)}')">${esc(c.label)}</th>`).join('')}
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
    fullName:e=>`<td class="col-fullName"><div class="td-name">${esc(e.fullName||'')}</div><div class="td-sub">${esc(e.email||'')}</div></td>`,
    infinixId:e=>`<td class="col-infinixId"><span class="td-id">${esc(e.infinixId)}</span></td>`,
    status:e=>`<td class="col-status">${badgeHTML(e.status)}</td>`,
    statusDate:e=>`<td class="col-statusDate" style="color:var(--text2);font-size:12px">${esc(e.statusDate||'—')}</td>`,
    deploymentDate:e=>`<td class="col-deploymentDate" style="color:var(--text2);font-size:12px">${esc(e.deploymentDate||'—')}</td>`,
    deploymentStatus:e=>`<td class="col-deploymentStatus">${badgeHTML(e.deploymentStatus,e.deploymentStatus?e.deploymentStatus.replace(/ /g,'-'):null)}</td>`,
    requirements:e=>`<td class="col-requirements">${reqProgressHTML(e)}</td>`,
    qrStatus:e=>{const qr=e.qrStatus||'NOT SCANNED';return`<td class="col-qrStatus">${badgeHTML(qr,qr.replace(/ /g,'-'))}</td>`},
    region:e=>`<td class="col-region" style="color:var(--text2)">${esc(e.region||'—')}</td>`,
    storeAssignment:e=>`<td class="col-storeAssignment" style="color:var(--text2)">${esc(e.storeAssignment||'—')}</td>`,
    storeId:e=>`<td class="col-storeId" style="color:var(--text3);font-size:11px">${esc(e.storeId||'—')}</td>`,
    rssName:e=>`<td class="col-rssName" style="color:var(--text2)">${esc(e.rssName||'—')}</td>`,
    bankName:e=>`<td class="col-bankName" style="color:var(--text2)">${esc(e.bankName||'—')}</td>`,
    contractStatus:e=>`<td class="col-contractStatus">${badgeHTML(e.contractStatus||'NOT YET SENT',(e.contractStatus||'NOT YET SENT').replace(/ /g,'-'))}</td>`,
    contractEndDate:e=>{
      const d=e.contractEndDate?new Date(e.contractEndDate):null;
      if(!d||isNaN(d)) return `<td class="col-contractEndDate" style="color:var(--text3)">—</td>`;
      const today=new Date(); today.setHours(0,0,0,0);
      const daysLeft=Math.ceil((d-today)/(1000*60*60*24));
      const label=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
      if(daysLeft<0) return `<td class="col-contractEndDate"><span class="expiry-badge expired"><i class="fi fi-sr-triangle-warning" style="font-size:10px"></i> Expired</span></td>`;
      if(daysLeft<=30) return `<td class="col-contractEndDate"><span class="expiry-badge expiring"><i class="fi fi-sr-clock" style="font-size:10px"></i> ${daysLeft}d left</span></td>`;
      return `<td class="col-contractEndDate" style="color:var(--text2);font-size:12px">${label}</td>`;
    },
    tags:e=>{
      if(!e.tags) return `<td class="col-tags"></td>`;
      const tagList=(e.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
      if(!tagList.length) return `<td class="col-tags"></td>`;
      return `<td class="col-tags"><div class="tag-cell">${tagList.map(t=>`<span class="emp-tag">${esc(t)}</span>`).join('')}</div></td>`;
    },
  };

  if(!page.length){
    const q=(document.getElementById('search-input')?.value||'').trim();
    const hasFilters=activeFilterCount()>0||!!filterStatus||!!missingFieldFilter||!!q;
    const clearBtn=hasFilters?`<button class="btn btn-ghost btn-sm" onclick="resetFilters();document.getElementById('search-input').value='';renderView()">Clear all filters</button>`:'';
    tbody.innerHTML=`<tr><td colspan="20">${
      typeof Components!=='undefined'
        ? Components.emptyState(hasFilters
            ? { icon:'🔍', title:'No matches found', message:'Try adjusting your filters or search term.', action:clearBtn }
            : { icon:'👥', title:'No employees here', message:'Add your first employee using the button above.' })
        : `<div class="empty-state"><div class="es-title">${hasFilters?'No matches found':'No employees here'}</div></div>`
    }</td></tr>`;
  }else{
    const visibleColKeys=TABLE_COLUMNS.filter(c=>visibleCols.has(c.key)).map(c=>c.key);
    tbody.innerHTML=page.map(e=>`
      <tr class="${selectedIds.has(e.infinixId)?'selected':''}" onclick="handleRowClick(event,'${esc(e.infinixId)}')" data-id="${esc(e.infinixId)}">
        <td class="td-check" style="display:${bulkMode?'':'none'}" onclick="event.stopPropagation()">
          <input type="checkbox" ${selectedIds.has(e.infinixId)?'checked':''} onchange="toggleSelect(event,'${esc(e.infinixId)}',this.checked)">
        </td>
        <td onclick="event.stopPropagation()" class="td-actions-cell">
          <button class="btn btn-tbl-edit write-action" onclick="openEditModal('${esc(e.infinixId)}')"><i class='fi fi-sr-edit' style='font-size:11px'></i> Edit</button>
          <button class="btn btn-tbl-delete" onclick="confirmDelete('${esc(e.infinixId)}','${esc(e.fullName||'')}')"><i class='fi fi-sr-trash' style='font-size:11px'></i> Del</button>
        </td>
        ${visibleColKeys.map(k=>(colRender[k]||(() =>`<td>—</td>`))(e)).join('')}
      </tr>`).join('');
    _attachRowPreview(tbody, page);
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

// ── Row Quick-Preview Tooltip ──────────────────────────────
let _rpTimer=null, _rpEl=null;
function _attachRowPreview(tbody, page){
  if(!_rpEl){
    _rpEl=document.createElement('div');
    _rpEl.className='row-preview';
    document.body.appendChild(_rpEl);
  }
  tbody.querySelectorAll('tr[data-id]').forEach(tr=>{
    tr.addEventListener('mouseenter', e=>{
      const id=tr.dataset.id;
      const emp=page.find(x=>String(x.infinixId)===String(id));
      if(!emp) return;
      _rpTimer=setTimeout(()=>{
        _rpEl.innerHTML=`
          <div class="rp-name">${esc(emp.fullName||'—')}</div>
          <div class="rp-divider"></div>
          <div class="rp-row"><span class="rp-label">Status</span>${badgeHTML(emp.status)}</div>
          <div class="rp-row"><span class="rp-label">Store</span><span class="rp-val">${esc(emp.storeAssignment||'—')}</span></div>
          <div class="rp-row"><span class="rp-label">Region</span><span class="rp-val">${esc(emp.region||'—')}</span></div>
          <div class="rp-row"><span class="rp-label">Deployed</span>${badgeHTML(emp.deploymentStatus||'NOT YET DEPLOYED',(emp.deploymentStatus||'NOT-YET-DEPLOYED').replace(/ /g,'-'))}</div>
          <div class="rp-row"><span class="rp-label">Contract</span>${badgeHTML(emp.contractStatus||'NOT YET SENT',(emp.contractStatus||'NOT-YET-SENT').replace(/ /g,'-'))}</div>`;
        const rect=tr.getBoundingClientRect();
        const top=Math.min(rect.top, window.innerHeight-240);
        _rpEl.style.cssText=`top:${top}px;left:${rect.right+12}px`;
        _rpEl.classList.add('visible');
      }, 550);
    });
    tr.addEventListener('mouseleave', ()=>{
      clearTimeout(_rpTimer);
      _rpEl.classList.remove('visible');
    });
    tr.addEventListener('click', ()=>{
      clearTimeout(_rpTimer);
      _rpEl.classList.remove('visible');
    });
  });
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

function goPage(p){
  const list=filteredEmployees(currentView==='inactive'?'inactive':'active');
  const totalPages=Math.max(1,Math.ceil(list.length/pageSize));
  currentPage=Math.max(1,Math.min(p,totalPages));
  renderTableRows(currentView==='inactive'?'inactive':'active');
}
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
  document.getElementById('confirm-icon').innerHTML='<i class="fi fi-sr-refresh"></i>';
  document.getElementById('confirm-icon').className='confirm-icon';
  document.getElementById('confirm-title').textContent='Bulk Status Update';
  document.getElementById('confirm-msg').textContent=`Change ${ids.length} employee(s) status to "${newStatus}"?`;
  document.getElementById('confirm-ok').textContent='Update';
  _setupTypeToConfirm(null, ()=>{closeConfirm();apiBulkUpdateStatus(ids,newStatus);});
  document.getElementById('confirm-overlay').classList.add('open');
}
function doBulkDeployChange(){
  if(!canWrite()){denyWrite();return;}
  const sel=document.getElementById('bulk-deploy-sel');
  const newDeploy=sel?.value;
  if(!newDeploy||selectedIds.size===0)return;
  const ids=[...selectedIds];
  document.getElementById('confirm-icon').innerHTML='<i class="fi fi-sr-marker"></i>';
  document.getElementById('confirm-icon').className='confirm-icon';
  document.getElementById('confirm-title').textContent='Bulk Deployment Update';
  document.getElementById('confirm-msg').textContent=`Set deployment status to "${newDeploy}" for ${ids.length} employee(s)?`;
  document.getElementById('confirm-ok').textContent='Update';
  _setupTypeToConfirm(null, ()=>{closeConfirm();apiBulkUpdateStatus(ids, null, newDeploy);});
  document.getElementById('confirm-overlay').classList.add('open');
}
function doBulkDelete(){
  if(!canDeleteRecords()){toast('Only Owner or HR/AGENCY can delete records.','error');return;}
  const ids=[...selectedIds];if(ids.length===0)return;
  document.getElementById('confirm-icon').innerHTML='<i class="fi fi-sr-trash"></i>';
  document.getElementById('confirm-icon').className='confirm-icon danger';
  document.getElementById('confirm-title').textContent='Bulk Delete';
  document.getElementById('confirm-msg').innerHTML=`Permanently delete <strong style="color:var(--danger)">${ids.length} employee(s)</strong>? This cannot be undone.`;
  document.getElementById('confirm-ok').textContent='Delete All';
  _setupTypeToConfirm(`DELETE ${ids.length}`, async ()=>{
    closeConfirm();showLoading(true,`Deleting ${ids.length} employees...`);
    let ok=0,fail=0;
    for(const id of ids){try{const r=await apiDeleteEmployee(id);if(r.ok)ok++;else fail++;}catch(e){fail++;}}
    showLoading(false);
    if(ok>0)toast(`Deleted ${ok} employee(s)`,'success');
    if(fail>0)toast(`${fail} deletion(s) failed`,'error');
    selectedIds.clear();await loadData();
  });
  document.getElementById('confirm-overlay').classList.add('open');
}

// ============================================================
// DETAIL PANEL
// ============================================================
function openDetailPanel(id){
  const emp=employees.find(e=>String(e.infinixId)===String(id));if(!emp)return;
  detailEmpId=id;
  const panel=document.getElementById('detail-panel');
  const backdrop=document.getElementById('dp-backdrop');
  panel.innerHTML=buildDetailHTML(emp);
  panel.classList.add('open');
  if(backdrop)backdrop.classList.add('open');
  document.body.classList.add('panel-open');
  loadEmployeeAudit(id);
  // activate first tab
  switchDpTab('info');
}
function closeDetailPanel(){
  const panel=document.getElementById('detail-panel');
  const backdrop=document.getElementById('dp-backdrop');
  panel.classList.remove('open');
  if(backdrop)backdrop.classList.remove('open');
  document.body.classList.remove('panel-open');
  detailEmpId=null;
}

// ============================================================
// QUICK ACTIONS (Detail Panel)
// ============================================================
async function quickAction(type, infinixId){
  if(!canWrite()){denyWrite();return;}
  const emp = employees.find(e=>String(e.infinixId)===String(infinixId));
  if(!emp){ toast('Employee not found.','error'); return; }
  let updateData = {...emp};
  let label = '';
  if(type==='deployed'){
    updateData.deploymentStatus = 'DEPLOYED';
    if(!updateData.deploymentDate) updateData.deploymentDate = new Date().toISOString().slice(0,10);
    label = 'Marked as Deployed';
  } else if(type==='scanned'){
    updateData.qrStatus = 'SCANNED';
    label = 'QR Scanned';
  } else if(type==='contract'){
    updateData.contractStatus = 'SENT';
    if(!updateData.contractSentDate) updateData.contractSentDate = new Date().toISOString().slice(0,10);
    label = 'Contract Sent';
  } else { return; }
  // Disable button immediately for visual feedback
  const btn = document.querySelector(`.dp-qa-btn[onclick*="${type}"]`);
  if(btn){ btn.disabled = true; btn.style.opacity = '0.5'; }
  showLoading(true, 'Updating…');
  try{
    const result = await apiUpdateEmployee(updateData);
    if(result.ok){
      toast(label+' — '+esc(emp.fullName||emp.firstName||infinixId),'success');
      await loadData();
      // Re-open panel with refreshed data
      openDetailPanel(infinixId);
    } else {
      toast(result.msg||'Update failed','error');
      if(btn){ btn.disabled=false; btn.style.opacity=''; }
    }
  }catch(e){
    toast('Error: '+e.message,'error');
    if(btn){ btn.disabled=false; btn.style.opacity=''; }
  }finally{ showLoading(false); }
}
function switchDpTab(tab){
  document.querySelectorAll('.dp-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.dp-tab').forEach(t=>t.classList.remove('active'));
  const pane=document.getElementById('dp-pane-'+tab);
  const btn=document.querySelector(`.dp-tab[data-tab="${tab}"]`);
  if(pane)pane.classList.add('active');
  if(btn)btn.classList.add('active');
}
function dpEdit(){
  if(!canWrite()){denyWrite();return;}const id=detailEmpId;if(!id)return;closeDetailPanel();openEditModal(id);}
function dpDelete(){
  if(!canDeleteRecords()){toast('Only Owner or HR/AGENCY can delete records.','error');return;}
  if(!detailEmpId)return;
  const emp=employees.find(e=>String(e.infinixId)===String(detailEmpId));
  if(emp)confirmDelete(detailEmpId,emp.fullName||`${emp.firstName||''} ${emp.lastName||''}`.trim());
}

function buildDetailHTML(e){
  const field=(label,val,full=false)=>`<div class="dp-field${full?' dp-field-full':''}"><div class="dp-field-label">${esc(label)}</div><div class="dp-field-val${val?'':' muted'}">${val||'—'}</div></div>`;
  const fieldSensitive=(label,val,full=false)=>`<div class="dp-field${full?' dp-field-full':''}"><div class="dp-field-label">${esc(label)}</div><div class="dp-field-val sensitive${val?'':' muted'}">${val||'—'}</div></div>`;
  const missing=v=>`<span style="color:var(--danger);font-size:10px">⚠ Missing</span>`;

  // Profile completion checks
  const checks=[
    {label:'Employment Status', done:!!e.status&&e.status!=='-'},
    {label:'Deployment Status', done:e.deploymentStatus==='DEPLOYED'},
    {label:'QR Scanned',        done:e.qrStatus==='SCANNED'},
    {label:'Contract Sent',     done:e.contractStatus==='SENT'},
    {label:'Mobile Number',     done:!isMissing(e.mobile)},
    {label:'Email Address',     done:!isMissing(e.email)},
    {label:'SSS Number',        done:!isMissing(e.sss)},
    {label:'PhilHealth',        done:!isMissing(e.philhealth)},
    {label:'Pag-IBIG',          done:!isMissing(e.pagibig)},
    {label:'Bank Account',      done:!isMissing(e.bankAccount)},
    {label:'Date of Birth',     done:!isMissing(e.dob)},
    {label:'Region Assigned',   done:!isMissing(e.region)},
  ];
  const doneCount=checks.filter(c=>c.done).length;
  const pct=Math.round(doneCount/checks.length*100);
  const barClass=pct===100?'':pct>=60?'warn':'danger';
  const barColorStr=pct===100?'var(--success)':pct>=60?'var(--warning)':'var(--danger)';

  // Birthday banner
  let bdayBanner='';
  if(e.dob){
    const bd=new Date(e.dob); const now=new Date();
    if(!isNaN(bd)){
      const thisYear=new Date(now.getFullYear(),bd.getMonth(),bd.getDate());
      const diff=Math.round((thisYear-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/(1000*60*60*24));
      if(diff===0) bdayBanner=`<div style="background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.3);border-radius:8px;padding:7px 12px;font-size:11.5px;color:var(--warning);margin-bottom:12px">🎉 Birthday today! Happy Birthday, ${esc(e.firstName||'!')}!</div>`;
      else if(diff>0&&diff<=7) bdayBanner=`<div style="background:rgba(0,200,170,0.06);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:11.5px;color:var(--accent);margin-bottom:12px">🎂 Birthday in ${diff} day${diff!==1?'s':''}</div>`;
    }
  }

  // Status dot color
  const statusColors={'Active':'var(--success)','Floating':'var(--warning)','Resigned':'#CD7F32','AWOL':'var(--danger)','Terminated':'var(--purple)','Backout':'var(--danger)'};
  const statusDotColor=statusColors[e.status]||'var(--text3)';

  // Avatar initials
  const initials=((e.firstName||e.fullName||'?')[0]||'?').toUpperCase();

  // HERO HEADER
  const hero=`
    <div class="dp-hero">
      <div class="dp-avatar-wrap">
        <div class="dp-avatar">${initials}</div>
        <div class="dp-status-dot-hero" style="background:${statusDotColor}"></div>
      </div>
      <div class="dp-hero-info">
        <div class="dp-hero-name">${esc(e.fullName||`${e.firstName||''} ${e.lastName||''}`.trim())}</div>
        <div class="dp-hero-id">${esc(e.infinixId||'No ID')}</div>
        <div class="dp-hero-badges">
          ${badgeHTML(e.status)}
          ${e.deploymentStatus?badgeHTML(e.deploymentStatus,e.deploymentStatus.replace(/ /g,'-')):''}
        </div>
      </div>
      <button class="dp-close-btn" onclick="closeDetailPanel()">✕</button>
    </div>`;

  // TABS
  const tabs=`
    <div class="dp-tabs">
      <button class="dp-tab active" data-tab="info" onclick="switchDpTab('info')">Profile</button>
      <button class="dp-tab" data-tab="reqs" onclick="switchDpTab('reqs')">Requirements</button>
      <button class="dp-tab" data-tab="notes" onclick="switchDpTab('notes')">Notes</button>
      <button class="dp-tab" data-tab="audit" onclick="switchDpTab('audit')">Audit</button>
    </div>`;

  // PANE: Profile Info
  const paneInfo=`
    <div class="dp-pane active" id="dp-pane-info">
      ${bdayBanner}
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-document" style="font-size:12px"></i> Employment</div>
        <div class="dp-grid">
          ${field('Status',badgeHTML(e.status))}
          ${field('QR Status',badgeHTML(e.qrStatus||'NOT SCANNED',(e.qrStatus||'NOT SCANNED').replace(/ /g,'-')))}
          ${field('Deploy Status',e.deploymentStatus?badgeHTML(e.deploymentStatus,e.deploymentStatus.replace(/ /g,'-')):'')}
          ${field('Deploy Date',esc(e.deploymentDate))}
          ${field('Contract',badgeHTML(e.contractStatus||'NOT YET SENT',(e.contractStatus||'NOT YET SENT').replace(/ /g,'-')))}
          ${field('Status Date',esc(e.statusDate))}
          ${field('Remarks',esc(e.statusRemarks))}
        </div>
      </div>
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-user" style="font-size:12px"></i> Personal</div>
        <div class="dp-grid">
          ${field('First Name',esc(e.firstName))}
          ${field('Last Name',esc(e.lastName))}
          ${field('Middle Name',esc(e.middleName))}
          ${field('Gender',esc(e.gender))}
          ${field('Marital Status',esc(e.maritalStatus))}
          ${fieldSensitive('Date of Birth',esc(e.dob))}
          ${fieldSensitive('Mobile',esc(e.mobile))}
          ${fieldSensitive('Email',esc(e.email))}
          ${fieldSensitive('Address',esc(e.address),true)}
        </div>
      </div>
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-marker" style="font-size:12px"></i> Assignment</div>
        <div class="dp-grid">
          ${field('Region',esc(e.region))}
          ${field('Store',esc(e.storeAssignment))}
          ${field('Store ID',esc(e.storeId))}
          ${field('RSS Name',esc(e.rssName))}
          ${field('RSS ID',esc(e.rssId))}
          ${field('Last Updated',esc(e.lastUpdated))}
        </div>
      </div>
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-id-card-clip-alt" style="font-size:12px"></i> Government IDs</div>
        <div class="dp-grid">
          ${fieldSensitive('SSS',e.sss?esc(e.sss):missing())}
          ${fieldSensitive('PhilHealth',e.philhealth?esc(e.philhealth):missing())}
          ${fieldSensitive('Pag-IBIG',esc(e.pagibig))}
          ${fieldSensitive('TIN',esc(e.tin))}
        </div>
      </div>
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-clipboard-list" style="font-size:12px"></i> Payroll</div>
        <div class="dp-grid">
          ${fieldSensitive('Basic Wage',e.basicWage?'₱'+Number(e.basicWage).toLocaleString():'')}
          ${fieldSensitive('Bank',esc(e.bankName))}
          ${fieldSensitive('Account No.',e.bankAccount?esc(e.bankAccount):missing())}
        </div>
      </div>
    </div>`;

  // PANE: Requirements
  const reqDone=REQUIREMENT_FIELDS.filter(([k])=>e[k]).length;
  const reqTotal=REQUIREMENT_FIELDS.length;
  const reqPct=reqTotal?Math.round(reqDone/reqTotal*100):0;
  const reqBarClass=reqPct===100?'':reqPct>=60?'warn':'danger';
  const paneReqs=`
    <div class="dp-pane" id="dp-pane-reqs">
      <div class="dp-req-card">
        <div class="dp-req-header">
          <div class="dp-req-label">Requirements Completion</div>
          <div class="dp-req-pct">${reqPct}%</div>
        </div>
        <div class="dp-req-bar-wrap">
          <div class="dp-req-bar-fill${reqBarClass?' '+reqBarClass:''}" style="width:${reqPct}%"></div>
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-bottom:8px">${reqDone} of ${reqTotal} submitted · Required: 9</div>
        <div class="dp-req-items">
          ${REQUIREMENT_FIELDS.map(([k,label])=>`<span class="dp-req-chip ${e[k]?'done':'miss'}">${e[k]?'✓':'✗'} ${esc(label)}</span>`).join('')}
        </div>
      </div>
      <div class="dp-section" style="margin-top:8px">
        <div class="dp-section-title"><i class="fi fi-sr-chart-histogram" style="font-size:12px"></i> Profile Completion</div>
        <div class="dp-req-card" style="margin-bottom:0">
          <div class="dp-req-header">
            <div class="dp-req-label">Overall Profile</div>
            <div class="dp-req-pct" style="color:${barColorStr}">${pct}%</div>
          </div>
          <div class="dp-req-bar-wrap">
            <div class="dp-req-bar-fill${pct===100?'':pct>=60?' warn':' danger'}" style="width:${pct}%"></div>
          </div>
          <div class="dp-req-items" style="margin-top:8px">
            ${checks.map(c=>`<span class="dp-req-chip ${c.done?'done':'miss'}">${c.done?'✓':'✗'} ${esc(c.label)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

  // PANE: Notes
  const paneNotes=`
    <div class="dp-pane" id="dp-pane-notes">
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-edit" style="font-size:12px"></i> Notes / Remarks</div>
        <textarea class="dp-notes-area notes-area" id="dp-notes-area" placeholder="Add notes or remarks about this employee…">${esc(e.notes||'')}</textarea>
        <div style="margin-top:8px;display:flex;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm notes-save-btn" onclick="saveNotes('${esc(e.infinixId)}',document.getElementById('dp-notes-area').value)">💾 Save Notes</button>
        </div>
      </div>
    </div>`;

  // PANE: Audit
  const paneAudit=`
    <div class="dp-pane" id="dp-pane-audit">
      <div class="dp-section">
        <div class="dp-section-title"><i class="fi fi-sr-clock" style="font-size:12px"></i> Audit Trail</div>
        <div class="dp-log-list" id="dp-audit-inner">
          <div style="font-size:12px;color:var(--text3);padding:8px 0">Loading…</div>
        </div>
      </div>
    </div>`;

  // FOOTER ACTIONS
  const footer=`
    <div class="detail-panel-footer">
      ${canWrite()?`<button class="btn btn-dp-edit write-action" id="dp-edit-btn" onclick="dpEdit()"><i class="fi fi-sr-edit" style="font-size:13px"></i> Edit</button>`:''}
      ${canDeleteRecords()?`<button class="btn btn-dp-delete" id="dp-delete-btn" onclick="dpDelete()"><i class="fi fi-sr-trash" style="font-size:13px"></i> Delete</button>`:''}
    </div>`;

  // QUICK ACTIONS (only for write-capable roles)
  const canAct = canWrite();
  const isDeployed = e.deploymentStatus === 'DEPLOYED';
  const isScanned  = e.qrStatus === 'SCANNED';
  const isSent     = e.contractStatus === 'SENT';
  const quickActions = canAct ? `
    <div class="dp-quick-actions">
      <button class="dp-qa-btn${isDeployed?' done':''}" onclick="quickAction('deployed','${esc(e.infinixId)}')" ${isDeployed?'disabled':''} title="${isDeployed?'Already deployed':'Mark as Deployed'}">
        <i class="fi ${isDeployed?'fi-sr-check':'fi-sr-marker'}" style="font-size:11px"></i> Mark Deployed
      </button>
      <button class="dp-qa-btn${isScanned?' done':''}" onclick="quickAction('scanned','${esc(e.infinixId)}')" ${isScanned?'disabled':''} title="${isScanned?'Already scanned':'Mark QR Scanned'}">
        <i class="fi ${isScanned?'fi-sr-check':'fi-sr-qrcode'}" style="font-size:11px"></i> Mark QR Scanned
      </button>
      <button class="dp-qa-btn${isSent?' done':''}" onclick="quickAction('contract','${esc(e.infinixId)}')" ${isSent?'disabled':''} title="${isSent?'Contract already sent':'Mark Contract Sent'}">
        <i class="fi ${isSent?'fi-sr-check':'fi-sr-document'}" style="font-size:11px"></i> Mark Contract Sent
      </button>
    </div>` : '';

  return hero+tabs+quickActions+`<div class="dp-body">`+paneInfo+paneReqs+paneNotes+paneAudit+`</div>`+footer;
}

async function loadEmployeeAudit(infinixId){
  try{
    // FIX: Use spread copy to avoid mutating logCache when reversing
    if(!logCache){const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${LOG_SHEET}!A2:H`});logCache=r.result.values||[];}
    const entries=[...logCache].filter(r=>String(r[1]||'').trim()===String(infinixId).trim()).reverse();
    const el=document.getElementById('dp-audit-inner');if(!el)return;
    if(!entries.length){el.innerHTML=`<div class="audit-empty">No activity recorded yet</div>`;return;}
    const dotClass={Added:'added','Status Changed / Moved':'changed',Deleted:'deleted',Updated:'changed'};
    el.innerHTML=`<div class="dp-log-list">`+entries.map(r=>{
      const action=r[3]||'Updated';
      const from=r[4]||''; const to=r[5]||'';
      const detail=r[7]||'';
      return`<div class="dp-log-item">
        <div class="dp-log-dot ${dotClass[action]||''}"></div>
        <div class="dp-log-meta">
          <div class="dp-log-action">${esc(action)}${from&&from!=='—'?` <span style="color:var(--text3);font-weight:400">${esc(from)} → </span><b>${esc(to)}</b>`:''}</div>
          ${detail?`<div class="dp-log-detail">${esc(detail)}</div>`:''}
          <div class="dp-log-detail">${esc(r[0]||'')} · ${esc(r[6]||'')}</div>
        </div>
        <div class="dp-log-time">${esc(r[0]?r[0].split(' ')[0]:'')}</div>
      </div>`;
    }).join('')+'</div>';
  }catch(e){const el=document.getElementById('dp-audit-inner');if(el)el.innerHTML=`<div class="audit-empty">Could not load audit trail</div>`;}
}

// ============================================================
// ACTIVITY LOG
// ============================================================
async function renderLog(){
  document.getElementById('topbar-title').textContent='Activity Log';
  const _sub2=document.getElementById('topbar-sub'); if(_sub2) _sub2.textContent='All changes recorded automatically';
  document.getElementById('content').innerHTML=`<div class="table-wrap"><div class="table-head"><h3>Activity Log</h3></div><div id="log-list" style="padding:6px 18px 16px">Loading...</div></div>`;
  showLoading(true,'Loading log...');
  try{
    const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${LOG_SHEET}!A2:H`});
    logCache=r.result.values||[];
    // FIX: Use spread copy to avoid mutating logCache
    const rows=[...logCache].reverse();
    const el=document.getElementById('log-list');
    if(!rows.length){
      el.innerHTML=`<div class="log-empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1.5"/><path d="M9 12h6M9 16h4"/></svg>
        <div class="log-empty-title">No Activity Yet</div>
        <div class="log-empty-sub">Changes to employee records will appear here automatically.</div>
      </div>`;
      return;
    }
    const iconMap={Added:'log-added','Status Changed / Moved':'log-changed',Deleted:'log-deleted',Updated:'log-updated'};
    const svgMap={
      Added:`<i class="fi fi-sr-plus"></i>`,
      'Status Changed / Moved':`<i class="fi fi-sr-rotate-right"></i>`,
      Deleted:`<i class="fi fi-sr-trash"></i>`,
      Updated:`<i class="fi fi-sr-edit"></i>`
    };
    el.innerHTML=rows.map(r=>{
      const action=r[3]||'';
      const from=r[4]||'';
      const to=r[5]||'';
      const detail=r[7]||''; // column H — full change detail
      // Build the change summary line
      let changeLine='';
      if(from && from!=='—' && to && to!==from){
        changeLine=` · <span style="color:var(--text3)">${esc(from)}</span> → <b>${esc(to)}</b>`;
      }
      // Detail line shows every field that changed
      const detailLine=detail?`<div class="log-detail">${esc(detail)}</div>`:'';
      return`<div class="log-item">
        <div class="log-icon ${iconMap[action]||'log-updated'}">${svgMap[action]||svgMap['Updated']}</div>
        <div class="log-meta"><b>${esc(r[2]||'')}</b> <span style="color:var(--text3);font-weight:400">(${esc(r[1]||'')})</span> — ${esc(action)}${changeLine}
          ${detailLine}
          <div class="log-time">${esc(r[0]||'')} · by ${esc(r[6]||'')}</div>
        </div>
      </div>`;
    }).join('');
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
    <div class="field req"><label>First Name</label>${inp('firstName','text','Juan','oninput="updateFullName();checkDupName()"')}</div>
    <div class="field req"><label>Last Name</label>${inp('lastName','text','Dela Cruz','oninput="updateFullName();checkDupName()"')}</div>
    <div class="field"><label>Middle Name</label>${inp('middleName','text','Santos')}</div>
  </div>
  <div class="dup-warning" id="dup-warning-name" style="margin:-6px 0 8px"></div>
  <div class="form-grid">
    <div class="field form-sensitive-control"><label>Date of Birth</label>${dateInp('dob')}</div>
    <div class="field"><label>Gender</label>${sel('gender',['','Male','Female','N/A'])}</div>
    <div class="field"><label>Marital Status</label>${sel('maritalStatus',['','Single','Married'])}</div>
    <div class="field form-sensitive-control"><label>Mobile No.</label>${inp('mobile','text','09XXXXXXXXX','oninput="checkDupMobile()" onblur="onMobileBlur()"')}
      <div class="field-hint" style="display:block;opacity:.65;margin-top:3px">Auto-formats to 09XXXXXXXXX on blur</div>
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
    <div class="field"><label>Contract End Date <span style="color:var(--warning);font-size:10px">⚠ expiry tracked</span></label>${dateInp('contractEndDate')}</div>
  </div>

  <div class="section-label">Tags / Labels</div>
  <div class="field form-full">
    <label>Tags <span style="color:var(--text3);font-size:10px;font-weight:400">Comma-separated — e.g. Priority, Probation, High Risk</span></label>
    <input id="f_tags" type="text" value="${esc(v('tags'))}" placeholder="Priority, Probation, High Risk…">
    <div class="field-hint" style="display:block;opacity:.7;margin-top:4px">Separate tags with commas. These appear as color pills in the table and profile.</div>
  </div>

  <div class="section-label">Requirements Checklist</div>
  <div class="req-check-grid">
    ${REQUIREMENT_FIELDS.map(([k,label])=>`<label class="req-check"><input id="f_${k}" type="checkbox" ${v(k)?'checked':''}> <span>${esc(label)}</span></label>`).join('')}
  </div>

  <div class="section-label">Notes / Remarks</div>
  <div class="field form-full">
    <label>Notes</label>
    <textarea id="f_notes" style="height:80px;resize:vertical;width:100%;padding:7px 11px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12.5px;font-family:'Inter',sans-serif;color:var(--text);background:rgba(136,144,99,0.05);outline:none" placeholder="Optional remarks…">${esc(v('notes'))}</textarea>
  </div>`;
}

function updateFullName(){
  const fn=document.getElementById('f_firstName')?.value.trim()||'';
  const ln=document.getElementById('f_lastName')?.value.trim()||'';
  const p=document.getElementById('fullname-preview');
  if(p)p.textContent=(fn+' '+ln).trim()||'— Enter First & Last Name —';
}
// ── Phase 5: Required-field completion progress ──────────────
const REQUIRED_FORM_FIELDS=['firstName','lastName','infinixId','status'];
function updateFormProgress(){
  const fill=document.getElementById('modal-progress-fill');
  const label=document.getElementById('modal-progress-label');
  if(!fill||!label)return;
  let filled=0;
  REQUIRED_FORM_FIELDS.forEach(k=>{
    const el=document.getElementById('f_'+k);
    if(el&&el.value&&el.value.trim())filled++;
  });
  const total=REQUIRED_FORM_FIELDS.length;
  const pct=total?Math.round(filled/total*100):0;
  fill.style.width=pct+'%';
  fill.style.background=pct===100?'var(--success)':pct>=50?'var(--accent)':'var(--warning)';
  label.textContent=`${filled} of ${total} required fields`;
}
// ── Phase 5: Mobile number auto-format ────────────────────────
function formatMobileNumber(raw){
  if(!raw)return'';
  let digits=raw.replace(/[^\d]/g,''); // strip everything except digits
  if(digits.startsWith('63'))digits=digits.slice(2);     // strip leading 63
  if(digits.startsWith('0'))digits=digits.slice(1);      // strip leading 0
  if(digits.length===10&&digits.startsWith('9'))return'0'+digits;
  return raw; // fallback: leave as-is if it doesn't match expected pattern
}
function onMobileBlur(){
  const el=document.getElementById('f_mobile');
  if(!el)return;
  const formatted=formatMobileNumber(el.value.trim());
  if(formatted)el.value=formatted;
  checkDupMobile();
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
  const idVal=document.getElementById('f_infinixId')?.value.trim()||'';
  const warn=document.getElementById('dup-warning');
  if(!warn)return;
  if(idVal&&employees.some(e=>String(e.infinixId).trim()===idVal)){
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
}
function checkDupName(){
  if(editingId)return;
  const fn=(document.getElementById('f_firstName')?.value.trim()||'').toLowerCase();
  const ln=(document.getElementById('f_lastName')?.value.trim()||'').toLowerCase();
  const mob=(document.getElementById('f_mobile')?.value.trim()||'').replace(/\s/g,'');
  const warn=document.getElementById('dup-warning-name');
  if(!warn)return;
  if(fn&&ln){
    const nameDup=employees.find(e=>
      (e.firstName||'').trim().toLowerCase()===fn &&
      (e.lastName||'').trim().toLowerCase()===ln
    );
    if(nameDup){
      warn.textContent=`⚠ An employee named "${nameDup.fullName||fn+' '+ln}" (ID: ${nameDup.infinixId}) already exists.`;
      warn.classList.add('visible');
      return;
    }
  }
  warn.classList.remove('visible');
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
    contractEndDate:f('contractEndDate'),
    tags:f('tags'),
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
  document.getElementById('modal-body').addEventListener('input',updateFormProgress);
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-body').scrollTop=0;
  updateFormProgress();
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
  document.getElementById('modal-body').scrollTop=0;
  document.getElementById('modal-body').addEventListener('input',updateFormProgress);
  updateFormProgress();
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
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('open');
  const fill=document.getElementById('modal-progress-fill');
  const label=document.getElementById('modal-progress-label');
  if(fill)fill.style.width='0%';
  if(label)label.textContent='0 of 0 required fields';
}
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
        document.getElementById('confirm-icon').innerHTML='<i class="fi fi-sr-triangle-warning"></i>';
        document.getElementById('confirm-icon').className='confirm-icon warn';
        document.getElementById('confirm-title').textContent=`Confirm: Set to ${data.status}?`;
        document.getElementById('confirm-msg').innerHTML=`You are about to mark <strong>${esc(data.firstName)} ${esc(data.lastName)}</strong> as "<strong style="color:var(--warning)">${esc(data.status)}</strong>". This is a significant status change. Are you sure?`;
        document.getElementById('confirm-ok').textContent=`Yes, set to ${data.status}`;
        _setupTypeToConfirm(null, ()=>{closeConfirm();resolve(true);});
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
  document.getElementById('confirm-icon').innerHTML='<i class="fi fi-sr-trash"></i>';
  document.getElementById('confirm-icon').className='confirm-icon danger';
  document.getElementById('confirm-title').textContent='Delete Employee?';
  document.getElementById('confirm-msg').innerHTML=`This will permanently delete <strong style="color:var(--danger)">${esc(name)}</strong> (${esc(id)}). This cannot be undone.`;
  document.getElementById('confirm-ok').textContent='Delete';
  _setupTypeToConfirm(name, ()=>{closeConfirm();doDelete(id);});
  document.getElementById('confirm-overlay').classList.add('open');
}
function _setupTypeToConfirm(targetText, onConfirm){
  const wrap=document.getElementById('confirm-type-wrap');
  const targetEl=document.getElementById('confirm-type-target');
  const input=document.getElementById('confirm-type-input');
  const okBtn=document.getElementById('confirm-ok');
  if(targetText){
    wrap.classList.remove('hidden');
    targetEl.textContent=targetText;
    input.value='';
    okBtn.disabled=true;
    okBtn.classList.add('disabled');
    okBtn.onclick=()=>{ if(input.value.trim()===targetText.trim()) onConfirm(); };
  } else {
    wrap.classList.add('hidden');
    okBtn.disabled=false;
    okBtn.classList.remove('disabled');
    okBtn.onclick=onConfirm;
  }
}
function _checkConfirmTypeMatch(){
  const target=document.getElementById('confirm-type-target')?.textContent||'';
  const input=document.getElementById('confirm-type-input')?.value||'';
  const okBtn=document.getElementById('confirm-ok');
  if(!okBtn)return;
  const match=input.trim()===target.trim();
  okBtn.disabled=!match;
  okBtn.classList.toggle('disabled',!match);
}
function closeConfirm(){
  document.getElementById('confirm-overlay').classList.remove('open');
  const wrap=document.getElementById('confirm-type-wrap');
  if(wrap)wrap.classList.add('hidden');
  const icon=document.getElementById('confirm-icon');
  if(icon){icon.innerHTML='<i class="fi fi-sr-triangle-warning"></i>';icon.className='confirm-icon';}
  const okBtn=document.getElementById('confirm-ok');
  if(okBtn){okBtn.disabled=false;okBtn.classList.remove('disabled');}
}
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
// NOTIFICATION CENTER
// ============================================================
let _dismissedNotifKeys = new Set(JSON.parse(localStorage.getItem('infinix_notif_dismissed') || '[]'));

function _notifKey(n){ return `${n.group}:${n.id||n.title}`; }

function markAllNotifsRead(){
  const notifs = buildNotifications();
  notifs.forEach(n => _dismissedNotifKeys.add(_notifKey(n)));
  localStorage.setItem('infinix_notif_dismissed', JSON.stringify([..._dismissedNotifKeys]));
  renderNotifDrawer();
  updateNotifBadge();
}

function buildNotifications(){
  const notifs = [];
  const today = new Date(); today.setHours(0,0,0,0);
  // Contract expiry warnings
  const today2 = new Date(); today2.setHours(0,0,0,0);
  employees.filter(e => e.contractEndDate).forEach(e => {
    const d = new Date(e.contractEndDate);
    if(isNaN(d)) return;
    const daysLeft = Math.ceil((d - today2) / (1000*60*60*24));
    if(daysLeft < 0) {
      notifs.push({
        group:'contract', color:'#FF5252',
        title: esc(e.fullName||e.infinixId),
        sub: `Contract expired ${Math.abs(daysLeft)} day(s) ago`,
        id: e.infinixId
      });
    } else if(daysLeft <= 30) {
      notifs.push({
        group:'contract', color:'#FFD740',
        title: esc(e.fullName||e.infinixId),
        sub: `Contract expires in ${daysLeft} day(s)`,
        id: e.infinixId
      });
    }
  });

  const bdaysToday = getBirthdaysToday ? getBirthdaysToday() : [];
  bdaysToday.forEach(({emp})=>{
    notifs.push({
      group:'birthday', color:'var(--warning)',
      title: esc(emp.fullName||emp.firstName||emp.infinixId),
      sub: '🎉 Birthday today!',
      id: emp.infinixId
    });
  });

  // Employees with 0 requirements complete (active promoters only)
  const zeroReq = activePromotersOnly().filter(e=>reqDoneCount(e)===0);
  zeroReq.slice(0,10).forEach(e=>{
    notifs.push({
      group:'requirements', color:'var(--text3)',
      title: esc(e.fullName||e.firstName||e.infinixId),
      sub: 'No requirements submitted',
      id: e.infinixId
    });
  });
  if(zeroReq.length > 10){
    notifs.push({
      group:'requirements', color:'var(--text3)',
      title: `+${zeroReq.length-10} more`,
      sub: 'employees with 0 requirements',
      id: null
    });
  }

  return notifs;
}

function renderNotifDrawer(){
  const allNotifs = buildNotifications();
  const notifs = allNotifs.filter(n => !_dismissedNotifKeys.has(_notifKey(n)));
  const badge = document.getElementById('notif-count-badge');
  if(badge){
    const total = notifs.filter(n=>n.id).length;
    if(total > 0){
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
  const body = document.getElementById('notif-drawer-body');
  if(!body) return;

  if(!notifs.length){
    body.innerHTML = `<div class="notif-empty">All clear — no notifications right now.</div>`;
    return;
  }

  const groups = {birthday:[], requirements:[]};
  notifs.forEach(n=>{ if(groups[n.group]) groups[n.group].push(n); });
  const groupLabels = {birthday:'Birthdays Today', requirements:'Missing Requirements'};
  const groupColors = {birthday:'var(--warning)', requirements:'var(--text3)'};

  let html = '';
  Object.keys(groups).forEach(g=>{
    if(!groups[g].length) return;
    // Cap requirements at 8 visible, show summary if more
    const visible = groups[g].length > 8 ? groups[g].slice(0,8) : groups[g];
    const overflow = groups[g].length - visible.length;
    html += `<div class="notif-group">
      <div class="notif-group-label">${groupLabels[g]} <span style="color:${groupColors[g]}">(${groups[g].length})</span></div>
      ${visible.map(n=>`
        <div class="notif-item" ${n.id?`onclick="closeNotifDrawer();openDetailPanel('${n.id}')"`:''}>
          <div class="notif-dot" style="background:${n.color}"></div>
          <div class="notif-item-text">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-sub">${n.sub}</div>
          </div>
          <button class="notif-dismiss-btn" onclick="event.stopPropagation();_dismissNotif(${JSON.stringify(_notifKey(n))})" title="Dismiss">✕</button>
        </div>`).join('')}
      ${overflow > 0 ? `<div style="font-size:10.5px;color:var(--text3);padding:6px 4px;text-align:center">+${overflow} more — click "All read" to clear</div>` : ''}
    </div>`;
  });
  body.innerHTML = html;
}

function toggleNotifDrawer(){
  const drawer = document.getElementById('notif-drawer');
  if(!drawer) return;
  if(drawer.classList.contains('open')){
    closeNotifDrawer();
  } else {
    renderNotifDrawer();
    drawer.classList.add('open');
    // Close when clicking outside
    setTimeout(()=>{
      function outsideClick(e){
        const wrap = document.getElementById('notif-wrap');
        if(wrap && !wrap.contains(e.target)){ closeNotifDrawer(); document.removeEventListener('click',outsideClick); }
      }
      document.addEventListener('click', outsideClick);
    }, 50);
  }
}

function closeNotifDrawer(){
  const drawer = document.getElementById('notif-drawer');
  if(drawer) drawer.classList.remove('open');
}

// Update notif badge whenever data loads
function updateNotifBadge(){
  const notifs = buildNotifications().filter(n => !_dismissedNotifKeys.has(_notifKey(n)));
  const badge = document.getElementById('notif-count-badge');
  if(!badge) return;
  const total = notifs.filter(n=>n.id).length;
  if(total > 0){ badge.textContent = total > 99 ? '99+' : total; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

function _dismissNotif(key){
  _dismissedNotifKeys.add(key);
  localStorage.setItem('infinix_notif_dismissed', JSON.stringify([..._dismissedNotifKeys]));
  renderNotifDrawer();
  updateNotifBadge();
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


// ============================================================
// ANNOUNCEMENTS
// ============================================================
let announcementsCache = [];

async function loadAnnouncements(){
  try{
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${ANNOUNCEMENTS_SHEET}!A2:F`
    });
    const rows = res.result.values || [];
    announcementsCache = rows
      .filter(r => String(r[5]||'').trim().toUpperCase() === 'TRUE')
      .map(r => ({ id:r[0]||'', title:r[1]||'', body:r[2]||'', postedBy:r[3]||'', timestamp:r[4]||'' }))
      .reverse(); // newest first
    renderAnnouncementsList();
  } catch(e){ console.warn('Announcements load error:', e); }
}

function renderAnnouncementsList(){
  // Announcement display moved to carousel — renderAnnouncementCarousel handles the DOM
  if(typeof renderAnnouncementCarousel === 'function') renderAnnouncementCarousel();
}

function openAnnouncementManager(){
  if(!canViewSensitive()){ toast('Only HR/AGENCY or Owner can manage announcements.','error'); return; }

  // Build and show the modal immediately — don't wait for the API call
  const modal = document.createElement('div');
  modal.id = 'ann-modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div class="glass-card" style="width:100%;max-width:620px;max-height:85vh;display:flex;flex-direction:column;padding:24px;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="font-size:14px;font-weight:800;color:var(--text)">📢 Manage Announcements</div>
        <button id="ann-close-btn" class="btn btn-ghost btn-sm">✕ Close</button>
      </div>
      <!-- ADD NEW -->
      <div style="background:rgba(46,196,190,0.05);border:1px solid rgba(46,196,190,0.15);border-radius:10px;padding:14px;flex-shrink:0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--moss-green);margin-bottom:10px">New Announcement</div>
        <input id="ann-new-title" placeholder="Title" style="width:100%;margin-bottom:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:'Inter',sans-serif;box-sizing:border-box">
        <div class="ann-toolbar">
          <button type="button" class="ann-tb-btn" onclick="_annWrapSelection('**','**')" title="Bold"><i class="fi fi-sr-bold"></i></button>
          <button type="button" class="ann-tb-btn" onclick="_annWrapSelection('*','*')" title="Italic"><i class="fi fi-sr-italic"></i></button>
          <button type="button" class="ann-tb-btn" onclick="_annInsertBullet()" title="Bullet point"><i class="fi fi-sr-list"></i></button>
          <button type="button" class="ann-tb-btn" onclick="_annInsertLink()" title="Insert link"><i class="fi fi-sr-link"></i></button>
          <span class="ann-tb-hint">Markdown: **bold**, *italic*, - bullet, [text](url)</span>
        </div>
        <textarea id="ann-new-body" placeholder="Message body... supports **bold**, *italic*, - bullets, [link](url)" rows="3" style="width:100%;margin-bottom:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:'Inter',sans-serif;resize:vertical;box-sizing:border-box"></textarea>
        <div class="ann-preview" id="ann-preview"></div>
        <input id="ann-new-poster" placeholder='Posted by (e.g. "HR - Candy")' style="width:100%;margin-bottom:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:'Inter',sans-serif;box-sizing:border-box">
        <button id="ann-post-btn" class="btn btn-primary btn-sm" style="margin-top:8px">Post Announcement</button>
      </div>
      <!-- LIST — populated asynchronously -->
      <div style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);flex-shrink:0">Existing Announcements</div>
        <div id="ann-mgr-list" style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">Loading…</div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  document.getElementById('ann-close-btn').addEventListener('click', () => modal.remove());
  document.getElementById('ann-post-btn').addEventListener('click', addAnnouncement);
  document.getElementById('ann-new-body').addEventListener('input', _annUpdatePreview);

  // Now fetch and populate the list
  renderManagerList();
}

// ── Phase 6: Announcement formatting toolbar helpers ──────────
function _annUpdatePreview(){
  const body=document.getElementById('ann-new-body')?.value||'';
  const prev=document.getElementById('ann-preview');
  if(!prev)return;
  if(!body.trim()){prev.innerHTML='';prev.style.display='none';return;}
  prev.style.display='block';
  prev.innerHTML=`<div class="ann-preview-label">Preview</div>${parseMiniMarkdown(body)}`;
}
function _annWrapSelection(prefix,suffix){
  const ta=document.getElementById('ann-new-body');
  if(!ta)return;
  const start=ta.selectionStart,end=ta.selectionEnd;
  const selected=ta.value.substring(start,end)||'text';
  ta.value=ta.value.substring(0,start)+prefix+selected+suffix+ta.value.substring(end);
  ta.focus();
  ta.selectionStart=start+prefix.length;
  ta.selectionEnd=start+prefix.length+selected.length;
  _annUpdatePreview();
}
function _annInsertBullet(){
  const ta=document.getElementById('ann-new-body');
  if(!ta)return;
  const start=ta.selectionStart;
  const needsNewline=start>0&&ta.value[start-1]!=='\n';
  const insert=(needsNewline?'\n':'')+'- ';
  ta.value=ta.value.substring(0,start)+insert+ta.value.substring(start);
  ta.focus();
  ta.selectionStart=ta.selectionEnd=start+insert.length;
  _annUpdatePreview();
}
function _annInsertLink(){
  const ta=document.getElementById('ann-new-body');
  if(!ta)return;
  const start=ta.selectionStart,end=ta.selectionEnd;
  const selected=ta.value.substring(start,end)||'link text';
  const insert=`[${selected}](https://)`;
  ta.value=ta.value.substring(0,start)+insert+ta.value.substring(end);
  ta.focus();
  // Select the URL part so user can paste over it
  const urlStart=start+selected.length+3;
  ta.selectionStart=urlStart;
  ta.selectionEnd=urlStart+8;
  _annUpdatePreview();
}

// Builds the existing-announcements list inside the open manager modal.
// Called on open, and again after every add / toggle / delete so the
// modal stays open and the list refreshes in-place.
async function renderManagerList(){
  const listEl = document.getElementById('ann-mgr-list');
  if(!listEl) return;
  try{
    const rows = await loadAllAnnouncementsForManager();
    if(!rows.length){
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">No announcements yet.</div>`;
      return;
    }
    listEl.innerHTML = rows.map((r,i) => `
      <div class="ann-mgr-row glass-card" id="ann-mgr-${i}" style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${esc(r[1]||'')}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${esc((r[2]||'').substring(0,80))}${(r[2]||'').length>80?'…':''}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">By ${esc(r[3]||'')} &middot; ${esc(r[4]||'')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;${String(r[5]||'').toUpperCase()==='TRUE'?'background:rgba(78,203,113,0.15);color:var(--success)':'background:rgba(224,92,92,0.12);color:var(--danger)'}">
            ${String(r[5]||'').toUpperCase()==='TRUE'?'ACTIVE':'HIDDEN'}
          </span>
          <button class="btn btn-sm" onclick="toggleAnnouncement(${i+2},'${String(r[5]||'').toUpperCase()==='TRUE'?'FALSE':'TRUE'}')" style="font-size:10px;padding:3px 8px">
            ${String(r[5]||'').toUpperCase()==='TRUE'?'Hide':'Show'}
          </button>
          <button class="btn btn-sm" onclick="deleteAnnouncement(${i+2})" style="font-size:10px;padding:3px 8px;background:rgba(224,92,92,0.12);color:var(--danger);border:1px solid rgba(224,92,92,0.3)">Delete</button>
        </div>
      </div>`).join('');
  } catch(e){
    listEl.innerHTML = `<div style="font-size:12px;color:var(--danger);padding:8px 0">⚠ Could not load announcements — please close and reopen the manager.</div>`;
    console.error('Announcement manager list error:', e);
  }
}

async function loadAllAnnouncementsForManager(){
  try{
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${ANNOUNCEMENTS_SHEET}!A2:F`
    });
    return res.result.values || [];
  } catch(e){ return []; }
}

// ── Phase 6: Mini markdown parser for announcements ──────────
// Supports: **bold**, *italic*, bullet lines starting with "- ",
// and [text](url) links. Output is escaped first, then safe tags injected.
function parseMiniMarkdown(raw){
  if(!raw)return'';
  let text=esc(raw); // escape first — prevents injection
  // Links: [text](url) — only allow http(s) and mailto
  text=text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="ann-link">$1</a>');
  // Bold: **text**
  text=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  // Italic: *text* (single asterisk, not already consumed by bold)
  text=text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>');
  // Bullet lines: convert consecutive "- " lines into <ul><li>
  const lines=text.split('\n');
  let html='', inList=false;
  lines.forEach(line=>{
    const bulletMatch=line.match(/^\s*-\s+(.*)$/);
    if(bulletMatch){
      if(!inList){html+='<ul class="ann-list">';inList=true;}
      html+=`<li>${bulletMatch[1]}</li>`;
    } else {
      if(inList){html+='</ul>';inList=false;}
      html+= line.trim() ? `<p>${line}</p>` : '';
    }
  });
  if(inList)html+='</ul>';
  return html;
}

async function addAnnouncement(){
  const title = document.getElementById('ann-new-title').value.trim();
  const body  = document.getElementById('ann-new-body').value.trim();
  if(!title){ toast('Please enter a title.','error'); return; }
  if(!body){  toast('Please enter a message.','error'); return; }
  const id = 'ANN-' + Date.now();
  const ts = new Date().toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const postedBy = (document.getElementById('ann-new-poster').value.trim()) || currentUser?.name || currentRole || 'HR';
  try{
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${ANNOUNCEMENTS_SHEET}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [[id, title, body, postedBy, ts, 'TRUE']] }
    });
    toast('Announcement posted!','success');
    // Clear form fields and refresh list in-place (keep modal open)
    document.getElementById('ann-new-title').value = '';
    document.getElementById('ann-new-body').value = '';
    document.getElementById('ann-new-poster').value = '';
    await loadAnnouncements();
    renderManagerList();
  } catch(e){ toast('Failed to post announcement.','error'); console.error(e); }
}

async function toggleAnnouncement(rowNum, newVal){
  try{
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${ANNOUNCEMENTS_SHEET}!F${rowNum}`,
      valueInputOption: 'RAW',
      resource: { values: [[newVal]] }
    });
    toast(`Announcement ${newVal==='TRUE'?'shown':'hidden'}.`,'success');
    await loadAnnouncements();
    renderManagerList(); // refresh list in-place, keep modal open
  } catch(e){ toast('Failed to update announcement.','error'); }
}

async function deleteAnnouncement(rowNum){
  if(!confirm('Delete this announcement permanently?')) return;
  try{
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests:[{
          deleteDimension:{
            range:{ sheetId: await getSheetId(ANNOUNCEMENTS_SHEET), dimension:'ROWS', startIndex: rowNum-1, endIndex: rowNum }
          }
        }]
      }
    });
    toast('Announcement deleted.','success');
    await loadAnnouncements();
    renderManagerList(); // refresh list in-place, keep modal open
  } catch(e){ toast('Failed to delete announcement.','error'); console.error(e); }
}

async function getSheetId(sheetName){
  const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = (res.result.sheets||[]).find(s=>s.properties.title===sheetName);
  return sheet ? sheet.properties.sheetId : 0;
}

// ============================================================
// VIEW ALL — Birthdays + Recently Updated modals
// ============================================================
function viewAllBirthdays(){
  const all = getBirthdaysThisMonth();
  const modal = document.createElement('div');
  modal.id = 'bday-all-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const rows = all.length === 0
    ? `<div style="font-size:12px;color:var(--text3);font-style:italic;padding:16px 0;text-align:center">No birthdays this month.</div>`
    : all.map(({emp, day, daysUntil}) => {
        const isToday = daysUntil === 0;
        const d = new Date(emp.dob);
        const dateLabel = d.toLocaleDateString('en-US',{month:'long',day:'numeric'});
        const timeLabel = isToday ? '🎉 Today!' : daysUntil > 0 ? `in ${daysUntil} day${daysUntil!==1?'s':''}` : `${Math.abs(daysUntil)} day${Math.abs(daysUntil)!==1?'s':''} ago`;
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="width:34px;height:34px;border-radius:50%;background:${isToday?'rgba(245,200,66,0.15)':'rgba(46,196,190,0.1)'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${isToday?'🎉':'🎂'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--text)">${esc(emp.fullName||'')}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${esc(dateLabel)}${emp.region?` · ${esc(emp.region)}`:''}</div>
          </div>
          <div style="font-size:11px;font-weight:700;color:${isToday?'var(--warning)':'var(--text3)'};white-space:nowrap">${timeLabel}</div>
        </div>`;
      }).join('');
  modal.innerHTML = `
    <div class="glass-card" style="width:100%;max-width:480px;max-height:80vh;display:flex;flex-direction:column;padding:24px;gap:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-shrink:0">
        <div style="font-size:14px;font-weight:800;color:var(--text)">🎂 Birthdays This Month</div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('bday-all-modal').remove()">✕ Close</button>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

function viewAllRecentlyUpdated(){
  const recent = [...employees].sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0)).slice(0,20);
  const modal = document.createElement('div');
  modal.id = 'recent-all-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const rows = recent.map(e => {
    const initials = ((e.firstName||e.fullName||'?')[0]||'?').toUpperCase();
    const empLogs = logCache ? [...logCache].filter(r=>String(r[1]||'').trim()===String(e.infinixId).trim()).reverse() : [];
    const statusLog = empLogs.find(r=>{
      const action=r[3]||'', from=r[4]||'', to=r[5]||'';
      if(action==='Added') return true;
      return STATUS_SET.has(from)||STATUS_SET.has(to)||(action==='Status Changed / Moved');
    });
    let changeDesc = '', logTs = '';
    if(statusLog){
      const action=statusLog[3]||'', from=statusLog[4]||'', to=statusLog[5]||'';
      logTs = statusLog[0]||'';
      if(action==='Added') changeDesc='New employee added';
      else if(from && to && from!=='—' && from!==to) changeDesc=from+' → '+to;
      else if(to && to!=='—') changeDesc='Status set to '+to;
      else changeDesc=action;
    }
    const ago = timeAgo(logTs||e.lastUpdated);
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="document.getElementById('recent-all-modal').remove();openDetailPanel('${esc(e.infinixId)}')">
      <div class="rr-avatar">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${esc(e.fullName||'')}</div>
        ${changeDesc?`<div style="font-size:11px;color:var(--text3);margin-top:1px">${esc(changeDesc)}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
        ${badgeHTML(e.status)}
        ${ago?`<div style="font-size:10px;color:var(--text3)">${ago}</div>`:''}
      </div>
    </div>`;
  }).join('');
  modal.innerHTML = `
    <div class="glass-card" style="width:100%;max-width:500px;max-height:80vh;display:flex;flex-direction:column;padding:24px;gap:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-shrink:0">
        <div style="font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="fi fi-sr-clock" style="font-size:13px"></i> Recently Updated</div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('recent-all-modal').remove()">✕ Close</button>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

// Announcement carousel state
let _annIdx = 0;
function renderAnnouncementCarousel(){
  const wrap = document.getElementById('ann-carousel-wrap');
  if(!wrap) return;
  const list = announcementsCache;
  if(!list.length){
    wrap.innerHTML = `<div style="font-size:12px;color:var(--text3);font-style:italic;padding:8px 0">No announcements at this time.</div>`;
    return;
  }
  _annIdx = Math.max(0, Math.min(_annIdx, list.length-1));
  const a = list[_annIdx];
  const dots = list.map((_,i)=>`<span style="width:6px;height:6px;border-radius:50%;background:${i===_annIdx?'var(--moss-green)':'rgba(136,144,99,0.3)'};display:inline-block;cursor:pointer;transition:background .2s" onclick="annGoTo(${i})"></span>`).join('');
  wrap.innerHTML = `
    <div style="flex:1;min-width:0;padding:0 4px">
      <div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.3">${esc(a.title)}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;line-height:1.5" class="ann-body-rendered">${parseMiniMarkdown(a.body)}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:6px">Posted by ${esc(a.postedBy)} · ${esc(a.timestamp)}</div>
    </div>
    ${list.length > 1 ? `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;padding-left:8px">
      <button onclick="annPrev()" style="background:none;border:1px solid var(--border);border-radius:6px;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:10px">▲</button>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:center">${dots.replace(/display:inline-block/g,'display:block')}</div>
      <button onclick="annNext()" style="background:none;border:1px solid var(--border);border-radius:6px;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:10px">▼</button>
    </div>` : ''}`;
}
function annPrev(){ _annIdx=(_annIdx-1+announcementsCache.length)%announcementsCache.length; renderAnnouncementCarousel(); }
function annNext(){ _annIdx=(_annIdx+1)%announcementsCache.length; renderAnnouncementCarousel(); }
function annGoTo(i){ _annIdx=i; renderAnnouncementCarousel(); }

function viewAllAnnouncements(){
  const list = announcementsCache;
  const modal = document.createElement('div');
  modal.id = 'ann-all-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const rows = list.length === 0
    ? `<div style="font-size:12px;color:var(--text3);font-style:italic;padding:16px 0;text-align:center">No announcements at this time.</div>`
    : list.map(a => `
        <div style="padding:14px;background:rgba(46,196,190,0.05);border:1px solid rgba(46,196,190,0.12);border-radius:10px;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${esc(a.title)}</div>
          <div style="font-size:11.5px;color:var(--text2);margin-top:5px;line-height:1.6">${esc(a.body)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:8px">Posted by ${esc(a.postedBy)} · ${esc(a.timestamp)}</div>
        </div>`).join('');
  modal.innerHTML = `
    <div class="glass-card" style="width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;padding:24px;gap:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-shrink:0">
        <div style="font-size:14px;font-weight:800;color:var(--text)">📢 Announcements</div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ann-all-modal').remove()">✕ Close</button>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}
