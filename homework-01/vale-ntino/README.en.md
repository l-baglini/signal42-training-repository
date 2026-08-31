# Crossword — offline generator (WebLLM)

A bilingual (IT/EN) crossword generator that runs **entirely in the browser**: an open-source LLM (via WebLLM + WebGPU) picks words tied to your themes and writes the clues, an interlocking algorithm assembles the grid, and you get a crossword you can **solve on screen** (even on a smartphone or tablet) or **print**. No server, no API, no key: after the first model download it works **without internet** too.

Main file: `crossword-offline-webllm.html` (a single self-contained file, nothing to install).

---

## Requirements

- **A browser with WebGPU**: an up-to-date Chrome or Edge (the most reliable). You can check at `chrome://gpu` or at webgpureport.org.
- A **small local HTTP server** to serve the file (see below). Double-clicking the file is **not enough**.
- ~1–2 GB free for the model cache (first time only).

## How to run it

1. Put `crossword-offline-webllm.html` in a folder.
2. Open a terminal in that folder and start a static server, for example:
   - **Python**: `python3 -m http.server 8000`
   - **Node**: `npx serve`
   - or the **Live Server** extension in VS Code.
3. In the browser go to `http://localhost:8000/crossword-offline-webllm.html`.
4. Click **Load model**: the first time it downloads the weights (~1 GB for the base model) with a progress bar; after that they stay cached.
5. Type the **theme words** (e.g. `sea, holiday, sun`), choose language, number of words and difficulty, then **Build**.
6. **Print / PDF**: produces the grid + clues; the solution comes out on a separate page.

> **Why is a server needed?** Browsers block ES module imports when the page is opened as `file://` (CORS error). Serving it via `http://localhost` lets the WebLLM import work.

Without a GPU or a connection: the **Try an example (no AI)** button generates a grid from a list already included in the file. Handy as a fallback during a demo.

## Solving it on screen (including phone/tablet)

Once generated, the crossword can be filled in directly on the page:

- **Tap** (or click) a cell and **type**: on a phone/tablet the keyboard appears.
- **Tap the same cell again** to switch between across and down; the active word is highlighted.
- Arrow keys and Backspace to move and correct (with a physical keyboard).
- **Check** marks wrong letters in red; **Clear** empties the grid.
- **Show solution** reveals all the answers.

Printing is unchanged: it produces an **empty** grid (typed answers are not printed) plus the solution on a separate page.

## Available models (the "AI model" menu)

| Model | Size | Notes |
|---|---|---|
| Llama 3.2 1B (q4f32) | ~1.1 GB | Default: fast, broadest compatibility (no shader-f16 needed) |
| Qwen 2.5 1.5B (q4f16) | ~1.3 GB | Stronger in Italian |
| Llama 3.2 3B (q4f16) | ~2.3 GB | Better quality, larger download |

Model IDs are **validated at runtime** against WebLLM's list; if one isn't available, the app automatically falls back to an equivalent small model.

---

## Implementation details

Everything lives in a single HTML file, with no build step and no dependencies to install. The code splits into three parts.

**1. Word/clue generation (local LLM).** The WebLLM library (`@mlc-ai/web-llm`) is loaded from the CDN with a **dynamic** `import()`: this keeps the interface and the example usable even if the library fails to load. The engine is created with `CreateMLCEngine`, passing a progress callback (the download bar). The request uses the OpenAI-style API (`engine.chat.completions.create`) with `response_format: { type: "json_object" }`; the prompt asks for an object of the form `{"words":[{"word","clue"}]}` with explicit rules (words related to at least one theme, single words, no accents, a clue that doesn't contain the answer). A tolerant JSON parser accepts both objects and arrays and ignores any stray text — useful with small models, which are less precise about format.

**2. Interlocking placement (criss-cross).** Words are sorted from longest to shortest; the first goes in the center. For each following word every possible crossing is tried — each letter shared with the grid, both horizontally and vertically — and validated: no letter conflicts, empty cells before and after the word (so no "ghost" words form by touching), and free perpendicular neighbors where there's no intended crossing. Each placement is scored (more crossings, less bounding-box growth) and ~80 randomized attempts are run, keeping the one that places the most words. Finally: coordinate normalization, cell numbering in scan order, and building the Across/Down lists.

**3. Rendering, interactive play and printing.** The grid is drawn with CSS grid ("filled" white cells with a number, the rest transparent, criss-cross style). Hovering a clue highlights its cells in yellow. For on-screen play, each cell has a span for the user's answer; tapping sets the active cell and highlights the current word, and to bring up the keyboard on mobile — since cells aren't native fields — a single hidden `<input>` receives focus on tap and captures keystrokes (handling letters, Backspace and arrows). "Check" compares answers against the solution; "Clear" empties them. Printing uses the browser's dialog: it hides controls and typed answers, prints the empty grid, and sends the solution to a second page (`break-before: page`), so "Save as PDF" produces the file.

**Other details.** Words are normalized (accents removed, uppercased, A–Z only), deduplicated and filtered by length (3–13 letters). The interface and the generation language are both switchable IT/EN. No data leaves the device: after the initial download, everything happens locally.

## Known limitations

- Small in-browser models give simpler and occasionally imperfect clues; for higher quality, pick a larger model.
- The first generation includes the model download: it can take a few minutes depending on your connection.
- If only a few words interlock, regenerate or change the themes.
- Requires WebGPU: on old hardware or drivers it may not start (in that case, use the example).
- On some Android keyboards the delete key can be unpredictable; alternatively, tap the cell and type over it.

## Variants

There's also a **cloud** version (`crossword-generator.html`) that uses Claude as the generator: higher-quality clues, with the same on-screen solving and printing, but it needs internet and the authentication available only when run as an artifact inside Claude.ai.

## Credits

Crossword built entirely with AI. Local inference with **WebLLM** (the MLC-AI project); **Llama 3.2** (Meta) and **Qwen 2.5** (Alibaba) models in MLC format.
