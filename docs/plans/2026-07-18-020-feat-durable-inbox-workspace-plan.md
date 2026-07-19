---
title: Durable Inbox Workspace for Users and Agents - Plan
type: feat
date: 2026-07-18
topic: durable-inbox-workspace
roadmap_id: RM001
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Durable Inbox Workspace for Users and Agents - Plan

## Goal Capsule

- **Objective:** Replace new app-local working documents with guarded, journaled Markdown notes in the configured Inbox, while preserving research evidence, pin-aware arrival, dual-panel editing, and explicit wiki promotion.
- **Product authority:** `STRATEGY.md`, `PRODUCT.md`, `ROADMAP.md` RM001, `CONTEXT.md`, and the planning decisions recorded on 2026-07-18.
- **Depends on:** The shipped research pin/current-view and editable-editor behavior from plan 019 and plan 018.
- **Stop conditions:** Do not add another vault writer, silently migrate legacy temporary documents, make graph membership a prerequisite for reading an Inbox note, or permit two active editors for one canonical note path.
- **Open blockers:** None.

## Product Contract

### Lifecycle

The canonical lifecycle is:

```text
Research evidence -> Inbox working note -> Wiki knowledge
```

Research history remains app-local and disposable for web, article, semantic, and keyword evidence. New user-authored and agent-authored documents become Markdown notes under the configured `writeDestination` as soon as their title is confirmed. Inbox notes use the same guarded create/edit/move path, hash-based concurrency, journal, search, and portability as every other vault note.

Legacy `mode: "document"` research entries remain readable, editable, and promotable. They are not silently copied into the vault. All first-party creation paths stop creating them.

### Requirements

**Durable creation and identity**

- R1. New user and agent documents are created through `guardedCreate()` in the configured Inbox; `/api/document` is no longer the first-party creation path.
- R2. A user creates a note by entering a required title inline before the write. Cancel creates nothing. There is no `untitled.md` placeholder file.
- R3. An agent creation requires a non-empty title and complete Markdown. `guardedCreate()` derives the stable path and applies its existing numeric collision suffix.
- R4. A saved note is identified by vault-relative path plus SHA-256 base hash, not by research id plus revision.
- R5. User-created writes are journaled as `actor: "user"`; agent/tool/delegation writes are journaled as `actor: "agent"`. The server chooses the actor from the calling route/surface, never from an untrusted body field.

**Inbox collection and navigation**

- R6. `GET /api/inbox` lists Markdown notes recursively under the configured `writeDestination`, independent of graph membership. Each item includes path, title, modified time, and content hash.
- R7. A successful create, edit, archive, or wiki move refreshes the Inbox collection immediately without requiring a graph rescan.
- R8. Research and Inbox are separate navigation collections in the research panel. Previous/next and position operate only inside the active collection and retain a separate cursor for each.
- R9. The research header exposes a compact Research/Inbox collection switch using existing panel controls. Inbox has an inline title/create affordance and no research-history trash semantics.
- R10. The research pin protects the visible right-panel item regardless of collection. A different agent-created Inbox note enters Inbox navigation but does not replace a pinned item.
- R11. When unpinned, an agent-created Inbox note opens immediately in the research panel. A user-created note opens there after creation.

**Single-editor ownership**

- R12. One canonical path has at most one mounted editor. Different paths may remain open side by side in the reader and research panels.
- R13. Graph nodes, global search results, semantic hits, wiki-links, reader history, and explicit `open_note` actions target the reader panel. Inbox list navigation and newly created Inbox notes target the research panel.
- R14. If the target path is already mounted in the other panel, the app transfers ownership instead of mounting a second editor.
- R15. Clean ownership transfers immediately. A saving editor is awaited. A dirty editor is flushed first. Transfer proceeds only after the editor reaches `clean`.
- R16. A `conflict` or `error` blocks transfer, keeps and focuses the existing editor, and exposes the existing reload/overwrite or retry resolution. No discard path is implicit.
- R17. Closing, navigating away, collection switching, promotion, archive, and panel transfer all use the same flush-before-destroy rule.

**Promotion and arrival**

