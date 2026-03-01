(() => {
  const DEFAULT_NODE_PALETTE = [
    '#1f2d3d', '#0066cc', '#00a65a', '#8e44ad',
    '#d35400', '#c0392b', '#0ea5e9', '#10b981',
    '#fb923c', '#a855f7', '#22c55e', '#f43f5e'
  ];

  function initMapas(root = document) {
    root.querySelectorAll('.eu-mapa-sinoptico').forEach(renderMapa);
  }

  function renderMapa(container) {
    const dataEl = container.querySelector('.eu-mapa-sinoptico-data');
    const treeWrapper = container.querySelector('.eu-mapa-sinoptico-tree');
    const captionEl = container.querySelector('.eu-mapa-sinoptico-caption');
    if (!dataEl || !treeWrapper) return;

    const caption = container.dataset.caption || 'Mapa Sinóptico';
    if (captionEl) {
      captionEl.textContent = `🗺️ ${caption}`;
    }

    const rawText = dataEl.textContent || '';
    const parsed = parseLines(rawText);
    const { edges, nodes } = parsed;

    if (!edges.length) {
      treeWrapper.innerHTML = '<div class="eu-mapa-sinoptico-empty">Define relaciones usando <code>-></code> para que aparezca el mapa.</div>';
      return;
    }

    const parsedColorMap = parseColorMap(container.dataset.nodeColors);
    const colorMap = ensureNodeColors(container, parsedColorMap, nodes);
    const { roots, childrenMap } = buildHierarchy(edges, nodes);

    treeWrapper.innerHTML = '';
    if (!roots.length) {
      treeWrapper.innerHTML = '<div class="eu-mapa-sinoptico-empty">No se encontró raíz para este mapa.</div>';
      return;
    }

    const rendered = new Set();
    roots.forEach(rootName => {
      const nodeElement = createNode(rootName, 1, childrenMap, colorMap, rendered);
      if (nodeElement) {
        treeWrapper.appendChild(nodeElement);
      }
    });

    const remaining = nodes.filter(name => !rendered.has(name));
    if (remaining.length) {
      const fallbackWrapper = document.createElement('div');
      fallbackWrapper.className = 'eu-mapa-sinoptico-children';
      remaining.forEach(extra => {
        const nodeElement = createNode(extra, 1, childrenMap, colorMap, rendered);
        if (nodeElement) fallbackWrapper.appendChild(nodeElement);
      });
      if (fallbackWrapper.childElementCount) {
        treeWrapper.appendChild(fallbackWrapper);
      }
    }
  }

  function createNode(name, depth, childrenMap, colorMap, rendered, ancestry = new Set()) {
    if (ancestry.has(name)) {
      return null;
    }
    ancestry.add(name);

    const node = document.createElement('div');
    node.className = `eu-mapa-sinoptico-node level-${Math.min(depth, 6)}${depth === 1 ? ' root' : ''}`;

    const content = document.createElement('div');
    content.className = 'eu-mapa-sinoptico-content';
    content.textContent = name;

    const color = colorMap[name];
    if (color) {
      content.style.background = color;
      content.style.borderColor = color;
      content.style.color = getContrastColor(color);
    }

    node.appendChild(content);
    rendered.add(name);

    const children = childrenMap.get(name) || [];
    if (children.length) {
      const childWrapper = document.createElement('div');
      childWrapper.className = 'eu-mapa-sinoptico-children';
      children.forEach(child => {
        const childNode = createNode(child, depth + 1, childrenMap, colorMap, rendered, new Set(ancestry));
        if (childNode) {
          childWrapper.appendChild(childNode);
        }
      });
      if (childWrapper.childElementCount) {
        node.appendChild(childWrapper);
      }
    }

    return node;
  }

  function buildHierarchy(edges, nodes) {
    const childrenMap = new Map();
    const indegree = new Map();
    nodes.forEach(name => {
      childrenMap.set(name, []);
      indegree.set(name, 0);
    });

    edges.forEach(({ parent, child }) => {
      if (!childrenMap.has(parent)) {
        childrenMap.set(parent, []);
      }
      childrenMap.get(parent).push(child);
      indegree.set(child, (indegree.get(child) || 0) + 1);
      if (!indegree.has(parent)) {
        indegree.set(parent, 0);
      }
    });

    const roots = nodes.filter(name => (indegree.get(name) || 0) === 0);
    return { roots, childrenMap };
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

  function ensureNodeColors(container, baseMap, nodes) {
    const normalized = { ...(baseMap || {}) };
    let index = 0;
    nodes.forEach(name => {
      if (!normalized[name]) {
        normalized[name] = DEFAULT_NODE_PALETTE[index % DEFAULT_NODE_PALETTE.length];
        index++;
      }
    });
    try {
      container.dataset.nodeColors = JSON.stringify(normalized);
    } catch (err) {
      console.warn('[mapaSinoptico] no se pudo guardar color map', err);
    }
    return normalized;
  }

  function getContrastColor(hex) {
    const cleaned = String(hex || '').replace('#', '');
    if (!cleaned || cleaned.length < 6) {
      return '#fff';
    }
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#111' : '#fff';
  }

  document.addEventListener('DOMContentLoaded', () => initMapas());
  window.addEventListener('eu:content-loaded', () => initMapas());

  initMapas();

  const observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(mutations => {
      mutations.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches('.eu-mapa-sinoptico')) {
            renderMapa(node);
          }
          node.querySelectorAll && node.querySelectorAll('.eu-mapa-sinoptico').forEach(renderMapa);
        });
      });
    })
    : null;

  if (observer) {
    const rootNode = document.body || document.documentElement;
    if (rootNode) {
      observer.observe(rootNode, { childList: true, subtree: true });
    }
  }
})();
