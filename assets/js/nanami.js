/**
 * nanami.js
 * Nanami AI Chat Component — floating, persistent, modular.
 * Depends on: nanami-prompts.js (loaded before this file)
 *
 * Usage in any HTML page: just include this script + nanami.css.
 * The component auto-initializes and mounts itself.
 */

(function() {
  'use strict';

  const BASE_URL   = () => window.EU_CONFIG?.backendUrl || window.location.origin;
  const P          = () => window.NanamiPrompts;
  const STORAGE_KEY = 'nanami_history';
  const MAX_HISTORY = 60; // messages stored in localStorage
  const SEND_HISTORY = 10; // messages sent to backend (5 exchanges)
  const BASE_PATH  = (() => {
    // Detect Jekyll baseurl from current page
    const scripts = document.querySelectorAll('script[src*="nanami"]');
    for (const s of scripts) {
      const m = s.src.match(/(.*?)\/assets\/js\/nanami/);
      if (m) return m[1];
    }
    return '';
  })();

  // ─── State ──────────────────────────────────────────────────────
  let isOpen        = false;
  let isThinking    = false;
  let attachments   = []; // { name, content (base64 or text), type }
  let articleCtx    = null; // { title, content } from current article
  let abortCtrl     = null; // AbortController for SSE

  // ─── DOM refs (set after mount) ─────────────────────────────────
  let $win, $msgs, $textarea, $sendBtn, $attachBtn, $fileInput,
      $thinkingOverlay, $thinkingMsg, $thinkingVideo, $contextBanner,
      $contextBannerText, $attachmentsRow, $fab;

  // ─── History ────────────────────────────────────────────────────
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveHistory(msgs) {
    const trimmed = msgs.slice(-MAX_HISTORY);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); }
    catch {}
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ─── Render ─────────────────────────────────────────────────────
  function mount() {
    const assetBase = BASE_PATH;

    // FAB
    const fab = document.createElement('div');
    fab.className  = 'nanami-fab';
    fab.id         = 'nanamiiFab';
    fab.innerHTML  = `
      <div class="nanami-fab-tooltip" id="nanamiTooltip">${P().FAB_TOOLTIP}</div>
      <button class="nanami-fab-btn" id="nanamiiFabBtn" aria-label="Abrir chat Nanami AI" title="Nanami AI">
        <img src="${assetBase}/assets/img/nanami.png" alt="Nanami AI" loading="lazy">
      </button>`;
    document.body.appendChild(fab);

    // Chat window
    const win = document.createElement('div');
    win.className = 'nanami-window';
    win.id        = 'nanamiWindow';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat Nanami AI');
    win.innerHTML = `
      <!-- Header -->
      <div class="nanami-header">
        <img src="${assetBase}/assets/img/nanami.png" class="nanami-header-avatar" alt="Nanami">
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

      <!-- Article context banner -->
      <div class="nanami-context-banner" id="nanamiContextBanner" style="display:none">
        <i class="bi bi-book-half"></i>
        <span id="nanamiContextText">Leyendo artículo</span>
      </div>

      <!-- Messages -->
      <div class="nanami-messages" id="nanamiMessages">
        <!-- Thinking overlay (shows during AI processing) -->
        <div class="nanami-thinking-overlay" id="nanamiThinking">
          <div class="nanami-thinking-video-wrap" id="nanamiVideoWrap">
            <video id="nanamiVideo" autoplay loop muted playsinline
                   src="${assetBase}/assets/img/nanami.mp4"
                   style="display:none">
            </video>
            <img id="nanamiVideoFallback"
                 src="${assetBase}/assets/img/nanami.png"
                 alt="Nanami pensando">
          </div>
          <div class="nanami-thinking-msg" id="nanamiThinkingMsg">Pensando…</div>
        </div>
      </div>

      <!-- Input -->
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
               accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
               multiple>
      </div>`;

    document.body.appendChild(win);

    // Cache refs
    $win              = win;
    $fab              = fab;
    $msgs             = win.querySelector('#nanamiMessages');
    $textarea         = win.querySelector('#nanamiTextarea');
    $sendBtn          = win.querySelector('#nanamiSendBtn');
    $attachBtn        = win.querySelector('#nanamiAttachBtn');
    $fileInput        = win.querySelector('#nanamiFileInput');
    $thinkingOverlay  = win.querySelector('#nanamiThinking');
    $thinkingMsg      = win.querySelector('#nanamiThinkingMsg');
    $thinkingVideo    = win.querySelector('#nanamiVideo');
    $contextBanner    = win.querySelector('#nanamiContextBanner');
    $contextBannerText= win.querySelector('#nanamiContextText');
    $attachmentsRow   = win.querySelector('#nanamiAttachments');

    // Try loading video
    const videoEl = $thinkingVideo;
    const fallbackEl = win.querySelector('#nanamiVideoFallback');
    videoEl.addEventListener('canplay', () => {
      videoEl.style.display = 'block';
      if (fallbackEl) fallbackEl.style.display = 'none';
    });
    videoEl.load();

    bindEvents();
    detectArticleContext();
    renderHistory();
  }

  // ─── Events ─────────────────────────────────────────────────────
  function bindEvents() {
    // FAB open
    document.getElementById('nanamiiFabBtn').addEventListener('click', toggleChat);

    // Close
    $win.querySelector('#nanamiCloseBtn').addEventListener('click', () => setOpen(false));

    // Clear history
    $win.querySelector('#nanamiClearBtn').addEventListener('click', () => {
      if (confirm('¿Limpiar todo el historial del chat?')) {
        clearHistory();
        renderHistory();
      }
    });

    // Textarea auto-resize + send enable
    $textarea.addEventListener('input', () => {
      $textarea.style.height = 'auto';
      $textarea.style.height = Math.min($textarea.scrollHeight, 100) + 'px';
      $sendBtn.disabled = !$textarea.value.trim() && !attachments.length;
    });

    // Send on Enter (Shift+Enter = newline)
    $textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!$sendBtn.disabled) sendMessage();
      }
    });

    // Send button
    $sendBtn.addEventListener('click', sendMessage);

    // Attach button
    $attachBtn.addEventListener('click', () => $fileInput.click());

    // File input change
    $fileInput.addEventListener('change', handleFiles);

    // FAB tooltip show on hover
    const tooltip = document.getElementById('nanamiTooltip');
    setTimeout(() => {
      tooltip?.classList.add('show');
      setTimeout(() => tooltip?.classList.remove('show'), 3500);
    }, 1500);
  }

  // ─── Open/Close ─────────────────────────────────────────────────
  function toggleChat() {
    setOpen(!isOpen);
  }

  function setOpen(open) {
    isOpen = open;
    $win.classList.toggle('open', open);
    if (open) {
      $textarea.focus();
      scrollToBottom();
    }
  }

  // Public API
  window.NanamiChat = { open: () => setOpen(true), close: () => setOpen(false), toggle: toggleChat };

  // ─── Detect article context ──────────────────────────────────────
  function detectArticleContext() {
    // Check if we're on an article page
    const articlePage = document.getElementById('articlePage');
    const articleContent = document.getElementById('articleContent');

    if (!articlePage && !articleContent) return;

    // Wait for article to load
    const tryGetArticle = () => {
      const titleEl   = document.querySelector('.eu-article-title, h1.eu-article-title, #articleTitle');
      const contentEl = document.getElementById('articleContent');

      if (!titleEl || !contentEl) return false;

      const title   = titleEl.textContent.trim();
      const content = contentEl.textContent.trim().slice(0, 3000);

      if (!title) return false;

      articleCtx = { title, content };
      $contextBanner.style.display = 'flex';
      $contextBannerText.textContent = `Leyendo artículo: ${title}`;
      return true;
    };

    if (!tryGetArticle()) {
      // Poll until article loads
      const interval = setInterval(() => {
        if (tryGetArticle()) clearInterval(interval);
      }, 500);
      setTimeout(() => clearInterval(interval), 10000);
    }
  }

  // ─── File handling ───────────────────────────────────────────────
  function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB

    files.forEach(file => {
      if (file.size > MAX_SIZE) {
        alert(`Archivo demasiado grande: ${file.name} (máx 2MB)`);
        return;
      }

      const reader = new FileReader();

      if (file.type.startsWith('image/')) {
        reader.onload = (ev) => {
          attachments.push({
            name:    file.name,
            type:    file.type,
            content: ev.target.result.split(',')[1], // base64
            isImage: true
          });
          renderAttachments();
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (ev) => {
          attachments.push({
            name:    file.name,
            type:    file.type || 'text/plain',
            content: ev.target.result,
            isImage: false
          });
          renderAttachments();
        };
        reader.readAsText(file);
      }
    });

    $fileInput.value = '';
  }

  function renderAttachments() {
    $attachmentsRow.innerHTML = attachments.map((a, i) => `
      <div class="nanami-attachment-chip">
        <i class="bi ${a.isImage ? 'bi-image' : 'bi-file-text'}"></i>
        <span title="${a.name}">${a.name}</span>
        <button onclick="window._nanamiRemoveAttachment(${i})" title="Quitar">
          <i class="bi bi-x"></i>
        </button>
      </div>`).join('');

    $sendBtn.disabled = !$textarea.value.trim() && !attachments.length;
  }

  window._nanamiRemoveAttachment = (i) => {
    attachments.splice(i, 1);
    renderAttachments();
  };

  // ─── Render history ──────────────────────────────────────────────
  function renderHistory() {
    const history = loadHistory();

    // Clear messages (keep thinking overlay)
    const msgs = $msgs;
    const thinking = $thinkingOverlay;
    msgs.innerHTML = '';
    msgs.appendChild(thinking);

    if (!history.length) {
      appendEmptyState();
      return;
    }

    history.forEach(m => {
      if (m.role === 'user')      appendUserMessage(m.content, false);
      else if (m.role === 'assistant') appendAIMessage(m.content, false);
      else if (m.role === 'tool') appendToolMessage(m.tool, m.message, m.done, false);
    });

    scrollToBottom();
  }

  // ─── Message rendering ───────────────────────────────────────────
  function appendEmptyState() {
    const suggestions = P().getSuggestions(!!articleCtx);
    const div = document.createElement('div');
    div.className = 'nanami-empty';
    div.id = 'nanamiEmpty';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami.png" alt="Nanami">
      <div class="nanami-empty-title">¡Hola! Soy Nanami AI 🐱</div>
      <div class="nanami-empty-sub">Tu asistente de la Enciclopedia Universitaria. ¡Pregúntame lo que quieras!</div>
      <div class="nanami-suggestions">
        ${suggestions.map(s => `<button class="nanami-suggestion" onclick="window._nanamiSuggest(${JSON.stringify(s)})">${s}</button>`).join('')}
      </div>`;
    $msgs.appendChild(div);
  }

  window._nanamiSuggest = (text) => {
    $textarea.value = text;
    $textarea.dispatchEvent(new Event('input'));
    $textarea.focus();
    sendMessage();
  };

  function appendUserMessage(text, save = true) {
    removeEmptyState();
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--user';
    div.innerHTML = `<div class="nanami-msg-bubble">${escHtml(text)}</div>`;
    $msgs.insertBefore(div, $thinkingOverlay);
    scrollToBottom();

    if (save) {
      const h = loadHistory();
      h.push({ role: 'user', content: text });
      saveHistory(h);
    }
  }

  function appendAIMessage(text, save = true) {
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--ai';
    div.innerHTML = `
      <img src="${BASE_PATH}/assets/img/nanami.png" class="nanami-msg-avatar" alt="Nanami">
      <div class="nanami-msg-body">
        <div class="nanami-msg-name">Nanami AI</div>
        <div class="nanami-msg-text">${P().markdownToHtml(text)}</div>
      </div>`;
    $msgs.insertBefore(div, $thinkingOverlay);
    scrollToBottom();

    if (save) {
      const h = loadHistory();
      h.push({ role: 'assistant', content: text });
      saveHistory(h);
    }
  }

  function appendToolMessage(toolName, message, done = false, save = true) {
    const icon = P().getToolIcon(toolName);
    const div = document.createElement('div');
    div.className = 'nanami-msg nanami-msg--tool';
    div.innerHTML = `
      <div class="nanami-tool-icon">${icon}</div>
      <div class="nanami-tool-text ${done ? 'done' : ''}">${escHtml(message)}</div>`;
    $msgs.insertBefore(div, $thinkingOverlay);
    scrollToBottom();

    if (save) {
      const h = loadHistory();
      h.push({ role: 'tool', tool: toolName, message, done });
      saveHistory(h);
    }
  }

  function removeEmptyState() {
    document.getElementById('nanamiEmpty')?.remove();
  }

  // ─── Send message ────────────────────────────────────────────────
  async function sendMessage() {
    const text = $textarea.value.trim();
    if (!text && !attachments.length) return;
    if (isThinking) return;

    // Build full message with attachments
    let fullMessage = text;
    if (attachments.length) {
      const attText = attachments.map(a => {
        if (a.isImage) return `[Imagen adjunta: ${a.name}]`;
        return `\n\n--- Archivo adjunto: ${a.name} ---\n${a.content.slice(0, 1500)}\n---`;
      }).join('');
      fullMessage = text + attText;
    }

    // Clear input
    $textarea.value = '';
    $textarea.style.height = 'auto';
    attachments = [];
    $attachmentsRow.innerHTML = '';
    $sendBtn.disabled = true;

    // Show user message
    appendUserMessage(text);

    // Start thinking UI
    setThinking(true);

    // Build history for backend
    const history = loadHistory()
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-(SEND_HISTORY));

    try {
      await streamFromBackend(fullMessage, history);
    } catch (err) {
      setThinking(false);
      appendAIMessage(`Lo siento, ocurrió un error. Inténtalo de nuevo. (${err.message})`);
    }
  }

  // ─── SSE streaming ───────────────────────────────────────────────
  async function streamFromBackend(message, history) {
    abortCtrl = new AbortController();

    const body = {
      message,
      history,
      articleContext: articleCtx?.content || null,
      articleTitle:   articleCtx?.title   || null
    };

    const res = await fetch(`${BASE_URL()}/api/ai/chat/stream`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('eu_token')
          ? { 'Authorization': `Bearer ${localStorage.getItem('eu_token')}` }
          : {})
      },
      body:   JSON.stringify(body),
      signal: abortCtrl.signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let finalAnswer = null;

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
        try { event = JSON.parse(raw); }
        catch { continue; }

        handleSSEEvent(event);
        if (event.type === 'answer') {
          finalAnswer = event.content;
        }
      }
    }

    setThinking(false);

    if (finalAnswer) {
      appendAIMessage(finalAnswer);
    }
  }

  function handleSSEEvent(event) {
    switch (event.type) {
      case 'thinking':
        // Already handled by thinking overlay
        break;

      case 'tool_start':
        // Show tool progress message
        appendToolMessage(event.tool, event.message, false);
        break;

      case 'tool_done':
        appendToolMessage(event.tool, `✓ ${event.resultSummary}`, true);
        break;

      case 'tool_error':
        appendToolMessage(event.tool || 'tool', `⚠ ${event.message}`, true);
        break;

      case 'error':
        setThinking(false);
        appendAIMessage(`Error: ${event.message}`);
        break;

      case 'done':
        // SSE stream ended
        break;
    }
  }

  // ─── Thinking UI ────────────────────────────────────────────────
  function setThinking(active) {
    isThinking = active;
    $thinkingOverlay.classList.toggle('active', active);

    if (active) {
      P().startThinking((msg) => { $thinkingMsg.textContent = msg; });
      // Play video if available
      const video = $thinkingVideo;
      if (video.readyState >= 2) video.play().catch(() => {});
    } else {
      P().stopThinking();
      $thinkingVideo.pause();
    }
  }

  // ─── Utils ──────────────────────────────────────────────────────
  function scrollToBottom() {
    requestAnimationFrame(() => {
      $msgs.scrollTop = $msgs.scrollHeight;
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }

  init();

})();
