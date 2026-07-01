// ============================================================
// page-analytics.js — Analytics page
// Phase 3: Headcount trend, deployment funnel, region table,
//          print/PDF profile
// ============================================================
'use strict';

let _headcountRangeMonths = 6; // 3 / 6 / 12 — toggled via the Headcount Trend range control

function renderAnalyticsPage() {
  if (typeof renderDashboard === 'function') {
    renderDashboard();
  } else {
    document.getElementById('content').innerHTML =
      Components.emptyState({ icon: '📊', title: 'Analytics unavailable', message: 'charts.js failed to load.' });
  }
  const contentEl = document.getElementById('content');
  if (contentEl) contentEl.scrollTop = 0;
  _injectAnalyticsStyles();

  // Remove any stale phase3 section before loading fresh data
  const stalePhase3 = document.getElementById('phase3-charts');
  if (stalePhase3) stalePhase3.remove();

  // Ensure the activity log is actually loaded before computing the headcount
  // trend chart — previously this silently used whatever (often nothing) was
  // cached from prior navigation, producing inaccurate/empty trend data.
  _ensureLogCacheLoaded().then(() => {
    setTimeout(_injectPhase3Charts, 150);
  });
}

// Actively fetch the activity log sheet if it hasn't been loaded yet this
// session. Safe to call repeatedly — only fetches once per session unless
// data is invalidated elsewhere (logCache = null).
async function _ensureLogCacheLoaded() {
  if (logCache && logCache.length) return;
  try {
    if (typeof gapi === 'undefined' || !gapi.client?.sheets) return;
    const r = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H`
    });
    logCache = r.result.values || [];
  } catch (e) {
    console.warn('Could not load activity log for analytics:', e);
    logCache = logCache || [];
  }
}

// ── Phase 3: Headcount Trend + Deployment Funnel + Region Table ──
function _setHeadcountRange(months) {
  if (_headcountRangeMonths === months) return;
  _headcountRangeMonths = months;
  _injectPhase3Charts();
}

function _injectPhase3Charts() {
  const dashMain = document.querySelector('.dash-main');
  if (!dashMain) return;

  // CRITICAL: Remove any existing phase3 section to prevent duplication
  const existing = document.getElementById('phase3-charts');
  if (existing) existing.remove();

  // Compute data
  const activeEmployees = (typeof activePromotersOnly === 'function') ? activePromotersOnly() : employees;
  const total = activeEmployees.length;

  const deployedList = activeEmployees.filter(e =>
    (e.deploymentStatus||'').toUpperCase().includes('DEPLOYED') &&
    !(e.deploymentStatus||'').toUpperCase().includes('NOT'));
  const deployed = deployedList.length;

  // QR scan and contract sent are measured WITHIN the deployed population —
  // these stages conceptually only apply once someone is actually deployed,
  // so this reflects true stage-to-stage funnel conversion rather than
  // comparing every stage independently back to the full active pool
  // (which previously made bottlenecks invisible — e.g. someone scanned
  // but never deployed would inflate "QR Scanned" misleadingly).
  const scannedList = deployedList.filter(e => e.qrStatus === 'SCANNED');
  const scanned = scannedList.length;
  const contracted = scannedList.filter(e => e.contractStatus === 'SENT').length;

  // Region breakdown with deploy rate
  const RORDER = ['NCR','NORTH LUZON','CENTRAL LUZON','SOUTH LUZON','VISAYAS','MINDANAO'];
  const regionData = RORDER.map(r => {
    const reg = activeEmployees.filter(e => (e.region||'').toUpperCase().includes(r.split(' ')[0]) ||
      (r === 'NCR' && (e.region||'').toUpperCase() === 'NCR'));
    const dep = reg.filter(e => (e.deploymentStatus||'').toUpperCase().includes('DEPLOYED') && !(e.deploymentStatus||'').toUpperCase().includes('NOT')).length;
    const pct = reg.length ? Math.round(dep / reg.length * 100) : 0;
    return { region: r, total: reg.length, deployed: dep, pct };
  }).filter(r => r.total > 0).sort((a,b) => b.total - a.total);

  // ── Headcount trend (last 6 months) ──────────────────────────
  // Reconstructs actual headcount-over-time by walking the activity log
  // chronologically and applying net +1 (Added) / -1 (Deleted) deltas,
  // working BACKWARDS from the current total. This is accurate regardless
  // of how far back the log goes — if the log doesn't cover a given month,
  // that month is flagged so the chart can show it honestly instead of
  // faking a flat line at the current total.
  const monthLabels = [];
  const monthCounts = [];
  const monthHasData = [];
  const now = new Date();

  // Sort all log entries chronologically (oldest first) once.
  const sortedLog = (logCache || [])
    .map(r => ({ date: new Date(r[0] || ''), action: (r[3] || '').trim() }))
    .filter(r => !isNaN(r.date) && (r.action === 'Added' || r.action === 'Deleted'))
    .sort((a, b) => a.date - b.date);

  const earliestLogDate = sortedLog.length ? sortedLog[0].date : null;
  // Anchor to the same "Active" population the funnel above reports (status
  // Active, not Backout) — NOT the full raw roster, which also includes
  // Resigned/AWOL/Terminated/Floating/Backout records and made this chart
  // show a different, larger number (e.g. 366) than "Total Active" (233).
  const currentTotal = activeEmployees.length;

  for (let i = _headcountRangeMonths - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth  = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
    monthLabels.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

    if (!earliestLogDate || endOfMonth < earliestLogDate) {
      // No log coverage for this month at all — don't fabricate a number.
      monthCounts.push(null);
      monthHasData.push(false);
      continue;
    }

    // Net change from end-of-this-month to now = sum of deltas AFTER endOfMonth.
    let netChangeAfter = 0;
    sortedLog.forEach(r => {
      if (r.date > endOfMonth) netChangeAfter += (r.action === 'Added' ? 1 : -1);
    });
    const countAtMonth = currentTotal - netChangeAfter;
    monthCounts.push(Math.max(0, countAtMonth));
    monthHasData.push(true);
  }

  const hasAnyTrendData = monthHasData.filter(Boolean).length >= Math.min(3, _headcountRangeMonths);

  const section = document.createElement('div');
  section.id = 'phase3-charts';
  section.innerHTML = `
    <!-- HEADCOUNT TREND + FUNNEL ROW -->
    <div class="p3-row">

      <!-- Headcount Trend -->
      <div class="p3-card glass-card">
        <div class="p3-card-header">
          <span class="p3-card-title"><i class="fi fi-sr-chart-histogram"></i> Headcount Trend</span>
          <div class="p3-range-toggle" role="group" aria-label="Headcount trend range">
            ${[[3,'3M'],[6,'6M'],[12,'1Y']].map(([m,label])=>`
              <button class="p3-range-btn ${_headcountRangeMonths===m?'active':''}" onclick="_setHeadcountRange(${m})">${label}</button>
            `).join('')}
          </div>
          <span class="p3-card-sub">${hasAnyTrendData ? 'Reconstructed from activity log' : 'Limited log history'}</span>
        </div>
        <div class="p3-chart-wrap">
          ${hasAnyTrendData
            ? `<canvas id="chart-headcount"></canvas>`
            : _renderRecentActivitySummary()}
        </div>
      </div>

      <!-- Deployment Funnel -->
      <div class="p3-card glass-card">
        <div class="p3-card-header">
          <span class="p3-card-title"><i class="fi fi-sr-filter"></i> Deployment Funnel</span>
          <span class="p3-card-sub" title="Each % is the conversion rate from the stage directly above it">% of previous stage</span>
        </div>
        <div class="p3-funnel">
          ${_funnelStep('Total Active', total, total, '#00C8AA')}
          ${_funnelStep('Deployed',     deployed, total, '#00E676')}
          ${_funnelStep('QR Scanned (of deployed)',   scanned,  deployed, '#378ADD')}
          ${_funnelStep('Contract Sent (of scanned)', contracted, scanned, '#8B5CF6')}
        </div>
      </div>

    </div>

    <!-- REGION BREAKDOWN TABLE -->
    <div class="p3-card glass-card" style="margin-top:16px">
      <div class="p3-card-header" style="margin-bottom:12px">
        <span class="p3-card-title"><i class="fi fi-sr-marker"></i> Region Breakdown</span>
        <span class="p3-card-sub">Deployment rate per region</span>
      </div>
      <div class="rgn-grid">
        <div class="rgn-head">
          <span class="rgn-c rgn-c-name">Region</span>
          <span class="rgn-c rgn-c-num">Total</span>
          <span class="rgn-c rgn-c-num">Deployed</span>
          <span class="rgn-c rgn-c-rate">Deploy Rate</span>
          <span class="rgn-c rgn-c-bar">Progress</span>
        </div>
        ${regionData.length===0
          ? `<div style="padding:20px;text-align:center;color:var(--text3);font-style:italic">No region data available</div>`
          : regionData.map(r=>`
        <div class="rgn-row" title="${esc(r.region)} — ${r.deployed} deployed of ${r.total}">
          <span class="rgn-c rgn-c-name" style="font-weight:600;color:var(--text)">${esc(r.region)}</span>
          <span class="rgn-c rgn-c-num"><strong>${r.total}</strong></span>
          <span class="rgn-c rgn-c-num" style="color:#00E676;font-weight:700">${r.deployed}</span>
          <span class="rgn-c rgn-c-rate">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;background:${r.pct>=70?'rgba(0,230,118,.15)':r.pct>=40?'rgba(255,215,64,.15)':'rgba(255,82,82,.15)'};color:${r.pct>=70?'#00E676':r.pct>=40?'#FFD740':'#FF5252'}">${r.pct}%</span>
          </span>
          <span class="rgn-c rgn-c-bar">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
                <div style="width:${r.pct}%;height:100%;background:${r.pct>=70?'#00E676':r.pct>=40?'#FFD740':'#FF5252'};border-radius:3px;transition:width .4s"></div>
              </div>
              <span style="font-size:10px;color:var(--text3);min-width:32px;text-align:right;flex-shrink:0">${r.pct}%</span>
            </div>
          </span>
        </div>`).join('')}
        <div class="rgn-row rgn-foot">
          <span class="rgn-c rgn-c-name"><strong>Total</strong></span>
          <span class="rgn-c rgn-c-num"><strong>${regionData.reduce((s,r)=>s+r.total,0)}</strong></span>
          <span class="rgn-c rgn-c-num"><strong style="color:#00E676">${regionData.reduce((s,r)=>s+r.deployed,0)}</strong></span>
          <span class="rgn-c rgn-c-rate"><strong>${regionData.reduce((s,r)=>s+r.total,0)?Math.round(regionData.reduce((s,r)=>s+r.deployed,0)/regionData.reduce((s,r)=>s+r.total,0)*100):0}%</strong></span>
          <span class="rgn-c rgn-c-bar"></span>
        </div>
      </div>
    </div>

    <!-- EXPORT NOTE -->
    <div class="p3-export-note">
      <i class="fi fi-sr-info"></i>
      <span>Export respects your current filters — use the status sidebar or filter bar to narrow down before exporting.</span>
      <button class="btn btn-primary" onclick="exportXLSX()" style="margin-left:auto;flex-shrink:0">
        <i class="fi fi-sr-download" style="font-size:12px"></i> Export Current View
      </button>
    </div>
  `;

  dashMain.appendChild(section);

  // Draw headcount chart — only when we actually have reconstructed data
  if (hasAnyTrendData) {
    setTimeout(() => {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const gridColor = isDark ? 'rgba(215,254,250,0.05)' : 'rgba(10,138,133,0.07)';
      const tickColor = isDark ? 'rgba(215,254,250,0.45)' : 'rgba(26,34,34,0.55)';

      const ctxH = document.getElementById('chart-headcount');
      if (ctxH) {
        if (_charts.headcount) _charts.headcount.destroy();
        const gradCtx = ctxH.getContext('2d');
        const grad = gradCtx.createLinearGradient(0, 0, 0, 200);
        grad.addColorStop(0, isDark ? 'rgba(0,200,170,0.25)' : 'rgba(0,138,133,0.18)');
        grad.addColorStop(1, 'rgba(0,200,170,0)');

        // Give the axis honest breathing room — with tiny month-to-month
        // deltas (e.g. 366 -> 365), a tight auto-scaled axis makes a 1-person
        // change look like a cliff. Pad relative to the actual headcount size.
        const validCounts = monthCounts.filter(c => c != null);
        const dataMin = validCounts.length ? Math.min(...validCounts) : 0;
        const dataMax = validCounts.length ? Math.max(...validCounts) : 0;
        const pad = Math.max(3, Math.ceil(dataMax * 0.03));

        _charts.headcount = new Chart(ctxH, {
          type: 'line',
          data: {
            labels: monthLabels,
            datasets: [{
              label: 'Headcount',
              data: monthCounts,
              spanGaps: false, // months with no log coverage (null) show as a real gap, not a fake flat line
              borderColor: '#00C8AA',
              backgroundColor: grad,
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#00C8AA',
              pointBorderColor: isDark ? '#0d1f1f' : '#fff',
              pointBorderWidth: 2,
              pointHoverRadius: 6,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => ctx.raw == null ? 'No data' : `${ctx.raw} employees`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                border: { display: false },
                ticks: { font: { size: 10, weight: '600' }, color: tickColor }
              },
              y: {
                beginAtZero: false,
                suggestedMin: Math.max(0, dataMin - pad),
                suggestedMax: dataMax + pad,
                grid: { color: gridColor },
                border: { display: false },
                ticks: { font: { size: 10, weight: '600' }, color: tickColor, precision: 0 }
              }
            }
          }
        });
      }
    }, 80);
  }
}

// Honest fallback when we don't have 3+ months of log coverage: show real
// net change over the last 30 days (which we likely DO have data for),
// instead of faking a 6-month line chart from incomplete data.
function _renderRecentActivitySummary() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30*24*60*60*1000);

  const recentLog = (logCache || [])
    .map(r => ({ date: new Date(r[0] || ''), action: (r[3] || '').trim() }))
    .filter(r => !isNaN(r.date) && r.date >= thirtyDaysAgo);

  const added   = recentLog.filter(r => r.action === 'Added').length;
  const deleted = recentLog.filter(r => r.action === 'Deleted').length;
  const net     = added - deleted;

  if (!logCache || !logCache.length) {
    return `<div class="p3-no-data"><i class="fi fi-sr-info"></i> Activity log hasn't loaded yet. Visit the Activity Log page once to populate this.</div>`;
  }

  return `
    <div class="p3-recent-summary">
      <div class="p3-rs-row">
        <div class="p3-rs-item">
          <div class="p3-rs-val" style="color:#00E676">+${added}</div>
          <div class="p3-rs-label">Added<br>(last 30 days)</div>
        </div>
        <div class="p3-rs-item">
          <div class="p3-rs-val" style="color:#FF5252">−${deleted}</div>
          <div class="p3-rs-label">Removed<br>(last 30 days)</div>
        </div>
        <div class="p3-rs-item">
          <div class="p3-rs-val" style="color:${net>=0?'#00C8AA':'#FF9800'}">${net>=0?'+':''}${net}</div>
          <div class="p3-rs-label">Net change<br>(last 30 days)</div>
        </div>
      </div>
      <div class="p3-rs-note">A full 6-month trend will appear automatically once the activity log accumulates more history.</div>
    </div>`;
}