- R18. Saving web/article evidence to Inbox removes the research-history entry only after the guarded create succeeds, keeps the right panel open, displays the saved note there, and transfers a source pin to the new path.
- R19. Moving an Inbox note through approved wiki ingest removes it from Inbox, clears a matching right-panel pin, destroys its editor, and opens the canonical RAW/result path in the reader panel.
- R20. Wiki ingest remains proposal-first and explicitly approved. Proposals capture the source hash and every existing edit target hash. Apply preflights every operation, rejects any stale hash before writing, applies creates/edits first, and moves the Inbox source to RAW last so a later derived-write failure cannot strand a partially moved source. External spending remains behind the existing key/consent gates.
- R21. Archive remains a move through `guardedMove()`; no Inbox action hard-deletes a saved note.

**Legacy document compatibility**

- R22. Existing `mode: "document"` entries continue to use `/api/document`, revision conflicts, and explicit Save to Inbox. They remain in Research navigation and are visibly labeled legacy working documents.
- R23. `write_document` and `read_working_document` use `{ note, baseHash }` for new vault-backed work. They accept `{ documentId, revision }` only when that id already resolves to a legacy `mode: "document"` entry.
- R24. `/api/document` remains available for legacy read/update/promote, but first-party UI, voice, delegation, MCP, and CLI stop creating new entries there. No automatic **vault migration** runs at startup or read time. The existing app-local revision backfill for a legacy entry missing a revision may remain because it does not create or change a vault note.
- R25. `save_research_to_inbox` remains the evidence-to-Inbox action and the explicit legacy-document promotion action.

**Searchability versus graph visibility**

- R26. Keyword, exact, path, and semantic note-result mapping use a vault catalog that is independent of `graph.nodes`.
- R27. User-configured Admin exclusions are hard exclusions from graph, catalog, search, Inbox listing where applicable, and wiki discovery.
- R28. Internal non-content directories remain hard safety exclusions. Scanner presentation defaults such as RAW/history/root operational notes may stay out of the graph without being automatically removed from search.
- R29. Semantic graph edges remain restricted to graph nodes. Semantic search may return any catalog note covered by qmd. If qmd has not indexed a new note yet, keyword/exact/path search still finds it immediately.
- R29a. `/api/current-view/open-note` validates a requested path against the confined vault catalog or `noteFileOrFail()`, not `graph.nodes`, so MCP/CLI can explicitly open a searchable catalog-only note.

**Trust and interface**

- R30. Every new user-facing label, state, and error has matching English and Spanish keys in `web/src/i18n.ts`.
- R31. New mutation routes retain host/origin and session-token enforcement. Paths remain `.md`-only, symlink-aware, and vault-confined.
- R32. `current_view` reports the actual note path and dirty/save state for whichever panel owns an Inbox editor; it never claims a blocked pinned arrival opened.

### Acceptance Examples

- AE1. Creating “Q3 priorities” writes `writeDestination/q3-priorities.md`, journals it, and opens that path in the research panel; cancelling before title submission writes nothing.
- AE2. An agent creates “Client brief” while Research result A is pinned. The note appears in Inbox navigation, A remains visible, and the display acknowledgment reports `blocked-pinned`.
- AE3. The same note is open clean in the reader. Opening it from Inbox destroys the reader editor, mounts it in research, and preserves the exact Markdown and base hash.
- AE4. The same note is dirty in the reader. Opening it from Inbox flushes first; on success it transfers, and on conflict it stays in the reader with no second editor.
- AE5. Saving pinned web evidence to Inbox deletes the evidence history entry only after create succeeds, keeps the panel open on the new note, and pins the note path.
- AE6. Approved wiki ingest preflights source and target hashes, applies derived creates/edits, moves the Inbox source to RAW last, clears its research pin/editor, removes it from Inbox immediately, and opens the resulting path in the reader. Any stale hash or failed derived operation leaves the source at its Inbox path.
- AE7. An existing legacy temporary document remains editable through `/api/document` and can be explicitly promoted. No vault file appears merely because it was read.
- AE8. A note excluded from graph presentation but not by an Admin exclusion is returned by keyword/path search and can be opened by path.
- AE9. A note under an Admin-excluded folder is absent from graph, search catalog, Inbox collection, and wiki discovery.
- AE10. A newly created Inbox note is available in Inbox navigation and keyword/path search before any graph rescan or qmd update.

## Planning Contract

### Key Technical Decisions

