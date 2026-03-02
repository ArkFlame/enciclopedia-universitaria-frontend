/**
 * nanami.js
 * Nanami AI Chat Component — floating, persistent, modular.
 * Depends on: nanami-prompts.js
 *
 * Changes:
 *   1. Real streaming from backend (chunk events from OpenRouter).
 *   2. Blinking cursor only appears while tokens are arriving, removed on finish.
 *   3. FAB button shows nanami.mp4 (looping, no controls) while processing.
 */

(function () {
  'use strict';

  const BASE_URL     = () => window.EU_CONFIG?.backendUrl || window.location.origin;
  const P            = () => window.NanamiPrompts;
  const STORAGE_KEY  = 'nanami_history';
  const MAX_HISTORY  = 60;
  const SEND_HISTORY = 10;

  const BASE_PATH = (() => {
    for (const s of document.querySelectorAll('script[src*="nanami"]')) {
      const m = s.src.match(/(.*?)\/assets\/js\/nanami/);
      if (m) return m[1];
    }
    return '';
  })();

  // ─── State ─────────────────────────────────────────────────────
  let isOpen        = false;
  let isThinking    = false;
  let attachments   = [];
  let articleCtx    = null;
  let abortCtrl     = null;
  let streamingDiv  = null;   // live message div being built
  let streamingText = '';     // accumulated text during streaming
  let thinkingDiv   = null;   // "Pensando..." placeholder

  // ─── DOM refs ──────────────────────────────────────────────────
  let $win, $msgs, $textarea, $sendBtn, $attachBtn, $fileInput,
      $contextBanner, $contextBannerText, $attachmentsRow,
      $fabBtn,          // the clickable FAB button element
      $headerAvatarWrap; // header avatar wrapper (img + video)

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
    // FAB — contains both the static image and the processing video
    const fab = document.createElement('div');
    fab.className = 'nanami-fab';
    fab.id = 'nanamiiFab';
    fab.innerHTML = `
      <div class="nanami-fab-tooltip" id="nanamiTooltip">${P().FAB_TOOLTIP}</div>
      <button class="nanami-fab-btn" id="nanamiiFabBtn" aria-label="Abrir Nanami AI">
        <img  class="nanami-fab-img"   src="${BASE_PATH}/assets/img/nanami-profile.jpg" alt="Nanami AI" loading="lazy">
        <video class="nanami-fab-video" id="nanamiiFabVideo"
               autoplay loop muted playsinline preload="auto"
               poster="${BASE_PATH}/assets/img/nanami-profile.jpg">
          <source src="${BASE_PATH}/assets/img/nanami.mp4" type="video/mp4">
        </video>
      </button>`;
    document.body.appendChild(fab);
    $fabBtn = fab.querySelector('#nanamiiFabBtn');

    // ── Video mobile compatibility ──────────────────────────────────────────
    // Some mobile browsers block autoplay or cannot play mp4 inline.
    // On any error we hide the video so the static image shows as fallback.
    const $fabVideo = fab.querySelector('#nanamiiFabVideo');
    if ($fabVideo) {
      const hideVideo = () => {
        $fabVideo.style.display = 'none';
        $fabVideo.style.opacity = '0';
        console.warn('[Nanami] FAB video failed to play — falling back to static image');
      };

      // Check if browser can play mp4 at all
      if (!$fabVideo.canPlayType || $fabVideo.canPlayType('video/mp4') === '') {
        console.warn('[Nanami] Browser cannot play video/mp4 — using static image fallback');
        hideVideo();
      } else {
        $fabVideo.addEventListener('error', (e) => {
          console.error('[Nanami] FAB video error:', e.target && e.target.error ? e.target.error.message : 'unknown error');
          hideVideo();
        });

        // On iOS autoplay with muted may not fire 'error' — also catch stall
        $fabVideo.addEventListener('stalled', () => {
          console.warn('[Nanami] FAB video stalled');
        });

        // Try to force-play (needed on some mobile browsers)
        const playPromise = $fabVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            if (err.name === 'NotAllowedError') {
              // Autoplay blocked by policy — normal on mobile, video shows when processing
              console.info('[Nanami] FAB video autoplay blocked by browser policy (normal on mobile)');
            } else if (err.name === 'NotSupportedError') {
              console.warn('[Nanami] FAB video not supported — falling back to static image');
              hideVideo();
            } else {
              console.error('[Nanami] FAB video play() error:', err.name, err.message);
              hideVideo();
            }
          });
        }
      }
    }

    // Chat window
    const win = document.createElement('div');
    win.className = 'nanami-window';
    win.id = 'nanamiWindow';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat Nanami AI');
    win.innerHTML = `
      <div class="nanami-header">
        <div class="nanami-header-avatar-wrap" id="nanamiHeaderAvatarWrap">
          <img src="${BASE_PATH}/assets/img/nanami-profile.jpg" class="nanami-header-avatar nanami-header-avatar-img" alt="Nanami">
          <video class="nanami-header-avatar nanami-header-avatar-video"
                 autoplay loop muted playsinline preload="auto"
                 poster="${BASE_PATH}/assets/img/nanami-profile.jpg">
            <source src="${BASE_PATH}/assets/img/nanami.mp4" type="video/mp4">
          </video>
        </div>
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
    $headerAvatarWrap  = win.querySelector('#nanamiHeaderAvatarWrap');

    bindEvents();
    detectArticleContext();
    renderHistory();
  }

  // ─── FAB processing state ──────────────────────────────────────
  // Swaps between static image and looping video while AI is working.
  // Applies to both the FAB button and the header avatar.
  function setFabProcessing(active) {
    $fabBtn.classList.toggle('nanami-fab-btn--processing', active);
    if ($headerAvatarWrap) {
      $headerAvatarWrap.classList.toggle('nanami-header-avatar-wrap--processing', active);
    }
  }

  // ─── Events ────────────────────────────────────────────────────
  function bindEvents() {
    $fabBtn.addEventListener('click', toggleChat);

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

    $textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!$sendBtn.disabled) sendMessage(); }
    });

    $sendBtn.addEventListener('click', sendMessage);
    $attachBtn.addEventListener('click', () => $fileInput.click());
    $fileInput.addEventListener('change', handleFiles);

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
    // On mobile: hide the FAB while chat window is open so it doesn't overlap
    const fab = document.getElementById('nanamiiFab');
    if (fab) fab.classList.toggle('nanami-fab--chat-open', open);
    if (open) { $textarea.focus(); scrollToBottom(); }
  }
  window.NanamiChat = { open: () => setOpen(true), close: () => setOpen(false), toggle: toggleChat };

  // ─── Article context ────────────────────────────────────────────
  function detectArticleContext() {
    if (!document.getElementById('articlePage') && !document.getElementById('articleContent')) return;
    const tryGet = () => {
      const titleEl   = document.querySelector('.eu-article-title, h1.eu-article-title, #articleTitle');
      const contentEl = document.getElementById('articleContent');
      if (!titleEl || !contentEl) return false;
      const title = titleEl.textContent.trim();
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
  window._nanamiRemoveAttachment = i => { attachments.splice(i, 1); renderAttachments(); };

  // ─── Render history ─────────────────────────────────────────────
  function renderHistory() {
    $msgs.innerHTML = '';
    const history = loadHistory();
    if (!history.length) { appendEmptyState(); return; }
    history.forEach(m => {
      if      (m.role === 'user')      appendUserMessage(m.content, false);
      else if (m.role === 'assistant') appendAIMessage(m.content, m.articleLinks || [], false);
      else if (m.role === 'tool')      appendToolMsg(m.tool, m.icon, m.message, m.state, false);
    });
    scrollToBottom();
  }

  // ─── Empty state ────────────────────────────────────────────────
  function appendEmptyState() {
    const div = document.createElement('div');
    div.className = 'nanami-empty';
    div.id = 'nanamiEmpty';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami-profile.jpg" alt="Nanami">
      <div class="nanami-empty-title">¡Hola! Soy Nanami AI 🐱</div>
      <div class="nanami-empty-sub">Tu asistente de la Enciclopedia Universitaria. ¡Pregúntame lo que quieras!</div>
      <div class="nanami-suggestions">
        ${P().getSuggestions(!!articleCtx).map(s =>
          `<button class="nanami-suggestion" onclick="window._nanamiSuggest(${JSON.stringify(s)})">${escHtml(s)}</button>`
        ).join('')}
      </div>`;
    $msgs.appendChild(div);
  }
  window._nanamiSuggest = text => {
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

  function appendAIMessage(text, articleLinks = [], save = true) {
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--ai nanami-fade-in';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami-profile.jpg" class="nanami-msg-avatar" alt="Nanami">
      <div class="nanami-msg-body">
        <div class="nanami-msg-name">Nanami AI</div>
        <div class="nanami-msg-text">${P().markdownToHtml(text)}</div>
        ${buildArticleLinksHtml(articleLinks)}
      </div>`;
    $msgs.appendChild(div);
    scrollToBottom();
    if (save) { const h = loadHistory(); h.push({ role: 'assistant', content: text, articleLinks }); saveHistory(h); }
  }

  function appendToolMsg(toolName, icon, message, state = 'running', save = true) {
    const div = document.createElement('div');
    div.className = `nanami-msg nanami-msg--tool nanami-fade-in nanami-tool-${state}`;
    div.innerHTML = `
      <span class="nanami-tool-icon">${icon || '⚙️'}</span>
      ${state === 'running' ? '<span class="nanami-tool-spinner"></span>' : ''}
      <span class="nanami-tool-text">${escHtml(message)}</span>`;
    $msgs.appendChild(div);
    scrollToBottom();
    if (save) { const h = loadHistory(); h.push({ role: 'tool', tool: toolName, icon, message, state }); saveHistory(h); }
    return div;
  }

  function showThinkingMessage() {
    if (thinkingDiv) return;
    thinkingDiv = appendToolMsg('thinking', '💭', 'Pensando…', 'running', false);
  }

  function clearThinkingMessage() {
    if (thinkingDiv) {
      thinkingDiv.remove();
      thinkingDiv = null;
    }
  }

  /**
   * Create the streaming message shell.
   * The cursor blink is added via `.nanami-streaming-active` and removed when done.
   */
  function createStreamingMessage() {
    document.getElementById('nanamiEmpty')?.remove();
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--ai nanami-fade-in';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami-profile.jpg" class="nanami-msg-avatar" alt="Nanami">
      <div class="nanami-msg-body">
        <div class="nanami-msg-name">Nanami AI</div>
        <div class="nanami-msg-text nanami-streaming-active"></div>
      </div>`;
    $msgs.appendChild(div);
    scrollToBottom();
    return { div, textEl: div.querySelector('.nanami-streaming-active') };
  }

  /** Remove the blinking cursor from a finished streaming message. */
  function finalizeStreamingMessage(div, articleLinks = []) {
    const textEl = div.querySelector('.nanami-streaming-active');
    if (textEl) textEl.classList.remove('nanami-streaming-active');

    const body = div.querySelector('.nanami-msg-body');
    if (body && articleLinks.length && !body.querySelector('.nanami-article-links')) {
      const linkDiv = document.createElement('div');
      linkDiv.className = 'nanami-article-links nanami-fade-in';
      linkDiv.innerHTML = buildArticleLinksInner(articleLinks);
      body.appendChild(linkDiv);
    }
  }

  function buildArticleLinksHtml(links) {
    if (!links || !links.length) return '';
    return `<div class="nanami-article-links">${buildArticleLinksInner(links)}</div>`;
  }

  function buildArticleLinksInner(links) {
    const base = window.EU_CONFIG?.baseUrl || window.location.origin;
    return links.map(l => {
      const url = `${base}/articulo.html?slug=${encodeURIComponent(l.slug)}`;
      return `<a href="${url}" class="nanami-article-link" target="_blank" rel="noopener" title="${escHtml(l.title)}">
                <i class="bi bi-box-arrow-up-right"></i> ${escHtml(l.title)}
              </a>`;
    }).join('');
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
    showThinkingMessage();
    setFabProcessing(true);
    setInputDisabled(true);

    const history = loadHistory()
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-SEND_HISTORY);

    try {
      await streamFromBackend(fullMessage, history);
    } catch (err) {
      // Clean up streaming state if error mid-stream
      console.error('[Nanami] sendMessage error:', err.message, err);
      if (streamingDiv) {
        finalizeStreamingMessage(streamingDiv, []);
        streamingDiv = null;
        streamingText = '';
      }
      clearThinkingMessage();
      appendAIMessage(`Lo siento, ocurrió un error. Inténtalo de nuevo. *(${escHtml(err.message)})*`);
    } finally {
      isThinking = false;
      setFabProcessing(false);
      setInputDisabled(false);
      streamingDiv  = null;
      streamingText = '';
      clearThinkingMessage();
    }
  }

  function setInputDisabled(disabled) {
    $textarea.disabled  = disabled;
    $sendBtn.disabled   = disabled;
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
      body: JSON.stringify({
        message,
        history,
        articleContext: articleCtx?.content || null,
        articleTitle:   articleCtx?.title   || null
      }),
      signal: abortCtrl.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      console.error('[Nanami] Stream request failed:', res.status, errText);
      let errMsg;
      try { errMsg = JSON.parse(errText).error; } catch { errMsg = null; }
      throw new Error(errMsg || errText || `HTTP ${res.status}`);
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
        try { event = JSON.parse(raw); } catch (parseErr) {
          console.warn('[Nanami] Failed to parse SSE event:', raw.slice(0, 100), parseErr.message);
          continue;
        }

        if (event.type === 'answer') finalArticleLinks = event.articleLinks || [];
        handleSSEEvent(event);
      }
    }

    // Stream is finished — remove cursor, append links, save
    if (streamingDiv) {
      finalizeStreamingMessage(streamingDiv, finalArticleLinks);
      const h = loadHistory();
      h.push({ role: 'assistant', content: streamingText, articleLinks: finalArticleLinks });
      saveHistory(h);
      scrollToBottom();
    }
  }

  // ─── SSE event handler ──────────────────────────────────────────
  function handleSSEEvent(event) {
    if (event.type !== 'done') clearThinkingMessage();
    switch (event.type) {

      case 'tool_start':
        appendToolMsg(event.tool, P().getToolIcon(event.tool), event.message, 'running');
        break;

      case 'tool_done':
        appendToolMsg(event.tool, P().getToolIcon(event.tool), event.resultSummary, 'done');
        break;

      case 'tool_skip':
        appendToolMsg(event.tool, '⏭️', event.message, 'skip');
        break;

      case 'tool_error':
        appendToolMsg(event.tool || 'tool', '⚠️', event.message, 'error');
        break;

      case 'chunk':
        // First chunk: create the streaming message shell with active cursor
        if (!streamingDiv) {
          const { div, textEl } = createStreamingMessage();
          streamingDiv  = div;
          streamingText = '';
          div._textEl   = textEl;
        }
        streamingText += event.content;
        streamingDiv._textEl.innerHTML = P().markdownToHtml(streamingText);
        scrollToBottom();
        break;

      case 'answer':
        // Final event — if no chunks arrived (fallback), render it all at once
        if (!streamingDiv) {
          appendAIMessage(event.content, event.articleLinks || []);
          streamingText = event.content;
        }
        break;

      case 'error':
        console.error('[Nanami] AI error event from backend:', event.message);
        appendAIMessage(`⚠️ ${event.message}`);
        break;
    }
  }

  // ─── Scroll ─────────────────────────────────────────────────────
  function scrollToBottom() {
    requestAnimationFrame(() => { $msgs.scrollTop = $msgs.scrollHeight; });
  }

  // ─── Utils ──────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ─── Init ────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();
