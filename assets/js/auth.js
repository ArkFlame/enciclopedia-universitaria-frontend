/**
 * AUTH.JS - Enciclopedia Universitaria
 * Gestión de autenticación JWT en el frontend
 */

const Auth = (() => {
  const API       = window.EU_CONFIG.backendUrl;
  const TOKEN_KEY = 'eu_token';
  const USER_KEY  = 'eu_user';

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getUser()   {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }
  function isLoggedIn() { return !!getToken(); }
  function hasRole(...roles) {
    const u = getUser();
    return u && roles.includes(u.role);
  }

  async function login(email, password) {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  }

  async function register(username, email, password) {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrarse');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = window.EU_CONFIG.baseUrl + '/';
  }

  /**
   * authFetch — fetch with Authorization header.
   * 
   * IMPORTANT: Does NOT auto-logout on 401.
   * Callers must check res?.ok and handle errors themselves.
   * Auto-logout was removed because it caused session loss when any background
   * request (notifications, refresh) returned 401 due to token expiry or
   * a transient server error — logging the user out unexpectedly.
   * 
   * Pages that require auth should redirect to login themselves if needed.
   */
  async function authFetch(url, options = {}) {
    const token   = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { ...options, headers });
      return res;
    } catch (e) {
      console.warn('authFetch network error:', e);
      return null;
    }
  }

  /**
   * refreshToken — gets a fresh JWT from the server with the current DB role.
   * Uses raw fetch (never authFetch) so a 401 never triggers logout.
   * Silently keeps the existing stored user if refresh fails.
   */
  async function refreshToken() {
    if (!isLoggedIn()) return null;
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${getToken()}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
      // 401 = token expired/invalid — keep existing stored user, don't logout.
      // The user will be prompted to login naturally when they hit a protected action.
    } catch (e) {
      console.warn('Token refresh failed (network?):', e);
    }
    return getUser();
  }

  /**
   * refreshUser — updates just the user object in localStorage without new JWT.
   */
  async function refreshUser() {
    if (!isLoggedIn()) return null;
    try {
      const res = await authFetch(`${API}/api/auth/me`);
      if (res?.ok) {
        const user = await res.json();
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        return user;
      }
    } catch (e) {
      console.warn('refreshUser failed:', e);
    }
    return getUser();
  }

  function resolveNotificationLink(n) {
    const BASE = window.EU_CONFIG.baseUrl;
    switch (n.type) {
      case 'article_approved':
      case 'article_rejected':
      case 'new_submission':
        return n.notification_url
          ? n.notification_url
          : n.article_slug
            ? `${BASE}/articulo.html?slug=${encodeURIComponent(n.article_slug)}`
            : null;
      case 'edit_approved':
      case 'edit_rejected':
        return n.notification_url
          ? n.notification_url
          : n.article_slug
            ? `${BASE}/articulo.html?slug=${encodeURIComponent(n.article_slug)}`
            : null;
      case 'subscription_activated':
      case 'subscription_expired':
        return `${BASE}/suscripcion.html`;
      default:
        return n.notification_url || null;
    }
  }

  function resolveNotificationIcon(type) {
    const icons = {
      article_approved: '✅', article_rejected: '❌',
      edit_approved: '✏️', edit_rejected: '✏️',
      subscription_activated: '⭐', subscription_expired: '⚠️',
      new_submission: '📝'
    };
    return `<span style="font-size:1rem">${icons[type] || '🔔'}</span>`;
  }

  function updateNavbar() {
    const user               = getUser();
    const authSection        = document.getElementById('authSection');
    const sidebarAuthSection = document.getElementById('sidebarAuthSection');
    const notifWrapper       = document.getElementById('notifWrapper');
    const readCounter        = document.getElementById('readCounter');
    const sidebarNewArticle  = document.getElementById('sidebarNewArticle');
    const BASE               = window.EU_CONFIG.baseUrl;

    if (user && isLoggedIn()) {
      const roleLabels = { FREE: 'Gratis', MONTHLY: 'Premium', MOD: 'Moderador', ADMIN: 'Admin' };
      const roleColors = { FREE: 'text-muted', MONTHLY: 'text-success', MOD: 'text-primary', ADMIN: 'text-danger' };

      if (authSection) {
        authSection.innerHTML = `
          <div class="dropdown">
            <button class="eu-btn-outline dropdown-toggle" id="userMenuBtn"
                    type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-person-fill"></i>
              <span class="d-none d-lg-inline">${escapeHtml(user.username)}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end eu-dropdown-menu" aria-labelledby="userMenuBtn">
              <li><div class="px-3 py-2 small">
                <div class="fw-semibold">${escapeHtml(user.username)}</div>
                <div class="${roleColors[user.role] || 'text-muted'} small">${roleLabels[user.role] || user.role}</div>
              </div></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="${BASE}/nuevo-articulo.html">
                    <i class="bi bi-plus-circle me-2"></i>Nuevo artículo</a></li>
              <li><a class="dropdown-item" href="${BASE}/perfil.html">
                    <i class="bi bi-person me-2"></i>Mi perfil</a></li>
              ${user.role === 'FREE' ? `
              <li><a class="dropdown-item text-success" href="${BASE}/suscripcion.html">
                    <i class="bi bi-star me-2"></i>Mejorar plan</a></li>` : ''}
              ${['MOD','ADMIN'].includes(user.role) ? `
              <li><a class="dropdown-item" href="${BASE}/admin/index.html">
                    <i class="bi bi-shield-check me-2"></i>Panel moderación</a></li>` : ''}
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="event.preventDefault(); Auth.logout();">
                    <i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</a></li>
            </ul>
          </div>`;

        // Bootstrap 5: manually initialize the dropdown since the button was injected
        // after Bootstrap's initial DOM scan.
        const btn = authSection.querySelector('[data-bs-toggle="dropdown"]');
        if (btn && typeof bootstrap !== 'undefined') {
          // Dispose old instance if any, then create new
          const existing = bootstrap.Dropdown.getInstance(btn);
          if (existing) existing.dispose();
          new bootstrap.Dropdown(btn);
        }
      }

      if (sidebarAuthSection) {
        sidebarAuthSection.innerHTML = `
          <a href="${BASE}/perfil.html"><i class="bi bi-person"></i> Mi perfil</a>
          <a href="${BASE}/nuevo-articulo.html"><i class="bi bi-plus-circle"></i> Nuevo artículo</a>
          ${user.role === 'FREE' ? `<a href="${BASE}/suscripcion.html" style="color:var(--eu-success)">
            <i class="bi bi-star"></i> Mejorar plan</a>` : ''}
          ${['MOD','ADMIN'].includes(user.role) ? `<a href="${BASE}/admin/index.html">
            <i class="bi bi-shield-check"></i> Moderación</a>` : ''}
          <a href="#" onclick="event.preventDefault(); Auth.logout();">
            <i class="bi bi-box-arrow-right"></i> Cerrar sesión</a>`;
      }

      // Show notification bell
      if (notifWrapper) {
        notifWrapper.classList.remove('d-none');
        const badge = document.getElementById('notifBadge');
        if (badge && user.notificationCount > 0) {
          badge.textContent = user.notificationCount > 99 ? '99+' : String(user.notificationCount);
          badge.classList.remove('d-none');
        }
      }

      // Read counter for FREE users
      if (readCounter) {
        if (user.role === 'FREE') {
          const limit = user.freeLimit || 30;
          const read  = user.articlesReadThisMonth || 0;
          readCounter.classList.remove('d-none');
          const countText = document.getElementById('readCountText');
          if (countText) countText.textContent = `${read}/${limit}`;
          if (read >= limit)        readCounter.classList.add('at-limit');
          else if (read >= limit-3) readCounter.classList.add('near-limit');
        } else {
          readCounter.classList.add('d-none');
        }
      }

      if (sidebarNewArticle) sidebarNewArticle.classList.remove('d-none');

    } else {
      if (authSection) {
        authSection.innerHTML = `<a href="${BASE}/login.html" class="eu-btn-primary">Iniciar sesión</a>`;
      }
      if (sidebarAuthSection) {
        sidebarAuthSection.innerHTML = `
          <a href="${BASE}/login.html"><i class="bi bi-box-arrow-in-right"></i> Iniciar sesión</a>
          <a href="${BASE}/login.html"><i class="bi bi-person-plus"></i> Registrarse</a>`;
      }
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function loadNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;
    try {
      const res = await authFetch(`${API}/api/auth/notifications`);
      if (!res?.ok) return;
      const notifs = await res.json();
      if (!notifs.length) {
        list.innerHTML = '<div class="eu-notif-empty">No hay notificaciones</div>';
        return;
      }
      list.innerHTML = notifs.slice(0, 15).map(n => {
        const link = resolveNotificationLink(n);
        const inner = `
          <div class="eu-notif-icon">${resolveNotificationIcon(n.type)}</div>
          <div style="flex:1;min-width:0">
            <div class="eu-notif-msg">${escapeHtml(n.message)}</div>
            <div class="eu-notif-time">${timeAgo(n.created_at)}</div>
          </div>
          ${!n.read_at ? '<span class="eu-notif-dot"></span>' : ''}`;
        const itemClass = `eu-notif-item ${!n.read_at ? 'unread' : ''}`;
        return link
          ? `<a href="${link}" class="${itemClass}">${inner}</a>`
          : `<div class="${itemClass}">${inner}</div>`;
      }).join('');
    } catch (e) {
      console.warn('Error cargando notificaciones:', e);
    }
  }

  function getNotifLink(n, BASE) {
    switch (n.type) {
      case 'article_approved':
      case 'article_rejected':
      case 'new_submission':
        return n.article_slug
          ? `${BASE}/articulo.html?slug=${encodeURIComponent(n.article_slug)}`
          : n.reference_id ? `${BASE}/articulo.html?id=${n.reference_id}` : null;
      case 'edit_approved':
      case 'edit_rejected':
        return n.article_slug
          ? `${BASE}/articulo.html?slug=${encodeURIComponent(n.article_slug)}`
          : null;
      case 'subscription_activated':
      case 'subscription_expired':
        return `${BASE}/suscripcion.html`;
      default:
        return null;
    }
  }

  function getNotifIcon(type) {
    const icons = {
      article_approved: '✅', article_rejected: '❌',
      edit_approved: '✏️', edit_rejected: '✏️',
      subscription_activated: '⭐', subscription_expired: '⚠️',
      new_submission: '📝'
    };
    return `<span style="font-size:1rem">${icons[type] || '🔔'}</span>`;
  }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60)    return 'Hace un momento';
    if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
    return new Date(dateStr).toLocaleDateString('es-AR');
  }

  async function _authInit() {
    if (isLoggedIn()) {
      await refreshToken(); // silent — never logs out
    }
    updateNavbar();
    if (isLoggedIn()) loadNotifications();
  }

  // Scripts load at end of <body>; DOMContentLoaded may have already fired.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _authInit);
  } else {
    _authInit();
  }

  return {
    getToken, getUser, isLoggedIn, hasRole,
    login, register, logout, authFetch,
    refreshToken, refreshUser, updateNavbar,
    getNotificationLink: resolveNotificationLink,
    getNotificationIcon: resolveNotificationIcon
  };
})();

window.Auth = Auth;
