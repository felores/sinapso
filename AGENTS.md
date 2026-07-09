# AGENTS.md - Solaris

Solaris is a local-first 3D visualizer for an Obsidian vault (or any folder of interlinked Markdown). It scans the vault into a graph and renders it as a navigable 3D force-directed map; click a note to read it in a side pane, double-click to open it in Obsidian. Fork of `chntnm/akasha`, MIT.

## Commands

```bash
npm install
npm run scan -- "<vault-path>" [--exclude rel/path]...   # build data/graph.json (incremental; cached by mtime+size)
npm run dev                                               # vite (5173) + express (5175), hot-reload → http://localhost:5173
npm test                                                  # vitest: scanner + server path-traversal guard
npm run test:e2e                                          # Playwright smoke + browser diagnostics
npm run typecheck                                         # tsc --noEmit
npm run build                                             # build web/ for prod
npm start                                                 # serve built app on http://localhost:5175
npm run desktop                                           # Electron shell (GPU unlocked)
```

Rescan without restarting: `/api/rescan` (or File → Rescan) re-parses changed files and hot-swaps the graph.

## Architecture

- `scanner/scan.ts` — walks the vault; parses `[[wiki]]` (by basename) + `[text](path.md)` (relative) links and YAML frontmatter (`title`/`type`/`tags`); emits `data/graph.json`. Pure, file-cacheable. Exclude list in `DEFAULT_EXCLUDES`.
- `server/app.ts` — Express app factory, bound to **127.0.0.1 only**. `GET /api/graph`, `/api/note?id=`, `/api/search`, `POST /api/rescan`, `/api/layout`.
- `web/src/main.ts` — the frontend shell (Three.js / `3d-force-graph`, reader pane, menubar, DOM wiring). Pure frontend logic lives in `web/src/theme.ts`, `spectrum.ts`, `filters.ts`, `clusters.ts`, `api.ts`, and `prefs.ts`. `web/index.html` is the DOM skeleton, `web/src/style.css` the chrome.
- `desktop/main.ts` — Electron shell that runs the server and loads it in a hardened window (`contextIsolation: true`, `nodeIntegration: false`).
- `bin/cli.ts` — zero-install `npx` on-ramp (scan + serve + open; `--addons` installs missing qmd/markitdown).
- `server/integrations/` — the optional integrations layer (all detection-based, core works without any tool):
  - `config.ts` — `~/.solaris/config.json` (0600): Exa + OpenRouter keys, web consent, default model, addons state, active vault path, vault-scoped wiki config, and prompt overrides. `loadConfig()` is mtime-cached; `updateConfig()` refreshes the cache. Secrets never appear in API responses.
  - `detect.ts` — qmd/markitdown detection: PATH, known install dirs (`~/.bun/bin`, `~/.local/bin`), login-shell fallback. Injectable runner for tests.
  - `security.ts` — Host/Origin validation on all routes + per-session token (`x-solaris-token`) on mutating/spending routes (CSRF/DNS-rebinding guard).
  - `paths.ts` — shared vault-note path confinement for read routes and the write path: `.md` only, `phantom:` rejected, traversal rejected, route-specific 400/404 behavior preserved.
  - `gates.ts` — shared route gate helpers for web consent + Exa key, OpenRouter key, and markitdown availability. Helpers write the route's existing response body/status; do not normalize divergent messages without auditing callers.
  - `wiki.ts` — discovers folders named exactly `wiki`, detects `AGENTS.md`/`CLAUDE.md`/`index.md`/`README.md`, assigns confidence, and merges saved enabled/label/rawDestination state.
  - `qmd.ts` — Semantic mode: `/api/related`, `/api/semantic-search`, setup/status. vsearch queries are `vec:`-typed (untyped triggers 30s+ LLM expansion; see `docs/solutions/qmd-vsearch-latency.md`).
  - `qmd-vectors.ts` — **the semantic layer's data source** (F030): opens `~/.cache/qmd/index.sqlite` READ-ONLY (better-sqlite3 + sqlite-vec, lazy-required so a wrong-ABI binary degrades to "unavailable" not a crash). `docVector`/`allDocVectors`/`knn`; dimension read from the `vectors_vec float[N]` schema (never hardcode 768); reconciles qmd collection paths → graph.json node ids via `store_collections`. Quarantines ALL sqlite coupling behind a schema guard.
  - `semantic.ts` — mutual-KNN edge builder (F031): `data/semantic.json` (gitignored) via `GET /api/semantic` (builds once, caches by graph fingerprint). Anti-hairball: mutual-KNN + cosine≥0.5 + K≤8. Feeds arrangement modes (F032), semantic-cluster grouping (F033), orphan suggestions (F034).
  - `topology.ts` — phantoms/orphans/sparse clusters → `/api/gaps` suggestions (orphans enriched with their top semantic neighbor from the cached edges); also the template fallback for `/api/note-questions`.
  - `excerpt.ts` — markdown/frontmatter cleanup for note excerpts and qmd query text (`excerptFor`, `norm`, `stripSnippet`, `clip`).
  - `questions.ts` — OpenRouter note-question prompt assembly, JSON-array parsing, and LLM fallback orchestration; routes keep the `{ questions, source }` adapter shape.
  - `notes-index.ts` — MiniSearch index construction/snippets and literal `/api/note-grep` matching with context windows.
  - `exa.ts` — Web mode: `/api/research` proxy (deep synthesis only); the exa-js request shape stays behind this adapter only.
  - `openrouter.ts` — LLM for follow-up questions (`/api/note-questions`, templates fallback) and wiki-ingest synthesis + `/api/llm/models` proxy. OpenAI-compatible chat completions; the BYO key is server-side only, never echoed.
  - `ingest.ts` — Ingest mode: `/api/ingest` (path/URL) and `/api/ingest-upload` (browser bytes) convert via markitdown into a vault note through `write.ts`, or into converted markdown reused by wiki-ingest proposals.
  - `wiki-ingest.ts` — contract-aware proposal layer: reads selected wiki contracts, asks OpenRouter for JSON create/edit proposals, adds raw-copy proposals for per-wiki rawDestination, validates proposal paths under the selected wiki/raw destination, and applies approvals only through `write.ts`.
  - `voice.ts` — Gemini Live voice relay. Its system prompt is built at session start from the Admin voice prompt plus enabled wiki paths/raw destinations/contract filenames. Audio/session plumbing stays here; tool dispatch delegates to `voice-tools.ts`.
  - `voice-tools.ts` — voice tool declarations and per-session tool state (`workingDocId`, contract-read tracking), driven through injected `fetchFn` loopback HTTP so tests do not need Gemini or a WebSocket.
  - `write.ts` - **the single sanctioned app-authored vault-write path** (`POST/PUT /api/notes`, plus `guardedAppendLink` for orphan links via `POST /api/gaps/link`): path-confined, `.md`-only, symlink-aware, never overwrites, journals to `data/changes.jsonl`. Add append/edit helpers HERE; never a second app writer. User-triggered Git sync is the only repo-level exception and lives in `git.ts`.
  - `git.ts` - Git history and maintenance for vault repos. Read-only note history stays safe (`GET /api/note-versions`, `/api/note-version`); restore re-reads old content and writes only the target note through `guardedEdit()`. Git commit/sync may move HEAD only from token-guarded, user-triggered endpoints using `execFile` arg arrays, clean-tree checks, `fetch`, `merge --ff-only` for behind-only sync, `merge --no-edit` for clean divergent sync, `merge --abort` after failed conflict merges, and `push`. Never run `git checkout/reset/revert/rebase`, amend, or force push. Vaults without `.git` get `available:false` silently.
  - `install.ts` — addons flavor: installs only missing tools, never touches existing setups.

