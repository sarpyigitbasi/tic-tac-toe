(() => {
  // Prevent double-injection
  if (window.__schoolAiInjected) return;
  window.__schoolAiInjected = true;

  // ── Overlay bootstrap ──────────────────────────────────────────────────────

  let shadowHost = null;
  let shadowRoot = null;
  let overlayEl = null;
  let isVisible = false;

  function createOverlay() {
    if (shadowHost) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'school-ai-host';
    shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; bottom: 24px; right: 24px;';
    getOverlayParent().appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getOverlayCSS();
    shadowRoot.appendChild(style);

    overlayEl = document.createElement('div');
    overlayEl.className = 'overlay';
    overlayEl.innerHTML = getOverlayHTML();
    shadowRoot.appendChild(overlayEl);

    attachOverlayListeners();

    // Re-parent into the fullscreen element when fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      if (shadowHost) getOverlayParent().appendChild(shadowHost);
    });
  }

  // Returns the fullscreen element if active, otherwise document.body
  function getOverlayParent() {
    return document.fullscreenElement || document.body;
  }

  function toggleOverlay() {
    if (!shadowHost) createOverlay();
    isVisible = !isVisible;
    shadowHost.style.display = isVisible ? 'block' : 'none';
    if (isVisible) setStatus('idle');
  }

  // ── DOM text extraction ───────────────────────────────────────────────────

  function extractPageText() {
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEADER', 'NAV', 'FOOTER']);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el) {
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        const style = window.getComputedStyle(node.parentElement);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const parts = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text.length > 2) parts.push(text);
    }
    return parts.join(' ').replace(/\s{2,}/g, ' ').trim().slice(0, 8000);
  }

  // ── Screen capture ────────────────────────────────────────────────────────

  async function captureScreenFromStreamId(streamId) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
        },
      },
      audio: false,
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise((res) => { video.onloadedmetadata = res; });
    video.play();
    await new Promise((res) => setTimeout(res, 200)); // let first frame render

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stream.getTracks().forEach((t) => t.stop());

    return canvas.toDataURL('image/png');
  }

  // ── Overlay interaction ───────────────────────────────────────────────────

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function attachOverlayListeners() {
    const header = shadowRoot.querySelector('.overlay-header');
    const askPageBtn = shadowRoot.querySelector('#ask-page-btn');
    const askScreenBtn = shadowRoot.querySelector('#ask-screen-btn');
    const minimizeBtn = shadowRoot.querySelector('#minimize-btn');
    const closeBtn = shadowRoot.querySelector('#close-btn');
    const clearBtn = shadowRoot.querySelector('#clear-btn');

    // Dragging
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      const rect = shadowHost.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - dragOffsetX;
      const y = e.clientY - dragOffsetY;
      shadowHost.style.left = `${x}px`;
      shadowHost.style.top = `${y}px`;
      shadowHost.style.right = 'auto';
      shadowHost.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    // Minimize / close
    minimizeBtn.addEventListener('click', () => {
      const body = shadowRoot.querySelector('.overlay-body');
      const isMin = body.style.display === 'none';
      body.style.display = isMin ? 'flex' : 'none';
      minimizeBtn.textContent = isMin ? '−' : '+';
    });
    closeBtn.addEventListener('click', () => {
      isVisible = false;
      shadowHost.style.display = 'none';
    });

    // Ask from page text
    askPageBtn.addEventListener('click', async () => {
      const text = extractPageText();
      if (!text) { setAnswer('No readable text found on this page.'); return; }
      const prompt = `Here is the text from the current page. Find any questions and answer them:\n\n${text}`;
      await sendToAI({ type: 'text', prompt });
    });

    // Ask from screen capture
    askScreenBtn.addEventListener('click', () => {
      setStatus('waiting');
      setAnswer('Select the window to capture in the dialog…');
      chrome.runtime.sendMessage({ type: 'START_SCREEN_CAPTURE' });
    });

    clearBtn.addEventListener('click', () => {
      setAnswer('');
      setStatus('idle');
    });
  }

  async function sendToAI({ type, prompt, imageBase64 }) {
    setStatus('loading');
    setAnswer('Thinking…');

    const stored = await chrome.storage.local.get(['textModel', 'visionModel']);
    const textModel = stored.textModel || 'llama3';
    const visionModel = stored.visionModel || 'llava';

    let response;
    if (type === 'image') {
      response = await chrome.runtime.sendMessage({
        type: 'ASK_OLLAMA_IMAGE',
        prompt: prompt || 'Answer the questions visible in this screenshot.',
        imageBase64,
        model: visionModel,
      });
    } else {
      response = await chrome.runtime.sendMessage({
        type: 'ASK_OLLAMA_TEXT',
        prompt,
        model: textModel,
      });
    }

    if (response.ok) {
      setStatus('done');
      setAnswer(response.answer);
    } else {
      setStatus('error');
      setAnswer(`Error: ${response.error}\n\nMake sure Ollama is running:\nOLLAMA_ORIGINS="chrome-extension://*" ollama serve`);
    }
  }

  function setStatus(state) {
    const indicator = shadowRoot.querySelector('#status-indicator');
    const labels = { idle: '⬤ Ready', loading: '⬤ Thinking…', done: '⬤ Done', error: '⬤ Error', waiting: '⬤ Waiting…' };
    const colors = { idle: '#6b7280', loading: '#f59e0b', done: '#22c55e', error: '#ef4444', waiting: '#3b82f6' };
    indicator.textContent = labels[state] || '';
    indicator.style.color = colors[state] || '#6b7280';
  }

  function setAnswer(text) {
    const el = shadowRoot.querySelector('#answer-box');
    el.textContent = text;
  }

  // ── Message listener (from background) ──────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_OVERLAY') {
      toggleOverlay();
    }

    if (msg.type === 'SCREEN_CAPTURE_STREAM_ID') {
      captureScreenFromStreamId(msg.streamId).then((imageBase64) => {
        sendToAI({ type: 'image', imageBase64 });
      }).catch((err) => {
        setStatus('error');
        setAnswer(`Capture failed: ${err.message}`);
      });
    }
  });

  // ── HTML / CSS templates ──────────────────────────────────────────────────

  function getOverlayHTML() {
    return `
      <div class="overlay-header">
        <span class="overlay-title">🎓 School AI</span>
        <span id="status-indicator" style="font-size:11px;color:#6b7280;">⬤ Ready</span>
        <div class="header-btns">
          <button id="minimize-btn" title="Minimize">−</button>
          <button id="close-btn" title="Close">✕</button>
        </div>
      </div>
      <div class="overlay-body">
        <div class="action-row">
          <button id="ask-page-btn" class="btn-primary" title="Read this webpage and answer questions">📄 This Page</button>
          <button id="ask-screen-btn" class="btn-secondary" title="Capture any window and answer questions">🖥 Capture Screen</button>
        </div>
        <div id="answer-box" class="answer-box">Press a button above to get started.</div>
        <div class="footer-row">
          <button id="clear-btn" class="btn-ghost">Clear</button>
        </div>
      </div>
    `;
  }

  function getOverlayCSS() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .overlay {
        width: 320px;
        background: #1e1e2e;
        border: 1px solid #313244;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        overflow: hidden;
        color: #cdd6f4;
        font-size: 13px;
      }
      .overlay-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #181825;
        cursor: grab;
        user-select: none;
        border-bottom: 1px solid #313244;
      }
      .overlay-header:active { cursor: grabbing; }
      .overlay-title { font-weight: 600; font-size: 13px; flex: 1; color: #cdd6f4; }
      .header-btns { display: flex; gap: 4px; }
      .header-btns button {
        background: #313244; border: none; color: #cdd6f4; width: 22px; height: 22px;
        border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
      }
      .header-btns button:hover { background: #45475a; }
      .overlay-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
      .action-row { display: flex; gap: 8px; }
      button { cursor: pointer; border: none; border-radius: 8px; padding: 7px 10px; font-size: 12px; font-weight: 500; transition: opacity .15s; }
      button:hover { opacity: .85; }
      .btn-primary { background: #89b4fa; color: #1e1e2e; flex: 1; }
      .btn-secondary { background: #313244; color: #cdd6f4; flex: 1; }
      .btn-ghost { background: transparent; color: #6c7086; font-size: 11px; padding: 4px 8px; }
      .answer-box {
        background: #181825;
        border: 1px solid #313244;
        border-radius: 8px;
        padding: 10px;
        min-height: 80px;
        max-height: 300px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.6;
        color: #cdd6f4;
      }
      .footer-row { display: flex; justify-content: flex-end; }
    `;
  }
})();
