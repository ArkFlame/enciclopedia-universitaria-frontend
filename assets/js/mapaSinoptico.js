(() => {
  const instances = new Map();
  const RESIZE_DEBOUNCE_MS = 120;

  function initMapas(root = document) {
    root.querySelectorAll('.eu-mapa-sinoptico').forEach(renderMapa);
  }

  function renderMapa(container) {
    const dataEl = container.querySelector('.eu-mapa-sinoptico-data');
    if (!dataEl) return;

    const rawText = dataEl.textContent || '';
    let parsed = { edges: [], nodes: [] };
    try {
      parsed = parseLines(rawText);
    } catch (err) {
      console.warn('[mapaSinoptico] error parsing data', err);
    }
    const { edges, nodes } = parsed;

    const levelsWrapper = container.querySelector('.eu-mapa-sinoptico-levels');
    const svgEl = container.querySelector('.eu-mapa-sinoptico-svg');
    const captionEl = container.querySelector('.eu-mapa-sinoptico-caption');
    const caption = container.dataset.caption || 'Mapa Sinóptico';
    if (captionEl) {
      captionEl.textContent = `🗺️ ${caption}`;
    }

    if (!edges.length) {
      if (levelsWrapper) {
        levelsWrapper.innerHTML = '<div class="eu-mapa-sinoptico-empty">Define relaciones usando <code>-></code> para que aparezca el mapa.</div>';
      }
      if (svgEl) svgEl.innerHTML = '';
      removeInstance(container);
      return;
    }

    const colorMap = parseColorMap(container.dataset.nodeColors);
    const built = buildLevels(edges, nodes);

    if (!levelsWrapper) return;
    levelsWrapper.innerHTML = '';

    built.levels.forEach(level => {
      const row = document.createElement('div');
      row.className = 'eu-mapa-sinoptico-level';
      level.forEach(title => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'eu-mapa-sinoptico-node';
        node.dataset.nodeName = title;
        node.textContent = title;
        const color = colorMap[title];
        if (color) {
          node.style.setProperty('--node-bg', color);
          node.style.setProperty('--node-text', getContrastColor(color));
          node.style.setProperty('--node-border', color);
        }
        node.addEventListener('click', () => highlightNode(node));
        row.appendChild(node);
      });
      levelsWrapper.appendChild(row);
    });

    const state = {
      observer: null,
      redraw: () => {},
      lastSize: null,
      resizeTimer: null,
    };

    const drawLoop = (force = false) => {
      if (!svgEl) return;
      const rect = container.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (!width || !height) return;
      const sizeKey = `${width}x${height}`;
      if (!force && state.lastSize === sizeKey) {
        return;
      }
      state.lastSize = sizeKey;
      drawConnections(container, built.childrenMap, svgEl, rect);
    };

    const scheduleRedraw = () => {
      if (state.resizeTimer) return;
      state.resizeTimer = window.setTimeout(() => {
        state.resizeTimer = null;
        window.requestAnimationFrame(() => drawLoop(false));
      }, RESIZE_DEBOUNCE_MS);
    };

    state.redraw = () => window.requestAnimationFrame(() => drawLoop(true));

    const prev = instances.get(container);
    if (prev) {
      if (prev.observer) prev.observer.disconnect();
      if (prev.resizeTimer) clearTimeout(prev.resizeTimer);
    }

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleRedraw)
      : null;

    if (ro) {
      ro.observe(container);
    }

    state.observer = ro;
    instances.set(container, state);
    state.redraw();
  }

  function removeInstance(container) {
    const prev = instances.get(container);
    if (prev) {
      if (prev.observer) prev.observer.disconnect();
      if (prev.resizeTimer) clearTimeout(prev.resizeTimer);
      instances.delete(container);
    }
  }

  function highlightNode(node) {
    node.classList.add('eu-mapa-sinoptico-node-active');
    clearTimeout(node._highlightTimeout);
    node._highlightTimeout = setTimeout(() => {
      node.classList.remove('eu-mapa-sinoptico-node-active');
      node._highlightTimeout = null;
    }, 1500);
  }

  function parseLines(text) {
    const edges = [];
    const nodes = new Set();
    text.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      const parts = line.split(/-+>/).map(p => p.trim()).filter(Boolean);
      if (parts.length === 2) {
        const [parent, child] = parts;
        edges.push({ parent, child });
        nodes.add(parent);
        nodes.add(child);
      }
    });
    return { edges, nodes: Array.from(nodes) };
  }

  function parseColorMap(payload) {
    if (!payload) return {};
    try {
      const value = JSON.parse(payload);
      if (value && typeof value === 'object') {
        return value;
      }
    } catch (err) {
      console.warn('[mapaSinoptico] color map JSON inválido', err);
    }
    return {};
  }

  function buildLevels(edges, nodes) {
    const childrenMap = {};
    const indegree = {};
    nodes.forEach(name => {
      childrenMap[name] = [];
      indegree[name] = 0;
    });

    edges.forEach(({ parent, child }) => {
      if (!childrenMap[parent]) childrenMap[parent] = [];
      childrenMap[parent].push(child);
      indegree[child] = (indegree[child] || 0) + 1;
      indegree[parent] = indegree[parent] || 0;
    });

    const roots = nodes.filter(name => indegree[name] === 0);
    const levels = [];
    let queue = roots;

    while (queue.length) {
      levels.push(queue);
      const next = [];
      queue.forEach(name => {
        (childrenMap[name] || []).forEach(child => {
          indegree[child]--;
          if (indegree[child] === 0) {
            next.push(child);
          }
        });
      });
      queue = next;
    }

    return { levels, childrenMap };
  }

  function drawConnections(container, childrenMap, svg, containerRect = null) {
    if (!svg) return;
    svg.innerHTML = '';

    const wrapperRect = containerRect || container.getBoundingClientRect();
    svg.setAttribute('width', wrapperRect.width);
    svg.setAttribute('height', wrapperRect.height);
    svg.setAttribute('viewBox', `0 0 ${wrapperRect.width} ${wrapperRect.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    addArrowMarker(svg);

    const nodes = Array.from(container.querySelectorAll('.eu-mapa-sinoptico-node'));
    const nodeIndex = new Map(nodes.map(el => [el.dataset.nodeName, el]));

    Object.entries(childrenMap).forEach(([parent, children]) => {
      const parentEl = nodeIndex.get(parent);
      if (!parentEl) return;
      const parentRect = parentEl.getBoundingClientRect();

      children.forEach(child => {
        const childEl = nodeIndex.get(child);
        if (!childEl) return;
        const childRect = childEl.getBoundingClientRect();

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const x1 = parentRect.right - wrapperRect.left;
        const y1 = parentRect.top + parentRect.height / 2 - wrapperRect.top;
        const x2 = childRect.left - wrapperRect.left;
        const y2 = childRect.top + childRect.height / 2 - wrapperRect.top;

        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', 'currentColor');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('fill', 'none');
        line.setAttribute('marker-end', 'url(#eu-mapa-sinoptico-arrow)');

        svg.appendChild(line);
      });
    });
  }

  function addArrowMarker(svg) {
    if (svg.querySelector('#eu-mapa-sinoptico-arrow')) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'eu-mapa-sinoptico-arrow');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto-start-reverse');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 L10,3 L0,6 Z');
    path.setAttribute('fill', 'currentColor');

    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  function getContrastColor(hex) {
    const cleaned = String(hex || '').replace('#', '');
    if (!cleaned || cleaned.length < 6) {
      return '#111';
    }
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#111' : '#fff';
  }

  function redrawAll() {
    instances.forEach(instance => {
      if (instance && typeof instance.redraw === 'function') {
        instance.redraw();
      }
    });
  }

  window.addEventListener('resize', () => {
    window.requestAnimationFrame(redrawAll);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMapas());
  } else {
    initMapas();
  }
  window.addEventListener('eu:content-loaded', () => initMapas());
})();
