// ============================================================
// components.js — Reusable UI components
// ============================================================
'use strict';

const Components = (() => {

  // ── Avatar ─────────────────────────────────────────────────
  function avatar(name, size = 48, statusColor = null) {
    const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
    const dot = statusColor
      ? `<span class="comp-avatar-dot" style="background:${statusColor}"></span>`
      : '';
    return `
      <div class="comp-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">
        ${esc(initials)}${dot}
      </div>`;
  }

  // ── Empty state ────────────────────────────────────────────
  function emptyState({ icon = '📭', title = 'Nothing here', message = '', action = '' } = {}) {
    return `
      <div class="comp-empty">
        <div class="comp-empty-icon">${icon}</div>
        <div class="comp-empty-title">${esc(title)}</div>
        ${message ? `<div class="comp-empty-msg">${esc(message)}</div>` : ''}
        ${action ? `<div class="comp-empty-action">${action}</div>` : ''}
      </div>`;
  }

  // ── Stat card ──────────────────────────────────────────────
  function statCard({ label, value, sub = '', color = 'var(--accent)', icon = '', onclick = '' } = {}) {
    return `
      <div class="comp-stat-card ${onclick ? 'comp-stat-card--clickable' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
        ${icon ? `<div class="comp-stat-icon" style="color:${color}">${icon}</div>` : ''}
        <div class="comp-stat-val" style="color:${color}">${value}</div>
        <div class="comp-stat-label">${esc(label)}</div>
        ${sub ? `<div class="comp-stat-sub">${sub}</div>` : ''}
      </div>`;
  }

  // ── Progress bar ───────────────────────────────────────────
  function progressBar(pct, { color = null, label = '', showPct = true } = {}) {
    const c = color || (pct === 100 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)');
    return `
      <div class="comp-progress-wrap">
        ${label ? `<div class="comp-progress-label">${esc(label)}</div>` : ''}
        <div class="comp-progress-bar">
          <div class="comp-progress-fill" style="width:${pct}%;background:${c}"></div>
        </div>
        ${showPct ? `<div class="comp-progress-pct" style="color:${c}">${pct}%</div>` : ''}
      </div>`;
  }

  // ── Section header ─────────────────────────────────────────
  function sectionHeader(title, action = '') {
    return `
      <div class="comp-section-header">
        <div class="comp-section-title">${title}</div>
        ${action ? `<div class="comp-section-action">${action}</div>` : ''}
      </div>`;
  }

  // ── Tab bar ────────────────────────────────────────────────
  function tabBar(tabs, activeKey, onClickFn) {
    return `
      <div class="comp-tabs">
        ${tabs.map(t => `
          <button class="comp-tab ${t.key === activeKey ? 'active' : ''}"
                  onclick="${onClickFn}('${t.key}')">
            ${t.icon ? `<span class="comp-tab-icon">${t.icon}</span>` : ''}
            ${esc(t.label)}
            ${t.badge !== undefined ? `<span class="comp-tab-badge">${t.badge}</span>` : ''}
          </button>`).join('')}
      </div>`;
  }

  // ── Timeline item ──────────────────────────────────────────
  function timelineItem({ time, actor, action, detail = '', isFirst = false, isLast = false } = {}) {
    return `
      <div class="comp-timeline-item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}">
        <div class="comp-timeline-dot"></div>
        <div class="comp-timeline-body">
          <div class="comp-timeline-action">${esc(action)}</div>
          ${detail ? `<div class="comp-timeline-detail">${esc(detail)}</div>` : ''}
          <div class="comp-timeline-meta">${esc(time)} · ${esc(actor)}</div>
        </div>
      </div>`;
  }

  // ── Inject styles ──────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('components-styles')) return;
    const s = document.createElement('style');
    s.id = 'components-styles';
    s.textContent = `
      /* ── Avatar ── */
      .comp-avatar {
        position: relative;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(0,255,224,.35), rgba(0,184,160,.15));
        border: 1.5px solid rgba(0,255,224,.4);
        color: var(--accent, #00FFE0);
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; letter-spacing: .5px; flex-shrink: 0;
        box-shadow: 0 0 14px rgba(0,255,224,.18);
        user-select: none;
      }
      .comp-avatar-dot {
        position: absolute; bottom: 1px; right: 1px;
        width: 10px; height: 10px; border-radius: 50%;
        border: 2px solid var(--bg1, #141414);
      }

      /* ── Empty state ── */
      .comp-empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 48px 24px; gap: 8px;
        text-align: center;
      }
      .comp-empty-icon { font-size: 40px; opacity: .6; }
      .comp-empty-title { font-size: 14px; font-weight: 600; color: var(--text1); }
      .comp-empty-msg { font-size: 12px; color: var(--text3); max-width: 280px; line-height: 1.5; }
      .comp-empty-action { margin-top: 8px; }

      /* ── Stat card ── */
      .comp-stat-card {
        background: var(--card, var(--bg2));
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 14px 16px;
        display: flex; flex-direction: column; gap: 4px;
        transition: border-color .18s;
      }
      .comp-stat-card--clickable { cursor: pointer; }
      .comp-stat-card--clickable:hover { border-color: var(--accent); }
      .comp-stat-icon { font-size: 18px; margin-bottom: 2px; }
      .comp-stat-val { font-size: 26px; font-weight: 700; line-height: 1; }
      .comp-stat-label { font-size: 11px; color: var(--text3); font-weight: 500; text-transform: uppercase; letter-spacing: .4px; }
      .comp-stat-sub { font-size: 11px; color: var(--text3); margin-top: 2px; }

      /* ── Progress bar ── */
      .comp-progress-wrap { display: flex; align-items: center; gap: 8px; }
      .comp-progress-label { font-size: 11px; color: var(--text3); min-width: 80px; }
      .comp-progress-bar { flex: 1; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
      .comp-progress-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }
      .comp-progress-pct { font-size: 11px; font-weight: 600; min-width: 32px; text-align: right; }

      /* ── Section header ── */
      .comp-section-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px;
      }
      .comp-section-title { font-size: 12px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; }
      .comp-section-action { font-size: 12px; color: var(--accent); }

      /* ── Tab bar ── */
      .comp-tabs {
        display: flex; gap: 0; border-bottom: 1px solid var(--border);
        margin-bottom: 16px; overflow-x: auto; scrollbar-width: none;
      }
      .comp-tabs::-webkit-scrollbar { display: none; }
      .comp-tab {
        padding: 8px 16px; font-size: 12.5px; font-weight: 500;
        color: var(--text3); border: none; background: none; cursor: pointer;
        border-bottom: 2px solid transparent; transition: color .15s, border-color .15s;
        white-space: nowrap; display: flex; align-items: center; gap: 5px;
      }
      .comp-tab:hover { color: var(--text2); }
      .comp-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
      .comp-tab-icon { font-size: 13px; }
      .comp-tab-badge {
        font-size: 10px; background: var(--accent); color: #000;
        border-radius: 8px; padding: 1px 5px; font-weight: 700;
      }

      /* ── Timeline ── */
      .comp-timeline-item {
        display: flex; gap: 12px; padding: 0 0 16px 0; position: relative;
      }
      .comp-timeline-item:not(.last)::before {
        content: ''; position: absolute; left: 5px; top: 14px; bottom: 0;
        width: 1px; background: var(--border);
      }
      .comp-timeline-dot {
        width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; margin-top: 3px;
        background: var(--accent); border: 2px solid var(--bg1, #141414);
        box-shadow: 0 0 6px rgba(0,255,224,.4);
      }
      .comp-timeline-body { flex: 1; min-width: 0; }
      .comp-timeline-action { font-size: 12.5px; color: var(--text1); font-weight: 500; }
      .comp-timeline-detail { font-size: 11.5px; color: var(--text3); margin-top: 2px; }
      .comp-timeline-meta { font-size: 11px; color: var(--text3); margin-top: 3px; }

      /* ── Light theme overrides ── */
      [data-theme="light"] .comp-avatar {
        background: linear-gradient(135deg, rgba(0,150,130,.15), rgba(0,120,100,.08));
        border-color: rgba(0,150,130,.3);
        color: var(--accent);
        box-shadow: none;
      }
      [data-theme="light"] .comp-stat-card { background: var(--bg2); }
    `;
    document.head.appendChild(s);
  }

  // Auto-inject on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  return { avatar, emptyState, statCard, progressBar, sectionHeader, tabBar, timelineItem };

})();
