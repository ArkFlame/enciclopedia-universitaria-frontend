/**
 * THEME.JS — Dark / Light mode toggle
 *
 * NOTE: This file is loaded at the end of <body>, so DOMContentLoaded
 * may have already fired by the time this script runs. We use a
 * readyState check to handle both cases safely.
 */
(function () {
  const THEME_KEY = 'eu_theme';

  function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = t === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
  }

  function attachToggle() {
    applyTheme(getTheme()); // apply & update icon now that DOM is ready
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
      });
    }
  }

  // Apply theme immediately (avoids flash of wrong theme)
  document.documentElement.setAttribute('data-theme', getTheme());

  // Attach toggle — safe whether DOMContentLoaded already fired or not
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToggle);
  } else {
    attachToggle(); // DOM already ready
  }
})();
