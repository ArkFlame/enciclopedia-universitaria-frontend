/**
 * THEME.JS - Dark / Light mode
 */
(function() {
  const THEME_KEY = 'eu_theme';

  function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
  function setTheme(t) {
    localStorage.setItem(THEME_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
    updateIcon(t);
  }
  function updateIcon(t) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = t === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
  }

  // Aplicar inmediatamente para evitar flash
  setTheme(getTheme());

  document.addEventListener('DOMContentLoaded', () => {
    updateIcon(getTheme());
    const btn = document.getElementById('themeToggle');
    btn?.addEventListener('click', () => {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  });
})();
