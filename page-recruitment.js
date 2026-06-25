// ============================================================
// page-recruitment.js — Recruitment & Training page
// Placeholder UI ready for future implementation
// ============================================================
'use strict';

function renderRecruitmentPage(){
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = 'Recruitment & Training';

  document.getElementById('content').innerHTML = `
    <div class="rec-wrap">

      <!-- Summary Cards -->
      <div class="rec-kpi-row">
        <div class="rec-kpi-card">
          <div class="rec-kpi-icon" style="background:rgba(0,200,170,.1);color:var(--accent)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="rec-kpi-body">
            <div class="rec-kpi-val">—</div>
            <div class="rec-kpi-label">Total Applicants</div>
          </div>
        </div>
        <div class="rec-kpi-card">
          <div class="rec-kpi-icon" style="background:rgba(55,138,221,.1);color:#378ADD">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
          </div>
          <div class="rec-kpi-body">
            <div class="rec-kpi-val" style="color:#378ADD">—</div>
            <div class="rec-kpi-label">Shortlisted</div>
          </div>
        </div>
        <div class="rec-kpi-card">
          <div class="rec-kpi-icon" style="background:rgba(255,215,64,.1);color:#FFD740">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </div>
          <div class="rec-kpi-body">
            <div class="rec-kpi-val" style="color:#FFD740">—</div>
            <div class="rec-kpi-label">In Training</div>
          </div>
        </div>
        <div class="rec-kpi-card">
          <div class="rec-kpi-icon" style="background:rgba(0,230,118,.1);color:#00E676">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
          <div class="rec-kpi-body">
            <div class="rec-kpi-val" style="color:#00E676">—</div>
            <div class="rec-kpi-label">Onboarded</div>
          </div>
        </div>
      </div>

      <!-- Main content area -->
      <div class="rec-grid">

        <!-- Applicants section -->
        <div class="rec-section">
          <div class="rec-section-header">
            <div class="rec-section-title">Applicants</div>
            <div class="rec-section-badge coming-soon">Coming Soon</div>
          </div>
          <div class="rec-placeholder-body">
            <div class="rec-ph-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="rec-ph-title">Applicant Tracking</div>
            <div class="rec-ph-sub">Track applicants from screening to onboarding. Connect an Applicants Google Sheet to enable this feature.</div>
          </div>
        </div>

        <!-- Training Schedule section -->
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

        <!-- Pipeline section -->
        <div class="rec-section rec-section-full">
          <div class="rec-section-header">
            <div class="rec-section-title">Recruitment Pipeline</div>
            <div class="rec-section-badge coming-soon">Coming Soon</div>
          </div>
          <div class="rec-pipeline-placeholder">
            ${['Screening','Interview','Job Offer','Pre-Employment','Onboarding'].map((stage,i)=>`
              <div class="rec-pipeline-stage">
                <div class="rec-stage-header">
                  <div class="rec-stage-num">${String(i+1).padStart(2,'0')}</div>
                  <div class="rec-stage-name">${stage}</div>
                </div>
                <div class="rec-stage-empty">—</div>
              </div>`).join('')}
          </div>
        </div>

      </div>

    </div>
  `;

  _injectRecruitmentStyles();
}

function _injectRecruitmentStyles(){
  if(document.getElementById('page-rec-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-rec-styles';
  s.textContent = `
  .rec-wrap { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }

  /* KPI strip */
  .rec-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  @media(max-width:900px){ .rec-kpi-row { grid-template-columns: 1fr 1fr; } }
  @media(max-width:560px){ .rec-kpi-row { grid-template-columns: 1fr; } }
  .rec-kpi-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px;
    display: flex; gap: 12px; align-items: center;
    transition: transform .15s, border-color .15s;
  }
  .rec-kpi-card:hover { transform: translateY(-2px); border-color: var(--border2); }
  .rec-kpi-icon {
    width: 42px; height: 42px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .rec-kpi-body { flex: 1; }
  .rec-kpi-val { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.1; }
  .rec-kpi-label { font-size: 11px; color: var(--text3); margin-top: 3px; }

  /* Grid */
  .rec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media(max-width:768px){ .rec-grid { grid-template-columns: 1fr; } }

  .rec-section {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .rec-section-full { grid-column: 1 / -1; }

  .rec-section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
    background: rgba(0,200,170,.03);
  }
  .rec-section-title { font-size: 12px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: .5px; }
  .rec-section-badge {
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px;
    text-transform: uppercase; letter-spacing: .5px;
  }
  .rec-section-badge.coming-soon {
    background: rgba(255,215,64,.1); color: #FFD740; border: 1px solid rgba(255,215,64,.3);
  }

  /* Placeholder body */
  .rec-placeholder-body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 32px 20px; text-align: center; gap: 10px;
  }
  .rec-ph-icon { color: var(--text3); opacity: .5; margin-bottom: 4px; }
  .rec-ph-title { font-size: 13px; font-weight: 700; color: var(--text2); }
  .rec-ph-sub { font-size: 12px; color: var(--text3); line-height: 1.6; max-width: 280px; }

  /* Pipeline */
  .rec-pipeline-placeholder {
    display: grid; grid-template-columns: repeat(5, 1fr);
    padding: 16px; gap: 8px;
  }
  @media(max-width:900px){ .rec-pipeline-placeholder { grid-template-columns: repeat(3, 1fr); } }
  @media(max-width:560px){ .rec-pipeline-placeholder { grid-template-columns: 1fr 1fr; } }
  .rec-pipeline-stage {
    background: var(--bg-frosted); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px; min-height: 120px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .rec-stage-header { display: flex; align-items: center; gap: 6px; }
  .rec-stage-num { font-size: 10px; font-weight: 700; color: var(--text3); }
  .rec-stage-name { font-size: 11px; font-weight: 700; color: var(--text); }
  .rec-stage-empty { font-size: 11px; color: var(--text3); font-style: italic; padding: 4px 0; }
  `;
  document.head.appendChild(s);
}
