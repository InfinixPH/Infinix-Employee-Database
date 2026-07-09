// ROLE SYSTEM
// ============================================================
// Role passwords now come from the Google Sheet tab: Role Logs
// Required columns: Email | Role | Password/PIN | Status | Timestamp
//
// Passwords are stored as SHA-256 hashes (hex). Plain-text passwords
// already in the sheet are auto-migrated on first successful login.

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Returns true if value looks like a 64-char hex SHA-256 hash
function isHashed(v) {
  return /^[0-9a-f]{64}$/.test(String(v||'').trim());
}
const ROLE_NAME_MAP = {
  owner: 'Owner',
  hr: 'HR/AGENCY',
  rssrsh: 'RSS/RSH',
  viewer: 'Viewer'
};
const ROLE_ALIASES = {
  owner: 'owner',
  'hr': 'hr',
  'hragency': 'hr',
  'hr/agency': 'hr',
  'agency': 'hr',
  'rssrsh': 'rssrsh',
  'rss/rsh': 'rssrsh',
  'rshrss': 'rssrsh',
  'rsh/rss': 'rssrsh',
  'rsh': 'rssrsh',
  'rss': 'rssrsh',
  'viewer': 'viewer'
};
function roleKey(v){
  const raw = String(v||'').trim().toLowerCase();
  const compact = raw.replace(/\s+/g,'').replace(/-/g,'');
  return ROLE_ALIASES[raw] || ROLE_ALIASES[compact] || compact;
}
async function getRoleRows(){
  // Sheet names with spaces need single quotes in the range string
  const rangeName = `'${ROLE_LOG_SHEET}'!A2:E`;
  let res;
  try {
    res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: rangeName
    });
  } catch(e) {
    // Fallback: try without quotes (in case sheet name has no spaces)
    try {
      res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${ROLE_LOG_SHEET}!A2:E`
      });
    } catch(e2) {
      console.error('getRoleRows failed both with and without quotes:', e2);
      throw e2;
    }
  }
  return (res.result.values || []).map((r,i)=>({
    row: i + 2,
    email: String(r[0]||'').trim(),
    role: roleKey(r[1]),
    roleLabel: String(r[1]||'').trim(),
    pin: String(r[2]||''),
    status: String(r[3]||'').trim().toUpperCase(),
    timestamp: String(r[4]||'').trim()
  }));
}
function roleEmailAllowed(row){
  const email = String(row.email||'').trim().toLowerCase();
  const me = String(currentUser?.email||'').trim().toLowerCase();
  // Blank / ANY / role labels mean shared role password. Specific email locks that row to that account.
  if(!email || ['any','all','shared','owner','hr','agency','hr/agency','rss','rsh','rss/rsh'].includes(email)) return true;
  return !!me && email === me;
}
async function validateRolePassword(role, pin){
  const rows = await getRoleRows();
  const hashedInput = await sha256(pin);
  const match = rows.find(row => {
    if(row.role !== role) return false;
    if(row.status !== 'ACTIVE') return false;
    if(!roleEmailAllowed(row)) return false;
    const stored = String(row.pin||'').trim();
    if(isHashed(stored)){
      // Normal path: compare hash to hash
      return stored === hashedInput;
    } else {
      // Migration path: legacy plaintext — compare directly
      return stored === String(pin);
    }
  });
  if(match){
    // Auto-migrate: if stored value was plaintext, upgrade it to a hash now
    if(!isHashed(String(match.pin||'').trim())){
      try{
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `'${ROLE_LOG_SHEET}'!C${match.row}`,
          valueInputOption: 'RAW',
          resource: { values: [[hashedInput]] }
        });
      }catch(e){ console.warn('Password migration failed:', e); }
    }
    await stampRoleLogin(match.row, hashedInput, match.role);
    return true;
  }
  return false;
}
async function stampRoleLogin(rowNumber, hashedPin, role){
  try{
    const email = currentUser?.email || '';
    const roleLabel = ROLE_NAME_MAP[role] || role || '';
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${ROLE_LOG_SHEET}!A${rowNumber}:E${rowNumber}`,
      valueInputOption: 'RAW',
      resource: { values: [[email, roleLabel, hashedPin || '', 'ACTIVE', ts()]] }
    });
  }catch(e){
    console.warn('Role timestamp update failed:', e);
  }
}
// viewer has no PIN — open access but with blur

let currentRole = null; // 'owner' | 'hr' | 'rssrsh' | 'viewer'
let _pendingRole = null;

