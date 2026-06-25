// ============================================================
// page-recruitment.js — Recruitment & Training page
// Placeholder layout — no backend wired yet
// ============================================================
'use strict';

function renderRecruitmentPage(){
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.textContent = 'Recruitment & Training';

  // Pull some basic stats from existing employees for display
  const empList = typeof employees !== 'undefined' ? employees : [];
  const totalActive = empList.filter(e=>String(e.status||'').trim().toLowerCase()==='active').length;

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="recruit-page">

      <!-- Header -->
      <div class="recruit-hero">
        <div class="recruit-hero-icon">
          <i class="fi fi-sr-handshake" style="font-size:28px;color:var(--accent)"></i>
        </div>
        <div>
          <div class="recruit-hero-title">Recruitment &amp; Training</div>
          <div class="recruit-hero-sub">Manage applicants and track training schedules for your workforce.</div>
        </div>
        <div class="recruit-coming-tag">
          <i class="fi fi-sr-rocket-lunch" style="font-size:11px"></i> Coming Soon
        </div>
      </div>

      <!-- Summary cards -->
      <div class="recruit-summary-grid">
        <div class="recruit-sum-card">
          <div class="recruit-sum-icon" style="background:rgba(0,200,170,.12);color:var(--accent)">
            <i class="fi fi-sr-users-medical"></i>
          </div>
          <div class="recruit-sum-body">
            <div class="recruit-sum-val">—</div>
            <div class="recruit-sum-label">Open Positions</div>
          </div>
        </div>
        <div class="recruit-sum-card">
          <div class="recruit-sum-icon" style="background:rgba(55,138,221,.12);color:#378ADD">
            <i class="fi fi-sr-person-walking"></i>
          </div>
          <div class="recruit-sum-body">
            <div class="recruit-sum-val">—</div>
            <div class="recruit-sum-label">Applicants This Month</div>
          </div>
        </div>
        <div class="recruit-sum-card">
          <div class="recruit-sum-icon" style="background:rgba(255,215,64,.12);color:#FFD740">
            <i class="fi fi-sr-chalkboard-user"></i>
          </div>
          <div class="recruit-sum-body">
            <div class="recruit-sum-val">—</div>
            <div class="recruit-sum-label">Training Sessions</div>
          </div>
        </div>
        <div class="recruit-sum-card">
          <div class="recruit-sum-icon" style="background:rgba(0,230,118,.12);color:#00E676">
            <i class="fi fi-sr-user-check"></i>
          </div>
          <div class="recruit-sum-body">
            <div class="recruit-sum-val">${totalActive}</div>
            <div class="recruit-sum-label">Active Workforce</div>
          </div>
        </div>
      </div>

      <!-- Two-column layout -->
      <div class="recruit-columns">

        <!-- Applicants panel -->
        <div class="recruit-panel">
          <div class="recruit-panel-header">
            <span class="recruit-panel-title"><i class="fi fi-sr-person-walking"></i> Applicants</span>
            <span class="recruit-panel-badge">Coming Soon</span>
          </div>
          <div class="recruit-panel-body recruit-placeholder">
            <div class="recruit-placeholder-inner">
              <i class="fi fi-sr-person-walking" style="font-size:36px;opacity:.18"></i>
              <p>Applicant pipeline will appear here.</p>
              <p class="recruit-placeholder-sub">Connect an <strong>Applicants</strong> Google Sheet tab to populate this section.</p>
            </div>
          </div>
        </div>

        <!-- Training Schedule panel -->
        <div class="recruit-panel">
          <div class="recruit-panel-header">
            <span class="recruit-panel-title"><i class="fi fi-sr-chalkboard-user"></i> Training Schedule</span>
            <span class="recruit-panel-badge">Coming Soon</span>
          </div>
          <div class="recruit-panel-body recruit-placeholder">
            <div class="recruit-placeholder-inner">
              <i class="fi fi-sr-chalkboard-user" style="font-size:36px;opacity:.18"></i>
              <p>Training sessions will appear here.</p>
              <p class="recruit-placeholder-sub">Connect a <strong>Training</strong> Google Sheet tab to populate this section.</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}
