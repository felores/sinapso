---
title: Text Selection to Voice - Plan
type: feat
date: 2026-07-07
topic: text-selection-to-voice
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Text Selection to Voice - Plan

## Goal Capsule

- **Objective:** When the user selects text in the reader (vault note) or research (web/ingest) panel, ship that selection to the active voice session as context, tagged with its source so the voice agent knows whether the highlighted text comes from a vault note or from a research result. When the source is the reader, the selection also carries the open note id.
- **Product authority:** User request in this session. Product Contract preservation: new plan bootstrapped directly from the request.
- **Execution profile:** Frontend listener + one new WS message type + one field on the existing `current_view` tool response. No new endpoints, no new collections, no new writer.
- **Stop conditions:** Stop and ask before adding a floating "Send to Voice" button, multi-selection history, persistent highlight store, or non-voice clients (webhook fan-out). Those are deferred.
- **Open blockers:** None.

---

## Product Contract

### Summary

Solaris already has a bidirectional voice relay (`web/src/voice.ts` <-> `server/integrations/voice.ts`) and a `current_view` tool that grounds the agent in "what's on screen". The gap: when the user points at a passage by selecting it, the agent has no idea. Selection is a free signal; we should relay it. Scope is deliberately narrow: capture text selections inside the two reader panels, push one context message per selection over the existing WS, and expose the latest pending selection through the existing `current_view` tool so the agent sees it the next time it grounds itself. No new endpoint, no UI affordance beyond selection itself.

### Requirements

- R1. Capture text selections whose anchor lives inside `#reader` or `#research` only. Selections elsewhere (menubar, graph, search input) are ignored.
- R2. Tag each captured selection with a `source` of `reader` or `research` based on the panel the selection anchor lives in.
- R3. When `source === "reader"`, attach the currently open note id (the value of `openNodeId` in `web/src/main.ts`). For `research`, attach the current research entry id (`currentEntryId` in `web/src/main.ts`) when present.
- R4. Push each captured selection to the active voice WS as a single `type: "context"` message of shape `{ source: "reader" | "research", noteId?: string, entryId?: string, text: string }`. No-op when the WS is not open.
- R5. The server stores only the latest pending selection on the voice session (overwrite, not accumulate), alongside the existing `workingDocId` in `server/integrations/voice.ts`.
- R6. The existing `current_view` tool response includes a `pendingHighlight` field of the same shape (or `null`) so the agent can ground itself when the user says "this", "esto", "lo que subrayé".
- R7. Once consumed by `current_view`, `pendingHighlight` stays (the agent may re-query); a new selection overwrites it. There is no explicit "clear" path; a new selection replaces the old one, and session end drops it.
- R8. The voice system prompt gains one sentence: when `pendingHighlight` is set, that is the text the user just selected; `source: reader` means it is a passage of the open vault note (noteId is the note path), `source: research` means it is from the most recent web/ingest result.

### Key Flows

- F1. Reader selection reaches the agent
  - **Trigger:** With a voice session active, user selects a passage inside `#reader-body` while note `X.md` is open.
  - **Steps:** Frontend mouseup handler reads `window.getSelection()`, confirms the anchor is inside `#reader`, builds `{ source: "reader", noteId: "X.md", text }`, sends `{ type: "context", ... }` over the WS. Server stores it as `pendingHighlight` on the session. Next time the agent calls `current_view`, it sees the highlight.
  - **Outcome:** Agent can answer "what did you think of this passage?" without the user having to type the path.
  - **Covers:** R1, R2, R3, R4, R5, R6.

- F2. Research selection reaches the agent
  - **Trigger:** With a voice session active, user selects a passage inside `#research-body`.
  - **Steps:** Same as F1 but source is `research` and `entryId` (not `noteId`) is attached.
  - **Outcome:** Agent grounds in the web/ingest result, not the vault.
  - **Covers:** R1, R2, R3, R4, R5, R6.

- F3. No voice session
  - **Trigger:** User selects text with no voice session open.
  - **Steps:** Frontend detects WS is not open, no-ops. No errors surface.
  - **Outcome:** Selection behaves normally; nothing is sent.
  - **Covers:** R4.

### Acceptance Examples

