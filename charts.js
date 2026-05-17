// DASHBOARD
// ============================================================
function renderDashboard(){
  document.getElementById('topbar-title').textContent='Dashboard';
  document.getElementById('topbar-sub').textContent='Overview · Active promoters only for HR metrics';

  const s=getStats();
  const total=employees.length;
  const activeEmployees=activePromotersOnly();
  const activeTotal=activeEmployees.length;

  const deployed=activeEmployees.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='DEPLOYED').length;
  const activeSheetRows=employees.filter(e=>e._sheet===ACTIVE_SHEET);
  const notDeployed=activeSheetRows.filter(e=>isNotYetDeployedColL(e.deploymentStatusColL)).length;
  const scanned=activeEmployees.filter(e=>e.qrStatus==='SCANNED').length;
  const notScanned=activeEmployees.filter(e=>!e.qrStatus||e.qrStatus==='NOT SCANNED').length;
  const contractSent=activeEmployees.filter(e=>e.contractStatus==='SENT').length;
  const contractPending=activeEmployees.filter(e=>!e.contractStatus||e.contractStatus==='NOT YET SENT').length;
  const missingGovIds=activeEmployees.filter(e=>isMissing(e.sss)||isMissing(e.philhealth)||isMissing(e.pagibig)||isMissing(e.tin)).length;
  const missingBank=activeEmployees.filter(e=>isMissing(e.bankAccount)).length;
  const missingMobile=activeEmployees.filter(e=>isMissing(e.mobile)).length;
  const missingRequirements=activeEmployees.filter(e=>!requirementsComplete(e)).length;
  const reqComplete=activeTotal-missingRequirements;
  const missingInfinixId=employees.filter(e=>e._sheet===ACTIVE_SHEET && !String(e.infinixId||'').trim()).length;
  const missingStore=employees.filter(e=>e._sheet===ACTIVE_SHEET && normalizeStatus(e.status)==='Active' && isMissing(e.storeAssignment)).length;

  const regions={};activeEmployees.forEach(e=>{const rr=normalizeRegion(e.region);if(rr)regions[rr]=(regions[rr]||0)+1;});
  const recent=[...employees].sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0)).slice(0,6);
  const birthdays=getBirthdaysThisMonth().slice(0,5);
  const now=new Date();

  const deployPct=activeTotal?Math.round(deployed/activeTotal*100):0;
  const scanPct=activeTotal?Math.round(scanned/activeTotal*100):0;
  const contractPct=activeTotal?Math.round(contractSent/activeTotal*100):0;
  const reqPct=activeTotal?Math.round(reqComplete/activeTotal*100):0;

  const pendingCount=[notDeployed,notScanned,contractPending,missingRequirements,missingGovIds,missingBank,missingMobile,missingInfinixId,missingStore].filter(v=>v>0).length;

  document.getElementById('content').innerHTML=`
    <!-- DASHBOARD SEARCH -->
    <div class="dash-search-wrap">
      <span class="dash-search-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
      <input type="text" id="dash-search-input" placeholder="Search employees by name, ID, or store…" onkeydown="if(event.key==='Enter')dashSearch(this.value)">
    </div>

    <!-- HERO KPI ROW -->
    <div class="dash-hero">
      <div class="dash-hero-card glass-card">
        <div class="dhc-accent-bar" style="background:linear-gradient(90deg,#4ecb71,transparent)"></div>
        <div class="dhc-label">Total Workforce</div>
        <div class="dhc-value" style="color:var(--text)">${total}</div>
        <div class="dhc-sub">All employment records</div>
        <div class="dhc-progress"><div class="dhc-progress-fill" style="width:100%;background:#4ecb71"></div></div>
      </div>
      <div class="dash-hero-card glass-card" onclick="drillDown('notDeployed')" style="cursor:pointer">
        <div class="dhc-accent-bar" style="background:linear-gradient(90deg,#4ecb71,transparent)"></div>
        <div class="dhc-label">Deployed</div>
        <div class="dhc-value" style="color:#4ecb71">${deployed}</div>
        <div class="dhc-sub">${deployPct}% of active promoters</div>
        <div class="dhc-progress"><div class="dhc-progress-fill" style="width:${deployPct}%;background:#4ecb71"></div></div>
      </div>
      <div class="dash-hero-card glass-card" onclick="drillDown('notDeployed')" style="cursor:pointer">
        <div class="dhc-accent-bar" style="background:linear-gradient(90deg,#f5c842,transparent)"></div>
        <div class="dhc-label">Pending Deploy</div>
        <div class="dhc-value" style="color:#f5c842">${notDeployed}</div>
        <div class="dhc-sub">Active sheet · Col L</div>
        <div class="dhc-progress"><div class="dhc-progress-fill" style="width:${activeSheetRows.length?Math.round(notDeployed/activeSheetRows.length*100):0}%;background:#f5c842"></div></div>
      </div>
      <div class="dash-hero-card glass-card" onclick="drillDown('notScanned')" style="cursor:pointer">
        <div class="dhc-accent-bar" style="background:linear-gradient(90deg,var(--teal-deep),transparent)"></div>
        <div class="dhc-label">QR Scanned</div>
        <div class="dhc-value" style="color:var(--teal-deep)">${scanned}</div>
        <div class="dhc-sub">${scanPct}% of active promoters</div>
        <div class="dhc-progress"><div class="dhc-progress-fill" style="width:${scanPct}%;background:var(--teal-deep)"></div></div>
      </div>
      <div class="dash-hero-card glass-card" onclick="drillDown('missingRequirements')" style="cursor:pointer">
        <div class="dhc-accent-bar" style="background:linear-gradient(90deg,var(--moss-green),transparent)"></div>
        <div class="dhc-label">Req. Complete</div>
        <div class="dhc-value" style="color:var(--moss-green)">${reqComplete}</div>
        <div class="dhc-sub">${reqPct}% of active promoters</div>
        <div class="dhc-progress"><div class="dhc-progress-fill" style="width:${reqPct}%;background:var(--moss-green)"></div></div>
      </div>
    </div>

    <!-- STATUS CARDS -->
    <div class="dash-status-row">
      ${STATUSES.map(st=>{
        const cnt=s[st]||0;
        const pct=total?Math.round(cnt/total*100):0;
        return`<div class="dsr-card glass-card" onclick="filterByStatus('${esc(st)}')" style="border-left-color:${STATUS_COLORS[st]}">
          <div class="dsr-num" style="color:${STATUS_COLORS[st]}">${cnt}</div>
          <div class="dsr-label">${esc(st)}</div>
          <div class="dsr-pct">${pct}% of total</div>
          <div class="dsr-bar"><div class="dsr-bar-fill" style="width:${pct}%;background:${STATUS_COLORS[st]}"></div></div>
        </div>`;
      }).join('')}
    </div>

    <!-- PENDING ACTIONS -->
    <div class="pending-section">
      <div class="pending-title">
        <span>Pending Actions</span>
        <div class="pending-title-line"></div>
        <span style="font-size:9px;opacity:.55">Active promoters only · click to filter</span>
        ${pendingCount>0?`<span style="background:var(--danger-bg);border:1px solid rgba(224,92,92,0.3);color:var(--danger);font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px">${pendingCount} issue${pendingCount!==1?'s':''}</span>`:`<span style="background:var(--success-bg);border:1px solid rgba(78,203,113,0.3);color:var(--success);font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px">All clear</span>`}
      </div>
      <div class="pending-grid">
        ${notDeployed>0?`<div class="pending-card glass-card" onclick="drillDown('notDeployed')"><div class="pc-icon warn">${actionIconSVG('rocket')}</div><div class="pc-body"><div class="pc-num" style="color:#f5c842">${notDeployed}</div><div class="pc-label">Not Yet Deployed</div></div></div>`:''}
        ${notScanned>0?`<div class="pending-card glass-card" onclick="drillDown('notScanned')"><div class="pc-icon">${actionIconSVG('phone')}</div><div class="pc-body"><div class="pc-num" style="color:var(--teal-deep)">${notScanned}</div><div class="pc-label">QR Not Scanned</div></div></div>`:''}
        ${contractPending>0?`<div class="pending-card glass-card" onclick="drillDown('contractPending')"><div class="pc-icon warn">${actionIconSVG('file')}</div><div class="pc-body"><div class="pc-num" style="color:#f5c842">${contractPending}</div><div class="pc-label">Contract Pending</div></div></div>`:''}
        ${missingRequirements>0?`<div class="pending-card glass-card" onclick="drillDown('missingRequirements')"><div class="pc-icon danger">${actionIconSVG('alert')}</div><div class="pc-body"><div class="pc-num" style="color:var(--danger)">${missingRequirements}</div><div class="pc-label">Reqs Incomplete</div></div></div>`:''}
        ${missingGovIds>0?`<div class="pending-card glass-card" onclick="drillDown('missingGovIds')"><div class="pc-icon danger">${actionIconSVG('id')}</div><div class="pc-body"><div class="pc-num" style="color:var(--danger)">${missingGovIds}</div><div class="pc-label">Missing Gov IDs</div></div></div>`:''}
        ${missingBank>0?`<div class="pending-card glass-card" onclick="drillDown('missingBank')"><div class="pc-icon danger">${actionIconSVG('bank')}</div><div class="pc-body"><div class="pc-num" style="color:var(--danger)">${missingBank}</div><div class="pc-label">Missing Bank Acct</div></div></div>`:''}
        ${missingMobile>0?`<div class="pending-card glass-card" onclick="drillDown('missingMobile')"><div class="pc-icon danger">${actionIconSVG('phone')}</div><div class="pc-body"><div class="pc-num" style="color:var(--danger)">${missingMobile}</div><div class="pc-label">Missing Mobile</div></div></div>`:''}
        ${missingInfinixId>0?`<div class="pending-card glass-card" onclick="drillDown('missingInfinixId')"><div class="pc-icon danger">${actionIconSVG('id')}</div><div class="pc-body"><div class="pc-num" style="color:var(--danger)">${missingInfinixId}</div><div class="pc-label">No Infinix ID</div></div></div>`:''}
        ${missingStore>0?`<div class="pending-card glass-card" onclick="drillDown('missingStore')"><div class="pc-icon danger">${actionIconSVG('store')}</div><div class="pc-body"><div class="pc-num" style="color:var(--danger)">${missingStore}</div><div class="pc-label">No Store Assignment</div></div></div>`:''}
        ${pendingCount===0?`<div class="pending-card ok-card glass-card" style="border-left-color:var(--success);grid-column:1/-1"><div class="pc-icon">${actionIconSVG('check')}</div><div class="pc-body"><div class="pc-num" style="color:var(--success);font-size:14px">All Clear</div><div class="pc-label">All active records are complete</div></div></div>`:''}
      </div>
    </div>

    <!-- CHARTS + SIDE PANEL -->
    <div class="dash-grid">
      <div>
        <div class="charts-row">

          <!-- DOUGHNUT + STATUS TABLE -->
          <div class="chart-card glass-card" style="display:flex;flex-direction:column">
            <div class="chart-title">Workforce Distribution</div>
            <div style="display:flex;align-items:center;gap:16px;flex:1;min-height:0">
              <div style="position:relative;width:150px;height:150px;flex-shrink:0">
                <canvas id="chart-status"></canvas>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
                  <div style="font-size:26px;font-weight:900;font-family:'Poppins',sans-serif;line-height:1;color:var(--text)">${total}</div>
                  <div style="font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-top:3px">TOTAL</div>
                </div>
              </div>
              <div style="flex:1;min-width:0">
                <div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:3px 10px;align-items:center">
                  <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text3);padding-bottom:4px;border-bottom:1px solid var(--border)"></div>
                  <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text3);padding-bottom:4px;border-bottom:1px solid var(--border)">Status</div>
                  <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text3);padding-bottom:4px;border-bottom:1px solid var(--border);text-align:right">Count</div>
                  <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text3);padding-bottom:4px;border-bottom:1px solid var(--border);text-align:right">%</div>
                  ${STATUSES.map(st=>{
                    const cnt=s[st]||0;
                    const pct=total?Math.round(cnt/total*100):0;
                    return`
                  <span style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLORS[st]};flex-shrink:0;display:block"></span>
                  <div style="font-size:11.5px;font-weight:600;color:var(--text2);cursor:pointer;padding:3px 0" onclick="filterByStatus('${esc(st)}')">${esc(st)}</div>
                  <div style="font-size:12px;font-weight:800;color:${STATUS_COLORS[st]};text-align:right">${cnt}</div>
                  <div style="font-size:11px;color:var(--text3);text-align:right">${pct}%</div>`;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- BAR CHART — Active Promoters by Region -->
          <div class="chart-card glass-card" style="display:flex;flex-direction:column">
            <div class="chart-title">Regional Workforce Analytics</div>
            <div class="chart-wrap" style="flex:1"><canvas id="chart-region"></canvas></div>
          </div>

        </div>
      </div>
      <div class="dash-right">
        <div class="recent-card glass-card">
          <h4>Recently Updated</h4>
          ${recent.map(e=>{
            const initials=((e.firstName||e.fullName||'?')[0]||'?').toUpperCase();
            return`<div class="recent-row" onclick="openDetailPanel('${esc(e.infinixId)}')">
              <div class="rr-avatar">${initials}</div>
              <div class="rr-name">${esc(e.fullName||'')}</div>
              <div class="rr-badge">${badgeHTML(e.status)}</div>
            </div>`;
          }).join('')||`<div style="font-size:12px;color:var(--text3);padding:8px 0">No recent updates.</div>`}
        </div>
        <div class="birthday-card glass-card">
          <h4>🎂 Birthdays This Month</h4>
          ${birthdays.length===0
            ?`<div style="font-size:12px;color:var(--text3)">No birthdays this month.</div>`
            :birthdays.map(({emp,day,daysUntil})=>{
              const isToday=daysUntil===0;
              return`<div class="bday-item ${isToday?'bday-today':''}" onclick="openDetailPanel('${esc(emp.infinixId)}')">
                <span class="bday-icon">${isToday?'🎉':'🎂'}</span>
                <div style="min-width:0">
                  <div class="bday-name">${esc(emp.fullName||'')}</div>
                  <div class="bday-date">${isToday?'<b style="color:var(--warning)">Today!</b>':daysUntil>0?`in ${daysUntil} day${daysUntil!==1?'s':''}`:`${Math.abs(daysUntil)} day${Math.abs(daysUntil)!==1?'s':''} ago`} · ${esc(emp.storeAssignment||emp.region||'')}</div>
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>
    </div>`;

  setTimeout(()=>{
    const isDark=document.documentElement.getAttribute('data-theme')!=='light';
    Chart.defaults.font.family='Poppins';
    const gridColor=isDark?'rgba(215,254,250,0.055)':'rgba(10,138,133,0.075)';
    const tickColor=isDark?'rgba(215,254,250,0.48)':'rgba(26,34,34,0.54)';
    const tooltipBg=isDark?'rgba(20,24,24,0.94)':'rgba(255,255,255,0.94)';
    const tooltipText=isDark?'#ffffff':'#1a2222';
    Chart.defaults.color=tickColor;

    const chartGlowPlugin={
      id:'chartGlowPlugin',
      beforeDatasetDraw(chart,args){
        const {ctx}=chart;
        if(args.index!==0)return;
        ctx.save();
        ctx.shadowColor=isDark?'rgba(46,196,190,0.28)':'rgba(10,138,133,0.18)';
        ctx.shadowBlur=14;
        ctx.shadowOffsetY=4;
      },
      afterDatasetDraw(chart,args){
        if(args.index!==0)return;
        chart.ctx.restore();
      }
    };

    const valueLabelPlugin={
      id:'regionValueLabels',
      afterDatasetsDraw(chart){
        if(chart.config.type!=='bar')return;
        const ctx2=chart.ctx;
        const meta=chart.getDatasetMeta(0);
        const data=chart.data.datasets[0].data||[];
        meta.data.forEach((bar,idx)=>{
          const val=data[idx];
          if(val===undefined||val===null)return;
          ctx2.save();
          ctx2.font='800 12px Poppins, sans-serif';
          ctx2.fillStyle=isDark?'rgba(255,255,255,0.94)':'rgba(26,34,34,0.88)';
          ctx2.textAlign='left';
          ctx2.textBaseline='middle';
          ctx2.fillText(val, Math.min(bar.x+10, chart.chartArea.right-26), bar.y);
          ctx2.restore();
        });
      }
    };

    const baseTooltip={
      enabled:true,
      backgroundColor:tooltipBg,
      titleColor:tooltipText,
      bodyColor:tooltipText,
      borderColor:isDark?'rgba(215,254,250,0.18)':'rgba(10,138,133,0.18)',
      borderWidth:1,
      padding:10,
      cornerRadius:10,
      displayColors:true,
      titleFont:{size:12,weight:'800'},
      bodyFont:{size:11,weight:'600'}
    };

    // DOUGHNUT — premium glass donut with glow and cleaner tooltip
    const ctxS=document.getElementById('chart-status');
    if(ctxS){
      if(_charts.status)_charts.status.destroy();
      _charts.status=new Chart(ctxS,{
        type:'doughnut',
        plugins:[chartGlowPlugin],
        data:{
          labels:STATUSES,
          datasets:[{
            data:STATUSES.map(st=>s[st]||0),
            backgroundColor:STATUSES.map(st=>STATUS_COLORS[st]+(isDark?'AA':'BB')),
            borderColor:isDark?'rgba(20,24,24,0.95)':'rgba(255,255,255,0.96)',
            borderWidth:3,
            spacing:1,
            hoverOffset:9,
            hoverBorderWidth:3
          }]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          cutout:'74%',
          animation:{animateRotate:true,animateScale:true,duration:850,easing:'easeOutQuart'},
          plugins:{
            legend:{display:false},
            tooltip:{
              ...baseTooltip,
              callbacks:{
                label:ctx=>`${ctx.label}: ${ctx.raw} employees (${total?Math.round(ctx.raw/total*100):0}%)`
              }
            }
          }
        }
      });
    }

    // BAR CHART — premium rounded gradient bars with full region names
    const ctxR=document.getElementById('chart-region');
    if(ctxR){
      if(_charts.region)_charts.region.destroy();
      const rEntries=Object.entries(regions).sort((a,b)=>b[1]-a[1]);
      const maxVal=rEntries.length?rEntries[0][1]:0;
      const regionCanvas=ctxR.getContext('2d');
      const makeGradient=(strong=false)=>{
        const g=regionCanvas.createLinearGradient(0,0,ctxR.clientWidth||520,0);
        if(isDark){
          g.addColorStop(0,strong?'rgba(215,254,250,0.22)':'rgba(215,254,250,0.10)');
          g.addColorStop(0.55,strong?'rgba(46,196,190,0.88)':'rgba(46,196,190,0.42)');
          g.addColorStop(1,strong?'rgba(143,232,228,0.95)':'rgba(143,232,228,0.52)');
        }else{
          g.addColorStop(0,strong?'rgba(10,138,133,0.18)':'rgba(10,138,133,0.08)');
          g.addColorStop(0.6,strong?'rgba(10,138,133,0.78)':'rgba(10,138,133,0.34)');
          g.addColorStop(1,strong?'rgba(13,122,118,0.88)':'rgba(13,122,118,0.42)');
        }
        return g;
      };
      const barColors=rEntries.map(([,c])=>makeGradient(c===maxVal));
      const barBorders=rEntries.map(([,c])=>c===maxVal
        ? (isDark?'rgba(215,254,250,0.85)':'rgba(10,138,133,0.85)')
        : (isDark?'rgba(215,254,250,0.22)':'rgba(10,138,133,0.22)')
      );
      _charts.region=new Chart(ctxR,{
        type:'bar',
        indexAxis:'y',
        plugins:[chartGlowPlugin,valueLabelPlugin],
        data:{
          labels:rEntries.map(([r])=>prettyRegionName(r)),
          datasets:[{
            label:'Active Promoters',
            data:rEntries.map(([,c])=>c),
            backgroundColor:barColors,
            borderColor:barBorders,
            borderWidth:1,
            borderRadius:14,
            borderSkipped:false,
            barPercentage:0.62,
            categoryPercentage:0.78
          }]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          layout:{padding:{top:12,right:32,bottom:8,left:4}},
          interaction:{mode:'nearest',axis:'y',intersect:false},
          plugins:{
            legend:{display:false},
            tooltip:{...baseTooltip,callbacks:{label:ctx=>`${ctx.raw} active promoters`}},
          },
          scales:{
            x:{
              beginAtZero:true,
              max:maxVal?Math.ceil(maxVal*1.20):10,
              grid:{color:gridColor,drawTicks:false},
              border:{display:false},
              ticks:{font:{size:10,weight:'700'},color:tickColor,precision:0,padding:6}
            },
            y:{
              grid:{display:false},
              border:{display:false},
              ticks:{font:{size:11,weight:'800'},color:tickColor,autoSkip:false,padding:8}
            }
          },
          animation:{duration:900,easing:'easeOutQuart'}
        }
      });
    }
  },80);
}

// ============================================================
// DEPLOYMENT TRACKER
// ============================================================
function renderTracker(){
  document.getElementById('topbar-title').textContent='Deployment Tracker';
  document.getElementById('topbar-sub').textContent='Active promoters only';

  let list=employees.filter(e=>normalizeStatus(e.status)==='Active');
  if(trackerDateFrom)list=list.filter(e=>e.deploymentDate&&e.deploymentDate>=trackerDateFrom);
  if(trackerDateTo)list=list.filter(e=>e.deploymentDate&&e.deploymentDate<=trackerDateTo);
  if(trackerRegion)list=list.filter(e=>normalizeRegion(e.region)===normalizeRegion(trackerRegion));

  const total=list.length;
  const deployed=list.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='DEPLOYED').length;
  const notYet=list.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='NOT YET DEPLOYED').length;
  const backout=list.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='BACKOUT').length;
  const pct=total?Math.round(deployed/total*100):0;

  const byRegion={};
  REGIONS.forEach(r=>{
    const reg=list.filter(e=>normalizeRegion(e.region)===normalizeRegion(r));
    byRegion[r]={total:reg.length,deployed:reg.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='DEPLOYED').length,notYet:reg.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='NOT YET DEPLOYED').length,backout:reg.filter(e=>normalizeDeployStatus(e.deploymentStatus)==='BACKOUT').length};
  });

  const byStore={};
  list.forEach(e=>{
    const key=e.storeAssignment||e.storeId||'Unknown';
    if(!byStore[key])byStore[key]={name:key,storeId:e.storeId,region:normalizeRegion(e.region),total:0,deployed:0,notYet:0,backout:0};
    byStore[key].total++;
    if(normalizeDeployStatus(e.deploymentStatus)==='DEPLOYED')byStore[key].deployed++;
    else if(normalizeDeployStatus(e.deploymentStatus)==='BACKOUT')byStore[key].backout++;
    else byStore[key].notYet++;
  });
  const storeList=Object.values(byStore).sort((a,b)=>b.total-a.total).slice(0,20);

  document.getElementById('content').innerHTML=`
    <div class="tracker-date-filters glass-card" style="padding:12px 16px;margin-bottom:16px">
      <span style="font-size:9.5px;color:var(--moss-green);font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:.8">Filters</span>
      <input type="date" value="${esc(trackerDateFrom)}" onchange="trackerDateFrom=this.value;renderTracker()" placeholder="From date">
      <span style="font-size:11px;color:var(--text3)">to</span>
      <input type="date" value="${esc(trackerDateTo)}" onchange="trackerDateTo=this.value;renderTracker()" placeholder="To date">
      <select style="background:var(--bg-frosted);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;font-size:11.5px;color:var(--text2);font-family:'Poppins',sans-serif;outline:none;" onchange="trackerRegion=this.value;renderTracker()">
        <option value="">All Regions</option>
        ${REGIONS.map(r=>`<option value="${esc(r)}" ${trackerRegion===r?'selected':''}>${esc(r)}</option>`).join('')}
      </select>
      ${(trackerDateFrom||trackerDateTo||trackerRegion)?`<button class="btn btn-ghost btn-sm" onclick="trackerDateFrom='';trackerDateTo='';trackerRegion='';renderTracker()">Reset</button>`:''}
      <span style="margin-left:auto;font-size:11px;color:var(--text3)">${total} employees in view</span>
    </div>
    <div class="tracker-grid">
      <div class="tracker-kf glass-card"><div class="kf-label-top">Total in View</div><div style="font-size:32px;font-weight:800">${total}</div><div style="font-size:10.5px;color:var(--text3);margin-top:6px">Filtered records</div></div>
      <div class="tracker-kf glass-card"><div class="kf-label-top">Deployed</div><div style="font-size:32px;font-weight:800;color:var(--success)">${deployed}</div><div style="font-size:10.5px;color:var(--text3);margin-top:6px">${pct}% deployment rate</div><div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:12px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--success);border-radius:2px"></div></div></div>
      <div class="tracker-kf glass-card"><div class="kf-label-top">Breakdown</div><div style="display:flex;gap:16px;font-size:13px;margin-top:4px"><span><span style="color:var(--warning);font-weight:800;font-size:22px">${notYet}</span><div style="font-size:10px;color:var(--text3);margin-top:2px">Pending</div></span><span><span style="color:var(--danger);font-weight:800;font-size:22px">${backout}</span><div style="font-size:10px;color:var(--text3);margin-top:2px">Backout</div></span></div></div>
    </div>
    <div class="section-heading"><span>By Region</span><div class="section-heading-line"></div></div>
    <div class="tracker-region-grid">
      ${REGIONS.map(r=>{
        const rd=byRegion[r];
        if(!rd||rd.total===0)return`<div class="tracker-region-card glass-card"><div class="tracker-region-name">${esc(r)}</div><div style="font-size:11px;color:var(--text3)">No employees</div></div>`;
        const rpct=Math.round(rd.deployed/rd.total*100);
        return`<div class="tracker-region-card glass-card">
          <div class="tracker-region-name">${esc(r)}</div>
          <div style="font-size:22px;font-weight:800;color:var(--text)">${rd.deployed}<span style="font-size:13px;color:var(--text3);font-weight:400"> / ${rd.total}</span></div>
          <div class="tracker-region-bar-wrap"><div class="tracker-region-bar" style="width:${rpct}%"></div></div>
          <div class="tracker-region-stats"><span style="color:var(--success)">${rpct}% deployed</span><span>${rd.notYet} pending · ${rd.backout} backout</span></div>
        </div>`;
      }).join('')}
    </div>
    <div class="section-heading"><span>By Store</span><div class="section-heading-line"></div><span style="font-size:9px;opacity:.55">Top 20 by headcount</span></div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th class="no-sort">Store</th><th class="no-sort">Store ID</th><th class="no-sort">Region</th>
            <th class="no-sort">Total</th><th class="no-sort">Deployed</th><th class="no-sort">Pending</th>
            <th class="no-sort">Backout</th><th class="no-sort">Progress</th>
          </tr></thead>
          <tbody>
            ${storeList.length===0?`<tr><td colspan="8"><div class="empty-state"><div class="ei">—</div><p>No data</p></div></td></tr>`
            :storeList.map(st=>{
              const sp=st.total?Math.round(st.deployed/st.total*100):0;
              return`<tr>
                <td><div class="td-name">${esc(st.name)}</div></td>
                <td><span class="td-id">${esc(st.storeId||'—')}</span></td>
                <td style="color:var(--text2)">${esc(st.region||'—')}</td>
                <td style="font-weight:700">${st.total}</td>
                <td><span style="color:var(--success);font-weight:700">${st.deployed}</span></td>
                <td><span style="color:var(--warning);font-weight:700">${st.notYet}</span></td>
                <td><span style="color:var(--danger);font-weight:700">${st.backout}</span></td>
                <td style="min-width:120px"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:rgba(136,144,99,0.12);border-radius:3px;overflow:hidden"><div style="width:${sp}%;height:100%;background:var(--moss-green);border-radius:3px"></div></div><span style="font-size:10px;color:var(--text3);min-width:28px">${sp}%</span></div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
