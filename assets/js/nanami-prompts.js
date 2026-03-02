/**
 * nanami-prompts.js
 * Centralized prompt content for the Nanami AI frontend.
 * Single responsibility: all user-facing text, suggestions, and thinking messages.
 */

window.NanamiPrompts = (function() {

  // Rotating "thinking" messages shown while AI processes
  const THINKING_MESSAGES = [
    'Pensando…',
    'Afilando garras…',
    'Cazando ratones…',
    'Consultando la enciclopedia…',
    'Olfateando la respuesta…',
    'Revisando apuntes…',
    'Procesando con mis bigotes…',
    'Buscando en la biblioteca…',
    'Calculando con las patitas…',
    'Maullando a los servidores…',
  ];

  // Suggestions shown in the empty chat state
  const DEFAULT_SUGGESTIONS = [
    '¿Cómo funciona el ADN?',
    'Explícame el teorema de Bayes',
    '¿Qué es la termodinámica?',
    'Resume este artículo',
    '¿Cómo cito un artículo?',
    'Busca artículos de matemáticas',
  ];

  // Context-aware suggestions when on an article page
  const ARTICLE_SUGGESTIONS = [
    'Resume este artículo',
    'Explícame los puntos clave',
    '¿Qué no entendí de esto?',
    'Busca artículos relacionados',
    'Dame ejemplos prácticos',
  ];

  // FAB tooltip text
  const FAB_TOOLTIP = '¡Preguntame lo que quieras! Miau 🐱';

  // Initial greeting shown on first open
  const GREETING = '¡Hola! Soy **Nanami AI** 🐱, tu asistente de la Enciclopedia Universitaria.\n\nPuedo ayudarte a buscar artículos, explicar conceptos y resumir contenido académico.\n\n¿En qué te ayudo hoy?';

  // Tool progress labels (matching backend tool names)
  const TOOL_ICONS = {
    search_articles:     '🔍',
    get_article_content: '📖',
    get_categories:      '📂',
    get_recent_articles: '📰',
    default:             '⚙️'
  };

  let thinkingIndex = 0;
  let thinkingInterval = null;

  function startThinking(setMessage) {
    thinkingIndex = 0;
    setMessage(THINKING_MESSAGES[0]);
    thinkingInterval = setInterval(() => {
      thinkingIndex = (thinkingIndex + 1) % THINKING_MESSAGES.length;
      setMessage(THINKING_MESSAGES[thinkingIndex]);
    }, 5000);
  }

  function stopThinking() {
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
    }
  }

  function getToolIcon(toolName) {
    return TOOL_ICONS[toolName] || TOOL_ICONS.default;
  }

  function getSuggestions(isArticlePage) {
    return isArticlePage ? ARTICLE_SUGGESTIONS : DEFAULT_SUGGESTIONS;
  }

  /** Convert basic markdown to safe HTML for display */
  function markdownToHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<strong>$1</strong>')
      .replace(/^## (.+)$/gm, '<strong>$1</strong>')
      // Bold, italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code inline
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Unordered lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>(\n|$))+/g, (m) => `<ul>${m}</ul>`)
      // Newlines to paragraphs
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => p.startsWith('<ul>') || p.startsWith('<li>') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  return {
    THINKING_MESSAGES,
    DEFAULT_SUGGESTIONS,
    ARTICLE_SUGGESTIONS,
    FAB_TOOLTIP,
    GREETING,
    TOOL_ICONS,
    startThinking,
    stopThinking,
    getToolIcon,
    getSuggestions,
    markdownToHtml
  };

})();