- AE1. Given a closed voice session, when the user selects text in either panel, then nothing is sent over the WS and no error appears.
- AE2. Given an open voice session and `notes/foo.md` open in the reader, when the user selects "bar baz" inside `#reader-body`, then exactly one `{ type: "context", source: "reader", noteId: "notes/foo.md", text: "bar baz" }` message is sent over the WS.
- AE3. Given an open voice session and a web research result visible in `#research-body` with `currentEntryId === "abc"`, when the user selects text inside `#research-body`, then exactly one `{ type: "context", source: "research", entryId: "abc", text }` message is sent.
- AE4. Given a pending highlight has been stored on the session, when the agent calls `current_view`, then the response includes `pendingHighlight` with the same shape.
- AE5. Given a pending highlight already stored, when the user makes a new selection, then the new selection replaces the old one (no accumulation).
- AE6. Given a selection that starts in the menubar, the search input, or the graph canvas, when the mouseup fires, then no `context` message is sent.
- AE7. Given a selection of pure whitespace or only collapsed range, when the mouseup fires, then no `context` message is sent.

### Scope Boundaries

**In scope**

- Capture selections inside `#reader-body` and `#research-body` only.
- One new WS message type (`context`).
- One new field on the `current_view` tool response (`pendingHighlight`).
- One new line in the voice system prompt.

**Deferred for later**

