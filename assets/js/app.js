/**
* APP.JS — Enciclopedia Universitaria
* Sidebar, notifications, tooltips, toasts, diagrams.
*
* Scripts load at end of <body> — DOMContentLoaded may already have fired.
* We use readyState to handle both cases safely.
*/
function _appInit() {
  // ── SIDEBAR MÓVIL ────────────────────────────────────────────
  const hamburgerBtn    = document.getElementById('hamburgerBtn');
  const closeSidebarBtn = document.getElementById('closeSidebar');
  const sidebar         = document.getElementById('mobileSidebar');
  const overlay         = document.getElementById('sidebarOverlay');
  function openSidebar() {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebarFn() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }
  hamburgerBtn?.addEventListener('click', openSidebar);
  closeSidebarBtn?.addEventListener('click', closeSidebarFn);
  overlay?.addEventListener('click', closeSidebarFn);
  // ── TOGGLE VER SIN APROBACIÓN ────────────────────────────────
  const togglePending       = document.getElementById('togglePending');
  const togglePendingMobile = document.getElementById('togglePendingMobile');
  function getIncludePending() {
    return localStorage.getItem('eu_show_pending') === 'true';
  }
  function setIncludePending(val) {
    localStorage.setItem('eu_show_pending', val);
    window.dispatchEvent(new CustomEvent('eu:pending-toggle', { detail: { enabled: val } }));
  }
  if (togglePending) {
    togglePending.checked = getIncludePending();
    togglePending.addEventListener('change', (e) => {
      setIncludePending(e.target.checked);
      if (togglePendingMobile) togglePendingMobile.checked = e.target.checked;
    });
  }
  if (togglePendingMobile) {
    togglePendingMobile.checked = getIncludePending();
    togglePendingMobile.addEventListener('change', (e) => {
      setIncludePending(e.target.checked);
      if (togglePending) togglePending.checked = e.target.checked;
    });
  }
  // ── NOTIFICATIONS DROPDOWN ───────────────────────────────────
  const notifDropdown = document.getElementById('notifDropdown');
  const notifBadge = document.getElementById('notifBadge');
  const notifWrapper = document.getElementById('notifWrapper');

  // Prevent double-initialization
  if (notifWrapper && notifDropdown && !notifWrapper._euNotifInit) {
    notifWrapper._euNotifInit = true; // Mark as initialized
    
    notifWrapper.addEventListener('click', (e) => {
      // Don't stop propagation entirely - just prevent default
      e.preventDefault();
      
      const isOpen = notifDropdown.classList.contains('active');
      
      // Close other dropdowns/popups
      document.querySelectorAll('.eu-search-dropdown.active').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.eu-cell-popup.active').forEach(p => p.classList.remove('active'));
      
      // Close Bootstrap dropdowns
      document.querySelectorAll('.dropdown-menu.show').forEach(el => el.classList.remove('show'));
      document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
        el.classList.remove('show');
        el.setAttribute('aria-expanded', 'false');
      });

      if (isOpen) {
        notifDropdown.classList.remove('active');
      } else {
        notifDropdown.classList.add('active');
        if (notifBadge) notifBadge.classList.add('d-none');
        loadNotifications();
      }
    });
  }

  // Move outside click handler to document level, but only once
  if (!window._euDocClickInit) {
    window._euDocClickInit = true;
    document.addEventListener('click', (e) => {
      if (notifDropdown?.classList.contains('active') && !notifWrapper?.contains(e.target)) {
        notifDropdown.classList.remove('active');
      }
    });
  }

  // Close when clicking outside (simplified - check if click is outside wrapper)
  document.addEventListener('click', (e) => {
    if (notifDropdown?.classList.contains('active') && !notifWrapper?.contains(e.target)) {
      notifDropdown.classList.remove('active');
    }
  });
  const markAllReadBtn = document.getElementById('markAllRead');
  markAllReadBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await Auth.authFetch(
        `${window.EU_CONFIG.backendUrl}/api/auth/notifications/read`,
        { method: 'PUT' }
      );
      const unreadItems = document.querySelectorAll('.eu-notif-item.unread');
      unreadItems.forEach(el => el.classList.remove('unread'));
      if (notifBadge) notifBadge.classList.add('d-none');
    } catch (_) {}
  });
  function loadNotifications() {
    const list = document.getElementById('notifList');
    if (!list || list.dataset.loaded) {
      return;
    }
    const spinnerHtml = '<div class="text-center p-3 text-muted"><div class="eu-spinner" style="width:20px;height:20px"></div></div>';
    list.innerHTML = spinnerHtml;
    const endpoint = `${window.EU_CONFIG.backendUrl}/api/auth/notifications`;
    const fetchPromise = Auth.authFetch(endpoint);
    fetchPromise
      .then(response => response.ok ? response.json() : [])
      .then(notifications => {
        list.dataset.loaded = 'true';
        if (!notifications.length) {
          list.innerHTML = '<div class="eu-notif-empty">No tienes notificaciones</div>';
          return;
        }
        const recent = notifications.slice(0, 5);
        const markup = recent.map(n => `
          <div class="eu-notif-item ${n.read_at ? '' : 'unread'}">
            <div class="eu-notif-icon">${n.type.includes('approved') ? '✓' : n.type.includes('rejected') ? '✕' : '•'}</div>
            <div style="flex:1">
              <div class="eu-notif-msg">${window.escapeHtml(n.message)}</div>
              <div class="eu-notif-time">${window.timeAgo(n.created_at)}</div>
            </div>
          </div>
        `).join('');
        list.innerHTML = markup;
      })
      .catch(() => {
        list.innerHTML = '<div class="eu-notif-empty text-danger">Error al cargar</div>';
      });
  }
  document.addEventListener('click', (e) => {
    if (notifJustOpened) {
      notifJustOpened = false;
      return;
    }
    if (notifDropdown && !e.target.closest('#notifWrapper')) {
      notifDropdown.classList.remove('active');
    }
    if (!e.target.closest('.eu-search-box')) {
      closeSearchDropdowns();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      notifDropdown?.classList.remove('active');
      closeActivePopups();
      closeSidebarFn();
    }
  });
  // ── INTERACTIVE DIAGRAMS ─────────────────────────────────────
  function initDiagrams() {
    let activePopup = null;
    const diagramCells = document.querySelectorAll('.eu-diagram-cell');
    diagramCells.forEach(cell => {
      const popup = document.getElementById(cell.dataset.cellId);
      if (!popup) return;
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activePopup && activePopup !== popup) activePopup.classList.remove('active');
        if (popup.classList.contains('active')) {
          popup.classList.remove('active'); activePopup = null; return;
        }
        const rect = cell.getBoundingClientRect();
        let top  = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX;
        if (left + 240 > window.innerWidth - 16) left = window.innerWidth - 256;
        if (top + 180 > window.scrollY + window.innerHeight - 16)
          top = rect.top + window.scrollY - 188;
        popup.style.top  = `${top}px`;
        popup.style.left = `${left}px`;
        popup.classList.add('active');
        activePopup = popup;
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.eu-diagram-cell') && !e.target.closest('.eu-cell-popup')) {
        closeActivePopups();
        activePopup = null;
      }
    });
  }
  // ── BOOTSTRAP TOOLTIPS ───────────────────────────────────────
  function initTooltips() {
    if (typeof bootstrap === 'undefined') return;
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
      if (!el._bsTooltip) {
        new bootstrap.Tooltip(el, { trigger: 'hover focus' });
        el._bsTooltip = true;
      }
    });
  }
  initDiagrams();
  initTooltips();
  window.addEventListener('eu:content-loaded', () => { initDiagrams(); initTooltips(); });
  // ── TOAST SYSTEM ─────────────────────────────────────────────
  window.showToast = function (message, type = 'default', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { success: '✓', error: '✕', warning: '⚠', default: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `eu-toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || icons.default}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'eu-slide-in 250ms ease reverse';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  };
}
// ── GLOBAL HELPERS ───────────────────────────────────────────────
window.escapeHtml = function (str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};
window.timeAgo = function (dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)     return 'Hace un momento';
  if (diff < 3600)   return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `Hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return new Date(dateStr).toLocaleDateString('es-AR');
};
window.formatDate = function (dateStr) {
  return new Date(dateStr).toLocaleDateString('es-AR',
    { year: 'numeric', month: 'long', day: 'numeric' });
};
// Safe init — handles DOMContentLoaded already fired when scripts load at end of body
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _appInit);
} else {
  _appInit();
}
