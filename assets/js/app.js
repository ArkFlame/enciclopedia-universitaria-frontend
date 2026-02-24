/**
 * APP.JS - Enciclopedia Universitaria
 * Inicialización global: sidebar, notificaciones, tooltips, diagramas interactivos
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── SIDEBAR MÓVIL ──────────────────────────────────────────
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const closeSidebar = document.getElementById('closeSidebar');
  const sidebar = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('sidebarOverlay');

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
  closeSidebar?.addEventListener('click', closeSidebarFn);
  overlay?.addEventListener('click', closeSidebarFn);

  // ── TOGGLE VER SIN APROBACIÓN ──────────────────────────────
  const togglePending = document.getElementById('togglePending');
  const togglePendingMobile = document.getElementById('togglePendingMobile');

  function getIncludePending() {
    return localStorage.getItem('eu_show_pending') === 'true';
  }

  function setIncludePending(val) {
    localStorage.setItem('eu_show_pending', val);
    // Disparar evento para que index.js y search.js lo escuchen
    window.dispatchEvent(new CustomEvent('eu:pending-toggle', { detail: { enabled: val } }));
  }

  // Restaurar estado del toggle
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

  // ── NOTIFICACIONES ─────────────────────────────────────────
  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  const markAllRead = document.getElementById('markAllRead');

  notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown?.classList.toggle('active');
    // Ocultar badge al abrir
    const badge = document.getElementById('notifBadge');
    if (badge && notifDropdown?.classList.contains('active')) {
      badge.classList.add('d-none');
    }
  });

  markAllRead?.addEventListener('click', async () => {
    try {
      await Auth.authFetch(`${window.EU_CONFIG.backendUrl}/api/auth/notifications/read`, { method: 'PUT' });
      document.querySelectorAll('.eu-notif-item.unread').forEach(el => el.classList.remove('unread'));
      const badge = document.getElementById('notifBadge');
      if (badge) badge.classList.add('d-none');
    } catch (e) { /* silencioso */ }
  });

  // ── DIAGRAMAS INTERACTIVOS ─────────────────────────────────
  function initDiagrams() {
    let activePopup = null;

    document.querySelectorAll('.eu-diagram-cell').forEach(cell => {
      const popupId = cell.dataset.cellId;
      const popup = document.getElementById(popupId);
      if (!popup) return;

      cell.addEventListener('click', (e) => {
        e.stopPropagation();

        // Cerrar popup anterior
        if (activePopup && activePopup !== popup) {
          activePopup.classList.remove('active');
        }

        if (popup.classList.contains('active')) {
          popup.classList.remove('active');
          activePopup = null;
          return;
        }

        // Posicionar popup
        const rect = cell.getBoundingClientRect();
        const popupW = 240;
        const popupH = 180;
        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX;

        // Evitar salirse de la pantalla
        if (left + popupW > window.innerWidth - 16) {
          left = window.innerWidth - popupW - 16;
        }
        if (top + popupH > window.scrollY + window.innerHeight - 16) {
          top = rect.top + window.scrollY - popupH - 8;
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        popup.classList.add('active');
        activePopup = popup;
      });
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.eu-diagram-cell') && !e.target.closest('.eu-cell-popup')) {
        document.querySelectorAll('.eu-cell-popup.active').forEach(p => p.classList.remove('active'));
        activePopup = null;
      }
    });
  }

  initDiagrams();

  // También inicializar cuando se cargue contenido dinámico
  window.addEventListener('eu:content-loaded', () => {
    initDiagrams();
    initTooltips();
  });

  // ── TOOLTIPS BOOTSTRAP ─────────────────────────────────────
  function initTooltips() {
    const tooltipEls = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipEls.forEach(el => {
      if (!el._bsTooltip) {
        new bootstrap.Tooltip(el, { trigger: 'hover focus' });
        el._bsTooltip = true;
      }
    });
  }

  initTooltips();

  // ── TOAST SYSTEM ───────────────────────────────────────────
  window.showToast = function(message, type = 'default', duration = 3500) {
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

  // ── CERRAR DROPDOWNS AL CLICK FUERA ────────────────────────
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notifWrapper')) {
      notifDropdown?.classList.remove('active');
    }
    if (!e.target.closest('.eu-search-box')) {
      document.querySelectorAll('.eu-search-dropdown').forEach(d => d.classList.remove('active'));
    }
  });

  // ── KEYBOARD: ESC cierra modales y dropdowns ───────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      notifDropdown?.classList.remove('active');
      document.querySelectorAll('.eu-cell-popup.active').forEach(p => p.classList.remove('active'));
      closeSidebarFn();
    }
  });

});

// ── UTILIDAD GLOBAL ────────────────────────────────────────────
window.escapeHtml = function(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
};

window.timeAgo = function(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return d.toLocaleDateString('es-AR');
};

window.formatDate = function(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
};