function _funnelStep(label, count, ofPrevious, color) {
  // pct = conversion rate from the previous stage (what narrows the funnel)
  const pct = ofPrevious ? Math.round(count / ofPrevious * 100) : 0;
  const width = Math.max(pct, 18); // min width so label is always visible
  return `
    <div class="p3-funnel-step">
      <div class="p3-funnel-label">${esc(label)}</div>
      <div class="p3-funnel-bar-wrap">
        <div class="p3-funnel-bar" style="width:${width}%;background:${color};opacity:0.85"></div>
        <span class="p3-funnel-count">${count}</span>
      </div>
      <div class="p3-funnel-pct">${pct}%</div>
    </div>`;
}

// ── Print / PDF single employee ──────────────────────────────
function printEmployeeProfile(infinixId) {
  const emp = employees.find(e => String(e.infinixId) === String(infinixId));
  if (!emp) { toast('Employee not found', 'error'); return; }

  const esc2 = v => (v || '—').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const field = (label, val) => `
    <div class="pf-field">
      <div class="pf-label">${label}</div>
      <div class="pf-val">${esc2(val)}</div>
    </div>`;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Employee Profile — ${esc2(emp.fullName)}</title>
    <meta charset="UTF-8">
    <style>
      @import url('https://rsms.me/inter/inter.css');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', sans-serif; color: #111; background: #fff; padding: 32px; font-size: 13px; }
      .pf-header { display: flex; align-items: flex-start; gap: 20px; border-bottom: 3px solid #00C8AA; padding-bottom: 18px; margin-bottom: 24px; }
      .pf-avatar { width: 64px; height: 64px; border-radius: 14px; background: #e0faf7; border: 2px solid #00C8AA; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #00a090; flex-shrink: 0; }
      .pf-name { font-size: 22px; font-weight: 800; color: #111; }
      .pf-id { font-size: 12px; color: #00a090; font-weight: 700; letter-spacing: 1px; margin-top: 3px; }
      .pf-meta { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
      .pf-badge { font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 20px; border: 1px solid #ccc; }
      .pf-section { margin-bottom: 22px; }
      .pf-section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #00a090; border-bottom: 1px solid #e0faf7; padding-bottom: 5px; margin-bottom: 12px; }
      .pf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
      .pf-field { display: flex; flex-direction: column; gap: 2px; }
      .pf-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #888; }
      .pf-val { font-size: 13px; font-weight: 500; color: #111; }
      .pf-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #aaa; display: flex; justify-content: space-between; }
      .pf-req-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
      .pf-req-item { display: flex; align-items: center; gap: 6px; font-size: 11px; }
      .pf-req-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      @media print { body { padding: 16px; } }
    </style>
  </head><body>
    <div class="pf-header">
      <div class="pf-avatar">${(emp.fullName||'?')[0].toUpperCase()}</div>
      <div>
        <div class="pf-name">${esc2(emp.fullName)}</div>
        <div class="pf-id">ID: ${esc2(emp.infinixId)}</div>
        <div class="pf-meta">
          <span class="pf-badge" style="background:#e6fff5;border-color:#00C8AA;color:#00a090">${esc2(emp.status||'—')}</span>
          <span class="pf-badge" style="background:#f0f0f0">${esc2(emp.deploymentStatus||'Not Yet Deployed')}</span>
          <span class="pf-badge" style="background:#f0f0f0">${esc2(emp.region||'—')}</span>
        </div>
      </div>
    </div>

    <div class="pf-section">
      <div class="pf-section-title">Employment</div>
      <div class="pf-grid">
        ${field('Infinix ID', emp.infinixId)}
        ${field('Status', emp.status)}
        ${field('Status Date', emp.statusDate)}
        ${field('RSS Name', emp.rssName)}
        ${field('Region', emp.region)}
        ${field('Store', emp.storeAssignment)}
        ${field('Store ID', emp.storeId)}
        ${field('Deployment Status', emp.deploymentStatus)}
        ${field('Deployment Date', emp.deploymentDate)}
        ${field('QR Status', emp.qrStatus)}
        ${field('Contract Status', emp.contractStatus)}
        ${field('Contract Sent', emp.contractSentDate)}
      </div>
    </div>

    <div class="pf-section">
      <div class="pf-section-title">Personal</div>
      <div class="pf-grid">
        ${field('First Name', emp.firstName)}
        ${field('Last Name', emp.lastName)}
        ${field('Middle Name', emp.middleName)}
        ${field('Date of Birth', emp.dob)}
        ${field('Gender', emp.gender)}
        ${field('Marital Status', emp.maritalStatus)}
        ${field('Mobile', emp.mobile)}
        ${field('Email', emp.email)}
        ${field('Address', emp.address)}
      </div>
    </div>

    <div class="pf-section">
      <div class="pf-section-title">Government IDs & Payroll</div>
      <div class="pf-grid">
        ${field('SSS', emp.sss)}
        ${field('PhilHealth', emp.philhealth)}
        ${field('Pag-IBIG', emp.pagibig)}
        ${field('TIN', emp.tin)}
        ${field('Bank', emp.bankName)}
        ${field('Bank Account', emp.bankAccount)}
        ${field('Basic Wage', emp.basicWage)}
      </div>
    </div>

    <div class="pf-section">
      <div class="pf-section-title">Requirements Checklist</div>
      <div class="pf-req-grid">
        ${[
          ['Medical Certificate', emp.medicalCert],
          ['Gov IDs/Forms', emp.govForms],
          ['NBI/Clearance', emp.clearance],
          ['2x2 ID Picture', emp.idPicture],
          ['Valid ID Copy', emp.validIdCopy],
          ['Birth Certificate', emp.birthCert],
          ['Diploma/TOR', emp.diplomaTor],
          ['COE (Previous)', emp.previousCoe],
          ['Pre-Employment Forms', emp.preEmploymentForms],
          ['Job Offer', emp.jobOffer],
        ].map(([label, val]) => `
          <div class="pf-req-item">
            <div class="pf-req-dot" style="background:${val?'#00C853':'#FF5252'}"></div>
            <span>${label}</span>
          </div>`).join('')}
      </div>
    </div>

    ${emp.notes ? `<div class="pf-section"><div class="pf-section-title">Notes</div><p style="font-size:12px;color:#444;line-height:1.6">${esc2(emp.notes)}</p></div>` : ''}

    <div class="pf-footer">
      <span>Infinix Employee Database — Confidential</span>
      <span>Printed: ${new Date().toLocaleString()}</span>
    </div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function _injectAnalyticsStyles() {
  if (document.getElementById('page-analytics-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-analytics-styles';
  s.textContent = `
    /* ── Phase 3 layout ── */
    #phase3-charts { margin-top: 20px; }

    .p3-row {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
    }
    @media (max-width: 900px) { .p3-row { grid-template-columns: 1fr; } }

    .p3-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 20px;
    }
    [data-theme="light"] .p3-card { background: #fff; }

    .p3-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .p3-card-title {
      display: flex; align-items: center; gap: 7px;
      font-size: 11px; font-weight: 700; letter-spacing: .8px;
      text-transform: uppercase; color: var(--accent); opacity: .85;
    }
    .p3-card-sub { font-size: 11px; color: var(--text3); }
    [data-theme="light"] .p3-card-title { color: #0a8a85; opacity: 1; }

    .p3-range-toggle { display: flex; gap: 2px; background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 7px; padding: 2px; }
    [data-theme="light"] .p3-range-toggle { background: rgba(0,0,0,.03); }
    .p3-range-btn {
      font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700;
      color: var(--text3); background: transparent; border: none; border-radius: 5px;
      padding: 4px 9px; cursor: pointer; transition: all .15s;
    }
    .p3-range-btn:hover { color: var(--text); }
    .p3-range-btn.active { background: var(--accent); color: #04231f; }

    .p3-chart-wrap { height: 200px; position: relative; }

    /* Funnel */
    .p3-funnel { display: flex; flex-direction: column; gap: 10px; }
    .p3-funnel-step { display: flex; align-items: center; gap: 10px; }
    .p3-funnel-label {
      font-size: 10.5px; font-weight: 600; color: var(--text2);
      min-width: 150px; flex-shrink: 0; line-height: 1.3;
    }
    .p3-funnel-bar-wrap {
      flex: 1; height: 28px; background: var(--border);
      border-radius: 6px; overflow: hidden; position: relative;
      display: flex; align-items: center;
    }
    .p3-funnel-bar {
      height: 100%; border-radius: 6px;
      transition: width .6s cubic-bezier(.4,0,.2,1);
    }
    .p3-funnel-count {
      position: absolute; left: 8px;
      font-size: 12px; font-weight: 800; color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,.4);
    }
    .p3-funnel-pct {
      font-size: 11px; font-weight: 700; color: var(--text3);
      min-width: 36px; text-align: right;
    }

    /* Region table */
    .p3-region-table { width: 100%; border-collapse: collapse; table-layout: auto; }
    .p3-region-table th {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 1px; color: var(--accent); opacity: .7;
      padding: 0 8px 8px; text-align: left; border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    [data-theme="light"] .p3-region-table th { color: #0a8a85; opacity: 1; }
    .p3-region-table td {
      padding: 10px 8px; font-size: 12px; color: var(--text2);
      border-bottom: 1px solid rgba(0,200,170,.04);
      white-space: nowrap;
    }
    .p3-region-table tr:last-child td { border-bottom: none; }
    .p3-region-table tbody tr:hover { background: rgba(0,200,170,.04); }
    .p3-region-table tfoot td {
      border-top: 1px solid var(--border);
      border-bottom: none; font-weight: 700; color: var(--text);
      padding-top: 10px;
    }

    .p3-rate-badge {
      font-size: 10px; font-weight: 700; padding: 2px 8px;
      border-radius: 20px; display: inline-block;
    }
    .p3-rate-badge.good { background: rgba(0,230,118,.12); color: #00C853; }
    .p3-rate-badge.mid  { background: rgba(255,215,64,.10); color: #FFD740; }
    .p3-rate-badge.low  { background: rgba(255,82,82,.12);  color: #FF5252; }
    [data-theme="light"] .p3-rate-badge.good { background: rgba(0,160,80,.1);  color: #0a7040; }
    [data-theme="light"] .p3-rate-badge.mid  { background: rgba(180,130,0,.1); color: #7a5500; }
    [data-theme="light"] .p3-rate-badge.low  { background: rgba(200,30,30,.1); color: #8a1f1f; }

    .p3-bar-cell { display: flex; align-items: center; gap: 8px; min-width: 140px; }
    .p3-bar-wrap { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
    .p3-bar-fill { height: 100%; border-radius: 3px; transition: width .5s; }
    .p3-bar-pct  { font-size: 10px; color: var(--text3); min-width: 28px; }

    /* Honest no-data state for headcount trend */
    .p3-no-data {
      height: 100%; display: flex; align-items: center; justify-content: center;
      gap: 8px; text-align: center; padding: 0 20px;
      font-size: 12px; color: var(--text3); line-height: 1.6;
    }
    .p3-no-data .fi { color: var(--accent); font-size: 16px; flex-shrink: 0; opacity: .7; }

    /* Recent activity summary fallback */
    .p3-recent-summary {
      height: 100%; display: flex; flex-direction: column; justify-content: center;
      gap: 16px; padding: 8px 4px;
    }
    .p3-rs-row { display: flex; gap: 20px; justify-content: space-around; }
    .p3-rs-item { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
    .p3-rs-val { font-size: 26px; font-weight: 800; line-height: 1; }
    .p3-rs-label { font-size: 10px; color: var(--text3); font-weight: 600; line-height: 1.4; }
    .p3-rs-note {
      font-size: 11px; color: var(--text3); text-align: center;
      padding-top: 12px; border-top: 1px solid var(--border); line-height: 1.5;
    }

    /* Export note */
    .p3-export-note {
      margin-top: 14px; padding: 12px 16px;
      background: rgba(0,200,170,.05); border: 1px solid rgba(0,200,170,.15);
      border-radius: 10px; display: flex; align-items: center; gap: 10px;
      font-size: 12px; color: var(--text2);
    }
    .p3-export-note .fi { color: var(--accent); font-size: 14px; flex-shrink: 0; }
    [data-theme="light"] .p3-export-note { background: rgba(0,138,133,.05); border-color: rgba(0,138,133,.18); }

    /* Print button in profile */
    .pp-print-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;
      background: rgba(55,138,221,.1); color: #378ADD;
      border: 1px solid rgba(55,138,221,.25); cursor: pointer;
      transition: all .18s;
    }
    .pp-print-btn:hover { background: rgba(55,138,221,.2); border-color: rgba(55,138,221,.4); }
    [data-theme="light"] .pp-print-btn { color: #1a5cb0; }
  `;
  document.head.appendChild(s);
}
