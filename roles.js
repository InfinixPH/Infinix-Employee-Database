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
function actionIconSVG(name){
  const icons={
    rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1 1-1.5 3-1.5 4.5 1.5 0 3.5-.5 4.5-1.5"/><path d="M9 15 5 19"/><path d="M14 4c3.3-.4 5.4.4 6 1 .6.6 1.4 2.7 1 6l-4.5 4.5-8-8L14 4Z"/><path d="M9.5 8.5 4 9l4 4"/><path d="m15 14 4 4 .5-5.5"/><circle cx="15.5" cy="8.5" r="1.5"/></svg>',
    phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
    id:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12" r="2"/><path d="M14 10h4M14 14h3"/><path d="M5.8 17c.6-1.4 1.6-2 2.7-2s2.1.6 2.7 2"/></svg>',
    bank:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M4 18h16M2 22h20"/><path d="m12 2 9 5H3Z"/></svg>',
    store:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1-6H5l-1 6Z"/><path d="M5 10v10h14V10"/><path d="M9 20v-5h6v5"/><path d="M3 10c.5 1.3 1.5 2 3 2s2.5-.7 3-2c.5 1.3 1.5 2 3 2s2.5-.7 3-2c.5 1.3 1.5 2 3 2s2.5-.7 3-2"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="10"/></svg>'
  };
  return icons[name] || icons.alert;
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
async function loadStoreDetails(){
  if(storeCacheLoaded)return;
  try{
    // Store Details columns: A=Region B=City C=Responsible RSS D=RSS User ID
    // E=Mall Name/Location F=Dealer Name G=DCR Name/Store Name H=Shop ID I=Store Type J=Status
    const r=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${STORE_DETAILS_SHEET}!A:J`});
    const rows=r.result.values||[];
    storeCache={};
    for(let i=1;i<rows.length;i++){
      const region   =(rows[i][0]||'').trim();
      const rssName  =(rows[i][2]||'').trim();
      const rssId    =(rows[i][3]||'').trim();
      const storeName=(rows[i][6]||'').trim();
      const shopId   =(rows[i][7]||'').trim();
      if(shopId) storeCache[shopId.toUpperCase()]={storeName, rssName, rssId, region};
    }
    storeCacheLoaded=true;
  }catch(e){console.warn('Store Details load failed:',e);}
}
function lookupStore(shopId){
  if(!shopId)return null;
  return storeCache[shopId.trim().toUpperCase()]||null;
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