function openRoleModal(){
  _pendingRole = null;
  document.getElementById('role-overlay').classList.remove('hidden');
  document.getElementById('role-pin-wrap').classList.remove('show');
  ['owner','hr','rssrsh','viewer'].forEach(r=>{
    document.getElementById('role-btn-'+r)?.classList.remove('selected');
  });
}
function closeRoleModal(){ document.getElementById('role-overlay').classList.add('hidden'); }

function selectRole(role){
  _pendingRole = role;
  ['owner','hr','rssrsh','viewer'].forEach(r=>document.getElementById('role-btn-'+r)?.classList.remove('selected'));
  if(role){
    document.getElementById('role-btn-'+role)?.classList.add('selected');
    if(role==='viewer'){
      applyRole('viewer');
      closeRoleModal();
    } else {
      const pinWrap = document.getElementById('role-pin-wrap');
      const pinLabel = document.getElementById('role-pin-label');
      pinLabel.textContent = `Enter ${ROLE_NAME_MAP[role]||role} Password`;
      document.getElementById('role-pin-input').value='';
      document.getElementById('role-pin-error').textContent='';
      pinWrap.classList.add('show');
      setTimeout(()=>document.getElementById('role-pin-input').focus(),80);
    }
  } else {
    document.getElementById('role-pin-wrap').classList.remove('show');
  }
}

function onPinInput(){
  document.getElementById('role-pin-error').textContent='';
}

async function confirmRolePin(){
  const pinInput = document.getElementById('role-pin-input');
  const pin = pinInput.value;
  const err = document.getElementById('role-pin-error');
  if(!_pendingRole) return;
  err.textContent = 'Checking password...';
  try{
    const ok = await validateRolePassword(_pendingRole, pin);
    if(ok){
      err.textContent = '';
      applyRole(_pendingRole);
      closeRoleModal();
    } else {
      err.textContent = '❌ Incorrect or disabled password — try again';
      pinInput.value='';
      pinInput.focus();
    }
  }catch(e){
    console.error('Role validation failed:', e);
    err.textContent = '❌ Could not read Role Logs sheet';
  }
}

// Password manager — Owner only. Updates the Role Logs sheet so passwords change without redeploying HTML.
function openPwManager(){
  if(currentRole!=='owner'){toast('Only Owner can manage passwords.','error');return;}
  document.getElementById('pw-hr').value='';
  document.getElementById('pw-rssrsh').value='';
  document.getElementById('pw-manager-msg').textContent='';
  document.getElementById('pw-manager-overlay').classList.add('open');
}
function closePwManager(){document.getElementById('pw-manager-overlay').classList.remove('open');}
async function upsertRolePassword(role, password){
  if(!password) return;
  const roleLabel = ROLE_NAME_MAP[role];
  const hashed = await sha256(password);
  const rows = await getRoleRows();
  const existing = rows.find(r => r.role === role);
  if(existing){
    // BUG FIX: preserve the existing email field so other users can still log in.
    // Using the owner's email here would lock out everyone else from this role.
    const existingEmail = existing.email || '';
    const values = [[existingEmail, roleLabel, hashed, 'ACTIVE', ts()]];
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId:SHEET_ID,
      range:`${ROLE_LOG_SHEET}!A${existing.row}:E${existing.row}`,
      valueInputOption:'RAW',
      resource:{values}
    });
  } else {
    // New row: use blank email so any user can log in with this shared password
    const values = [['', roleLabel, hashed, 'ACTIVE', ts()]];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId:SHEET_ID,
      range:`${ROLE_LOG_SHEET}!A:E`,
      valueInputOption:'RAW',
      insertDataOption:'INSERT_ROWS',
      resource:{values}
    });
  }
}
async function savePwManager(){
  const hrPw=document.getElementById('pw-hr').value.trim();
  const rshPw=document.getElementById('pw-rssrsh').value.trim();
  const msg=document.getElementById('pw-manager-msg');
  try{
    await upsertRolePassword('hr', hrPw);
    await upsertRolePassword('rssrsh', rshPw);
    msg.textContent='✓ Passwords updated in Role Logs sheet!';
    setTimeout(()=>closePwManager(),1200);
  }catch(e){
    console.error('Password update failed:', e);
    msg.textContent='Could not update Role Logs sheet.';
  }
}

