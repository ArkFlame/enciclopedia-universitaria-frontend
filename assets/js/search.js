/**
 * SEARCH.JS - Búsqueda inteligente con debounce
 */
(function() {
  const API = window.EU_CONFIG.backendUrl;
  let debounceTimer;

  function debounce(fn, delay) {
    return function(...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function search(query, dropdownEl) {
    if (!query.trim() || query.trim().length < 2) {
      dropdownEl.classList.remove('active');
      return;
    }

    const includePending = localStorage.getItem('eu_show_pending') === 'true';
    const url = new URL(`${API}/api/articles`);
    url.searchParams.set('query', query.trim());
    url.searchParams.set('limit', '6');
    if (includePending) url.searchParams.set('includePending', 'true');

    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const { articles } = await res.json();

      if (!articles.length) {
        dropdownEl.innerHTML = `<div class="eu-search-result-item text-muted">Sin resultados para "${escapeHtml(query)}"</div>`;
      } else {
        dropdownEl.innerHTML = articles.map(a => `
          <div class="eu-search-result-item" onclick="window.location.href='${window.EU_CONFIG.baseUrl}/articulo.html?slug=${encodeURIComponent(a.slug)}'">
            <div class="eu-search-result-title">
              ${escapeHtml(a.title)}
              ${a.status !== 'APPROVED' ? `<span class="eu-status-badge eu-status-${a.status} ms-1">${a.status === 'PENDING' ? 'Pendiente' : 'Rechazado'}</span>` : ''}
            </div>
            <div class="eu-search-result-summary">${escapeHtml(a.summary)}</div>
          </div>`).join('');
      }

      dropdownEl.classList.add('active');
    } catch (e) {
      dropdownEl.innerHTML = `<div class="eu-search-result-item text-danger">Error al buscar</div>`;
      dropdownEl.classList.add('active');
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setupSearch(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const debouncedSearch = debounce((q) => search(q, dropdown), 280);

    input.addEventListener('input', (e) => {
      if (!e.target.value.trim()) { dropdown.classList.remove('active'); return; }
      debouncedSearch(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        dropdown.classList.remove('active');
        window.location.href = `${window.EU_CONFIG.baseUrl}/busqueda.html?q=${encodeURIComponent(input.value.trim())}`;
      }
      if (e.key === 'Escape') dropdown.classList.remove('active');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupSearch('globalSearch', 'searchDropdown');
    setupSearch('mobileSearch', 'mobileSearchDropdown');
  });

  // Re-buscar si cambia el toggle
  window.addEventListener('eu:pending-toggle', () => {
    const input = document.getElementById('globalSearch');
    if (input?.value.trim()) {
      search(input.value, document.getElementById('searchDropdown'));
    }
  });
})();
