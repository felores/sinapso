---
title: Voice Documents And URL Routing - Plan
type: fix
date: 2026-07-08
topic: voice-documents-url-routing
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Voice Documents And URL Routing - Plan

## Goal Capsule

- **Objective:** Fix voice-created temporary documents so separate drafts do not overwrite each other, and make voice opening of web links route through the existing article research path instead of the vault note reader.
- **Product authority:** User report plus diagnostic artifact `.scratchpad/2026-07-08-224329_voice-tools-url-diagnostic.md`.
- **Execution profile:** Server voice-tool changes plus small frontend research-panel fixes. Keep the existing `data/research/` history store, `/api/article`, `/api/document`, `/api/document/:id/promote`, and `/api/note` path guards.
- **Stop conditions:** Stop before adding a new persistence model, a second web fetch route, browser-opening behavior, hard deletes of vault notes, or cross-session document management UX.

---

## Product Contract

### Summary

Voice currently has one `workingDocId` per conversation and the prompt tells the model there is "ONE working document per conversation". A second draft posts the same document id to `/api/document`, and `upsertEntry` overwrites the first temporary document. URL handling is also split across tools: `open_note` targets vault-relative `.md` notes and `fetch_url` targets web URLs, so the model can choose the wrong domain when the user says "open that link". The fix is to make voice documents addressable and add one resource-opening boundary that routes URLs, research-history ids, and vault notes to the right existing primitive.

### Requirements

#### Voice documents

- **R1.** Voice can create two or more temporary documents in one session; different drafts receive different ids and coexist in research history.
- **R2.** Voice can update a specific temporary document by id without overwriting another document.
- **R3.** `save_working_document` can promote a specified document id; when no id is supplied it keeps the current active-document fallback.
- **R4.** The system prompt and tool descriptions teach the model to create a new document for a separate artifact and update only when the user is revising an existing artifact.

#### Resource routing

- **R5.** Voice has a single `open_resource` tool that routes `http(s)` URLs to `/api/article`, research-history ids to `open_research`, and vault-relative `.md` ids to `open_note`.
- **R6.** `open_note` rejects `http(s)` URLs before calling `/api/note`, so wrong-tool calls do not open similar vault notes.
- **R7.** `current_view` includes enough recent research identity for voice references like "that link" or "the second result": entry ids, modes, queries, article URLs, document titles, and top web result titles and URLs.
- **R8.** Frontend selected research context includes the nearest web result or source URL when the user highlights text inside a web result or source link.

#### Research panel consistency

- **R9.** A `show_document` voice action selects the shown document's exact history entry by id after reloading history, not always index 0.
- **R10.** Saving a `mode: "document"` entry from the research panel deletes that temporary history entry after the vault note is created, matching article save and voice promotion behavior.

### Acceptance Examples

- **AE1.** Ask voice for document A, then for a separate document B. Research history contains two `mode: "document"` entries with different ids.
- **AE2.** Ask voice to revise document A while document B exists. Document A changes and document B stays unchanged.
- **AE3.** Ask voice to save document A while document B exists. `/api/document/:id/promote` is called for A's id, A is removed from history, and B remains temporary.
- **AE4.** Ask voice to open `https://example.com/a`. It calls the URL/article route, opens a `mode: "article"` research entry, and does not send an `open_note` action.
- **AE5.** If the model calls `open_note` with `https://example.com/a`, the tool returns a URL-specific error and sends no browser action.
- **AE6.** Ask voice to open an existing vault note path like `folder/a.md`. It opens the reader via the current note path flow.
- **AE7.** Ask voice to open a research-history id. It reopens that stored research entry without spending web credit.
- **AE8.** Highlight text inside a web result. The voice context includes the selected text and that result's URL.
- **AE9.** Saving an agent document with the research-panel save button creates a vault note and removes the temporary document entry from history.

### Scope Boundaries

**In scope**