const ROLE_META = {
  owner:  { label:'Owner',     icon:'OWN',  bodyClass:'' },
  hr:     { label:'HR/AGENCY', icon:'HR',   bodyClass:'' },
  rssrsh: { label:'RSS/RSH',   icon:'RSS',  bodyClass:'role-rssrsh' },
  viewer: { label:'Viewer',    icon:'VIEW', bodyClass:'role-viewer' },
};

function canWrite(){
  return currentRole === 'owner' || currentRole === 'hr' || currentRole === 'rssrsh';
}
function canDeleteRecords(){
  return currentRole === 'owner' || currentRole === 'hr';
}
function canViewSensitive(){
  return currentRole === 'owner' || currentRole === 'hr';
}
const SENSITIVE_FIELD_KEYS = ['dob','mobile','email','address','sss','philhealth','pagibig','tin','basicWage','bankName','bankAccount'];
function lockSensitiveFormFields(){
  if(canViewSensitive()) return;
  SENSITIVE_FIELD_KEYS.forEach(k=>{
    const el=document.getElementById('f_'+k);
    if(!el) return;
    el.disabled = true;
    el.setAttribute('data-sensitive-locked','1');
    const field=el.closest('.field');
    if(field){ field.classList.add('form-sensitive-control','is-locked'); }
  });
}
function protectSensitiveDataBeforeSave(data){
  if(canViewSensitive()) return data;
  const oldEmp = editingId ? employees.find(e=>String(e.infinixId)===String(editingId)) : null;
  SENSITIVE_FIELD_KEYS.forEach(k=>{
    data[k] = oldEmp ? (oldEmp[k] || '') : '';
  });
  return data;
}
function denyWrite(){
  toast('You need HR/AGENCY, RSS/RSH, or Owner access to edit records.','error');
}
function applyRole(role){
  currentRole = role;
  sessionStorage.setItem('hr_role', role);
  document.body.classList.remove('role-viewer','role-rssrsh');
  const meta = ROLE_META[role];
  if(meta.bodyClass) document.body.classList.add(meta.bodyClass);
  const roleLabel = document.getElementById('user-role-label');
  if(roleLabel) roleLabel.textContent = meta.label;
  const roleBadge = document.getElementById('user-role-display');
  if(roleBadge) roleBadge.setAttribute('data-role', role);
  // Show/hide manage passwords button for Owner
  const pwBtn = document.getElementById('pw-manager-btn');
  if(pwBtn) pwBtn.style.display = (role==='owner') ? 'flex' : 'none';
  if(detailEmpId) openDetailPanel(detailEmpId);
  // Re-render the current view so the Actions column is added/removed from the
  // table DOM rather than relying on CSS visibility tricks.
  if(typeof renderSidebar === 'function') renderSidebar();
  if(typeof renderView === 'function') renderView();
}

function initRole(){
  const saved = sessionStorage.getItem('hr_role');
  if(saved && ROLE_META[saved]){
    applyRole(saved);
  } else {
    setTimeout(()=>openRoleModal(), 400);
  }
}