- KTD1. **Inbox is a vault location, not a new datastore.** The configured `writeDestination` is the only source of truth for Inbox membership.
- KTD2. **No placeholder files.** User creation has a small inline title step; agent tools already have enough context to provide a title.
- KTD3. **Path plus hash is the shared document identity.** This reuses `PUT /api/notes`, `createAutosave()`, and the existing conflict contract.
- KTD4. **One reusable vault-note editor session owns persistence.** Extract the reader’s note editor/autosave wiring into a host-agnostic controller that can mount in either panel. Keep panel chrome and panel-specific actions in `main.ts`.
- KTD5. **Transfers are flush gates, not copy operations.** Await `saving`; flush `dirty`; block on `conflict`/`error`; destroy only after clean.
- KTD6. **Inbox listing is filesystem-backed and graph-independent.** A small server module lists only the configured Inbox with the same confinement/exclusion rules as reads and writes.
- KTD7. **Search gets a vault catalog; the graph remains a presentation model.** MiniSearch, exact, path, and qmd note mapping consume catalog entries. Semantic edge construction still intersects vectors with graph ids.
- KTD8. **Legacy compatibility is narrow and evidence-backed.** Existing persisted temporary entries and external tool callers justify legacy read/update support; no new first-party caller creates them.
- KTD9. **Collection switch, not tabs or a new panel.** The existing right panel and navigation controls show either Research or Inbox. The left reader remains the default graph/search note surface.
- KTD10. **Promotion transfers the pin.** Evidence-to-Inbox preserves the user’s protected context by changing the pin identity from history id to canonical note path.

### Directional Contracts

```ts
type InboxEntry = {
  id: string;       // vault-relative .md path
  title: string;
  modifiedAt: string;
  baseHash: string;
};

type EditorOwner = "reader" | "research";

type WorkingDocumentIdentity =
  | { note: string; baseHash: string }
  | { documentId: string; revision: string; legacy: true };
```

`POST /api/notes` returns `{ ok, id, baseHash }`. The new agent-only note creation adapter sets `actor: "agent"` server-side and returns the same shape. `PUT /api/notes` returns the new `baseHash` after success so clients do not need an extra read.

## Implementation Units

### U1. Vault catalog and Inbox listing

- **Files:** new `server/integrations/vault-catalog.ts`, `server/app.ts`, `server/integrations/config.ts`, focused tests.
- **Work:** Walk vault Markdown with symlink/path confinement; apply internal safety exclusions and active Admin exclusions; derive title/mtime/hash; expose `listInbox()` and catalog entries. Add `GET /api/inbox`. Refresh the catalog and invalidate MiniSearch after successful writes/moves and config exclusion changes.
- **Tests:** Recursive Inbox listing, configured destination, symlink/traversal rejection, Admin hard exclusions, graph-independent note, mutation refresh.

### U2. Search decoupling from graph membership

- **Files:** `server/integrations/notes-index.ts`, `search-vault.ts`, `qmd.ts`, `qmd-vectors.ts` comments/contracts, `server/app.ts`, related tests.
- **Work:** Build keyword/exact/path inputs from the vault catalog. Pass catalog title maps to qmd node-result mapping. Preserve graph intersection in `semantic.ts`. Make newly written notes immediately available to local search; document qmd eventual indexing. Change `/api/current-view/open-note` to use the confined catalog/read guard rather than graph membership.
- **Tests:** Catalog-only keyword/exact/path hit, qmd catalog hit, Admin-excluded miss, semantic graph edge still excludes non-graph ids, and MCP/CLI explicitly opens a catalog-only note.

### U3. Vault-note editor session and ownership transfer

- **Files:** new or extracted `web/src/vault-note-session.ts`, `web/src/main.ts`, `web/src/autosave.ts` only if a small lifecycle hook is needed, tests.
- **Work:** Move note editor/autosave/base-hash lifecycle out of reader-only globals. Track reader and research owners by path. Implement `openVaultNote(path, owner, origin)` and the clean/dirty/saving/conflict transfer table. Keep one crash-recovery mirror keyed by vault+path.
- **Tests:** clean transfer, dirty flush, saving wait, conflict/error block, different notes side by side, stale async open cannot steal ownership.

### U4. Research/Inbox collections and creation UX

- **Files:** `web/index.html`, `web/src/main.ts`, `web/src/style.css`, `web/src/i18n.ts`, `web/src/research-state.ts`, focused tests.
- **Work:** Add the compact collection switch, separate arrays/cursors, Inbox position/list refresh, inline title/create/cancel controls, Inbox note renderer/editor host, collection-specific actions, and pin identity that supports history ids or note paths. Preserve content/metadata typography from `DESIGN.md`.
- **Tests:** Independent cursors, pin blocks cross-collection agent arrival, cancellation writes nothing, successful create opens note, no research-trash action in Inbox.

