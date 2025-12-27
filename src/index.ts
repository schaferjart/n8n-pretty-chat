import './styles.css';
import type { ChatOptions, ChatInstance } from './types';

// Default options matching n8n/chat API
const defaultOptions: Partial<ChatOptions> = {
  webhookConfig: {
    method: 'POST',
    headers: {}
  },
  target: '#n8n-chat',
  mode: 'fullscreen',
  initialMessages: [
    'Hey there! 👋',
    'How can I help you today?'
  ],
  chatInputKey: 'chatInput',
  chatSessionKey: 'sessionId',
  loadPreviousSession: true,
  metadata: {},
  i18n: {
    inputPlaceholder: 'Type your message...',
    sendButtonText: 'Send',
    errorMessage: 'Connection error. Please try again.',
    fallbackResponse: "Sorry, I couldn't process that."
  },
  typingIndicator: {
    msPerChar: 20,
    baseDelay: 300
  },
  maxBubbleLength: 200,
  enableAnimations: true
};

/**
 * Creates a new chat instance
 */
export function createChat(options: ChatOptions): ChatInstance {
  const config = { ...defaultOptions, ...options };
  
  // Validate required options
  if (!config.webhookUrl) {
    throw new Error('n8n-pretty-chat: webhookUrl is required');
  }

  function generateSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for older browsers/webviews
    return `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  // Get or create session ID
  const sessionKey = `n8n-chat-session-${config.chatSessionKey}`;
  let sessionId = config.loadPreviousSession
    ? (localStorage.getItem(sessionKey) || generateSessionId())
    : generateSessionId();

  if (config.loadPreviousSession) {
    localStorage.setItem(sessionKey, sessionId);
  }

  // Get target element
  const targetEl = document.querySelector(config.target!) as HTMLElement;
  if (!targetEl) {
    throw new Error(`n8n-pretty-chat: target element "${config.target}" not found`);
  }

  // Create chat structure
  const container = document.createElement('div');
  container.className = `n8n-chat ${config.mode}-mode`;
  
  const messagesEl = document.createElement('div');
  messagesEl.className = 'n8n-chat-messages';
  
  const inputArea = document.createElement('div');
  inputArea.className = 'n8n-chat-input-area';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'n8n-chat-input';
  input.placeholder = config.i18n?.inputPlaceholder || 'Type your message...';
  input.autocomplete = 'off';
  
  const sendBtn = document.createElement('button');
  sendBtn.className = 'n8n-chat-send-btn';
  sendBtn.textContent = config.i18n?.sendButtonText || 'Send';
  
  inputArea.appendChild(input);
  inputArea.appendChild(sendBtn);
  container.appendChild(messagesEl);
  container.appendChild(inputArea);
  targetEl.appendChild(container);

  // Apply theme
  if (config.theme) {
    const t = config.theme;
    if (t.primaryColor) container.style.setProperty('--n8n-chat-primary', t.primaryColor);
    if (t.backgroundColor) container.style.setProperty('--n8n-chat-bg', t.backgroundColor);
    if (t.textColor) container.style.setProperty('--n8n-chat-text', t.textColor);
    if (t.botMessageBackground) container.style.setProperty('--n8n-chat-bot-bg', t.botMessageBackground);
    if (t.userMessageBackground) container.style.setProperty('--n8n-chat-user-bg', t.userMessageBackground);
    if (t.fontFamily) container.style.setProperty('--n8n-chat-font-family', t.fontFamily);
    if (t.borderRadius) container.style.setProperty('--n8n-chat-border-radius', t.borderRadius);
  }

  // Helper functions
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function createBubble(text: string, position: 'left' | 'right'): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = `n8n-chat-bubble ${position}`;
    const msg = document.createElement('span');
    msg.className = 'message';
    // Use textContent to avoid XSS via untrusted webhook/user content
    msg.textContent = text;
    bubble.appendChild(msg);
    return bubble;
  }

  function createLoadingBubble(): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'n8n-chat-bubble left';
    const loading = document.createElement('span');
    loading.className = 'loading';
    loading.innerHTML = '<b>•</b><b>•</b><b>•</b>';
    bubble.appendChild(loading);
    return bubble;
  }

  function addMessage(text: string, position: 'left' | 'right', shouldScroll = false): HTMLElement {
    const row = document.createElement('div');
    row.className = `n8n-chat-message-row ${position}`;
    const bubble = createBubble(text, position);
    
    if (config.enableAnimations) {
      bubble.classList.add('animate-in');
    }
    
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    
    if (shouldScroll) {
      scrollToBottom();
    }
    
    return bubble;
  }

  function splitIntoChunks(text: string): string[] {
    const MAX_LENGTH = config.maxBubbleLength || 200;
    
    // First try splitting by double newlines (paragraphs)
    let chunks = text.split(/\n\n+/).map(s => s.trim()).filter(s => s);
    
    // If only one chunk, try other split strategies
    if (chunks.length === 1) {
      // Try splitting by numbered lists or markdown headers
      const listSplit = text.split(/(?=\d+\.\s+\*\*|\n\d+\.\s|\n[-•]\s)/);
      if (listSplit.length > 1) {
        chunks = listSplit.map(s => s.trim()).filter(s => s);
      } else {
        // Split by sentence endings
        chunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        chunks = chunks.map(s => s.trim()).filter(s => s);
      }
    }
    
    // Merge very short chunks, split very long ones
    const result: string[] = [];
    for (const chunk of chunks) {
      if (result.length > 0 && chunk.length < 30) {
        result[result.length - 1] += ' ' + chunk;
      } else if (chunk.length > MAX_LENGTH) {
        const sentences = chunk.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [chunk];
        let current = '';
        for (const sentence of sentences) {
          if (current.length + sentence.length > MAX_LENGTH && current.length > 0) {
            result.push(current.trim());
            current = sentence;
          } else {
            current += (current ? ' ' : '') + sentence.trim();
          }
        }
        if (current.trim()) result.push(current.trim());
      } else {
        result.push(chunk);
      }
    }
    
    return result.length > 0 ? result : [text];
  }

  async function addMessagesSequentially(chunks: string[], position: 'left' | 'right') {
    const { msPerChar = 20, baseDelay = 300 } = config.typingIndicator || {};
    
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        const typingRow = document.createElement('div');
        typingRow.className = 'n8n-chat-message-row left';
        const typingBubble = createLoadingBubble();
        typingRow.appendChild(typingBubble);
        messagesEl.appendChild(typingRow);
        
        const delay = chunks[i].length * msPerChar + baseDelay;
        await new Promise(r => setTimeout(r, delay));
        
        typingRow.remove();
      }
      
      const shouldScroll = (i === 0);
      addMessage(chunks[i], position, shouldScroll);
    }
  }

  async function parseWebhookResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function extractBotMessage(data: unknown): string {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return config.i18n?.fallbackResponse || '';

    const record = data as Record<string, unknown>;
    const candidate = record.output ?? record.text ?? record.message;
    if (typeof candidate === 'string') return candidate;
    if (candidate == null) return config.i18n?.fallbackResponse || '';
    try {
      return JSON.stringify(candidate);
    } catch {
      return String(candidate);
    }
  }

  async function sendToWebhook(message: string) {
    const row = document.createElement('div');
    row.className = 'n8n-chat-message-row left';
    const loadingBubble = createLoadingBubble();
    row.appendChild(loadingBubble);
    messagesEl.appendChild(row);
    scrollToBottom();

    try {
      const payload = {
        action: 'sendMessage',
        [config.chatSessionKey!]: sessionId,
        [config.chatInputKey!]: message,
        ...config.metadata
      };

      const method = (config.webhookConfig?.method || 'POST').toUpperCase();
      const headers: Record<string, string> = {
        ...config.webhookConfig?.headers
      };

      let url = config.webhookUrl;
      const init: RequestInit = { method, headers };

      if (method === 'GET') {
        const u = new URL(url, window.location.href);
        for (const [key, value] of Object.entries(payload)) {
          if (value == null) continue;
          u.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        url = u.toString();
      } else {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        init.body = JSON.stringify(payload);
      }

      const response = await fetch(url, init);
      const data = await parseWebhookResponse(response);
      row.remove();

      if (!response.ok) {
        addMessage(config.i18n?.errorMessage || `Request failed (${response.status})`, 'left', true);
        return;
      }

      const botMessage = extractBotMessage(data) || config.i18n?.fallbackResponse || '';
      const chunks = splitIntoChunks(botMessage);
      await addMessagesSequentially(chunks, 'left');
      
    } catch (error) {
      row.remove();
      addMessage(config.i18n?.errorMessage || 'Connection error.', 'left', true);
    }
  }

  function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    addMessage(text, 'right', true);
    sendToWebhook(text);
  }

  // Event listeners
  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  // Initial messages
  if (config.initialMessages && config.initialMessages.length > 0) {
    let delay = 300;
    for (const msg of config.initialMessages) {
      setTimeout(() => addMessage(msg, 'left', true), delay);
      delay += 700;
    }
  }

  // Return chat instance
  return {
    sendMessage: async (text: string) => {
      addMessage(text, 'right', true);
      await sendToWebhook(text);
    },
    addMessage: (text: string, position: 'left' | 'right') => {
      addMessage(text, position, true);
    },
    clear: () => {
      messagesEl.innerHTML = '';
    },
    destroy: () => {
      container.remove();
    },
    getSessionId: () => sessionId,
    resetSession: () => {
      sessionId = generateSessionId();
      if (config.loadPreviousSession) {
        localStorage.setItem(sessionKey, sessionId);
      }
    }
  };
}

// Re-export types
export type { ChatOptions, ChatInstance, ThemeOptions, I18nOptions } from './types';