// ============================================================
// STORE LOOKUP
// ============================================================
// Maps each field we need to the possible header labels that could identify
// its column in the "Store Details" sheet. Matching is done against the
// actual header row (row 1) instead of a hardcoded column index, so if a
// column is ever inserted, removed, or reordered in the sheet, every field
// still lands in the right place instead of silently shifting over.
const STORE_DETAILS_COLUMN_ALIASES = {
  region:     ['region'],
  city:       ['city'],
  rssName:    ['responsible rss','rss','rss name','rssname'],
  rssId:      ['rss user id','rss id','rssid'],
  mallName:   ['mall name/location','mall name','location','mall'],
  dealerName: ['dealer name','dealername'],
  storeName:  ['dcr name/store name','store name','dcr name','storename','dcrname'],
  shopId:     ['shop id','shopid'],
  storeType:  ['store type','storetype','type'],
};
// Strips ALL punctuation/slashes/parentheses, not just whitespace, so headers
// like "DCR Name / Store Name" or "Store-Type" still match their alias.
function _normalizeHeaderLabel(s){
  return (s||'').toString().trim().toLowerCase()
    .replace(/[^\w\s]/g,' ')   // drop punctuation like / ( ) - _
    .replace(/\s+/g,' ')
    .trim();
}
// Builds { fieldName: columnIndex } by matching the sheet's real header row
// against STORE_DETAILS_COLUMN_ALIASES. Matching is done two ways: exact
// match first, then "header contains alias as a whole word" as a looser
// second pass, so small wording differences in the sheet don't break it.
//
// IMPORTANT: if a field still can't be found, we do NOT silently fall back
// to a hardcoded column position anymore. A guessed fallback is how a
// renamed/reordered/inserted column in the sheet used to produce data that
// looked plausible but was actually pulled from the wrong column (e.g. the
// "everything is shifted one column over, Region is blank" bug). Instead we
// mark it unresolved (-1), the row-builder below leaves that field blank,
// and we log a clear console warning naming exactly which field failed and
// what headers WERE seen, so it's immediately diagnosable instead of
// quietly showing wrong data.
function _buildStoreDetailsColumnMap(headerRow){
  const normalized = (headerRow||[]).map(_normalizeHeaderLabel);
  const map = {};
  const unresolved = [];
  Object.keys(STORE_DETAILS_COLUMN_ALIASES).forEach(field=>{
    // Normalize the aliases through the exact same function used on the
    // sheet's real headers — otherwise an alias like 'dcr name/store name'
    // (with a slash) never lines up with a normalized header (slash
    // stripped), and that field silently fails to resolve.
    const aliases = STORE_DETAILS_COLUMN_ALIASES[field].map(_normalizeHeaderLabel);
    // Pass 1: exact match after normalization.
    let idx = normalized.findIndex(h=>aliases.includes(h));
    // Pass 2: header contains the alias as a substring — handles headers
    // with extra descriptive text tacked on, e.g. "Mall Name / Location
    // (if mall tell mall name, if sidestreet, tell side street name)".
    if(idx===-1){
      idx = normalized.findIndex(h=>aliases.some(a=>a && h.includes(a)));
    }
    map[field] = idx;
    if(idx===-1) unresolved.push(field);
  });
  if(unresolved.length){
    console.warn(
      '[Store Details] Could not match these columns by header name:', unresolved,
      '\nActual header row read from the sheet was:', headerRow,
      '\nThese fields will show as blank/— instead of guessing a column, to avoid silently showing data from the wrong column. Fix the header text in row 1 of the "Store Details" sheet to match one of:',
      Object.fromEntries(unresolved.map(f=>[f, STORE_DETAILS_COLUMN_ALIASES[f]]))
    );
  } else {
    console.log('[Store Details] Column map resolved OK:', map, 'from header row:', headerRow);
  }
  return map;
}

