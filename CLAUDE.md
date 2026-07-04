# CLAUDE.md — Solaris

Solaris is a local-first 3D visualizer for an Obsidian vault (or any folder of interlinked Markdown). It scans the vault into a graph and renders it as a navigable 3D force-directed map; click a note to read it in a side pane, double-click to open it in Obsidian. Fork of `chntnm/akasha`, MIT.

## Commands

```bash
npm install
npm run scan -- "<vault-path>" [--exclude rel/path]...   # build data/graph.json (incremental; cached by mtime+size)
npm run dev                                               # vite (5173) + express (5175), hot-reload → http://localhost:5173
npm test                                                  # vitest: scanner + server path-traversal guard
npm run typecheck                                         # tsc --noEmit
npm run build                                             # build web/ for prod
npm start                                                 # serve built app on http://localhost:5175
npm run desktop                                           # Electron shell (GPU unlocked)
```

Rescan without restarting: `/api/rescan` (or File → Rescan) re-parses changed files and hot-swaps the graph.

## Architecture

- `scanner/scan.ts` — walks the vault; parses `[[wiki]]` (by basename) + `[text](path.md)` (relative) links and YAML frontmatter (`title`/`type`/`tags`); emits `data/graph.json`. Pure, file-cacheable. Exclude list in `DEFAULT_EXCLUDES`.
- `server/app.ts` — Express app factory, bound to **127.0.0.1 only**. `GET /api/graph`, `/api/note?id=`, `/api/search`, `POST /api/rescan`, `/api/layout`.
- `web/src/main.ts` — the whole frontend (Three.js / `3d-force-graph`, themes, reader pane, menubar). `web/index.html` is the DOM skeleton, `web/src/style.css` the chrome.
- `desktop/main.ts` — Electron shell that runs the server and loads it in a hardened window (`contextIsolation: true`, `nodeIntegration: false`).
- `bin/cli.ts` — zero-install `npx` on-ramp (scan + serve + open; `--addons` installs missing qmd/markitdown).
- `server/integrations/` — the optional integrations layer (all detection-based, core works without any tool):
  - `config.ts` — `~/.solaris/config.json` (0600): Exa + OpenRouter keys, web consent, default model, addons state. Secrets never appear in API responses.
  - `detect.ts` — qmd/markitdown detection: PATH, known install dirs (`~/.bun/bin`, `~/.local/bin`), login-shell fallback. Injectable runner for tests.
  - `security.ts` — Host/Origin validation on all routes + per-session token (`x-solaris-token`) on mutating/spending routes (CSRF/DNS-rebinding guard).
  - `qmd.ts` — Semantic mode: `/api/related`, `/api/semantic-search`, setup/status. vsearch queries are `vec:`-typed (untyped triggers 30s+ LLM expansion; see `docs/solutions/qmd-vsearch-latency.md`).
  - `qmd-vectors.ts` — **the semantic layer's data source** (F030): opens `~/.cache/qmd/index.sqlite` READ-ONLY (better-sqlite3 + sqlite-vec, lazy-required so a wrong-ABI binary degrades to "unavailable" not a crash). `docVector`/`allDocVectors`/`knn`; dimension read from the `vectors_vec float[N]` schema (never hardcode 768); reconciles qmd collection paths → graph.json node ids via `store_collections`. Quarantines ALL sqlite coupling behind a schema guard.
  - `semantic.ts` — mutual-KNN edge builder (F031): `data/semantic.json` (gitignored) via `GET /api/semantic` (builds once, caches by graph fingerprint). Anti-hairball: mutual-KNN + cosine≥0.5 + K≤8. Feeds arrangement modes (F032), semantic-cluster grouping (F033), orphan suggestions (F034).
  - `topology.ts` — phantoms/orphans/sparse clusters → `/api/gaps` suggestions (orphans enriched with their top semantic neighbor from the cached edges); also the template fallback for `/api/note-questions`.
  - `exa.ts` — Web mode: `/api/research` proxy (deep synthesis only); the exa-js request shape stays behind this adapter only.
  - `openrouter.ts` — LLM for follow-up questions (`/api/note-questions`, templates fallback) + `/api/llm/models` proxy. OpenAI-compatible chat completions; the BYO key is server-side only, never echoed.
  - `ingest.ts` — Ingest mode: `/api/ingest` (path/URL) and `/api/ingest-upload` (browser bytes) convert via markitdown into a vault note through `write.ts`.
  - `write.ts` — **the single sanctioned vault-write path** (`POST/PUT /api/notes`, plus `guardedAppendLink` for orphan links via `POST /api/gaps/link`): path-confined, `.md`-only, symlink-aware, never overwrites, journals to `data/changes.jsonl`. Add append/edit helpers HERE; never a second writer.
  - `install.ts` — addons flavor: installs only missing tools, never touches existing setups.

