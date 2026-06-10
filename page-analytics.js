// ============================================================
// page-analytics.js — Analytics page
// All charts, KPIs, region breakdown from charts.js live here
// ============================================================
'use strict';

function renderAnalyticsPage() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = 'Analytics';

  // renderDashboard() already does all the heavy lifting — reuse it entirely.
  // It writes to #content and sets up all Chart.js canvases.
  if (typeof renderDashboard === 'function') {
    renderDashboard();
    // Override the title it sets
    if (titleEl) titleEl.textContent = 'Analytics';
  } else {
    document.getElementById('content').innerHTML =
      Components.emptyState({ icon: '📊', title: 'Analytics unavailable', message: 'charts.js failed to load.' });
  }

  _injectAnalyticsStyles();
}

function _injectAnalyticsStyles() {
  if (document.getElementById('page-analytics-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-analytics-styles';
  s.textContent = `
    /* Analytics page gets a subtle accent on the section labels */
    #content .chart-section-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .5px; color: var(--text3); margin-bottom: 10px;
    }
  `;
  document.head.appendChild(s);
}
