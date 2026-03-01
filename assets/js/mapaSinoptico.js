(() => {
  // ── Constants ───────────────────────────────────────────────────────────
  const DEFAULT_NODE_PALETTE = [
    '#1f2d3d', '#0066cc', '#00a65a', '#8e44ad',
    '#d35400', '#c0392b', '#0ea5e9', '#10b981',
    '#fb923c', '#a855f7', '#22c55e', '#f43f5e'
  ];

  const TOGGLE_LABELS = {
    open:   'Ocultar mapa sinóptico',
    closed: 'Mostrar mapa sinóptico'
  };

  // Full self-contained CSS for the downloaded HTML file.
  // Uses only hardcoded hex colours — no CSS custom properties —
  // so it renders correctly offline without any stylesheet.
  const MAP_EXPORT_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  color: #0f172a;
  background: #f1f5f9;
  padding: 32px 20px 60px;
}
.eu-mapa-sinoptico-export { max-width: 980px; margin: 0 auto; }
.eu-export-title {
  font-size: 1.6rem; font-weight: 700; text-align: center;
  color: #0f172a; margin-bottom: 8px;
}
.eu-export-subtitle {
  text-align: center; font-size: 0.83rem; color: #64748b; margin-bottom: 28px;
}
.eu-mapa-sinoptico-wrapper {
  background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;
  padding: 36px 32px; box-shadow: 0 8px 32px rgba(15,23,42,0.08); overflow-x: auto;
}
.eu-mapa-sinoptico-tree { width: max-content; min-width: 100%; }
.eu-mapa-sinoptico-node { position: relative; padding-left: 45px; margin-bottom: 22px; }
.eu-mapa-sinoptico-node::before {
  content: ''; position: absolute; top: 19px; left: 0;
  width: 45px; height: 2px; background: #cbd5e1;
}
.eu-mapa-sinoptico-node.root::before { display: none; }
.eu-mapa-sinoptico-children {
  margin-top: 10px; border-left: 2px solid #cbd5e1; padding-left: 28px;
}
.eu-mapa-sinoptico-content {
  display: inline-block; padding: 9px 18px; border-radius: 8px;
  font-weight: 600; font-size: 0.93rem; min-width: 140px;
  color: #ffffff; background: #334155;
  box-shadow: 0 4px 12px rgba(15,23,42,0.12);
  border: 2px solid transparent; cursor: default;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.eu-mapa-sinoptico-content:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 10px 20px rgba(15,23,42,0.15);
}
.eu-mapa-sinoptico-node.level-1 > .eu-mapa-sinoptico-content { background: #1f2d3d; }
.eu-mapa-sinoptico-node.level-2 > .eu-mapa-sinoptico-content { background: #0066cc; }
.eu-mapa-sinoptico-node.level-3 > .eu-mapa-sinoptico-content { background: #00a65a; }
.eu-mapa-sinoptico-node.level-4 > .eu-mapa-sinoptico-content { background: #8e44ad; }
.eu-mapa-sinoptico-node.level-5 > .eu-mapa-sinoptico-content { background: #d35400; }
.eu-mapa-sinoptico-node.level-6 > .eu-mapa-sinoptico-content { background: #c0392b; }
.eu-mapa-sinoptico-content.has-definition { cursor: pointer; }
.eu-mapa-sinoptico-content.has-definition::after { content: ' \u24d8'; font-size: 0.75em; opacity: 0.7; }
.eu-export-definition-box {
  display: none; position: fixed; inset: 0;
  background: rgba(15,23,42,0.55); align-items: center;
  justify-content: center; z-index: 100; padding: 1rem;
}
.eu-export-definition-box.open { display: flex; }
.eu-export-definition-panel {
  background: #fff; border-radius: 14px; padding: 1.5rem;
  max-width: 420px; width: 100%;
  box-shadow: 0 20px 48px rgba(15,23,42,0.25); position: relative;
}
.eu-export-definition-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem; color: #0f172a; }
.eu-export-definition-text { font-size: 0.93rem; color: #475569; }
.eu-export-definition-close {
  position: absolute; top: 0.6rem; right: 0.8rem;
  background: none; border: none; font-size: 1.3rem; cursor: pointer; color: #64748b;
}
.eu-export-footer { text-align: center; margin-top: 24px; font-size: 0.78rem; color: #94a3b8; }
@media (max-width: 600px) {
  .eu-mapa-sinoptico-wrapper { padding: 20px 14px; }
  .eu-mapa-sinoptico-node { padding-left: 32px; margin-bottom: 16px; }
  .eu-mapa-sinoptico-node::before { width: 32px; }
  .eu-mapa-sinoptico-content { min-width: 100px; padding: 7px 12px; font-size: 0.82rem; }
}
`;

  // ── Rendering ────────────────────────────────────────────────────────────

  function initMapas(root) {
    root = root || document;
    root.querySelectorAll('.eu-mapa-sinoptico:not([data-mapa-init])').forEach(renderMapa);
  }

  function renderMapa(container) {
    container.dataset.mapaInit = '1';

    const dataEl      = container.querySelector('.eu-mapa-sinoptico-data');
    const treeWrapper = container.querySelector('.eu-mapa-sinoptico-tree');
    const captionEl   = container.querySelector('.eu-mapa-sinoptico-caption');
    if (!dataEl || !treeWrapper) return;

    const caption = container.dataset.caption || 'Mapa Sinóptico';
    if (captionEl) captionEl.textContent = '\uD83D\uDDFA\uFE0F ' + caption;

    const rawText = dataEl.textContent || '';
    const parsed  = parseLines(rawText);
    const edges       = parsed.edges;
    const nodes       = parsed.nodes;
    const definitions = parsed.definitions;

    if (!edges.length) {
      treeWrapper.innerHTML = '<div class="eu-mapa-sinoptico-empty">Define relaciones usando <code>-&gt;</code> para que aparezca el mapa.</div>';
      buildControls(container);
      return;
    }

    const parsedColorMap = parseColorMap(container.dataset.nodeColors);
    const colorMap       = ensureNodeColors(container, parsedColorMap, nodes);
    const summaryMap     = parseNodeSummaries(container.dataset.nodeSummaries);
    const hier           = buildHierarchy(edges, nodes);
    const roots          = hier.roots;
    const childrenMap    = hier.childrenMap;

    treeWrapper.innerHTML = '';

    if (!roots.length) {
      treeWrapper.innerHTML = '<div class="eu-mapa-sinoptico-empty">No se encontró raíz para este mapa.</div>';
      buildControls(container);
      return;
    }

    const rendered = new Set();
    roots.forEach(function(rootName) {
      const el = createNode(rootName, 1, childrenMap, colorMap, definitions, summaryMap, rendered, new Set());
      if (el) treeWrapper.appendChild(el);
    });

    nodes.filter(function(n) { return !rendered.has(n); }).forEach(function(name) {
      const el = createNode(name, 1, childrenMap, colorMap, definitions, summaryMap, rendered, new Set());
      if (el) treeWrapper.appendChild(el);
    });

    buildControls(container);
  }

  function createNode(name, depth, childrenMap, colorMap, definitions, summaries, rendered, ancestry) {
    if (ancestry.has(name)) return null;
    ancestry.add(name);

    const node = document.createElement('div');
    node.className = 'eu-mapa-sinoptico-node level-' + Math.min(depth, 6) + (depth === 1 ? ' root' : '');

    const content = document.createElement('div');
    content.className = 'eu-mapa-sinoptico-content';
    content.textContent = name;

    const color = colorMap[name];
    if (color) {
      content.style.background  = color;
      content.style.borderColor = color;
      content.style.color       = getContrastColor(color);
    }

    const info = (definitions && definitions[name]) || (summaries && summaries[name]) || '';
    if (info) content.dataset.definition = info;

    node.appendChild(content);
    rendered.add(name);

    const children = childrenMap.get(name) || [];
    if (children.length) {
      const childWrapper = document.createElement('div');
      childWrapper.className = 'eu-mapa-sinoptico-children';
      children.forEach(function(child) {
        const childEl = createNode(child, depth + 1, childrenMap, colorMap, definitions, summaries, rendered, new Set(ancestry));
        if (childEl) childWrapper.appendChild(childEl);
      });
      if (childWrapper.childElementCount) node.appendChild(childWrapper);
    }

    return node;
  }

  // ── Controls: toggle + download, rebuilt fresh each render ──────────────

  function buildControls(container) {
    const header = container.querySelector('.eu-mapa-sinoptico-header');
    if (!header) return;

    // Clear and rebuild — avoids any duplicate-listener issues
    header.innerHTML = '';

    const toggle   = makeToggleButton();
    const download = makeDownloadButton();
    header.appendChild(toggle);
    header.appendChild(download);

    // Toggle wiring
    const body  = container.querySelector('.eu-mapa-sinoptico-body');
    const lbl   = toggle.querySelector('.eu-mapa-sinoptico-toggle-label');
    const icon  = toggle.querySelector('.eu-mapa-sinoptico-toggle-icon');

    function setOpen(open) {
      container.classList.toggle('eu-mapa-sinoptico-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (body)  body.setAttribute('aria-hidden', String(!open));
      if (lbl)   lbl.textContent = open ? TOGGLE_LABELS.open : TOGGLE_LABELS.closed;
      if (icon)  icon.style.transform = open ? 'rotate(180deg)' : '';
    }
    setOpen(false);
    toggle.addEventListener('click', function() {
      setOpen(!container.classList.contains('eu-mapa-sinoptico-open'));
    });

    // Download wiring
    download.addEventListener('click', function() {
      const tree = container.querySelector('.eu-mapa-sinoptico-tree');
      if (!tree) return;
      const caption = container.dataset.caption || 'Mapa Sinóptico';
      const html = buildMapExportHtml(caption, tree.cloneNode(true).outerHTML);
      downloadMapFile(html, caption);
    });

    // Node definition modals
    initDefinitionInteractions(container);
  }

  function makeToggleButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eu-mapa-sinoptico-toggle';
    btn.setAttribute('aria-expanded', 'false');

    const icon = document.createElement('span');
    icon.className = 'eu-mapa-sinoptico-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');

    const lbl = document.createElement('span');
    lbl.className = 'eu-mapa-sinoptico-toggle-label';
    lbl.textContent = TOGGLE_LABELS.closed;

    btn.appendChild(icon);
    btn.appendChild(lbl);
    return btn;
  }

  function makeDownloadButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eu-mapa-sinoptico-download';
    btn.setAttribute('aria-label', 'Descargar mapa sinóptico');
    btn.title = 'Descargar mapa sinóptico (HTML offline)';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.flexShrink = '0';

    // Vertical arrow down
    const shaft = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    shaft.setAttribute('x1', '12'); shaft.setAttribute('y1', '4');
    shaft.setAttribute('x2', '12'); shaft.setAttribute('y2', '16');
    // Arrowhead
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    head.setAttribute('points', '8 12 12 16 16 12');
    // Base line (tray)
    const tray = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tray.setAttribute('x1', '5');  tray.setAttribute('y1', '20');
    tray.setAttribute('x2', '19'); tray.setAttribute('y2', '20');

    svg.appendChild(shaft);
    svg.appendChild(head);
    svg.appendChild(tray);
    btn.appendChild(svg);

    const lbl = document.createElement('span');
    lbl.textContent = 'Descargar';
    btn.appendChild(lbl);

    return btn;
  }

  // ── Definition modal (live page) ─────────────────────────────────────────

  function initDefinitionInteractions(container) {
    container.querySelectorAll('.eu-mapa-sinoptico-content[data-definition]').forEach(function(node) {
      if (node.dataset.euDefinitionInit) return;
      node.dataset.euDefinitionInit = '1';
      node.classList.add('has-definition');
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.addEventListener('click', function() {
        showDefinitionModal(node.textContent.trim(), node.dataset.definition);
      });
      node.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showDefinitionModal(node.textContent.trim(), node.dataset.definition);
        }
      });
    });
  }

  var _modal = null;

  function ensureModal() {
    if (_modal) return _modal;
    const overlay = document.createElement('div');
    overlay.className = 'eu-mapa-definition-modal';
    const panel   = document.createElement('div');
    panel.className = 'eu-mapa-definition-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'eu-mapa-definition-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '\xD7';
    const titleEl = document.createElement('h3');
    titleEl.className = 'eu-mapa-definition-title';
    const textEl = document.createElement('p');
    textEl.className = 'eu-mapa-definition-text';
    panel.appendChild(closeBtn);
    panel.appendChild(titleEl);
    panel.appendChild(textEl);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    function hide() { overlay.classList.remove('eu-visible'); }
    closeBtn.addEventListener('click', hide);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) hide(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hide(); });
    _modal = { overlay: overlay, titleEl: titleEl, textEl: textEl };
    return _modal;
  }

  function showDefinitionModal(title, text) {
    if (!text) return;
    var m = ensureModal();
    m.titleEl.textContent = title || 'Detalle';
    m.textEl.textContent  = text;
    m.overlay.classList.add('eu-visible');
  }

  // ── Export HTML builder ──────────────────────────────────────────────────

  function buildMapExportHtml(caption, treeHtml) {
    var safe = esc(caption);
    var now  = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    return '<!doctype html>\n'
      + '<html lang="es">\n<head>\n'
      + '  <meta charset="utf-8">\n'
      + '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '  <title>' + safe + ' \u2014 Mapa Sin\u00f3ptico</title>\n'
      + '  <style>' + MAP_EXPORT_CSS + '</style>\n'
      + '</head>\n<body>\n'
      + '  <div class="eu-mapa-sinoptico-export">\n'
      + '    <h1 class="eu-export-title">' + safe + '</h1>\n'
      + '    <p class="eu-export-subtitle">Mapa Sin\u00f3ptico \u00b7 Enciclopedia Universitaria \u00b7 ' + esc(now) + '</p>\n'
      + '    <div class="eu-mapa-sinoptico-wrapper">\n      ' + treeHtml + '\n    </div>\n'
      + '    <p class="eu-export-footer">Generado el ' + esc(now) + ' desde Enciclopedia Universitaria</p>\n'
      + '  </div>\n'
      /* Inline definition modal for the exported file */
      + '  <div class="eu-export-definition-box" id="euDefBox">\n'
      + '    <div class="eu-export-definition-panel">\n'
      + '      <button class="eu-export-definition-close" onclick="document.getElementById(\'euDefBox\').classList.remove(\'open\')">\xD7</button>\n'
      + '      <div class="eu-export-definition-title" id="euDefTitle"></div>\n'
      + '      <div class="eu-export-definition-text"  id="euDefText"></div>\n'
      + '    </div>\n  </div>\n'
      + '  <script>\n'
      + '  (function(){\n'
      + '    var box=document.getElementById(\'euDefBox\');\n'
      + '    document.querySelectorAll(\'.eu-mapa-sinoptico-content[data-definition]\').forEach(function(el){\n'
      + '      el.style.cursor=\'pointer\';\n'
      + '      el.addEventListener(\'click\',function(){\n'
      + '        document.getElementById(\'euDefTitle\').textContent=el.textContent.trim();\n'
      + '        document.getElementById(\'euDefText\').textContent=el.dataset.definition;\n'
      + '        box.classList.add(\'open\');\n'
      + '      });\n'
      + '    });\n'
      + '    box.addEventListener(\'click\',function(e){if(e.target===box)box.classList.remove(\'open\');});\n'
      + '    document.addEventListener(\'keydown\',function(e){if(e.key===\'Escape\')box.classList.remove(\'open\');});\n'
      + '  })();\n'
      + '  <\/script>\n'
      + '</body>\n</html>';
  }

  function downloadMapFile(html, caption) {
    var fileName = 'mapa-sinoptico-' + slugify(caption) + '.html';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  function parseLines(text) {
    var edges = [], nodes = new Set(), definitions = {};
    text.split('\n').forEach(function(raw) {
      var line = raw.trim();
      if (!line) return;
      var parts = line.split(/-+>/).map(function(p){ return p.trim(); }).filter(Boolean);
      if (parts.length === 2) {
        var parent = extractNodeData(parts[0], definitions);
        var child  = extractNodeData(parts[1], definitions);
        edges.push({ parent: parent, child: child });
        nodes.add(parent);
        nodes.add(child);
      }
    });
    return { edges: edges, nodes: Array.from(nodes), definitions: definitions };
  }

  function extractNodeData(value, definitions) {
    var match = value.match(/^(.*?)\s*\{\s*([^}]+)\s*\}\s*$/);
    if (match) {
      var name = match[1].trim();
      if (name) { definitions[name] = match[2].trim(); return name; }
    }
    return value;
  }

  function buildHierarchy(edges, nodes) {
    var childrenMap = new Map(), indegree = new Map();
    nodes.forEach(function(n){ childrenMap.set(n, []); indegree.set(n, 0); });
    edges.forEach(function(e) {
      if (!childrenMap.has(e.parent)) childrenMap.set(e.parent, []);
      childrenMap.get(e.parent).push(e.child);
      indegree.set(e.child, (indegree.get(e.child) || 0) + 1);
      if (!indegree.has(e.parent)) indegree.set(e.parent, 0);
    });
    var roots = nodes.filter(function(n){ return (indegree.get(n) || 0) === 0; });
    return { roots: roots, childrenMap: childrenMap };
  }

  function parseColorMap(payload) {
    if (!payload) return {};
    try { var v = JSON.parse(payload); return (v && typeof v === 'object') ? v : {}; } catch(e) { return {}; }
  }

  function parseNodeSummaries(payload) {
    if (!payload) return {};
    try { var v = JSON.parse(payload); return (v && typeof v === 'object') ? v : {}; } catch(e) { return {}; }
  }

  function ensureNodeColors(container, baseMap, nodes) {
    var map = Object.assign({}, baseMap || {});
    var idx = 0;
    nodes.forEach(function(n) {
      if (!map[n]) map[n] = DEFAULT_NODE_PALETTE[idx++ % DEFAULT_NODE_PALETTE.length];
    });
    try { container.dataset.nodeColors = JSON.stringify(map); } catch(e) {}
    return map;
  }

  function getContrastColor(hex) {
    var c = String(hex || '').replace('#', '');
    if (c.length < 6) return '#fff';
    var r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
    return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5 ? '#111827' : '#ffffff';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function slugify(v) {
    return String(v || 'mapa')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'')
      .toLowerCase() || 'mapa-sinoptico';
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function(){ initMapas(); });
  window.addEventListener('eu:content-loaded', function(){ initMapas(); });
  initMapas();

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function(mutations) {
      mutations.forEach(function(record) {
        record.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches('.eu-mapa-sinoptico:not([data-mapa-init])')) renderMapa(node);
          if (node.querySelectorAll) node.querySelectorAll('.eu-mapa-sinoptico:not([data-mapa-init])').forEach(renderMapa);
        });
      });
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
})();
