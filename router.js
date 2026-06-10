// ============================================================
// router.js — Hash-based routing for Infinix HR
// Version 1.0 — Step 1 of the website transformation
//
// HOW IT WORKS:
//   • Watches window.location.hash (e.g. #/people, #/profile/170012345)
//   • Maps each route to the existing showView() / openDetailPanel() calls
//   • Adds navigate(path) so any code can push a new route
//   • Back/forward browser buttons now work correctly
//   • Nothing in app.js breaks — router just wraps what's already there
//
// ROUTES:
//   #/home          → showView('dashboard')   (landing page)
//   #/people        → showView('active')
//   #/inactive      → showView('inactive')
//   #/tracker       → showView('tracker')
//   #/log           → showView('log')
//   #/analytics     → showView('analytics')   (future page-analytics.js)
//   #/settings      → showView('settings')    (future page-settings.js)
//   #/profile/:id   → openDetailPanel(id)
//   (empty / unknown) → #/home
// ============================================================

'use strict';

const Router = (() => {

  // ── Route definitions ──────────────────────────────────────
  // Each entry: { pattern: RegExp, handler: fn(matches) }
  const routes = [
    {
      pattern: /^\/home$/,
      handler: () => _activateView('home'),
    },
    {
      pattern: /^\/people$/,
      handler: () => _activateView('active'),
    },
    {
      pattern: /^\/inactive$/,
      handler: () => _activateView('inactive'),
    },
    {
      pattern: /^\/tracker$/,
      handler: () => _activateView('tracker'),
    },
    {
      pattern: /^\/log$/,
      handler: () => _activateView('log'),
    },
    {
      pattern: /^\/analytics$/,
      handler: () => _activateView('analytics'),
    },
    {
      pattern: /^\/settings$/,
      handler: () => _activateView('settings'),
    },
    {
      // Profile route: #/profile/170012345  → full page (not side panel)
      pattern: /^\/profile\/(.+)$/,
      handler: (m) => _activateProfile(m[1]),
    },
  ];

  // ── Default route ──────────────────────────────────────────
  const DEFAULT_ROUTE = '/home';

  // ── Internal helpers ───────────────────────────────────────

  /** Parse the hash string into a path (strips the leading #) */
  function _parsePath(hash) {
    if (!hash || hash === '#' || hash === '#/') return DEFAULT_ROUTE;
    // Support both #/path and #!/path
    return hash.replace(/^#!?/, '') || DEFAULT_ROUTE;
  }

  /**
   * Activate a named view.
   * Uses showView() when it's available (app.js loaded), falls back
   * to setting currentView directly so the router can be loaded early.
   */
  function _activateView(view) {
    // Close any open detail panel first
    if (typeof closeDetailPanel === 'function') {
      const panel = document.getElementById('detail-panel');
      if (panel && panel.classList.contains('open')) {
        closeDetailPanel();
      }
    }

    if (typeof showView === 'function') {
      showView(view);
    } else {
      // app.js not ready yet — queue it
      _pendingView = view;
    }
  }

  /**
   * Activate a profile by Infinix ID — renders the full profile page.
   */
  function _activateProfile(id) {
    if (typeof renderProfilePage === 'function') {
      // Update currentView so nav highlights correctly
      if (typeof currentView !== 'undefined') window.currentView = 'profile';
      renderProfilePage(id);
    } else {
      _pendingProfile = id;
    }
  }

  /** Pending navigation queued before app.js was ready */
  let _pendingView    = null;
  let _pendingProfile = null;

  // ── Route dispatcher ───────────────────────────────────────
  function _dispatch() {
    const path = _parsePath(window.location.hash);

    for (const route of routes) {
      const m = path.match(route.pattern);
      if (m) {
        route.handler(m);
        _updateBreadcrumb(path);
        return;
      }
    }

    // No match — redirect to home
    navigate(DEFAULT_ROUTE, true);
  }

  // ── Breadcrumb ─────────────────────────────────────────────
  const ROUTE_LABELS = {
    '/home':      'Home',
    '/people':    'People',
    '/inactive':  'Inactive',
    '/tracker':   'Deployment Tracker',
    '/log':       'Activity Log',
    '/analytics': 'Analytics',
    '/settings':  'Settings',
  };

  function _updateBreadcrumb(path) {
    const el = document.getElementById('breadcrumb');
    if (!el) return;

    // Profile route: People › [Name or ID]
    const profMatch = path.match(/^\/profile\/(.+)$/);
    if (profMatch) {
      const id = profMatch[1];
      let name = id;
      // Try to resolve name from employees array if available
      if (typeof employees !== 'undefined' && Array.isArray(employees)) {
        const emp = employees.find(e => String(e.infinixId) === String(id));
        if (emp) {
          name = emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || id;
        }
      }
      el.innerHTML = _crumbHTML([
        { label: 'People', href: '#/people' },
        { label: name },
      ]);
      return;
    }

    // Regular route
    const label = ROUTE_LABELS[path];
    if (label) {
      el.innerHTML = _crumbHTML([{ label }]);
    } else {
      el.innerHTML = '';
    }
  }

  function _crumbHTML(crumbs) {
    return crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      if (isLast || !c.href) {
        return `<span class="crumb-current">${_esc(c.label)}</span>`;
      }
      return `<a class="crumb-link" href="${c.href}">${_esc(c.label)}</a>
              <span class="crumb-sep">›</span>`;
    }).join('');
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * navigate(path, replace?)
   *
   * Push a new route.  Examples:
   *   Router.navigate('/people')
   *   Router.navigate('/profile/170012345')
   *   Router.navigate('/home', true)   // replaces history entry
   *
   * Can also be called as the global navigate() shorthand (wired below).
   */
  function navigate(path, replace = false) {
    const hash = '#' + (path.startsWith('/') ? path : '/' + path);
    if (replace) {
      history.replaceState(null, '', hash);
    } else {
      history.pushState(null, '', hash);
    }
    _dispatch();
  }

  /**
   * Call once app.js has finished loading and globals like showView()
   * are available.  Flushes any pending navigation and processes the
   * current hash so a direct link / page reload works.
   */
  function init() {
    // Flush queued navigation from before app.js was ready
    if (_pendingView) {
      const v = _pendingView;
      _pendingView = null;
      _activateView(v);
    }
    if (_pendingProfile) {
      const id = _pendingProfile;
      _pendingProfile = null;
      _activateProfile(id);
    }

    // If no hash yet, set the default
    if (!window.location.hash || window.location.hash === '#') {
      navigate(DEFAULT_ROUTE, true);
    } else {
      _dispatch();
    }

    // Inject breadcrumb CSS if not already present
    _injectBreadcrumbStyles();
  }

  // ── Breadcrumb styles ──────────────────────────────────────
  function _injectBreadcrumbStyles() {
    if (document.getElementById('router-breadcrumb-styles')) return;
    const style = document.createElement('style');
    style.id = 'router-breadcrumb-styles';
    style.textContent = `
      #breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text3, #888);
        padding: 0 4px;
        min-height: 20px;
        flex-shrink: 0;
      }
      .crumb-link {
        color: var(--text3, #888);
        text-decoration: none;
        transition: color .15s;
      }
      .crumb-link:hover { color: var(--accent, #00FFE0); }
      .crumb-sep { color: var(--text3, #888); opacity: .5; font-size: 11px; }
      .crumb-current { color: var(--text1, #eee); font-weight: 500; }
    `;
    document.head.appendChild(style);
  }

  // ── Intercept openDetailPanel to sync URL ──────────────────
  /**
   * Patch openDetailPanel so clicking a row also updates the URL.
   * Called once from init() after app.js is confirmed loaded.
   */
  function _patchDetailPanel() {
    if (typeof openDetailPanel !== 'function') return;
    if (openDetailPanel._routerPatched) return;

    const _orig = openDetailPanel;
    window.openDetailPanel = function(id) {
      // Navigate to full profile page via hash
      navigate(`/profile/${id}`);
      // Only call _orig (side panel) if renderProfilePage is NOT available
      if (typeof renderProfilePage !== 'function') {
        _orig(id);
      }
    };
    window.openDetailPanel._routerPatched = true;
  }

  /**
   * Patch closeDetailPanel so closing a panel returns the URL to
   * the people list.
   */
  function _patchClosePanel() {
    if (typeof closeDetailPanel !== 'function') return;
    if (closeDetailPanel._routerPatched) return;

    const _orig = closeDetailPanel;
    window.closeDetailPanel = function() {
      _orig();
      // Only navigate back if we were on a profile URL
      const currentPath = _parsePath(window.location.hash);
      if (currentPath.startsWith('/profile/')) {
        navigate('/people', true);
      }
    };
    window.closeDetailPanel._routerPatched = true;
  }

  // ── Sidebar nav link helper ────────────────────────────────
  /**
   * Returns the correct #/path for a given sidebar view name.
   * Use this in nav-item onclick: onclick="Router.go('active')"
   * It's the same as navigate() but accepts the old view names.
   */
  const VIEW_TO_ROUTE = {
    'home':      '/home',
    'dashboard': '/home',
    'active':    '/people',
    'inactive':  '/inactive',
    'tracker':   '/tracker',
    'log':       '/log',
    'analytics': '/analytics',
    'settings':  '/settings',
  };

  function go(viewName) {
    const path = VIEW_TO_ROUTE[viewName] || '/' + viewName;
    navigate(path);
  }

  // ── Boot ───────────────────────────────────────────────────
  // Listen for hash changes (browser back/forward)
  window.addEventListener('hashchange', _dispatch);

  // Expose globally so app.js can call Router.init() and Router.go()
  return { navigate, go, init, _patchDetailPanel, _patchClosePanel };

})();

// Convenience global so any inline onclick can call navigate('/people')
window.navigate = Router.navigate;

// ── Auto-init when DOM + app.js are both ready ────────────────
// We wait for app.js to define showView() before calling Router.init().
// Strategy: poll briefly after DOMContentLoaded, then give up and init
// anyway (the pending-queue mechanism handles the late case).
(function waitForApp() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForApp);
    return;
  }

  let attempts = 0;
  const MAX    = 50; // 50 × 100ms = 5 seconds max wait

  function check() {
    if (typeof showView === 'function') {
      Router._patchDetailPanel();
      Router._patchClosePanel();
      Router.init();
    } else if (attempts++ < MAX) {
      setTimeout(check, 100);
    } else {
      // app.js never loaded — still init the router so hash routing
      // at least doesn't 404
      Router.init();
    }
  }

  check();
})();
