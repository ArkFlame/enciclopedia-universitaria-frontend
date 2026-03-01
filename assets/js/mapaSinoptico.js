// mapaSinoptico.js
(() => {
  const DEFAULT_NODE_PALETTE = [
    '#1f2d3d', '#0066cc', '#00a65a', '#8e44ad',
    '#d35400', '#c0392b', '#0ea5e9', '#10b981',
    '#fb923c', '#a855f7', '#22c55e', '#f43f5e'
  ];
  const TOGGLE_LABELS = {
    open: 'Ocultar mapa sinóptico',
    closed: 'Mostrar mapa sinóptico'
  };
  const MAP_EXPORT_CSS = `
:root {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  color: #0f172a;
  background: #f9fafb;
}
body {
  margin: 0;
  padding: 32px;
  background: #f9fafb;
}
.eu-mapa-sinoptico-export {
  max-width: 960px;
  margin: 0 auto;
}
.eu-mapa-sinoptico-export h1 {
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  color: #0f172a;
  margin-bottom: 16px;
}
.eu-mapa-sinoptico-wrapper {
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  padding: 32px 26px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  overflow-x: auto;
}
.eu-mapa-sinoptico-tree {
  width: max-content;
}
.eu-mapa-sinoptico-node {
  position: relative;
  padding-left: 45px;
  margin-bottom: 24px;
}
.eu-mapa-sinoptico-node::before {
  content: '';
  position: absolute;
  top: 20px;
  left: 0;
  width: 45px;
  height: 2px;
  background: #cbd5f5;
}
.eu-mapa-sinoptico-node.root::before {
  display: none;
}
.eu-mapa-sinoptico-children {
  margin-top: 12px;
  border-left: 2px solid #cbd5f5;
  padding-left: 30px;
}
.eu-mapa-sinoptico-content {
  display: inline-block;
  padding: 10px 20px;
  border-radius: 7px;
  font-weight: 600;
  min-width: 150px;
  color: #fff;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.1);
  border: 2px solid transparent;
  background: var(--eu-border, #334155);
}
.eu-mapa-sinoptico-content:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.15);
}
`;

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
      initMapaInteractions(container);
      return;
    }

    const parsedColorMap = parseColorMap(container.dataset.nodeColors);
    const colorMap = ensureNodeColors(container, parsedColorMap, nodes);
    const { roots, childrenMap } = buildHierarchy(edges, nodes);

    treeWrapper.innerHTML = '';
    if (!roots.length) {
      treeWrapper.innerHTML = '<div class="eu-mapa-sinoptico-empty">No se encontró raíz para este mapa.</div>';
      initMapaInteractions(container);
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
    initMapaInteractions(container);
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

  function initMapaInteractions(container) {
    const controls = hydrateMapaControls(container);
    initMapaToggle(container, controls.toggle);
    initMapaDownload(container, controls.download);
  }

  function hydrateMapaControls(container) {
    const header = container.querySelector('.eu-mapa-sinoptico-header');
    if (!header) return { toggle: null, download: null };

    const toggles = Array.from(header.querySelectorAll('.eu-mapa-sinoptico-toggle'));
    const downloadButtons = Array.from(header.querySelectorAll('.eu-mapa-sinoptico-download'));

    for (let i = 1; i < toggles.length; i += 1) {
      toggles[i].remove();
    }
    for (let i = 1; i < downloadButtons.length; i += 1) {
      downloadButtons[i].remove();
    }

    let toggle = toggles[0];
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'eu-mapa-sinoptico-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.appendChild(createToggleIcon());
      toggle.appendChild(createToggleLabel(TOGGLE_LABELS.closed));
      header.insertBefore(toggle, header.firstChild);
    } else {
      if (!toggle.querySelector('.eu-mapa-sinoptico-toggle-icon')) {
        toggle.insertBefore(createToggleIcon(), toggle.firstChild);
      }
      if (!toggle.querySelector('.eu-mapa-sinoptico-toggle-label')) {
        toggle.appendChild(createToggleLabel(TOGGLE_LABELS.closed));
      }
    }

    let download = downloadButtons[0];
    if (!download) {
      const actions = container.querySelector('.eu-mapa-sinoptico-actions');
      if (actions) {
        const legacyDownload = actions.querySelector('.eu-mapa-sinoptico-download');
        if (legacyDownload) {
          download = legacyDownload;
          header.appendChild(download);
        }
        actions.remove();
      }
    }
    if (!download) {
      download = createDownloadButton();
      header.appendChild(download);
    }

    return { toggle, download };
  }

  function createToggleIcon() {
    const icon = document.createElement('span');
    icon.className = 'eu-mapa-sinoptico-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function createToggleLabel(text) {
    const label = document.createElement('span');
    label.className = 'eu-mapa-sinoptico-toggle-label';
    label.textContent = text;
    return label;
  }

  function createDownloadButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eu-mapa-sinoptico-download';
    button.innerHTML = `
      <svg class="eu-mapa-sinoptico-download-icon" width="18" height="18" viewBox="0 0 24 24" role="presentation" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6v10m0 0l-4-4m4 4l4-4M6 18h12"/>
      </svg>
      <span>Descargar Mapa Sinoptico</span>`;
    return button;
  }

  function initMapaToggle(container, toggleEl) {
    const toggle = toggleEl || container.querySelector('.eu-mapa-sinoptico-toggle');
    if (!toggle) return;
    const body = container.querySelector('.eu-mapa-sinoptico-body');
    const label = toggle.querySelector('.eu-mapa-sinoptico-toggle-label');
    const icon = toggle.querySelector('.eu-mapa-sinoptico-toggle-icon');
    const setOpen = open => {
      container.classList.toggle('eu-mapa-sinoptico-open', open);
      toggle.setAttribute('aria-expanded', open);
      if (body) {
        body.setAttribute('aria-hidden', !open);
      }
      if (label) {
        label.textContent = open ? TOGGLE_LABELS.open : TOGGLE_LABELS.closed;
      }
      if (icon) {
        icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    };
    setOpen(false);
    if (toggle.dataset.euMapaToggleInit === 'true') {
      return;
    }
    toggle.addEventListener('click', () => {
      setOpen(!container.classList.contains('eu-mapa-sinoptico-open'));
    });
    toggle.dataset.euMapaToggleInit = 'true';
  }

  function initMapaDownload(container, downloadEl) {
    let button = downloadEl || container.querySelector('.eu-mapa-sinoptico-download');
    if (!button) return;

    if (button.dataset.euMapaDownloadInit === 'true') {
      const replacement = button.cloneNode(true);
      if (button.parentNode) {
        button.parentNode.replaceChild(replacement, button);
      }
      button = replacement;
    }

    button.addEventListener('click', () => {
      const tree = container.querySelector('.eu-mapa-sinoptico-tree');
      if (!tree) return;
      const caption = container.dataset.caption || 'Mapa Sinoptico';
      const treeHtml = tree.cloneNode(true).outerHTML;
      const html = buildMapExportHtml(caption, treeHtml);
      downloadMapFile(html, caption);
    });
    button.dataset.euMapaDownloadInit = 'true';
  }

  function buildMapExportHtml(caption, treeHtml) {
    const safeCaption = escapeHtmlForExport(caption);
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeCaption}</title>
  <style>${MAP_EXPORT_CSS}</style>
</head>
<body>
  <div class="eu-mapa-sinoptico-export">
    <h1>${safeCaption}</h1>
    <div class="eu-mapa-sinoptico-wrapper">
      ${treeHtml}
    </div>
  </div>
</body>
</html>`;
  }

  function downloadMapFile(html, caption) {
    const fileName = `mapa-sinoptico-${slugify(caption)}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function slugify(value) {
    return String(value || 'mapa sinoptico')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'mapa-sinoptico';
  }

  function escapeHtmlForExport(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
