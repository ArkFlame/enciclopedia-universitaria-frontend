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
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY,  JSON.stringify(data.user));
    return data;
  }

  async function register(username, email, password) {
    const res  = await fetch(`${API}/api/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrarse');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY,  JSON.stringify(data.user));
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = window.EU_CONFIG.baseUrl + '/';
  }

  async function authFetch(url, options = {}) {
    const token   = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { logout(); return; }
    return res;
  }

  // Pide un token nuevo al backend con el rol actual de la DB.
  // Llamar cuando el rol puede haber cambiado externamente (ej: CLI promote).
  async function refreshToken() {
    if (!isLoggedIn()) return null;
    try {
      const res = await authFetch(`${API}/api/auth/refresh`, { method: 'POST' });
      if (res?.ok) {
        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY,  JSON.stringify(data.user));
        return data.user;
      }
    } catch (e) { console.warn('No se pudo refrescar el token:', e); }
    return getUser();
  }

  // Actualiza solo los datos del usuario en localStorage (sin nuevo token).
  async function refreshUser() {
    if (!isLoggedIn()) return null;
    try {
      const res = await authFetch(`${API}/api/auth/me`);
      if (res?.ok) {
        const user = await res.json();
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        return user;
      }
    } catch (e) { console.warn('No se pudo actualizar el usuario:', e); }
    return getUser();
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
                    data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-person-fill"></i>
              <span class="d-none d-lg-inline">${escapeHtml(user.username)}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end eu-dropdown-menu">
              <li><div class="px-3 py-2 small">
                <div class="fw-semibold">${escapeHtml(user.username)}</div>
                <div class="${roleColors[user.role]} small">${roleLabels[user.role] || user.role}</div>
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
              <li><button class="dropdown-item text-danger" onclick="Auth.logout()">
                    <i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</button></li>
            </ul>
          </div>`;
      }

      if (sidebarAuthSection) {
        sidebarAuthSection.innerHTML = `
          <a href="${BASE}/perfil.html"><i class="bi bi-person"></i> Mi perfil</a>
          <a href="${BASE}/nuevo-articulo.html"><i class="bi bi-plus-circle"></i> Nuevo artículo</a>
          ${user.role === 'FREE' ? `<a href="${BASE}/suscripcion.html" class="text-success">
            <i class="bi bi-star"></i> Mejorar plan</a>` : ''}
          ${['MOD','ADMIN'].includes(user.role) ? `<a href="${BASE}/admin/index.html">
            <i class="bi bi-shield-check"></i> Moderación</a>` : ''}
          <a href="#" onclick="Auth.logout(); return false;">
            <i class="bi bi-box-arrow-right"></i> Cerrar sesión</a>`;
      }

      // Notificaciones
      if (notifWrapper) {
        notifWrapper.classList.remove('d-none');
        if (user.notificationCount > 0) {
          const badge = document.getElementById('notifBadge');
          if (badge) {
            badge.textContent = user.notificationCount > 99 ? '99+' : user.notificationCount;
            badge.classList.remove('d-none');
          }
        }
      }

      // Contador artículos FREE
      if (readCounter) {
        if (user.role === 'FREE') {
          const limit = user.freeLimit || 30;
          const read  = user.articlesReadThisMonth || 0;
          readCounter.classList.remove('d-none');
          readCounter.title = `Artículos leídos este mes (límite: ${limit})`;
          const countText = document.getElementById('readCountText');
          if (countText) countText.textContent = `${read}/${limit}`;
          if (read >= limit)       readCounter.classList.add('at-limit');
          else if (read >= limit - 3) readCounter.classList.add('near-limit');
        } else {
          // Si ya no es FREE (ej: rol cambió via CLI), ocultar el contador
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
      if (!notifs.length) return;
      list.innerHTML = notifs.slice(0, 10).map(n => `
        <div class="eu-notif-item ${!n.read_at ? 'unread' : ''}">
          <div>${escapeHtml(n.message)}</div>
          <div class="eu-notif-time">${timeAgo(n.created_at)}</div>
        </div>`).join('');
    } catch (e) { console.warn('Error cargando notificaciones:', e); }
  }

  function timeAgo(dateStr) {
    const d    = new Date(dateStr);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60)    return 'Hace un momento';
    if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString('es-AR');
  }

  // Al cargar cada página: refrescar token silenciosamente para que el rol
  // siempre esté actualizado aunque haya cambiado via CLI en el servidor.
  document.addEventListener('DOMContentLoaded', async () => {
    if (isLoggedIn()) {
      await refreshToken();   // obtiene rol actual de la DB + nuevo JWT
    }
    updateNavbar();
    if (isLoggedIn()) loadNotifications();
  });

  return {
    getToken, getUser, isLoggedIn, hasRole,
    login, register, logout, authFetch,
    refreshToken, refreshUser, updateNavbar
  };
})();

window.Auth = Auth;