### U5. Agent tools and delegation migration

- **Files:** `server/integrations/registry.ts`, `voice-tools.ts`, `delegate.ts`, `mcp-bridge.ts`, `voice.ts`, snapshots and tests.
- **Work:** Route new `write_document` create/update and delegation output through guarded Inbox notes with server-selected agent actor. Update read/write contracts to note+baseHash. Emit `open_saved_note` for pin-aware research-panel arrival. Keep legacy documentId/revision only for existing entries.
- **Tests:** Agent create journals actor agent, update requires prior read/hash, stale hash conflicts, delegation returns note path, legacy id still reads/updates, unknown legacy create is rejected.

### U6. Evidence save and wiki promotion transfer

- **Files:** `server/app.ts`, `server/integrations/wiki-ingest.ts`, `server/integrations/write.ts`, `web/src/main.ts`, related tests.
- **Work:** Return hash/path from evidence save; replace the history entry with its Inbox note in-place; transfer pin; avoid rescan dependency. Add source and existing-target hashes to wiki proposals. Before apply, validate the full operation set and all hashes without writing; then apply derived creates/edits and move the Inbox source last. Return canonical source/result path, remove Inbox membership, destroy matching right editor, clear pin, and open reader. A failed/stale preflight writes nothing; a derived write failure leaves the source in Inbox and returns the already-applied operation details for explicit recovery rather than pretending atomicity.
- **Tests:** write-before-delete, failed create retains evidence, pin transfer, stale source/target writes nothing, derived failure leaves source in Inbox and reports partial derived operations, source move is last, wiki apply teardown/open, archive never deletes.

### U7. Legacy document boundary

- **Files:** `server/app.ts`, `research-history.ts`, `web/src/research-document.ts`, registry/tool tests, E2E fixture.
- **Work:** Label legacy documents, retain read/update/promote, stop first-party creation, and reject supplied unknown legacy ids. Do not scan or migrate existing entries into the vault. Preserve the current app-local revision backfill when an old entry lacks a revision.
- **Tests:** legacy read creates no vault note, optional revision backfill stays app-local, update conflict remains revision-based, explicit promote succeeds, first-party flows create no new `mode=document` entries.

### U8. End-to-end proof and design documentation

- **Files:** `tests/e2e/research-pinning.spec.ts`, `tests/e2e/editable-reader.spec.ts` or a focused Inbox spec, `DESIGN.md`.
- **Work:** Cover creation, pin-aware agent arrival, collection navigation, editor transfer, evidence save, and wiki move at desktop and narrow viewport. Document collection switch and editor ownership rules.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Focused server | `npm test -- --run server/integrations/write.test.ts server/integrations/notes-index.test.ts server/integrations/search-vault.test.ts server/integrations/qmd.test.ts server/app.test.ts` | Guarded persistence, catalog search, listing, exclusions, and legacy routes. |
| Focused tools | `npm test -- --run server/integrations/voice-tools.test.ts server/integrations/delegate.test.ts server/integrations/mcp-bridge.test.ts server/integrations/registry.test.ts` | Agent note identity, actor routing, delegation, and compatibility. |
| Focused frontend | `npm test -- --run web/src/autosave.test.ts web/src/research-state.test.ts web/src/research-document.test.ts` plus the new vault-note-session test | Ownership and transfer state are deterministic. |
| Full gates | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Repository release contract and browser diagnostics remain clean. |

## Definition of Done

- All new first-party documents are durable Inbox Markdown notes.
- Research and Inbox navigation are distinct, pin-aware collections.
- One path cannot acquire two live editors.
- Legacy temporary documents remain explicit and side-effect-free until promoted.
- Searchability no longer depends on visual graph membership, while Admin exclusions remain hard.
- Evidence save, archive, and wiki promotion preserve guarded writes and explicit approval.
- English/Spanish UI, focused tests, serial gate, desktop, and narrow-viewport E2E pass.

## Supersession and Boundaries

- Supersedes plan 019 R12-R17, KTD6-KTD8, and U3-U4 only for **new** working-document creation and identity.
- Preserves plan 019 pin/current-view behavior, evidence immutability, selection rules, typography, and legacy document conflict handling.
- Preserves plan 018 editor round-trip, frontmatter protection, autosave, mirror, and hash-CAS requirements.
- Excludes Inbox Review and suggestion state; those belong to RM002.
- Excludes scheduling/background routines; those belong to RM003.
