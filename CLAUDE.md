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
- `bin/cli.ts` — zero-install `npx` on-ramp (scan + serve + open; `--addons` installs missing qmd/OpenCode).
- `server/integrations/` — the optional integrations layer (all detection-based, core works without any tool):
  - `config.ts` — `~/.solaris/config.json` (0600): Exa key, consents, agent mode, default model. Secrets never appear in API responses.
  - `detect.ts` — qmd/opencode detection: PATH, known install dirs (`~/.bun/bin`, `~/.opencode/bin`), login-shell fallback. Injectable runner for tests.
  - `security.ts` — Host/Origin validation on all routes + per-session token (`x-solaris-token`) on mutating/spending routes (CSRF/DNS-rebinding guard).
  - `qmd.ts` — Semantic mode: `/api/related`, `/api/semantic-search`, setup/status. vsearch queries are `vec:`-typed (untyped triggers 30s+ LLM expansion; see `docs/solutions/qmd-vsearch-latency.md`).
  - `topology.ts` — phantoms/orphans/sparse clusters → `/api/gaps` suggestions; also seeds agent context.
  - `exa.ts` — Web mode: `/api/research` proxy; the exa-js request shape stays behind this adapter only.
  - `write.ts` — **the single sanctioned vault-write path** (`POST/PUT /api/notes`): path-confined, `.md`-only, symlink-aware, never overwrites, journals to `data/changes.jsonl`.
  - `opencode.ts` + `proposals.ts` — Agent mode: locked-down `opencode serve` child (cwd=vault, all write/egress tools denied) whose only mutation path is propose_create/propose_edit tools that route through `write.ts` after user approval (or full-access standing consent).
  - `install.ts` — addons flavor: installs only missing tools, never touches existing setups.

Data flow: `scanner` → `data/graph.json` → `server` → `web`. **The core uploads nothing.** The optional Web (Exa) and Agent (OpenCode) modes send data off-machine only behind one-time per-mode consent gates.

## Conventions & gotchas

- **The vault is read-only except through `server/integrations/write.ts`.** Scanner, reader, and search only read; runtime data goes to `data/` (gitignored). The one write path is user-consented (save a web result, approve an agent proposal, full-access standing consent) and always journaled. Never add a second write path.
- **Path-traversal guard** (`server/app.ts` `/api/note`, mirrored in `write.ts`): `resolve(vaultRoot, id)` must stay under `vaultRoot + sep` and end in `.md`; `phantom:` ids return 404. Tests live in `server/app.test.ts` and `server/integrations/*.test.ts` — keep them green when touching the server. The trust-model negatives (traversal, consent gates, token enforcement, agent sandbox) are release-blocking.
- **Frontend has no test framework.** `npm test` covers the scanner and all server modules. Verify UI changes manually with `npm run dev`.
- **Reader HTML is sanitized** with DOMPurify before `innerHTML` — integration-created notes carry untrusted content; keep the sanitizer when touching `openReader()`.
- **Themes** are CSS-variable sets in `THEMES` (`web/src/main.ts`); `--accent` drives link/active colors. Adding a theme = append to `THEMES` and to the `<select id="theme">` options in `web/index.html`.
- **Reader pane** docks/undocks: drag its header to float, double-click the header (or the dock button) to re-dock. Geometry persists in `localStorage` (`akasha-reader`).
- **Menubar** (`File / Layers / View / Tools / Help`) is click-to-open. The global click handler closes menus only when the click lands **outside** any `.menu`, so interacting with controls inside a dropdown (checkbox, `<select>`, layer toggle) keeps it open — preserve this when adding dropdown content.
- **`localStorage` keys are `akasha-*`** (theme, filters, reader geometry, custom colors, mode, collections) — kept from upstream for continuity, not renamed.
- **Integration modes are mutually exclusive** (`akasha-mode`) and **search-first**: the buttons change what the search field's Enter does; results open in the shared `#research` column (search bar hides, docked reader force-docks left via `ctx-left` — `!important` because the reader geometry engine sets inline `inset`). Web and Agent activation walks a consent modal first (R18) — never bypass it; web queries never auto-run while typing (they spend Exa credit).
- **Fork remotes:** `upstream` = `chntnm/akasha`, `origin` = `felores/solaris`. Keep the fork rebasable on upstream.

## Env

- `AKASHA_GRAPH` — override graph.json path (default `data/graph.json`).
- `AKASHA_PORT` — override server port (default `5175`).

Node 22+, npm. The core has no external services; everything runs on localhost. Optional integrations (qmd, Exa, OpenCode) are detected at runtime, never bundled.