- Addressable voice working documents inside a single voice session.
- Optional `documentId` and `operation` fields on `write_document`.
- Optional `documentId` on `save_working_document`.
- New `open_resource` voice tool built from existing `open_note`, `/api/article`, and research-history behavior.
- Strict URL rejection in `open_note`.
- Richer `current_view.recentResearch` payload with bounded web result URLs.
- Frontend selection URL capture for research results.
- Exact history index selection for `show_document`.
- Move-on-save behavior for `mode: "document"` research entries.

**Deferred for later**

- Cross-session document picker or document dashboard.
- Document branching UI.
- Full voice command grammar for "first/second result" beyond exposing ids and URLs in context.
- Non-Exa URL fetching.
- Additional browser-side voice actions for clicking arbitrary DOM elements.

**Outside this product's identity**

- A second vault-write path. Temporary history stays in `data/research/`; vault notes are still created through existing guarded note-write routes or document promotion.
- Treating URLs as vault note ids.
- Silent web spending while typing. URL fetches still require explicit voice/user action and the existing Web consent and Exa key gates.

### Sources And Research

- Diagnostic source: `.scratchpad/2026-07-08-224329_voice-tools-url-diagnostic.md`.
- Voice tool seam: `server/integrations/voice-tools.ts`.
- Voice prompt: `server/integrations/voice.ts`.
- Document and article routes: `server/app.ts`.
- Temporary research storage: `server/integrations/research-history.ts`.
- Vault path guard: `server/integrations/paths.ts`.
- Research panel and voice action handling: `web/src/main.ts`.
- Selection-context pure helpers: `web/src/selection-context.ts`.
- Existing tests: `server/integrations/voice-tools.test.ts`, `server/integrations/voice-promote.test.ts`, `server/integrations/research-history.test.ts`, `web/src/selection-context.test.ts`.
- External research: skipped. This is a local integration bug with established repo patterns.

---

## Planning Contract

### Key Technical Decisions

- **KTD1.** Keep the persistence model unchanged. `server/integrations/research-history.ts` already supports multiple `mode: "document"` entries; only the voice session state and prompt need to stop treating documents as a singleton.
- **KTD2.** Replace `workingDocId` with `activeWorkingDocId` plus a small session-local set of known document ids. Generated ids remain `doc-<timestamp>-<slug>`. Model-supplied ids are accepted only for known or existing `mode: "document"` history entries.
- **KTD3.** Extend `write_document` with `operation?: "create" | "update"` and `documentId?: string`. `operation: "create"` always mints a new id. `operation: "update"` requires a known or existing document id. Missing fields preserve the current fallback: create when there is no active doc, update the active doc when there is one.
- **KTD4.** Extend `save_working_document` with `documentId?: string`. It promotes that id when supplied, otherwise promotes `activeWorkingDocId`. After promotion, remove that id from the session set and clear the active id only if it was the saved document.
- **KTD5.** Add `open_resource` rather than making the model decide between `open_note` and `fetch_url`. The router is small: `http(s)` -> shared URL fetch helper, research-history id -> `open_research`, `.md` path -> note preview and `open_note`, anything else -> error telling the model to search first.
- **KTD6.** Keep `fetch_url` for direct URL fetches, but implement `fetch_url` and the URL branch of `open_resource` through one helper inside `voice-tools.ts` so `/api/article` behavior cannot drift.
- **KTD7.** Make `open_note` fail closed for `http(s)` input before `notePreview()`. This is the defensive backstop when the model ignores `open_resource`.
- **KTD8.** Keep `current_view` bounded. Return at most six recent research entries, and for web entries include only the first few `{ title, url }` results needed for voice references.
- **KTD9.** Frontend context capture stays local to `web/src/main.ts`; pure formatting of selected research URL context can be covered in `web/src/selection-context.ts` tests.
- **KTD10.** Research-panel document save should mimic article save: after successful `/api/notes`, delete `currentEntryId` from `/api/research/history/:id`, reload history, update nav, then open the saved vault note.

