// ============================================================
// page-home.js — Home page (replaces raw Dashboard as landing)
// Greeting · 4 quick-stat cards · recent activity · shortcuts
// ============================================================
'use strict';

function renderHome() {
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = 'Home';

  // Guard — employees array may not be ready on very first paint
  if (typeof employees === 'undefined' || typeof getStats === 'undefined') {
    document.getElementById('content').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Loading…</div>';
    return;
  }

  const s     = getStats();
  const total = employees.length;
  const active = employees.filter(e => normalizeStatus(e.status) === 'Active' &&
                                       normalizeDeployStatus(e.deploymentStatus) !== 'BACKOUT').length;
  const deployed = employees.filter(e => normalizeDeployStatus(e.deploymentStatus) === 'DEPLOYED').length;
  const missingReqs = employees.filter(e => !requirementsComplete(e)).length;

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = currentUser?.name?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';

  // Recent log entries (top 5 from cache)
  const recentItems = _buildRecentList(5);

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="ph-wrap">

      <!-- Greeting -->
      <div class="ph-greeting">
        <div class="ph-greeting-text">
          <span class="ph-hi">${esc(greeting)}, ${esc(userName)} 👋</span>
          <span class="ph-date">${_formatDate(new Date())}</span>
        </div>
        <div class="ph-shortcuts">
          ${canWrite() ? `<button class="btn btn-accent btn-sm" onclick="openAddModal()">+ Add Employee</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="Router.go('people')">View People</button>
          ${canViewSensitive() ? `<button class="btn btn-ghost btn-sm" onclick="exportXLSX()">Export Excel</button>` : ''}
        </div>
      </div>

      <!-- Stat cards -->
      <div class="ph-stats">
        ${Components.statCard({
          label: 'Total Employees',
          value: total,
          sub: 'All records',
          color: 'var(--accent)',
          icon: '👥',
          onclick: "Router.go('people')"
        })}
        ${Components.statCard({
          label: 'Active',
          value: active,
          sub: `${s.Floating || 0} floating`,
          color: 'var(--success)',
          icon: '✅',
          onclick: "filterByStatus('Active');Router.go('people')"
        })}
        ${Components.statCard({
          label: 'Deployed',
          value: deployed,
          sub: `${total - deployed} not yet`,
          color: '#378ADD',
          icon: '🏪',
          onclick: "Router.go('tracker')"
        })}
        ${Components.statCard({
          label: 'Missing Requirements',
          value: missingReqs,
          sub: missingReqs === 0 ? 'All complete 🎉' : 'Need attention',
          color: missingReqs === 0 ? 'var(--success)' : 'var(--danger)',
          icon: '📋',
          onclick: missingReqs > 0 ? "missingFieldFilter='requirements';Router.go('people')" : ''
        })}
      </div>

      <!-- Status breakdown -->
      <div class="ph-row">
        <div class="ph-card ph-status-card">
          ${Components.sectionHeader('Status Breakdown')}
          <div class="ph-status-list">
            ${Object.entries(s).map(([st, count]) => `
              <div class="ph-status-row" onclick="filterByStatus('${esc(st)}');Router.go('people')" title="View ${esc(st)}">
                <span class="ph-status-dot" style="background:${STATUS_COLORS[st] || 'var(--text3)'}"></span>
                <span class="ph-status-name">${esc(st)}</span>
                <span class="ph-status-count">${count}</span>
                <div class="ph-status-bar-wrap">
                  <div class="ph-status-bar-fill" style="width:${total ? Math.round(count/total*100) : 0}%;background:${STATUS_COLORS[st] || 'var(--text3)'}"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Recent activity -->
        <div class="ph-card ph-recent-card">
          ${Components.sectionHeader('Recent Activity', `<a href="#/log" onclick="Router.go('log')" style="font-size:12px;color:var(--accent);text-decoration:none">View all →</a>`)}
          <div id="ph-recent-list">
            ${recentItems.length
              ? recentItems.map(r => `
                  <div class="ph-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                    ${Components.avatar(r.name, 30)}
                    <div class="ph-recent-body">
                      <div class="ph-recent-name">${esc(r.name)}</div>
                      <div class="ph-recent-action">${esc(r.action)} · <span class="ph-recent-time">${esc(r.time)}</span></div>
                    </div>
                  </div>`).join('')
              : Components.emptyState({ icon: '📝', title: 'No recent activity', message: 'Activity will appear here as records are updated.' })
            }
          </div>
        </div>
      </div>

      <!-- Quick nav tiles -->
      <div class="ph-tiles">
        <div class="ph-tile" onclick="Router.go('analytics')">
          <div class="ph-tile-icon">📊</div>
          <div class="ph-tile-label">Analytics</div>
        </div>
        <div class="ph-tile" onclick="Router.go('tracker')">
          <div class="ph-tile-icon">📍</div>
          <div class="ph-tile-label">Tracker</div>
        </div>
        <div class="ph-tile" onclick="Router.go('log')">
          <div class="ph-tile-icon">📋</div>
          <div class="ph-tile-label">Activity Log</div>
        </div>
        <div class="ph-tile" onclick="Router.go('inactive')">
          <div class="ph-tile-icon">🗂</div>
          <div class="ph-tile-label">Inactive</div>
        </div>
        ${(typeof currentRole !== 'undefined' && currentRole === 'owner') ? `
        <div class="ph-tile" onclick="Router.go('settings')">
          <div class="ph-tile-icon">⚙️</div>
          <div class="ph-tile-label">Settings</div>
        </div>` : ''}
      </div>

    </div>`;

  // Lazy-load recent activity from log if not cached
  if (!logCache) {
    gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${LOG_SHEET}!A2:H` })
      .then(r => {
        logCache = r.result.values || [];
        const el = document.getElementById('ph-recent-list');
        if (!el) return;
        const items = _buildRecentList(5);
        el.innerHTML = items.length
          ? items.map(r => `
              <div class="ph-recent-item" onclick="openDetailPanel('${esc(r.id)}')" title="View profile">
                ${Components.avatar(r.name, 30)}
                <div class="ph-recent-body">
                  <div class="ph-recent-name">${esc(r.name)}</div>
                  <div class="ph-recent-action">${esc(r.action)} · <span class="ph-recent-time">${esc(r.time)}</span></div>
                </div>
              </div>`).join('')
          : Components.emptyState({ icon: '📝', title: 'No recent activity' });
      }).catch(() => {});
  }

  _injectHomeStyles();
}

