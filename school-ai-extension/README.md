# School AI Assistant — Chrome Extension

An AI overlay that reads questions from webpages or desktop apps and answers them using a local Ollama model (free, private, no API key).

---

## One-time Setup

### 1. Install Ollama

```bash
brew install ollama
```

### 2. Pull the models

```bash
ollama pull llama3   # text: literature, vocabulary, Turkish ↔ English translation (~4.7GB)
ollama pull llava    # vision: screen capture for desktop exam apps (~4.7GB)
```

### 3. Start Ollama with CORS allowed for the extension

```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

> Keep this terminal open while using the extension.

### 4. Load the extension in Chrome

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder: `school-ai-extension/`

---

## How to Use

| Action | How |
|--------|-----|
| Toggle overlay | `⌘⇧A` (Mac) / `Ctrl+Shift+A` (Windows/Linux) |
| Capture screen | `⌘⇧S` (Mac) / `Ctrl+Shift+S` — picks any window |
| Open overlay via icon | Click the extension icon → **Open overlay** |
| Change models | Click extension icon → edit model names → Save |

### For webpage exams (Canvas, Google Classroom, etc.)
Press `⌘⇧A` to open the overlay, then click **📄 This Page**. The extension reads all visible text on the page and asks the AI to answer any questions it finds.

### For desktop app exams (any app)
Press `⌘⇧S` (or click **🖥 Capture Screen** in the overlay). A dialog appears — select the window containing your exam. The screenshot is sent to the vision model for answering.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Ollama offline" in popup | Run `OLLAMA_ORIGINS="chrome-extension://*" ollama serve` |
| Error: model not found | Run `ollama pull llava` and `ollama pull llama3` |
| Screen capture dialog doesn't appear | Make sure you clicked from an active tab (not a new tab page) |
| Overlay doesn't appear | Refresh the page, then try the shortcut again |
| Slow responses | Normal for first run — model loads into memory. Subsequent calls are faster. |

---

## Changing the AI Model

Click the extension icon and type in a different Ollama model name. Any model from [ollama.com/library](https://ollama.com/library) works.

Recommended free alternatives:
- `mistral` — fast, good at reasoning
- `llama3.2-vision` — newer vision model (if llava doesn't work)
- `phi3` — very small and fast for simple Q&A