### Assumptions

- The main bug is session API shape, not research-history storage.
- Voice-created temporary documents only need addressability inside the current session for this fix.
- Existing Web consent and Exa key gates are correct and must remain in force for URL fetches.
- Exact "second result" spoken parsing is a model behavior issue; this plan exposes the stable ids and URLs the model needs but does not build a numeric-result parser.

---

## Implementation Units

### U1. Make voice documents addressable

- **Goal:** Allow multiple temporary documents in one voice session and targeted updates/saves.
- **Requirements:** R1, R2, R3, R4, AE1, AE2, AE3.
- **Files:** `server/integrations/voice-tools.ts`, `server/integrations/voice.ts`, `server/integrations/voice-tools.test.ts`, `server/integrations/research-history.test.ts`.
- **Approach:**
  - Update `write_document` declaration with optional `operation` and `documentId` fields.
  - Update `save_working_document` declaration with optional `documentId`.
  - Replace `workingDocId` with `activeWorkingDocId` and `knownDocumentIds` in `createVoiceToolSession`.
  - Add a small safe-id helper using the same id shape as research history (`/^[a-z0-9-]+$/`).
  - Add a helper that validates a requested document id by checking `knownDocumentIds` or a current `researchEntries()` item with `mode === "document"`.
  - On `operation: "create"`, mint a fresh id regardless of the active document.
  - On `operation: "update"`, require `documentId` or fall back to active only when active exists.
  - On successful write, send `show_document` with that id and make it active.
  - On save, promote the resolved id through the existing `/api/document/:id/promote` route.
  - Update `voice.ts` prompt text to remove the singleton instruction and state the create-vs-update rule.
- **Test scenarios:**
  - Two `write_document` calls with `operation: "create"` return different ids.
  - Updating document A by id posts A's id and does not post B's id.
  - `save_working_document({ documentId: A })` calls `/api/document/A/promote` even when B is active.
  - Unknown document id returns an error and does not POST `/api/document` or promote.
  - Existing old-style call with no active document still creates one document.
  - Existing old-style second call with no operation still updates active document, preserving iterative-edit compatibility.
  - `research-history.test.ts` imports `upsertEntry` and proves two different document ids coexist and upserting one leaves the other intact.
- **Verification:** `npm test -- --run server/integrations/voice-tools.test.ts server/integrations/research-history.test.ts server/integrations/voice-promote.test.ts`.

### U2. Add one voice resource router

- **Goal:** Remove model ambiguity between URLs, research-history entries, and vault notes.
- **Requirements:** R5, R6, R7, AE4, AE5, AE6, AE7.
- **Files:** `server/integrations/voice-tools.ts`, `server/integrations/voice-tools.test.ts`.
- **Approach:**
  - Add `open_resource` to `VOICE_TOOLS` with one required `target` string.
  - Add `isHttpUrl()` helper in `voice-tools.ts`.
  - Extract the current `fetch_url` `/api/article` logic into a helper that sends status, calls `/api/article`, opens the returned research entry, and returns capped text.
  - Route `open_resource({ target })` as follows: URL -> URL helper, exact research-history id -> send `open_research`, `.md` -> `open_note` helper, otherwise return an error telling the model to use search tools first.
  - Keep `fetch_url` as a direct URL tool, backed by the same helper.
  - Make `open_note` return `target is a web URL; use open_resource or fetch_url` for `http(s)` targets before calling `notePreview()`.
  - Expand `ResearchHist` to include `results`, `article`, and `document` fields used by `current_view` and `open_resource`.
  - Change `current_view.recentResearch` from `{ mode, query }` to bounded objects with `id`, `mode`, `query`, and mode-specific fields.