- A floating "Send to Voice" button or keyboard shortcut beyond plain selection.
- A history of multiple highlights, or any persistence beyond the active session.
- Pushing the same context to non-voice clients (webhook fan-out, REST polling).
- Visual highlight indicator on the page after sending (the browser's native selection already conveys this; clears on next click).
- Streaming the selection into the working document automatically.

---

## Implementation Units

### IU1: Frontend selection listener and WS sender

**Files:**
- `web/src/main.ts` (new listener + new `sendVoiceContext` helper, scoped to the existing reader/research region)
- `web/src/voice.ts` (expose a `sendContext(payload)` on the voice session API so `main.ts` does not reach into the WS directly)

**Behavior:**

- Single delegated `mouseup` listener on `document` (or scoped to the reader/research containers; document-level is simplest given the two panels float). Ponytail: document-level is fine because the closest-panel check is the actual gate.
- Read `window.getSelection()`. Skip if null, collapsed, or empty after trim.
- Walk `selection.anchorNode.parentElement.closest('#reader, #research')`. Skip if null (covers selections that start in the menubar, canvas, or inputs).
- Build payload `{ source: root.id === 'reader' ? 'reader' : 'research', text }`. For `reader`, add `noteId: openNodeId` only if non-null. For `research`, add `entryId: currentEntryId` only if non-null.
- Call `voice.sendContext(payload)`. `sendContext` in `web/src/voice.ts` checks `ws && ws.readyState === WebSocket.OPEN` and sends `JSON.stringify({ type: 'context', ...payload })`; otherwise no-op.
- One throttle is acceptable but not required: the browser only fires one `mouseup` per selection. Do not debounce without a measured reason.

**Test scenarios:**

- Test file: `web/src/main.test.ts` (does not exist today; per AGENTS.md the frontend has no test framework. Verify manually with `npm run dev`. Document the manual check list in IU1's commit body: (a) select in reader with voice open -> message hits WS, (b) select in research -> message hits WS, (c) select in menubar -> no message, (d) no voice session -> no error).
- If a programmatic check is wanted, the smallest is an inline `assert`-style demo in `voice.ts` exporting `buildContextMessage(rootId, openNoteId, currentEntryId, selection)` as a pure function and verifying the four branches in a tiny node script. Ponytail: optional, only if the manual check is unsatisfying.

---

### IU2: Server stores pendingHighlight and surfaces it via current_view

**Files:**
- `server/integrations/voice.ts` (handle inbound `type: "context"` in the WS message router; add a `pendingHighlight` slot on the session scope near `workingDocId`; include it in the `current_view` tool response)

**Behavior:**

- In the WS message handler (currently handles inbound `audio` only; note: `action` is an outbound type sent FROM server TO browser, not inbound), add a branch for `type === "context"` that validates the shape (`source` is `"reader"` or `"research"`, `text` is a non-empty string, optional `noteId`/`entryId` are strings) and overwrites the session's `pendingHighlight`.
- Invalid shape -> ignore silently (no error to the client; it is best-effort context, not a command channel).
- In the `current_view` tool branch of `runTool` (around `server/integrations/voice.ts:589`), add `pendingHighlight: pendingHighlight ?? null` to the returned object.
- The pendingHighlight is dropped when the session ends (it lives in the same closure scope as `workingDocId`, so it dies with the session automatically).

**Test scenarios:**

- Test file: `server/integrations/voice.test.ts` (exists).
- Add: inbound `context` message with `source: "reader"` and `noteId` -> stored; calling `current_view` -> response includes `pendingHighlight.source === "reader"` and matching `noteId`.
- Add: inbound `context` with `source: "research"` and `entryId` -> stored and surfaced.
- Add: inbound `context` then a second inbound `context` -> only the second is surfaced.
- Add: malformed `context` (missing `text`, unknown `source`) -> ignored, no throw.
- Add: session-end path does not leak the highlight into a later session (covered by closure-scope, but assert in the test that a new session starts with `null`).

---

### IU3: Voice system prompt one-liner

**Files:**
- `server/integrations/voice.ts` (the system prompt string; the line that already says "current_view FIRST when they point at what's on screen")

**Behavior:**

- Extend that instruction with: if `current_view` returns a `pendingHighlight`, that is text the user just selected; `source: "reader"` means a passage of the open vault note (`noteId` is its path, usable directly with `open_note`/`read_passage`); `source: "research"` means a passage of the most recent web/ingest result. Treat it as grounding, not as a command.

**Test scenarios:**

- No automated test for prompt text. Manual: with voice open, select a passage in the reader, then speak "resumeé esto" -> agent uses the highlight, not a fresh search.

---

## Key Technical Decisions

- **KTD1. One message type, one stored slot.** The pending selection is overwritten, not queued. Rationale: the agent only needs the most recent thing the user pointed at; a queue implies a workflow we do not have. Cheaper to widen later (add an array) than to start with a queue.
- **KTD2. Source discrimination by DOM ancestor, not by a flag we set on open.** `closest('#reader, #research')` is one line, requires no state plumbing on `openReader`/`openResearch`, and cannot drift if a panel is opened by a code path that forgets to set a flag. The panel identity IS the discriminator.
- **KTD3. `noteId` for reader, `entryId` for research.** Matches the existing ids the frontend already tracks (`openNodeId`, `currentEntryId`). No new identity concept introduced. When the agent gets `noteId`, it can pass it straight to `open_note`/`read_passage`; `entryId` already maps to research history the agent can read via `open_last_research`.
- **KTD4. No new endpoint, no new tool.** The relay and the `current_view` tool already exist; piggybacking keeps the trust surface unchanged (no new mutating/spending route, no new token-guarded path) and respects the "vault is read-only except through `write.ts`" rule by not writing anything.
- **KTD5. Best-effort, silently ignored on invalid.** The `context` channel is not a command channel; the server does not error back to the client on a bad payload. This keeps a flaky/legacy client from killing the voice session.

## Risks

- **RSK-1.** A user selecting text to copy it will fire a context message they did not "intend" the agent to consume. Acceptable: the agent only uses it when explicitly addressed, and a new selection overwrites it. If it becomes noisy, add a small floating "send to voice" button (deferred).
- **RSK-2.** Selection inside iframes or shadow DOM (none today in reader/research) would not be captured by a document-level listener. Reader HTML is sanitized into the same DOM, so this is fine; flag it if an embedded-content block is added later.
- **RSK-3.** Cross-session leak of selected text. Mitigated by closure scope (same as `workingDocId`); tested in IU2.

## Dependencies and Sequencing

- IU1 and IU2 can be done in parallel (frontend, server), then IU3 once IU2's response shape is confirmed.
- No new npm dependencies. No new env vars. No DB or `data/` artifacts.

## Verification

- `npm test` must stay green; IU2 adds cases to `server/integrations/voice.test.ts`.
- `npm run typecheck` clean.
- Manual smoke with `npm run dev`: start voice, open a note, select text, verify the WS message in devtools; speak "resumeé esto"; verify agent grounds in the highlight. Repeat with a research result open.
