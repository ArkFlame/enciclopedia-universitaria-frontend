/**
 * THEME.JS — Dark / Light mode toggle
 * Loaded synchronously at end of <body>. DOMContentLoaded has already fired.
 */
(function () {
  const THEME_KEY = 'eu_theme';
  const LOG = '[Theme]';

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  function applyTheme(t) {
    console.log(LOG, 'applyTheme called with:', t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.className = t === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
      console.log(LOG, 'icon updated to:', icon.className);
    } else {
      console.warn(LOG, 'themeIcon element NOT FOUND in DOM');
    }
  }

  function init() {
    console.log(LOG, 'init() called, readyState:', document.readyState);
    const current = getTheme();
    console.log(LOG, 'stored theme:', current);

    // Apply stored theme immediately
    applyTheme(current);

    // Find and wire the button
    const btn = document.getElementById('themeToggle');
    if (!btn) {
      console.error(LOG, 'CRITICAL: #themeToggle button NOT FOUND in DOM');
      return;
    }
    console.log(LOG, '#themeToggle found:', btn);

    btn.addEventListener('click', function (e) {
      console.log(LOG, 'CLICK EVENT FIRED on themeToggle');
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      console.log(LOG, 'switching to:', next);
      applyTheme(next);
    });

    console.log(LOG, 'click listener attached successfully');
  }

  // Apply immediately to prevent flash of wrong theme
  document.documentElement.setAttribute('data-theme', getTheme());

  // Scripts at end of body: DOM is parsed, DOMContentLoaded already fired.
  // readyState will be 'interactive' or 'complete' — NEVER 'loading' here.
  if (document.readyState === 'loading') {
    // Fallback: shouldn't happen for end-of-body scripts
    console.warn(LOG, 'Unexpected: readyState is loading, using DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
