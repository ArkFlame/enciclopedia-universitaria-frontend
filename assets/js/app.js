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
  const notifBadge    = document.getElementById('notifBadge');
  const notifWrapper  = document.getElementById('notifWrapper');

  function updateNotifBadge(unreadCount) {
    if (!notifBadge) return;
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      notifBadge.classList.remove('d-none');
    } else {
      notifBadge.classList.add('d-none');
    }
  }

  function renderNotifList(notifications) {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!notifications.length) {
      list.innerHTML = '<div class="eu-notif-empty">No tienes notificaciones</div>';
      return;
    }
    list.innerHTML = notifications.slice(0, 15).map(n => {
      const link  = Auth.getNotificationLink ? Auth.getNotificationLink(n) : null;
      const icon  = Auth.getNotificationIcon ? Auth.getNotificationIcon(n.type) : '🔔';
      const unread = !n.read_at;
      const inner = `
        <div class="eu-notif-icon">${icon}</div>
        <div style="flex:1;min-width:0">
          <div class="eu-notif-msg">${window.escapeHtml(n.message)}</div>
          <div class="eu-notif-time">${window.timeAgo(n.created_at)}</div>
        </div>
        ${unread ? '<span class="eu-notif-dot"></span>' : ''}`;
      const itemClass = `eu-notif-item${unread ? ' unread' : ''}`;
      const dataId = `data-notif-id="${n.id}"`;
      return link
        ? `<a href="${link}" class="${itemClass}" ${dataId}>${inner}</a>`
        : `<div class="${itemClass}" ${dataId} style="cursor:default">${inner}</div>`;
    }).join('');
  }

  function loadNotifications(forceReload = false) {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (list.dataset.loaded && !forceReload) return;

    list.innerHTML = '<div class="text-center p-3"><div class="eu-spinner" style="width:20px;height:20px;margin:auto"></div></div>';

    Auth.authFetch(`${window.EU_CONFIG.backendUrl}/api/auth/notifications`)
      .then(r => r.ok ? r.json() : [])
      .then(notifications => {
        list.dataset.loaded = 'true';
        renderNotifList(notifications);
        const unreadCount = notifications.filter(n => !n.read_at).length;
        updateNotifBadge(unreadCount);
      })
      .catch(() => {
        list.innerHTML = '<div class="eu-notif-empty text-danger">Error al cargar</div>';
      });
  }

  async function markOneRead(id) {
    if (!id) return;
    try {
      const res = await Auth.authFetch(
        `${window.EU_CONFIG.backendUrl}/api/auth/notifications/${id}/read`,
        { method: 'PUT' }
      );
      if (res?.ok) {
        const data = await res.json().catch(() => null);
        if (data?.unread !== undefined) updateNotifBadge(data.unread);
      }
    } catch (_) {}
  }

  async function markAllRead() {
    try {
      await Auth.authFetch(
        `${window.EU_CONFIG.backendUrl}/api/auth/notifications/read`,
        { method: 'PUT' }
      );
      document.querySelectorAll('.eu-notif-item.unread').forEach(el => {
        el.classList.remove('unread');
        el.querySelector('.eu-notif-dot')?.remove();
      });
      updateNotifBadge(0);
    } catch (_) {}
  }

  async function clearAllNotifications() {
    try {
      await Auth.authFetch(
        `${window.EU_CONFIG.backendUrl}/api/auth/notifications`,
        { method: 'DELETE' }
      );
      const list = document.getElementById('notifList');
      if (list) {
        list.dataset.loaded = '';
        list.innerHTML = '<div class="eu-notif-empty">No tienes notificaciones</div>';
      }
      updateNotifBadge(0);
    } catch (_) {}
  }

  // Initialize notifications
  if (notifWrapper && notifDropdown && !notifWrapper._euNotifInit) {
    notifWrapper._euNotifInit = true;
    
    notifWrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent Bootstrap/other handlers
      
      const isOpen = notifDropdown.classList.contains('active');
      
      // Close Bootstrap dropdowns if open
      document.querySelectorAll('.dropdown-menu.show').forEach(el => el.classList.remove('show'));
      document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
        el.setAttribute('aria-expanded', 'false');
      });

      if (isOpen) {
        notifDropdown.classList.remove('active');
      } else {
        notifDropdown.classList.add('active');
        loadNotifications();
      }
    });

    notifDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.eu-notif-item');
      if (!item || !item.classList.contains('unread')) return;
      const id = item.dataset.notifId;
      item.classList.remove('unread');
      item.querySelector('.eu-notif-dot')?.remove();
      markOneRead(id);
      const remaining = document.querySelectorAll('.eu-notif-item.unread').length;
      updateNotifBadge(remaining);
    });
  }

  // Mark all as read
  const markAllReadBtn = document.getElementById('markAllRead');
  markAllReadBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await markAllRead();
  });

  const clearAllNotifBtn = document.getElementById('clearAllNotif');
  clearAllNotifBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await clearAllNotifications();
  });

  // Close dropdown when clicking outside
  if (!window._euNotifDocInit) {
    window._euNotifDocInit = true;
    document.addEventListener('click', (e) => {
      if (notifDropdown?.classList.contains('active') && !notifWrapper?.contains(e.target)) {
        notifDropdown.classList.remove('active');
      }
    });
  }

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
          popup.classList.remove('active'); 
          activePopup = null; 
          return;
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

// Safe init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _appInit);
} else {
  _appInit();
}