Data flow: `scanner` → `data/graph.json` → `server` → `web`. **The core uploads nothing.** The optional Web mode (Exa) and the OpenRouter LLM (note questions) send data off-machine only behind a stored key / one-time web consent.

## Conventions & gotchas

- **The vault is read-only except through `server/integrations/write.ts`.** Scanner, reader, and search only read; runtime data goes to `data/` (gitignored). The one write path is user-initiated (save a web result, ingest a document) and always journaled. Never add a second write path.
- **Path-traversal guard** (`server/app.ts` `/api/note`, mirrored in `write.ts`): `resolve(vaultRoot, id)` must stay under `vaultRoot + sep` and end in `.md`; `phantom:` ids return 404. Tests live in `server/app.test.ts` and `server/integrations/*.test.ts` — keep them green when touching the server. The trust-model negatives (traversal, consent gates, token enforcement) are release-blocking.
- **Frontend has no test framework.** `npm test` covers the scanner and all server modules. Verify UI changes manually with `npm run dev`.
- **Reader HTML is sanitized** with DOMPurify before `innerHTML` — integration-created notes carry untrusted content; keep the sanitizer when touching `openReader()`.
- **Themes** are CSS-variable sets in `THEMES` (`web/src/main.ts`); `--accent` drives link/active colors. Adding a theme = append to `THEMES` and to the `<select id="theme">` options in `web/index.html`.
- **Reader pane** docks/undocks only via the dock button (`#reader-dock`); the header drag moves it when already floating (never undocks). Geometry persists in `localStorage` (`akasha-reader`).
- **Menubar** (`File / Layers / View / Tools / Help`) is click-to-open. The global click handler closes menus only when the click lands **outside** any `.menu`, so interacting with controls inside a dropdown (checkbox, `<select>`, layer toggle) keeps it open — preserve this when adding dropdown content.
- **`localStorage` keys are `akasha-*`** (theme, filters, reader geometry, custom colors, mode, collections) — kept from upstream for continuity, not renamed.
- **Integration modes are mutually exclusive** (`akasha-mode`) and **search-first**: Semantic / Web / Ingest buttons change what the search field's Enter does; results open in the shared `#research` column (search bar hides, docked reader force-docks left via `ctx-left` — `!important` because the reader geometry engine sets inline `inset`). Ingest mode also shows a Browse button (file picker → `/api/ingest-upload`). Web activation walks a consent modal first (R18) — never bypass it; web queries never auto-run while typing (they spend Exa credit).
- **Semantic layer** (all optional, degrades to unavailable without qmd/vectors): **arrangement** (View menu, `akasha-arrangement`) swaps the force-sim edge set — Links (structural), Semantic (`data/semantic.json`), Hybrid (both, semantic dampened 0.4×). Semantic edges render in a separate dashed buffer; the "semantic lines" toggle hides lines but keeps their physics. Positions cache per arrangement (`/api/layout?arrangement=`). **`group by: semantic cluster`** colors by deterministic label propagation (⟂ to layout). **Passage highlight** (F035): opening a semantic hit paints the matched snippet via the CSS Custom Highlight API (`::highlight(passage)`, no DOM mutation — keep DOMPurify intact); normal opens stay at the top. **Note-questions** carry per-question Web + Semantic buttons (F036).
- **Fork remotes:** `upstream` = `chntnm/akasha`, `origin` = `felores/solaris`. Keep the fork rebasable on upstream.

## Env

- `AKASHA_GRAPH` — override graph.json path (default `data/graph.json`).
- `AKASHA_PORT` — override server port (default `5175`).

Node 22+, npm. The core has no external services; everything runs on localhost. Optional integrations (qmd, markitdown, Exa, OpenRouter) are detected at runtime, never bundled.