- **Test scenarios:**
  - `VOICE_TOOLS` includes `open_resource`.
  - `open_note` with `https://example.com/a` returns a URL error and sends no `open_note` action.
  - `open_resource` with `https://example.com/a` calls `/api/article` and sends `open_research` with the returned history id.
  - `open_resource` with `folder/a.md` calls `/api/note` and sends `open_note`.
  - `open_resource` with a known research-history id sends `open_research` and returns that entry summary.
  - `current_view` returns recent web result URLs and document ids in bounded form.
- **Verification:** `npm test -- --run server/integrations/voice-tools.test.ts`.

### U3. Fix frontend research context and document history selection

- **Goal:** Give voice the same URL identity as UI clicks and keep the research pager pointed at the shown document.
- **Requirements:** R8, R9, AE8.
- **Files:** `web/src/main.ts`, `web/src/selection-context.ts`, `web/src/selection-context.test.ts`.
- **Approach:**
  - In `readDomSelection()`, when source is `research`, derive `url` from the selected anchor if the selection is inside an external link.
  - If the selection is inside a `.web-result` row, use that row's `.web-result-title[href^="http"]` URL.
  - Fall back to `entry.article?.url` for article entries.
  - In `selection-context.ts`, include a `URL: ...` line in contextual query text when a research slot has `url`.
  - In the `show_document` voice action handler, after `loadHistory()`, set `historyIdx` to `researchHistory.findIndex((r) => r.id === p.id)` with fallback to `0` only if missing.
- **Test scenarios:**
  - `buildKeywordQuery()` and `buildSemanticQuery()` include `URL: https://...` for research selection slots with URLs.
  - `show_document` manual/browser smoke: showing document B while document A is newer still sets the pager to B.
  - Research selection manual/browser smoke: selected text inside a web result gives voice context with that result URL.
- **Verification:** `npm test -- --run web/src/selection-context.test.ts` plus manual smoke in `npm run dev`.

### U4. Align document save cleanup

- **Goal:** Remove temporary document history after a successful research-panel save.
- **Requirements:** R10, AE9.
- **Files:** `web/src/main.ts`.
- **Approach:**
  - In `renderDocumentInto()` save handler, after successful `/api/notes`, mirror article save cleanup: if `currentEntryId` exists, `DELETE /api/research/history/:id`, clear `currentEntryId`, reload history, and update nav.
  - Keep `openAfterIngest()` after cleanup so the saved vault note still opens and rescans.
  - Do not delete history on failed save.
- **Test scenarios:**
  - Manual smoke: document save creates a vault note, opens it, and removes the temporary document from the research pager.
  - Manual smoke: failed save leaves the document entry available for retry.
- **Verification:** Covered by `npm run typecheck`; manual smoke in `npm run dev`.

---

## Dependencies And Sequencing

1. Implement U1 first, because document identity changes the old tests and prompt contract.
2. Implement U2 next, because it can share helper code with the existing `fetch_url` path.
3. Implement U3 and U4 last; they are small frontend consistency fixes.
4. Run the focused tests after each server/frontend unit, then run the full project checks.

## Risks And Mitigations

- **Model keeps using old tools:** Keep `fetch_url` and `open_note`, add `open_resource`, update descriptions, and make `open_note` reject URLs as a hard backstop.
- **Arbitrary document id upsert:** Validate requested ids against session-known ids or existing document history before updating or saving.
- **Token growth in current_view:** Cap recent research to six entries and cap web result URLs per entry.
- **Web spending surprise:** URL branches still call guarded `/api/article`, preserving consent and Exa key checks.
- **Frontend DOM selection is hard to unit test in Node Vitest:** Keep URL formatting in `selection-context.ts` under unit tests and cover DOM capture with manual browser smoke.

## Verification

- `npm test -- --run server/integrations/voice-tools.test.ts server/integrations/voice-promote.test.ts server/integrations/research-history.test.ts web/src/selection-context.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Manual smoke with `npm run dev`: create two voice documents, revise the first, save one, open a web result by URL through voice, select text inside a web result, and save a document from the research panel.