Data flow: `scanner` → `data/graph.json` → `server` → `web`. **The core uploads nothing except explicit, user-triggered Git push/sync.** Optional Web mode sends queries to Exa only after web consent + key. OpenRouter-backed note questions and wiki-ingest synthesis send selected note/source/contract context only when the user triggers that action and a key is configured.

## Conventions & gotchas

- **The vault is read-only except through `server/integrations/write.ts`, plus the explicit Git sync exception in `server/integrations/git.ts`.** Scanner, reader, search, wiki discovery, and proposal generation only read; runtime data goes to `data/` (gitignored). App-authored note writes are user-initiated (save a web result, capture-only ingest, approve wiki-ingest proposal, promote a voice working document, confirm orphan link) and always journaled. Git sync is also user-initiated, token-guarded, clean-tree, fast-forward when possible, merge-commit on clean divergence, and abort-on-conflict. Never add another write path.
- **Path-traversal guard** (`server/app.ts` `/api/note`, mirrored in `write.ts`): `resolve(vaultRoot, id)` must stay under `vaultRoot + sep` and end in `.md`; `phantom:` ids return 404. Tests live in `server/app.test.ts` and `server/integrations/*.test.ts` — keep them green when touching the server. The trust-model negatives (traversal, consent gates, token enforcement) are release-blocking.
- **Frontend pure modules have Vitest coverage.** `npm test` includes `web/src/*.test.ts` for extracted data-in/data-out helpers. DOM behavior still needs manual `npm run dev` checks.
- **Browser diagnostics are release-blocking.** Playwright E2E must capture and fail on unallowlisted `console.error`, `pageerror`, `requestfailed`, and HTTP `>=500`, and write `test-results/browser-diagnostics.json` for agent debugging.
- **Reader HTML is sanitized** with DOMPurify before `innerHTML` — integration-created notes carry untrusted content; keep the sanitizer when touching `openReader()`.
- **Themes** are CSS-variable sets in `THEMES` (`web/src/theme.ts`); `--accent` drives link/active colors. Adding a theme = append to `THEMES` and to the `<select id="theme">` options in `web/index.html`.
- **Reader pane** docks/undocks only via the dock button (`#reader-dock`); the header drag moves it when already floating (never undocks). Geometry persists in `localStorage` (`akasha-reader`).
- **Menubar** (`File / Layers / View / Tools / Help`) is click-to-open. The global click handler closes menus only when the click lands **outside** any `.menu`, so interacting with controls inside a dropdown (checkbox, `<select>`, layer toggle) keeps it open — preserve this when adding dropdown content.
- **`localStorage` keys are `akasha-*`** and main frontend persistence goes through `web/src/prefs.ts`. Key names and serialized formats are kept from upstream for continuity, not renamed.
- **Admin/wiki config**: File → Admin is the only UI for active vault path, saved wiki enable/label/path/rawDestination, and prompt overrides. Browser/CLI vault switching is typed path; Electron can pass `pickVault` into `createApp()`. Wikis are detected by folder basename `wiki`, not by contract-file presence. New wikis default enabled and infer rawDestination from existing folders in this order: `raw/`, `../raw/`, `research/`, `../research/`, `docs/`, `../docs/`, then fallback `../raw/`; blank rawDestination means no raw-copy proposal.
- **Integration modes are mutually exclusive** (`akasha-mode`) and **search-first**: Semantic / Web / Ingest buttons change what the search field's Enter does; results open in the shared `#research` column (search bar hides, docked reader force-docks left via `ctx-left` — `!important` because the reader geometry engine sets inline `inset`). Ingest mode also shows a target selector and Browse button. `Inbox / capture only` uses `/api/ingest` or `/api/ingest-upload`; wiki targets use `/api/wiki-ingest/propose*` then `/api/wiki-ingest/apply` after approval. Web activation walks a consent modal first (R18) — never bypass it; web queries never auto-run while typing (they spend Exa credit).
- **Semantic layer** (all optional, degrades to unavailable without qmd/vectors): **arrangement** (View menu, `akasha-arrangement`) swaps the force-sim edge set — Links (structural), Semantic (`data/semantic.json`), Hybrid (both, semantic dampened 0.4×). Semantic edges render in a separate dashed buffer; the "semantic lines" toggle hides lines but keeps their physics. Positions cache per arrangement (`/api/layout?arrangement=`). **`group by: semantic cluster`** colors by deterministic label propagation (⟂ to layout). **Passage highlight** (F035): opening a semantic hit paints the matched snippet via the CSS Custom Highlight API (`::highlight(passage)`, no DOM mutation — keep DOMPurify intact); normal opens stay at the top. **Note-questions** carry per-question Web + Semantic buttons (F036).
- **Fork remotes:** `upstream` = `chntnm/akasha`, `origin` = `felores/solaris`. Keep the fork rebasable on upstream.

## Env

- `AKASHA_GRAPH` — override graph.json path (default `data/graph.json`).
- `AKASHA_PORT` — override server port (default `5175`).

Node 22+, npm. The core has no external services; everything runs on localhost. Optional integrations (qmd, markitdown, Exa, OpenRouter) are detected at runtime, never bundled.