async function loadStoreDetails(){
  if(storeCacheLoaded)return;
  try{
    // Store Details sheet — column order can vary, so columns are matched by
    // header name (see STORE_DETAILS_COLUMN_ALIASES) rather than fixed position.
    // J=Promoter Status (YES/NO) K=Promoter Count — computed & written by the app, not manually edited.
    const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${STORE_DETAILS_SHEET}!A:K`});
    const rows=r.result.values||[];
    const colMap=_buildStoreDetailsColumnMap(rows[0]);
    if(colMap.shopId===-1){
      console.error('[Store Details] "Shop ID" column not found in row 1 of the sheet — the store list will be empty until that header is fixed. Header row read was:', rows[0]);
    }
    storeCache={};
    storeDetailsList=[];
    for(let i=1;i<rows.length;i++){
      const row       =rows[i]||[];
      const region    =(row[colMap.region]||'').trim();
      const city      =(row[colMap.city]||'').trim();
      const rssName   =(row[colMap.rssName]||'').trim();
      const rssId     =(row[colMap.rssId]||'').trim();
      const mallName  =(row[colMap.mallName]||'').trim();
      const dealerName=(row[colMap.dealerName]||'').trim();
      const storeName =(row[colMap.storeName]||'').trim();
      const shopId    =(row[colMap.shopId]||'').trim();
      const storeType =(row[colMap.storeType]||'').trim();
      if(shopId) storeCache[shopId.toUpperCase()]={storeName, rssName, rssId, region};
      if(!shopId) continue; // skip fully blank rows — they aren't real stores
      storeDetailsList.push({
        sheetRow: i+1, // 1-indexed row number in the Store Details sheet
        region, city, rssName, rssId, mallName, dealerName, storeName, shopId, storeType,
        promoterStatus:'', promoterCount:0
      });
    }
    storeCacheLoaded=true;
  }catch(e){console.warn('Store Details load failed:',e);}
}
function lookupStore(shopId){
  if(!shopId)return null;
  return storeCache[shopId.trim().toUpperCase()]||null;
}

// ============================================================
// STORE COVERAGE — how many stores have an Active promoter deployed
// Cross-references Store Details (Shop ID) against the Active sheet
// (Store ID) and writes YES/NO + count into Store Details columns J & K.
// ============================================================
function computeStoreCoverage(){
  if(!storeDetailsList.length || typeof employees==='undefined') return;
  const countByStoreId={};
  employees.forEach(e=>{
    if(e._sheet!==ACTIVE_SHEET) return;
    if(normalizeStatus(e.status)!=='Active') return;
    const sid=(e.storeId||'').trim().toUpperCase();
    if(!sid) return;
    countByStoreId[sid]=(countByStoreId[sid]||0)+1;
  });
  storeDetailsList.forEach(s=>{
    const cnt=countByStoreId[s.shopId.toUpperCase()]||0;
    s.promoterCount=cnt;
    s.promoterStatus=cnt>0?'YES':'NO';
  });
  storeCoverageComputed=true;
}
function getStoreCoverageStats(){
  const total=storeDetailsList.length;
  const withPromoter=storeDetailsList.filter(s=>s.promoterStatus==='YES').length;
  return {
    total,
    withPromoter,
    withoutPromoter: total-withPromoter,
    pct: total? Math.round((withPromoter/total)*100) : 0
  };
}
async function syncStoreCoverageToSheet(){
  if(!storeDetailsList.length) return;
  try{
    const data=storeDetailsList.map(s=>({
      range:`${STORE_DETAILS_SHEET}!J${s.sheetRow}:K${s.sheetRow}`,
      values:[[s.promoterStatus, s.promoterCount]]
    }));
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId:SHEET_ID,
      resource:{valueInputOption:'RAW', data}
    });
    storeCoverageSyncedAt=new Date();
  }catch(e){console.warn('Store coverage sync failed:',e);}
}
// Called after data + store details are both loaded (initial load and manual refresh).
// Fire-and-forget on the sheet write so it never blocks the UI.
async function refreshStoreCoverage(){
  if(typeof employees==='undefined' || !storeDetailsList.length) return;
  computeStoreCoverage();
  if(typeof refreshStoreListPageIfActive==='function') refreshStoreListPageIfActive();
  if(typeof refreshHomeStoreCoverageCard==='function' && typeof currentView!=='undefined' && currentView==='home') refreshHomeStoreCoverageCard();
  if(typeof _injectPhase3Charts==='function' && typeof currentView!=='undefined' && currentView==='analytics') _injectPhase3Charts();
  syncStoreCoverageToSheet();
}
function onStoreIdInput(){
  const shopIdEl   =document.getElementById('f_storeId');
  const storeNameEl=document.getElementById('f_storeAssignment');
  const rssNameEl  =document.getElementById('f_rssName');
  const rssIdEl    =document.getElementById('f_rssId');
  const statusEl   =document.getElementById('store-lookup-status');
  if(!shopIdEl||!storeNameEl||!statusEl)return;
  const shopId=shopIdEl.value.trim();
  if(!shopId){
    statusEl.textContent='';
    storeNameEl.readOnly=false;
    if(rssNameEl)rssNameEl.readOnly=false;
    if(rssIdEl)rssIdEl.readOnly=false;
    return;
  }
  const found=lookupStore(shopId);
  if(found){
    storeNameEl.value=found.storeName; storeNameEl.readOnly=true;
    if(rssNameEl){rssNameEl.value=found.rssName; rssNameEl.readOnly=!!found.rssName;}
    if(rssIdEl) {rssIdEl.value=found.rssId;   rssIdEl.readOnly=!!found.rssId;}
    statusEl.textContent=`Store found: ${found.storeName}${found.rssName?' · RSS: '+found.rssName:''}`;
    statusEl.className='store-lookup-status found';
  } else {
    storeNameEl.readOnly=false;
    if(rssNameEl)rssNameEl.readOnly=false;
    if(rssIdEl)rssIdEl.readOnly=false;
    statusEl.textContent=storeCacheLoaded?'Store ID not found — enter fields manually':'Store list loading…';
    statusEl.className='store-lookup-status '+(storeCacheLoaded?'notfound':'searching');
  }
  const hint=document.getElementById('hint-storeId');
  if(shopId&&!shopId.startsWith('PH0')){hint?.classList.add('visible');shopIdEl.classList.add('err');}
  else{hint?.classList.remove('visible');shopIdEl.classList.remove('err');}
}

// ============================================================