function _buildRecentList(limit = 5) {
  if (!logCache || !logCache.length) return [];
  return logCache.slice(-50).reverse()
    .slice(0, limit)
    .map(row => ({
      time:   row[0] ? _relativeTime(new Date(row[0])) : '—',
      id:     row[1] || '',
      name:   row[2] || 'Unknown',
      action: row[3] || 'Updated',
    }));
}

function _relativeTime(date) {
  if (isNaN(date)) return '—';
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function _formatDate(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function _injectHomeStyles() {
  if (document.getElementById('page-home-styles')) return;
  const s = document.createElement('style');
  s.id = 'page-home-styles';
  s.textContent = `
    .ph-wrap { padding: 20px 24px; max-width: 1100px; display: flex; flex-direction: column; gap: 20px; }

    /* Greeting */
    .ph-greeting { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .ph-greeting-text { display: flex; flex-direction: column; gap: 2px; }
    .ph-hi { font-size: 20px; font-weight: 700; color: var(--text1); }
    .ph-date { font-size: 12px; color: var(--text3); }
    .ph-shortcuts { display: flex; gap: 8px; flex-wrap: wrap; }

    /* Stat cards */
    .ph-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    @media (max-width: 900px) { .ph-stats { grid-template-columns: repeat(2, 1fr); } }

    /* Row layout */
    .ph-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 800px) { .ph-row { grid-template-columns: 1fr; } }

    /* Generic card */
    .ph-card { background: var(--card, var(--bg2)); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }

    /* Status breakdown */
    .ph-status-list { display: flex; flex-direction: column; gap: 8px; }
    .ph-status-row {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      padding: 4px 6px; border-radius: 6px; transition: background .15s;
    }
    .ph-status-row:hover { background: var(--bg3, rgba(255,255,255,.04)); }
    .ph-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 4px currentColor; }
    .ph-status-name { font-size: 12.5px; color: var(--text2); min-width: 80px; }
    .ph-status-count { font-size: 12.5px; font-weight: 600; color: var(--text1); min-width: 28px; text-align: right; }
    .ph-status-bar-wrap { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .ph-status-bar-fill { height: 100%; border-radius: 2px; transition: width .4s ease; }

    /* Recent activity */
    .ph-recent-item {
      display: flex; align-items: center; gap: 10px; padding: 7px 6px;
      border-radius: 6px; cursor: pointer; transition: background .15s;
    }
    .ph-recent-item:hover { background: var(--bg3, rgba(255,255,255,.04)); }
    .ph-recent-body { flex: 1; min-width: 0; }
    .ph-recent-name { font-size: 12.5px; font-weight: 500; color: var(--text1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ph-recent-action { font-size: 11px; color: var(--text3); }
    .ph-recent-time { color: var(--accent); }

    /* Quick nav tiles */
    .ph-tiles { display: flex; gap: 10px; flex-wrap: wrap; }
    .ph-tile {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 20px; background: var(--card, var(--bg2));
      border: 1px solid var(--border); border-radius: 10px; cursor: pointer;
      min-width: 90px; transition: border-color .18s, background .18s;
    }
    .ph-tile:hover { border-color: var(--accent); background: rgba(0,255,224,.04); }
    .ph-tile-icon { font-size: 22px; }
    .ph-tile-label { font-size: 11.5px; font-weight: 500; color: var(--text2); white-space: nowrap; }

    /* accent button */
    .btn-accent { background: var(--accent); color: #000 !important; font-weight: 600; border: none; }
    .btn-accent:hover { background: rgba(0,255,224,.8); }
  `;
  document.head.appendChild(s);
}
