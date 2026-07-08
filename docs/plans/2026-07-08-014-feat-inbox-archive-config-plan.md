# Feat: Configurable Inbox And Archive Note Action

**Type:** feature
**Depth:** lightweight
**Created:** 2026-07-08
**Status:** implementation-ready

## Goal

Make the Inbox destination folder and Archive destination folder configurable in Admin settings (defaulting to `inbox` / `archive`), and add an Archive action button to the content-panel reader first row. Archiving moves a note out of the way (to the configured archive folder) rather than deleting it — the same safe "move to folder" behavior as the existing create path guarded under `write.ts`.

## Problem Frame

Today the note-creation path in `POST /api/notes` hardcodes the fallback destination to `cfg.writeDestination` (default `"inbox"`). The vault's raw and research notes have no Archive workflow — users must manually move files in Obsidian or via the filesystem. Adding a config picker and an archive action closes the loop without introducing a second writer path.

Scope is intentionally narrow: two Admin text fields, one new write helper, one new route, one icon button + handler. No git operations, no deletion, no trash system.

## Scope

**In scope**
- Add `archiveDestination` field to `SolarisConfig` (default `"archive"`).
- Add Inbox folder + Archive folder text fields to the Admin modal's Vault section, in the same row.
- Add `guardedMove` helper to `server/integrations/write.ts` — moves a file within the vault root, journals the operation, uses numeric suffix collision handling (same spirit as `guardedCreate`'s `existsSync` loop).
- Add `POST /api/archive` to `server/app.ts` — accepts `{ id }`, validates path, calls `guardedMove`, returns `{ ok: true, newId }`.
- Add archive icon button in the reader first-row right side (`#reader-actions .reader-actions-right`), to the left of the Obsidian button.
- Wire archive button click: confirm → `POST /api/archive` → incremental `rescan()` → close reader on success.
- Add EN + ES labels to `i18n.ts`.

**Out of scope**
- No delete or trash — archive is a move, not a removal. Separate from `#research-trash` (which deletes research-history entries, not vault files).
- No git commit or undo — this plan does not add git history for archive moves. If undo is needed later, it reuses the existing `guardedEdit` / `POST /api/notes` path.
- No bulk archive or multi-select.
- No special archive-hide behavior. After archive, the client runs the existing incremental rescan/hot-swap so the graph points at the new archive path.
- No changes to the Ingest mode's target selector or the wiki-ingest proposal pipeline.
- No desktop/Electron changes.

## Decisions

### D1. Archive = move to folder, not delete or trash
Archive moves the note file from its current vault-relative path to the configured archive destination folder, preserving the filename (with numeric suffix on collision). The change is journaled to `changes.jsonl` as action `"archive"`. The note is no longer in the active graph; the client closes the reader after a successful archive.

**Why:** No data loss path; the note still exists in the vault. A vault rescan will re-index the note at its new location, and the user can move it back manually or via a future undo feature.

### D2. `guardedMove` goes in `write.ts` — the sole vault-write path
The new `guardedMove(deps, { id, destination })` helper reuses `confineNoteId`, `requireVault`, and the symlink guard. It `renameSync`-moves the file (same filesystem = instant, no copy), falls back to copy+unlink for cross-device moves, and appends a changelog entry with `action: "archive"`. On filename collision in the destination, it applies the same numeric suffix loop as `guardedCreate`.

**Why:** Every vault-write operation must stay in one file to maintain the "single sanction" invariant. Reuse of `confineNoteId` means path-traversal defense is identical to the read routes and the create/edit helpers.

### D3. Admin fields placement — Vault section, same row, after vault path
Add a single row below the vault-path input: two short text fields `Inbox folder` and `Archive folder` side by side, defaulting to `inbox` / `archive`. Saved via the existing `saveAdmin()` → `postConfig()` path, and exposed via the existing config save route (`app.ts` lines 241-300).

**Why:** These are vault-level defaults, not wiki-scoped. The Vault section is the natural home. Side-by-side keeps the modal compact.

### D4. Archive icon — first-row right side, before Open in Obsidian
Place the archive button in `#reader-actions .reader-actions-right`, left of the existing `#open-obsidian` button. SVG icon: a simple archive box / down-arrow-into-box icon from the same icon set (feather-style). Tooltip "Archive note" with i18n key `"reader.archive"`.

**Why:** The first row is the reader header; archive is a reader action. The right side matches the pattern of other view-level actions. Observing the existing button ordering: find toggle → version toggle → obsidian → dock → close. Archive goes after the version toggle and before obsidian (closer to content actions, before the window/dock actions).

### D5. Archive triggers the existing incremental rescan, then closes the reader
After a successful archive, the note no longer exists at its old path. Leaving the graph stale would make the old node fetch a missing file. The simplest correct behavior is to reuse the existing `rescan(false)` hot-swap path after `POST /api/archive`, then close the reader/clear selection. A confirm dialog (`"Archive this note to <folder>?"`) prevents accidents.

**Why:** `rescan(false)` already exists for changed vault contents and hot-swaps the graph. Reusing it avoids a bespoke single-node removal path and avoids stale node ids. Archived notes remain visible after rescan under the configured archive folder unless the user excludes that folder separately.

### D6. Archive route is behind the `guarded` token
`POST /api/archive` shares the same origin/Host guard baked into the app factory and uses `guarded` for consistency with `/api/notes` create/edit. Same token check, same trust boundary.

**Why:** All vault-mutating endpoints use the `guarded` middleware. Archive is vault-mutating.

## Implementation Units

### U1 — Server: add `archiveDestination` to config
**Files**
- `server/integrations/config.ts`

**Behavior**
- Add `archiveDestination: string` to `SolarisConfig` interface (after `writeDestination`).
- Add `archiveDestination?: string` to `ConfigPatch`.
- Add `archiveDestination: "archive"` to the default config returned by `defaultConfig()` (after `writeDestination: "inbox"`).
- Add a `merge()` case mirroring `writeDestination`: if `p.archiveDestination` is a non-empty string, persist it.
- Existing configs without `archiveDestination` will merge the default (the config-loader already spreads `defaultConfig()` as fallback).

### U2 — Server: add `guardedMove` to `write.ts`
**Files**
- `server/integrations/write.ts`

**Behavior**
- New export interface `MoveOptions`:
  ```ts
  export interface MoveOptions {
    id: string;
    destination: string;     // vault-relative folder, e.g. "archive"
    actor: ChangeLogEntry["actor"];
  }
  ```
- New export `guardedMove(deps: WriteDeps, opts: MoveOptions): { id: string }`:
  1. `requireVault(deps.vaultRoot)`.
  2. `const full = confine(deps.vaultRoot, opts.id)` — existing path guard.
  3. If `!existsSync(full)`: throw `WriteError(404, "note not found")`.
  4. Compute dest rel path: `join(opts.destination, basename(full))`, then call `confine(deps.vaultRoot, destRel)`.
  5. Ensure dest dir exists: `mkdirSync(dirname(destFull), { recursive: true })`.
  6. Collision loop (same pattern as `guardedCreate` lines 138-146): while `existsSync(destFull)`, append `-N` suffix before `.md`.
  7. `renameSync(full, destFull)` — atomic on same filesystem. If `EXDEV` (cross-device), fall back to `copyFileSync` + `unlinkSync`.
  8. Compute `newId = relative(resolve(deps.vaultRoot), destFull)`.
  9. `appendChangeLog(deps.dataDir, { at, actor, action: "archive", path: opts.id, newPath: newId })`.
  10. Return `{ id: newId }`.
- Add `newPath` field to `ChangeLogEntry` (optional, only for archive actions).
- Export `guardedMove` from the module.

### U3 — Server: add `POST /api/archive` route
**Files**
- `server/app.ts`

**Behavior**
- Import `guardedMove` and `WriteError` from `write.ts`.
- Add new route block after `PUT /api/notes` (line ~1227):
  ```ts
  app.post("/api/archive", guarded, express.json({ limit: "1mb" }), (req, res) => {
    try {
      const { id } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof id !== "string") {
        res.status(400).json({ error: "id required" });
        return;
      }
      const cfg = loadConfig(configPath);
      const r = guardedMove(writeDeps(), {
        id,
        destination: cfg.archiveDestination ?? "archive",
        actor: "user",
      });
      res.json({ ok: true, id: r.id });
    } catch (e) {
      writeFail(res, e, "archive");
    }
  });
  ```

### U4 — Frontend: Admin modal Inbox + Archive fields
**Files**
- `web/src/main.ts`

**Behavior**
- In `IntegrationsStatus`, add top-level `writeDestination: string` (already returned by the server) and `archiveDestination: string`.
- In `openAdmin()`, inside the Vault section (`<section class="admin-section">`), add a new row below the vault-path input:
  ```html
  <div class="admin-folder-row">
    <label class="admin-folder-field"><span>${T("admin.inboxFolder")}</span><input id="admin-inbox-input" type="text" value="${escapeHtml(inboxFolder)}"></label>
    <label class="admin-folder-field"><span>${T("admin.archiveFolder")}</span><input id="admin-archive-input" type="text" value="${escapeHtml(archiveFolder)}"></label>
  </div>
  ```
- Read `inboxFolder` and `archiveFolder` from top-level integration status fields: `integrations?.writeDestination ?? "inbox"` and `integrations?.archiveDestination ?? "archive"`.
- Add `archiveDestination: cfg.archiveDestination` beside the existing top-level `writeDestination` in `GET /api/integrations` and the `POST /api/integrations/config` response.
- In `saveAdmin()`, collect folder values:
  ```ts
  const inboxFolder = ($("#admin-inbox-input") as HTMLInputElement).value.trim() || "inbox";
  const archiveFolder = ($("#admin-archive-input") as HTMLInputElement).value.trim() || "archive";
  ```
- Include them in the `postConfig` payload:
  ```ts
  await postConfig({
    vaults: ...,
    prompts,
    writeDestination: inboxFolder,
    archiveDestination: archiveFolder,
  });
  ```
No `folders` wrapper object is needed; `ConfigPatch` already supports top-level scalar config fields, so add `archiveDestination` beside the existing `writeDestination`.

### U5 — Frontend: archive icon + handler
**Files**
- `web/index.html`
- `web/src/main.ts`
- `web/src/i18n.ts`

**Behavior**
- `web/index.html`:
  - In `#reader-actions .reader-actions-right`, insert a new archive button before `#open-obsidian`:
    ```html
    <button id="reader-archive" class="reader-icon" title="Archive note" data-i18n-title="reader.archive" aria-label="Archive note"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M3 3h18v5H3z"/><path d="M10 12h4"/></svg></button>
    ```
- `web/src/main.ts`:
  - Wire `$("#reader-archive").addEventListener("click", async () => { ... })`.
  - Handler:
    1. If `openNodeId` is null, return.
    2. Confirm: `confirm(T("reader.archiveConfirm", { folder: archiveFolder }))`.
    3. `await api("/api/archive", { json: { id: openNodeId } })` using the existing `api` helper.
    4. If success: clear selection, run `await rescan(false)` or the same incremental rescan helper used by File → Rescan, close reader, optionally flash a brief status.
    5. On error: show error in the reader body.
- `web/src/i18n.ts`:
  - Add to EN:
    - `"reader.archive": "Archive note"`
    - `"reader.archiveConfirm": "Archive this note to {folder}?"`
    - `"admin.inboxFolder": "Inbox folder"`
    - `"admin.archiveFolder": "Archive folder"`
    - `"admin.foldersHint": "Default folders for note creation and archiving"`
  - Add to ES:
    - `"reader.archive": "Archivar nota"`
    - `"reader.archiveConfirm": "¿Archivar esta nota en {folder}?"`
    - `"admin.inboxFolder": "Carpeta de entrada"`
    - `"admin.archiveFolder": "Carpeta de archivo"`
    - `"admin.foldersHint": "Carpetas por defecto para crear y archivar notas"`

### U6 — Tests
**Files**
- `server/integrations/write.test.ts`
- `server/app.test.ts` (or `server/integrations/api.test.ts`)

**Behavior**
- `write.test.ts`:
  - New test: `guardedMove moves a note to destination folder`.
  - New test: `guardedMove throws 404 for nonexistent note`.
  - New test: `guardedMove handles filename collision with numeric suffix`.
  - New test: `guardedMove preserves content after move`.
  - Use the existing temp-vault setup (temp dir with `mkdirSync`, write a test `.md`, then assert file existence at old + new path).
- `app.test.ts` or `api.test.ts`:
  - New test: `POST /api/archive with valid id returns ok`.
  - New test: `POST /api/archive with phantom: id returns 400` (path guard).
  - New test: `POST /api/archive with traversal path returns 400`.
  - New test: `POST /api/archive with missing id returns 400`.

**Note:** Config save tests should cover direct `writeDestination` and `archiveDestination` updates through the existing config patch path.

## Key Technical Decisions Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Archive = move to folder, not delete | No data loss; note still exists in vault; rescan re-indexes it |
| D2 | `guardedMove` in `write.ts` | Single sanctioned vault-write path invariant; reuses path guard |
| D3 | Admin fields in Vault section, same row | Natural home for vault-level defaults; compact |
| D4 | Archive icon before Obsidian button | Content action before window actions; matches icon ordering pattern |
| D5 | Archive runs existing incremental rescan, then closes reader | Avoids stale node ids without bespoke graph mutation |
| D6 | Archive route behind `guarded` token | All vault-mutating endpoints use the CSRF token guard |

## Risks & Mitigations

- **Cross-device move fails** — `renameSync` throws `EXDEV` when source and dest are on different filesystems. Mitigated: `guardedMove` catches `EXDEV` and falls back to `copyFileSync` + `unlinkSync`.
- **Admin folder fields diverge from saved config** — The fields are pre-filled from the integrations status (which reflects saved config). If the config save fails, the previous values remain on the server. The standard `postConfig` error handling (flash `admin.saveFail`) already covers this.
- **User archives a note already in the archive folder** — The note is moved from its current location to `<archiveDestination>/basename.md`. If the note was already in the archive folder, it moves again inside that folder (e.g. `archive/note.md` → `archive/note-2.md`). Acceptable minimal behavior; the collision suffix handles the edge case without error.
- **Archived notes still appear after rescan** — Archive is a move, not a hide/delete. If users want archived notes hidden from the graph, they can exclude that folder later; this feature does not add archive-filter semantics.
- **Archive path traversal** — `guardedMove` reuses the existing `confine()` wrapper for both source and destination. Destination is `join(destination, basename)` then confined under the vault root, so `../outside` is rejected the same way `guardedCreate` rejects bad destinations.
- **Admin modal dirty-state before archive** — The archive button is in the reader, not the admin modal. No interaction.
- **i18n key naming collision** — `reader.archive`, `reader.archiveConfirm`, `admin.inboxFolder`, `admin.archiveFolder` — all new, no existing collisions.

## Test Scenarios

### U1 — config
- `loadConfig()` returns default with `archiveDestination: "archive"` when key absent.
- `loadConfig()` respects persisted `archiveDestination`.
- Old configs without `archiveDestination` get the default from `defaultConfig()` during merge.

### U2 — guardedMove
- `guardedMove(deps, { id: "inbox/note.md", destination: "archive", actor: "user" })` moves the file to `archive/note.md`.
- File at old path no longer exists.
- File at new path has identical content.
- Changelog contains entry with `action: "archive"`, original `path`, and `newPath`.
- Collision: `archive/note.md` exists → moves to `archive/note-2.md`.
- Nonexistent source: throws `WriteError(404)`.
- Traversal path: throws `WriteError(400)`.

### U3 — POST /api/archive
- Valid note: returns `{ ok: true, id: "..." }` and file moves.
- Missing `id` param: returns 400.
- Phantom id (`phantom:some-note`): returns 400.
- Traversal id (`../../etc/passwd`): returns 400.
- Nonexistent note: returns 404.

### U4 — Admin modal fields
- Admin modal shows Inbox folder and Archive folder inputs, pre-filled from saved config (or defaults).
- Changing Inbox folder to `proyectos` and clicking Save persists the value (check via re-opening Admin).
- Changing Archive folder to `old-notes` and clicking Save persists.
- Blank values fall back to `inbox` / `archive` on save.

### U5 — Archive button
- Reader open on a vault note: archive icon visible in first row, right side, before Obsidian icon.
- Clicking archive with a note open: confirm dialog shows the folder name.
- Confirming: sends `POST /api/archive`, incremental rescan hot-swaps the graph, reader closes, node deselected.
- Clicking archive with no note open: no-op.
- Archive button i18n: tooltip shows "Archive note" in EN, "Archivar nota" in ES.
- Confirm dialog: "Archive this note to archive?" in EN, "¿Archivar esta nota en archive?" in ES.
- Confirm dialog shows the configured archive folder name (not the literal `{folder}` template).

## Dependencies & Sequencing

- U1 (config) is independent — implement first (small, low risk).
- U2 (guardedMove) depends on U1 for the destination default — implement second.
- U3 (route) depends on U2 — implement third.
- U4 (Admin UI) is independent of U2/U3 (config values flow through the same config save path) — can be parallel with U2/U3.
- U5 (archive button) depends on U3 — implement fourth.
- U6 (tests) — write alongside U2/U3 for server tests; U5 may need a test for the handler (manual `npm run dev` check is sufficient for the DOM/icon).
- Suggested order: U1 → U2 → U3 (+ U6 server tests) → U4 → U5 → U6 frontend check → `npm test` + `npm run typecheck` + manual `npm run dev` pass.

## Verification

- `npm test` — server tests (`guardedMove`, `POST /api/archive`) green. Config tests green.
- `npm run typecheck` — no new TS errors.
- `npm run dev` manual pass:
  1. Open Admin: Inbox folder and Archive folder inputs visible, pre-filled with defaults.
  2. Change both, save, reopen Admin: values persisted.
  3. Click a vault note → reader opens → archive icon visible in first row.
  4. Click archive: confirm dialog shows the configured archive folder.
  5. Confirm: file moves on disk, graph hot-swaps through incremental rescan, reader closes.
  6. Change archive folder to `old-stuff`, archive another note: file lands in `old-stuff/`.
  7. Archive a note that has a name collision in the destination: numeric suffix applied (e.g. `note-2.md`).
  8. `POST /api/archive` with phantom/traversal/missing id: 400.
  9. Spanish mode: all new labels render in Spanish.
  10. Re-scan vault: archived notes appear at their new paths.
