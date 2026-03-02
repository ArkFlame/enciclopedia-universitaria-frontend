/**
 * nanami.js
 * Nanami AI Chat Component — floating, persistent, modular.
 * Depends on: nanami-prompts.js (loaded before this file)
 *
 * Usage: include this script + nanami.css. Auto-initializes.
 */

(function () {
  'use strict';

  const BASE_URL    = () => window.EU_CONFIG?.backendUrl || window.location.origin;
  const P           = () => window.NanamiPrompts;
  const STORAGE_KEY  = 'nanami_history';
  const MAX_HISTORY  = 60;
  const SEND_HISTORY = 10;

  // Resolve asset path from script src
  const BASE_PATH = (() => {
    for (const s of document.querySelectorAll('script[src*="nanami"]')) {
      const m = s.src.match(/(.*?)\/assets\/js\/nanami/);
      if (m) return m[1];
    }
    return '';
  })();

  // ─── State ─────────────────────────────────────────────────────
  let isOpen       = false;
  let isThinking   = false;
  let attachments  = [];
  let articleCtx   = null;   // { title, content }
  let abortCtrl    = null;
  let streamingDiv = null;   // current streaming AI message div
  let streamingText = '';    // accumulated streamed text

  // ─── DOM refs ──────────────────────────────────────────────────
  let $win, $msgs, $textarea, $sendBtn, $attachBtn, $fileInput,
      $contextBanner, $contextBannerText, $attachmentsRow, $fab;

  // ─── History ───────────────────────────────────────────────────
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function saveHistory(msgs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY))); }
    catch {}
  }
  function clearHistory() { localStorage.removeItem(STORAGE_KEY); }

  // ─── Mount ─────────────────────────────────────────────────────
  function mount() {
    // FAB
    const fab = document.createElement('div');
    fab.className = 'nanami-fab';
    fab.id = 'nanamiiFab';
    fab.innerHTML = `
      <div class="nanami-fab-tooltip" id="nanamiTooltip">${P().FAB_TOOLTIP}</div>
      <button class="nanami-fab-btn" id="nanamiiFabBtn" aria-label="Abrir Nanami AI">
        <img src="${BASE_PATH}/assets/img/nanami.jpg" alt="Nanami AI" loading="lazy">
      </button>`;
    document.body.appendChild(fab);
    $fab = fab;

    // Chat window
    const win = document.createElement('div');
    win.className = 'nanami-window';
    win.id = 'nanamiWindow';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat Nanami AI');
    win.innerHTML = `
      <div class="nanami-header">
        <img src="${BASE_PATH}/assets/img/nanami.jpg" class="nanami-header-avatar" alt="Nanami">
        <div class="nanami-header-info">
          <div class="nanami-header-name">Nanami AI</div>
          <div class="nanami-header-status">En línea</div>
        </div>
        <div class="nanami-header-actions">
          <button class="nanami-header-btn" id="nanamiClearBtn" title="Limpiar chat">
            <i class="bi bi-trash3"></i>
          </button>
          <button class="nanami-header-btn" id="nanamiCloseBtn" title="Cerrar">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      <div class="nanami-context-banner" id="nanamiContextBanner" style="display:none">
        <i class="bi bi-book-half"></i>
        <span id="nanamiContextText">Leyendo artículo</span>
      </div>

      <div class="nanami-messages" id="nanamiMessages"></div>

      <div class="nanami-input-area">
        <div class="nanami-attachments" id="nanamiAttachments"></div>
        <div class="nanami-input-row">
          <button class="nanami-attach-btn" id="nanamiAttachBtn" title="Adjuntar archivo">
            <i class="bi bi-plus-lg"></i>
          </button>
          <textarea class="nanami-textarea" id="nanamiTextarea"
                    placeholder="Pregúntame algo… Miau 🐱"
                    rows="1" maxlength="2000"
                    aria-label="Mensaje para Nanami"></textarea>
          <button class="nanami-send-btn" id="nanamiSendBtn" title="Enviar" disabled>
            <i class="bi bi-arrow-up"></i>
          </button>
        </div>
        <input type="file" id="nanamiFileInput" class="nanami-file-input"
               accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp" multiple>
      </div>`;

    document.body.appendChild(win);

    $win               = win;
    $msgs              = win.querySelector('#nanamiMessages');
    $textarea          = win.querySelector('#nanamiTextarea');
    $sendBtn           = win.querySelector('#nanamiSendBtn');
    $attachBtn         = win.querySelector('#nanamiAttachBtn');
    $fileInput         = win.querySelector('#nanamiFileInput');
    $contextBanner     = win.querySelector('#nanamiContextBanner');
    $contextBannerText = win.querySelector('#nanamiContextText');
    $attachmentsRow    = win.querySelector('#nanamiAttachments');

    bindEvents();
    detectArticleContext();
    renderHistory();
  }

  // ─── Events ────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('nanamiiFabBtn').addEventListener('click', toggleChat);

    $win.querySelector('#nanamiCloseBtn').addEventListener('click', () => setOpen(false));

    $win.querySelector('#nanamiClearBtn').addEventListener('click', () => {
      if (confirm('¿Limpiar todo el historial del chat?')) {
        clearHistory();
        renderHistory();
      }
    });

    $textarea.addEventListener('input', () => {
      $textarea.style.height = 'auto';
      $textarea.style.height = Math.min($textarea.scrollHeight, 100) + 'px';
      $sendBtn.disabled = !$textarea.value.trim() && !attachments.length;
    });

    $textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!$sendBtn.disabled) sendMessage();
      }
    });

    $sendBtn.addEventListener('click', sendMessage);
    $attachBtn.addEventListener('click', () => $fileInput.click());
    $fileInput.addEventListener('change', handleFiles);

    // Show tooltip on first load
    const tooltip = document.getElementById('nanamiTooltip');
    setTimeout(() => {
      tooltip?.classList.add('show');
      setTimeout(() => tooltip?.classList.remove('show'), 3500);
    }, 1800);
  }

  // ─── Open / Close ───────────────────────────────────────────────
  function toggleChat() { setOpen(!isOpen); }

  function setOpen(open) {
    isOpen = open;
    $win.classList.toggle('open', open);
    if (open) {
      $textarea.focus();
      scrollToBottom();
    }
  }

  window.NanamiChat = { open: () => setOpen(true), close: () => setOpen(false), toggle: toggleChat };

  // ─── Article context detection ─────────────────────────────────
  function detectArticleContext() {
    if (!document.getElementById('articlePage') && !document.getElementById('articleContent')) return;

    const tryGet = () => {
      const titleEl   = document.querySelector('.eu-article-title, h1.eu-article-title, #articleTitle');
      const contentEl = document.getElementById('articleContent');
      if (!titleEl || !contentEl) return false;
      const title   = titleEl.textContent.trim();
      if (!title) return false;
      articleCtx = { title, content: contentEl.textContent.trim().slice(0, 3000) };
      $contextBanner.style.display = 'flex';
      $contextBannerText.textContent = `Leyendo artículo: ${title}`;
      return true;
    };

    if (!tryGet()) {
      const iv = setInterval(() => { if (tryGet()) clearInterval(iv); }, 500);
      setTimeout(() => clearInterval(iv), 10000);
    }
  }

  // ─── File handling ──────────────────────────────────────────────
  function handleFiles(e) {
    Array.from(e.target.files || []).forEach(file => {
      if (file.size > 2 * 1024 * 1024) { alert(`Archivo demasiado grande: ${file.name} (máx 2MB)`); return; }
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = ev => { attachments.push({ name: file.name, type: file.type, content: ev.target.result.split(',')[1], isImage: true }); renderAttachments(); };
        reader.readAsDataURL(file);
      } else {
        reader.onload = ev => { attachments.push({ name: file.name, type: file.type || 'text/plain', content: ev.target.result, isImage: false }); renderAttachments(); };
        reader.readAsText(file);
      }
    });
    $fileInput.value = '';
  }

  function renderAttachments() {
    $attachmentsRow.innerHTML = attachments.map((a, i) => `
      <div class="nanami-attachment-chip">
        <i class="bi ${a.isImage ? 'bi-image' : 'bi-file-text'}"></i>
        <span title="${escHtml(a.name)}">${escHtml(a.name)}</span>
        <button onclick="window._nanamiRemoveAttachment(${i})" title="Quitar"><i class="bi bi-x"></i></button>
      </div>`).join('');
    $sendBtn.disabled = !$textarea.value.trim() && !attachments.length;
  }

  window._nanamiRemoveAttachment = (i) => { attachments.splice(i, 1); renderAttachments(); };

  // ─── Render history ─────────────────────────────────────────────
  function renderHistory() {
    $msgs.innerHTML = '';
    const history = loadHistory();

    if (!history.length) {
      appendEmptyState();
      return;
    }

    history.forEach(m => {
      if      (m.role === 'user')      appendUserMessage(m.content, false);
      else if (m.role === 'assistant') appendAIMessage(m.content, m.articleLinks || [], false);
      else if (m.role === 'tool')      appendToolMsg(m.tool, m.icon, m.message, m.state, false);
    });

    scrollToBottom();
  }

  // ─── Empty state ────────────────────────────────────────────────
  function appendEmptyState() {
    const suggestions = P().getSuggestions(!!articleCtx);
    const div = document.createElement('div');
    div.className = 'nanami-empty';
    div.id = 'nanamiEmpty';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami.jpg" alt="Nanami">
      <div class="nanami-empty-title">¡Hola! Soy Nanami AI 🐱</div>
      <div class="nanami-empty-sub">Tu asistente de la Enciclopedia Universitaria. ¡Pregúntame lo que quieras!</div>
      <div class="nanami-suggestions">
        ${suggestions.map(s => `<button class="nanami-suggestion" onclick="window._nanamiSuggest(${JSON.stringify(s)})">${escHtml(s)}</button>`).join('')}
      </div>`;
    $msgs.appendChild(div);
  }

  window._nanamiSuggest = (text) => {
    $textarea.value = text;
    $textarea.dispatchEvent(new Event('input'));
    sendMessage();
  };

  // ─── Message renderers ──────────────────────────────────────────

  function appendUserMessage(text, save = true) {
    document.getElementById('nanamiEmpty')?.remove();
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--user nanami-fade-in';
    div.innerHTML = `<div class="nanami-msg-bubble">${escHtml(text)}</div>`;
    $msgs.appendChild(div);
    scrollToBottom();
    if (save) { const h = loadHistory(); h.push({ role: 'user', content: text }); saveHistory(h); }
  }

  /**
   * Append a finished AI message with optional article links.
   * @param {string}  text         - Markdown text
   * @param {Array}   articleLinks - [{ slug, title }]
   * @param {boolean} save
   */
  function appendAIMessage(text, articleLinks = [], save = true) {
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--ai nanami-fade-in';

    const linksHtml = buildArticleLinksHtml(articleLinks);

    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami.jpg" class="nanami-msg-avatar" alt="Nanami">
      <div class="nanami-msg-body">
        <div class="nanami-msg-name">Nanami AI</div>
        <div class="nanami-msg-text">${P().markdownToHtml(text)}</div>
        ${linksHtml}
      </div>`;
    $msgs.appendChild(div);
    scrollToBottom();
    if (save) {
      const h = loadHistory();
      h.push({ role: 'assistant', content: text, articleLinks });
      saveHistory(h);
    }
  }

  /**
   * Append a tool progress message (start, done, skip, error).
   * state: 'running' | 'done' | 'skip' | 'error'
   */
  function appendToolMsg(toolName, icon, message, state = 'running', save = true) {
    const div = document.createElement('div');
    div.className = `nanami-msg nanami-msg--tool nanami-fade-in nanami-tool-${state}`;
    const spinnerHtml = state === 'running'
      ? `<span class="nanami-tool-spinner"></span>`
      : '';
    div.innerHTML = `
      <span class="nanami-tool-icon">${icon || '⚙️'}</span>
      ${spinnerHtml}
      <span class="nanami-tool-text">${escHtml(message)}</span>`;
    $msgs.appendChild(div);
    scrollToBottom();
    if (save) {
      const h = loadHistory();
      h.push({ role: 'tool', tool: toolName, icon, message, state });
      saveHistory(h);
    }
    return div;
  }

  /** Build a streaming AI message shell — returns { div, textEl } */
  function createStreamingMessage() {
    document.getElementById('nanamiEmpty')?.remove();
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--ai nanami-fade-in';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami.jpg" class="nanami-msg-avatar" alt="Nanami">
      <div class="nanami-msg-body">
        <div class="nanami-msg-name">Nanami AI</div>
        <div class="nanami-msg-text nanami-streaming-text"></div>
      </div>`;
    $msgs.appendChild(div);
    scrollToBottom();
    return { div, textEl: div.querySelector('.nanami-streaming-text') };
  }

  /** Build the gray article-links footer HTML */
  function buildArticleLinksHtml(links) {
    if (!links || !links.length) return '';
    const FRONTEND_BASE = (window.EU_CONFIG?.baseUrl || window.location.origin);
    const items = links.map(l => {
      const url = `${FRONTEND_BASE}/articulo.html?slug=${encodeURIComponent(l.slug)}`;
      return `<a href="${url}" class="nanami-article-link" target="_blank" rel="noopener"
                 title="${escHtml(l.title)}">
                <i class="bi bi-box-arrow-up-right"></i> ${escHtml(l.title)}
              </a>`;
    }).join('');
    return `<div class="nanami-article-links">${items}</div>`;
  }

  // ─── Send message ───────────────────────────────────────────────
  async function sendMessage() {
    const text = $textarea.value.trim();
    if (!text && !attachments.length) return;
    if (isThinking) return;

    let fullMessage = text;
    if (attachments.length) {
      fullMessage += attachments.map(a =>
        a.isImage
          ? `\n[Imagen adjunta: ${a.name}]`
          : `\n\n--- Archivo: ${a.name} ---\n${a.content.slice(0, 1500)}\n---`
      ).join('');
    }

    $textarea.value = '';
    $textarea.style.height = 'auto';
    attachments = [];
    $attachmentsRow.innerHTML = '';
    $sendBtn.disabled = true;

    appendUserMessage(text);
    isThinking = true;
    setInputDisabled(true);

    const history = loadHistory()
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-SEND_HISTORY);

    try {
      await streamFromBackend(fullMessage, history);
    } catch (err) {
      appendAIMessage(`Lo siento, ocurrió un error. Inténtalo de nuevo. *(${escHtml(err.message)})*`);
    } finally {
      isThinking = false;
      setInputDisabled(false);
      streamingDiv  = null;
      streamingText = '';
    }
  }

  function setInputDisabled(disabled) {
    $textarea.disabled = disabled;
    $sendBtn.disabled  = disabled;
    $attachBtn.disabled = disabled;
  }

  // ─── SSE streaming ──────────────────────────────────────────────
  async function streamFromBackend(message, history) {
    abortCtrl = new AbortController();

    const res = await fetch(`${BASE_URL()}/api/ai/chat/stream`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('eu_token')
          ? { Authorization: `Bearer ${localStorage.getItem('eu_token')}` }
          : {})
      },
      body:   JSON.stringify({
        message,
        history,
        articleContext: articleCtx?.content || null,
        articleTitle:   articleCtx?.title   || null
      }),
      signal: abortCtrl.signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let finalArticleLinks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        if (event.type === 'answer') finalArticleLinks = event.articleLinks || [];
        handleSSEEvent(event);
      }
    }

    // Finalise streaming message — append article links & save
    if (streamingDiv && streamingText) {
      const linksHtml = buildArticleLinksHtml(finalArticleLinks);
      if (linksHtml) {
        const body = streamingDiv.querySelector('.nanami-msg-body');
        const existing = body.querySelector('.nanami-article-links');
        if (!existing) {
          const linkDiv = document.createElement('div');
          linkDiv.className = 'nanami-article-links nanami-fade-in';
          linkDiv.innerHTML = buildArticleLinksHtml(finalArticleLinks).replace('<div class="nanami-article-links">', '').replace('</div>', '');
          body.appendChild(linkDiv);
        }
      }
      // Persist to history
      const h = loadHistory();
      h.push({ role: 'assistant', content: streamingText, articleLinks: finalArticleLinks });
      saveHistory(h);
      scrollToBottom();
    }
  }

  // ─── SSE event handler ──────────────────────────────────────────
  function handleSSEEvent(event) {
    switch (event.type) {

      case 'tool_start':
        appendToolMsg(event.tool, P().getToolIcon(event.tool), event.message, 'running');
        break;

      case 'tool_done':
        appendToolMsg(event.tool, P().getToolIcon(event.tool), `${event.resultSummary}`, 'done');
        break;

      case 'tool_skip':
        appendToolMsg(event.tool, '⏭️', event.message, 'skip');
        break;

      case 'tool_error':
        appendToolMsg(event.tool || 'tool', '⚠️', event.message, 'error');
        break;

      case 'chunk':
        // Append token to streaming message
        if (!streamingDiv) {
          const { div, textEl } = createStreamingMessage();
          streamingDiv  = div;
          streamingText = '';
          // Store textEl reference on the div
          div._textEl = textEl;
        }
        streamingText += event.content;
        // Render markdown incrementally
        streamingDiv._textEl.innerHTML = P().markdownToHtml(streamingText);
        scrollToBottom();
        break;

      case 'answer':
        // Final answer arrives — if we streamed it via chunks, just finalize
        if (!streamingDiv) {
          // Fallback: no chunks received, render whole answer at once
          appendAIMessage(event.content, event.articleLinks || []);
          streamingText = event.content;
        }
        break;

      case 'error':
        appendAIMessage(`⚠️ Error: ${event.message}`);
        break;
    }
  }

  // ─── Scroll ─────────────────────────────────────────────────────
  function scrollToBottom() {
    requestAnimationFrame(() => { $msgs.scrollTop = $msgs.scrollHeight; });
  }

  // ─── Utils ──────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ─── Init ────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();
