/**
 * CUADRO SINOPTICO - Enciclopedia Universitaria
 * Handles interactive cuadro sinoptico with fixed position popups
 */

const CuadroSinoptico = (() => {
  
  function init() {
    // Initialize on content load
    document.removeEventListener('eu:content-loaded', init);
    document.addEventListener('eu:content-loaded', init);
    
    // Also run immediately in case content already loaded
    setupCuadrosSinopticos();
  }

  function setupCuadrosSinopticos() {
    const cuadros = document.querySelectorAll('.eu-cuadro-sinoptico');
    
    cuadros.forEach(cuadro => {
      // Add click handlers for etapas if we want expandable descriptions
      const etapas = cuadro.querySelectorAll('.etapa');
      etapas.forEach(etapa => {
        etapa.addEventListener('click', (e) => {
          // Toggle expanded state on mobile
          if (window.innerWidth < 768) {
            etapas.forEach(other => {
              if (other !== etapa) other.classList.remove('expanded');
            });
            etapa.classList.toggle('expanded');
          }
        });
      });
    });

    // Draw connection lines if needed
    drawConnectionLines();
  }

  function drawConnectionLines() {
    // Draw SVG lines between main box and etapas
    document.querySelectorAll('.eu-cuadro-sinoptico').forEach(cuadro => {
      const svg = cuadro.querySelector('svg');
      if (!svg) return;

      const mainBox = cuadro.querySelector('.shadow-2xl');
      if (!mainBox) return;

      const etapas = cuadro.querySelectorAll('.etapa');
      if (!etapas.length) return;

      const containerRect = cuadro.getBoundingClientRect();
      const mainRect = mainBox.getBoundingClientRect();
      const containerScrollTop = cuadro.scrollTop || 0;
      const containerScrollLeft = cuadro.scrollLeft || 0;

      // Start point: right side of main box
      const startX = mainRect.right - containerRect.left + containerScrollLeft + 8;
      const startY = mainRect.top - containerRect.top + containerScrollTop + mainRect.height / 2;

      // Clear existing lines
      svg.innerHTML = `
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#475569"/>
          </marker>
        </defs>
      `;

      etapas.forEach((etapa) => {
        const etapaBox = etapa.querySelector('div:first-child');
        if (!etapaBox) return;

        const etapaRect = etapaBox.getBoundingClientRect();
        
        // End point: left side of etapa box
        const endX = etapaRect.left - containerRect.left + containerScrollLeft - 15;
        const endY = etapaRect.top - containerRect.top + containerScrollTop + etapaRect.height / 2;

        // Create curved path
        const midX = startX + 90;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${startX},${startY} Q ${midX},${startY} ${endX},${endY}`);
        path.setAttribute('stroke', '#475569');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        
        svg.appendChild(path);
      });
    });
  }

  // Handle window resize
  let resizeTimeout;
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(drawConnectionLines, 100);
  }

  // Public init
  function initCuadroSinoptico() {
    init();
    window.addEventListener('resize', handleResize);
    
    // Initial setup after a short delay to ensure DOM is ready
    setTimeout(setupCuadrosSinopticos, 100);
  }

  return {
    init: initCuadroSinoptico
  };
})();

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', CuadroSinoptico.init);
} else {
  CuadroSinoptico.init();
}

window.CuadroSinoptico = CuadroSinoptico;
