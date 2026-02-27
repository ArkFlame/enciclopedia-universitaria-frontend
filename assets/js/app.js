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
  // The bell button (#notifBtn) is inside #notifWrapper which is initially
  // d-none. auth.js reveals it later. We use a flag to avoid the
  // close-on-same-click race between the button listener and the
  // document outside-click listener.
  const notifDropdown = document.getElementById('notifDropdown');
  let notifJustOpened = false;

  // Delegate to the static #notifWrapper element (always in DOM)
  const notifWrapper = document.getElementById('notifWrapper');
  if (notifWrapper && notifDropdown) {
    notifWrapper.addEventListener('click', (e) => {
      // Only react to clicks on the bell button itself (not inside the dropdown panel)
      if (e.target.closest('#notifDropdown')) return;
      const isOpen = notifDropdown.classList.contains('active');
      if (isOpen) {
        notifDropdown.classList.remove('active');
      } else {
        notifDropdown.classList.add('active');
        notifJustOpened = true; // prevent the document listener from immediately closing it
        document.getElementById('notifBadge')?.classList.add('d-none');
      }
    });
  }

  // Mark-all-read — inside the dropdown panel, stop propagation so panel stays open
  document.getElementById('markAllRead')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await Auth.authFetch(
        `${window.EU_CONFIG.backendUrl}/api/auth/notifications/read`,
        { method: 'PUT' }
      );
      document.querySelectorAll('.eu-notif-item.unread').forEach(el => el.classList.remove('unread'));
      document.getElementById('notifBadge')?.classList.add('d-none');
    } catch (_) {}
  });

  // Close dropdown when clicking outside — but not on the same click that opened it
  document.addEventListener('click', (e) => {
    if (notifJustOpened) {
      notifJustOpened = false;
      return; // skip: this is the same click that opened the dropdown
    }
    if (notifDropdown && !e.target.closest('#notifWrapper')) {
      notifDropdown.classList.remove('active');
    }
    if (!e.target.closest('.eu-search-box')) {
      document.querySelectorAll('.eu-search-dropdown').forEach(d => d.classList.remove('active'));
    }
  });

  // ESC closes everything
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      notifDropdown?.classList.remove('active');
      document.querySelectorAll('.eu-cell-popup.active').forEach(p => p.classList.remove('active'));
      closeSidebarFn();
    }
  });

  // ── INTERACTIVE DIAGRAMS ─────────────────────────────────────
  function initDiagrams() {
    let activePopup = null;
    document.querySelectorAll('.eu-diagram-cell').forEach(cell => {
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
        document.querySelectorAll('.eu-cell-popup.active').forEach(p => p.classList.remove('active'));
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
