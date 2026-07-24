---
title: Contextual Research Follow-ups and Grounded Research Threads - Plan
type: feat
date: 2026-07-23
topic: contextual-research-followups
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: accepted
---

# Contextual Research Follow-ups and Grounded Research Threads - Plan

## Goal Capsule

- **Objective:** Make every visible knowledge artifact easy to investigate iteratively through one contextual follow-up composer that grounds answers in the current artifact and local vault, optionally adds explicit Web research, preserves cited turns as a focused Research thread, and can be saved as a durable Inbox note.
- **Product authority:** `STRATEGY.md`, `PRODUCT.md`, `DESIGN.md`, RM007's existing-surface rule, and the user direction recorded on 2026-07-23.
- **Depends on:** Research history/pinning from plan 019, durable Inbox/editor ownership from plan 020, selection context from plan 010, existing Web consent and provider adapters, Tinyfish retrieval plus hybrid vault retrieval from plan 024 U1/U3, and RM007's contextual presentation ownership.
- **Stop conditions:** Do not add a chat panel, global transcript, autonomous web browsing, model-selected spend, background agent loop, direct wiki write, or a second editor for a note.
- **Open blockers:** None.

## Product Contract

### Research-thread model

A follow-up does not mutate its source artifact. It starts or continues one app-local Research thread that references the source and renders each question and answer as document sections. The thread is disposable Research evidence until the user saves it to Inbox.

```text
Visible note, Inbox note, article, web result, Wiki answer, or Research page
  -> contextual follow-up question
  -> current artifact snapshot + local hybrid evidence
  -> optional explicit Web evidence
  -> cited synthesis
  -> append to focused Research thread
  -> optional Save to Inbox
```

### Requirements

**Universal contextual composer**

- R1. Reader notes, Inbox notes, and every full Research page expose one reusable follow-up composer near the end of the visible content. Search dropdown rows do not each embed an input.
- R2. A web-result row may expose a compact Ask action that seeds the page composer with that result as the primary source. Opening an article exposes the normal full-page composer.
- R3. On Reader notes, the footer order becomes: generated research questions, follow-up composer, then related notes. Wiki actions retain their existing safe placement without splitting this sequence.
- R4. The composer has a localized prompt, multiline input, submit action, and Web toggle. It is keyboard-operable, focus-visible, and submits with Cmd/Ctrl+Enter; plain Enter remains a newline.
- R5. Generated note questions populate or submit through this same composer and current Web-toggle policy. Remove the per-question Vault/Web button fork after equivalent behavior is available.
- R6. The composer is disabled with an actionable model-configuration message when no worker/thinker model resolves. Context-only viewing and search remain available.

**Context identity and capture**

- R7. Every submission carries a closed source reference: canonical vault path for Reader/Inbox, Research-history id for persisted evidence/thread pages, or `{ researchId, resultIndex }` for one result inside a persisted Web Research entry. Browser-memory external-source ids are never sent as server authority.
- R8. The server resolves persisted source bytes from stable references and confinement checks. A web-result reference is valid only when `researchId` resolves to a persisted Web entry and `resultIndex` selects an existing normalized result; the server reads its URL/title/snippet from that entry. The browser may also send one bounded visible snapshot for dirty unsaved note content; the snapshot never grants a path, URL, route, or write authority.
- R9. Context is bounded by code-owned limits before any provider call. It includes source identity/title, the visible artifact excerpt or full bounded text, the current thread's recent turns, and top local hybrid evidence.
- R10. Local vault retrieval is automatic, read-only, and free. It excludes the primary note from duplicate evidence and degrades to MiniSearch when qmd is unavailable.
- R11. Research pinning, current-view identity, and dirty editor state are evaluated when presenting the answer, not only when the request starts. A pinned different item keeps its view; the completed thread remains in Research history.

**Explicit Web enrichment**

- R12. Web is a user-controlled toggle, never a model decision. Off means zero external Web-search calls. On means the existing Web consent/key gates run first; ordinary external retrieval then uses Tinyfish Search when configured, Exa when Tinyfish is absent, or reports unavailable. Hosted Google/OpenAI/xAI providers remain explicit deep-research choices and are not ordinary-search fallbacks.
- R13. The toggle initially defaults off. After the user explicitly enables it and passes consent, its choice persists as `sinapso-followup-web` for that browser. Declining consent returns it to off and performs no external call.
- R14. Web-enabled follow-up combines the current artifact, local vault evidence, and normalized external results into one final synthesis with inline source links. It does not display two competing answers. Tinyfish result titles, snippets, and HTTPS URLs become bounded evidence; Tinyfish does not generate the final answer.
- R15. If Web retrieval fails after local evidence is available, the server returns an explicit choice to retry Web or continue local-only; it does not silently present a local answer as if Web succeeded or automatically spend through another provider.

**Grounded synthesis**

- R16. `POST /api/follow-up` is token-guarded because it spends model tokens and may spend Web credits. It accepts a non-empty question, closed source reference, optional bounded snapshot, optional thread id, and explicit `web: boolean`.
- R17. The server assigns opaque citation markers to normalized evidence. The thinker tier receives only the question, locale, bounded current context, recent thread context, evidence text, and markers. It cites markers rather than authoring vault paths or external URLs.
- R18. The answer distinguishes supported conclusions, uncertainty, and conflicts between sources. Missing evidence produces an honest evidence-empty response, not an invented answer.
- R19. After generation, the server rejects unknown markers and strips or rejects model-authored vault paths/URLs, then expands valid markers into code-generated vault wikilinks or validated HTTPS source links. The route stores normalized answer Markdown, citations, evidence references, provider metadata allowed by current trusted adapters, and the question in one bounded thread turn. Raw prompts, keys, headers, provider payloads, and full unused documents are never persisted.

**Thread persistence and presentation**

- R20. Research history gains mode `thread` with one seed source and a bounded ordered turn list. Thread ids are UUIDs. A follow-up on an existing thread performs one atomic read-compare-temp-write-rename operation against its revision; stale revisions write nothing.
- R21. Threads are excluded from the existing disposable-entry `CAP=200` pruning policy and are never silently evicted. At most 50 unsaved threads may exist; creating another returns a specific capacity error that asks the user to save or delete one. At most 30 turns and the documented total-size ceiling are allowed per thread; exceeding either requires a new thread rather than pruning visible turns.
- R22. A Research thread renders as a readable evolving document: source header, question headings, answer Markdown, inline citations, source disclosure, and one composer at the end. It does not use left/right chat bubbles, avatars, typing theater, or a separate transcript pane.
- R23. New answers respect current Research pin behavior. An unpinned result opens the thread; a pinned different item records the result without replacing the visible page and announces where it landed.
- R24. Saving a thread to Inbox creates portable Markdown with source identity, ordered question/answer sections, vault wikilinks, external citations, and generation metadata that contains no secrets. The Research entry is removed only after the guarded create succeeds.
- R25. A saved thread becomes a normal editable Inbox note and may later enter the existing proposal-first wiki workflow. Follow-up itself never writes directly to a wiki.

**Trust and interface**

- R26. Follow-up progress belongs only to `#ops-status`. Starting work never clears the visible panel, destroys an editor, or creates a loading takeover.
- R27. Errors appear beside the composer when its source is still visible; a contextual terminal card is used only when the source is no longer visible, following RM007.
- R28. All new user-facing copy has matching English and neutral-Spanish entries. Answers are requested in the active UI language unless the user's question clearly requests another language.
- R29. Server routes retain Host/Origin validation, token enforcement, path confinement, size limits, URL validation, consent gates, and provider secret isolation.
- R30. Follow-up Web enrichment is ordinary evidence retrieval, not an implicit deep-research request. Tinyfish is preferred when configured; explicit deep research and its existing provider selector remain knowledge-bar Web behavior from plan 024.

### Acceptance Examples

- AE1. A user opens a note, asks `What conflicts with this assumption?`, and receives a cited thread answer grounded in the note plus related vault evidence, with zero Web calls while the toggle is off.
- AE2. Clicking a generated note question routes through the same composer and creates a thread instead of presenting separate Vault and Web buttons.
- AE3. Turning Web on for the first time opens the existing consent gate. Declining sends no Web request and leaves the toggle off.
- AE4. With Web enabled and Tinyfish configured, a question about current market evidence performs one Tinyfish search and produces one answer citing both `[[vault notes]]` and validated HTTPS results.
- AE5. A follow-up on a web-result row sends its persisted Research id plus result ordinal; the server resolves that exact stored result as the primary source while local vault retrieval can surface relevant owned knowledge. A forged or stale ordinal is rejected.
- AE6. A dirty Inbox note is asked about before autosave completes; the bounded visible snapshot grounds the answer, while the server path reference remains confined and non-authoritative for writes.
- AE7. Research item A is pinned while a follow-up finishes from item B. A remains visible, B's thread appears in Research history, and the UI announces the blocked arrival.
- AE8. A second question appended to a thread preserves the first turn, cites newly retrieved evidence, and rejects a stale concurrent append.
- AE9. Saving the thread creates one editable Inbox Markdown note and deletes the Research thread only after the write succeeds.
- AE10. At `390x844`, the composer, Web toggle, answer sections, citations, and keyboard focus remain usable without covering reader/research controls.
- AE11. With Tinyfish and Exa configured, a Web-enabled follow-up uses Tinyfish only. A Tinyfish 402/429 returns the explicit retry-or-local-only choice and performs no Exa call.

## Planning Contract

### Key Technical Decisions

- KTD1. **session-settled: user-directed. Follow-up is universal and contextual.** One composer works across Reader, Research, and Inbox; web rows use a compact context action rather than one input per row. Rejected: separate follow-up implementations per content type.
- KTD2. **session-settled: user-directed. Web use is explicit.** The user toggle, not the model, controls external research. Tinyfish is the ordinary-evidence default, Exa is the capability fallback, and hosted providers remain deep-research-only. Rejected: asking a model whether it should browse, because that hides egress and spend behind inference.
- KTD3. **Research threads are documents, not chat UI.** Persist ordered research sections in the existing Research collection and preserve the product's quiet, artifact-first interaction model. Rejected: a chat panel or global conversation feed.
- KTD4. **Source artifacts stay immutable.** A thread references a note/result/article/Wiki answer and stores its own turns. A web result is addressed through its persisted Research entry plus ordinal, not browser memory. Rejected: appending generated answers into the source note or research entry automatically.
- KTD5. **Local retrieval is always available.** Current context plus hybrid vault evidence is the default grounding bundle; qmd improves it but is optional.
- KTD6. **Web failure is visible.** If Web was explicitly requested, do not silently downgrade or fail over from Tinyfish to another spending provider. Offer a local-only continuation as an explicit user choice.
- KTD7. **Save remains explicit.** Threads live app-locally until Save to Inbox succeeds; wiki promotion remains proposal-first.
- KTD8. **Citation authority stays server-owned.** Models cite opaque evidence markers; server code maps only known markers to confined vault wikilinks or validated stored HTTPS sources. Rejected: trusting model-authored links as grounding proof.

### Directional Contracts

```ts
type FollowUpSource =
  | { kind: "vault-note"; path: string; baseHash?: string }
  | { kind: "research-entry"; id: string }
  | { kind: "research-result"; researchId: string; resultIndex: number };

type ResearchThreadTurn = {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  sources: Array<
    | { kind: "vault-note"; path: string; title: string }
    | { kind: "external-source"; title: string; url: string }
  >;
};

type ResearchThreadEntry = {
  mode: "thread";
  id: string;
  revision: string;
  seed: FollowUpSource;
  title: string;
  turns: ResearchThreadTurn[];
};
```

Exact helper names may change. Closed reference kinds, explicit Web policy, bounded persistence, stale-append protection, and no direct source mutation are normative.

## Implementation Units

### U1. Bounded Research-thread store

- **Covers:** R19-R21, R24, R29.
- **Files:** `server/integrations/research-history.ts`, a small `server/integrations/research-thread.ts` if it keeps validation deep, focused tests.
- **Work:** Add mode `thread`, UUID ids, closed schemas, atomic revisioned append, exclusion from disposable pruning, explicit 50-thread capacity, source/citation validation, turn/size limits, and portable Markdown conversion for Save to Inbox.
- **Verification:** Create/read/append, stale revision with no write, atomic replacement, no automatic thread pruning, capacity error, bounds, corrupt data, citation validation, conversion, and write-before-delete behavior.

### U2. Context bundle and stable source resolution

- **Depends on:** U1 and Plan 024 U1.
- **Covers:** R7-R11, R29.
- **Files:** new `server/integrations/follow-up-context.ts`, `server/integrations/search-vault.ts` only if a reusable scoped call is needed, `server/app.ts`, focused tests.
- **Work:** Resolve vault/research references and persisted Web result ordinals, confine paths and stored URLs, reject forged/stale ordinals, accept bounded dirty snapshots, include recent thread turns, retrieve local hybrid evidence, dedupe the primary source, and enforce token/character limits.
- **Verification:** Every source kind, valid/stale/forged result ordinal, dirty snapshot precedence, excluded/traversal rejection, qmd fallback, deduplication, and deterministic bounds.

### U3. Follow-up orchestration and optional Web evidence

- **Depends on:** U1, U2.
- **Covers:** R12-R19, R26-R30.
- **Files:** new `server/integrations/follow-up.ts`, `server/integrations/tinyfish.ts`, `server/integrations/registry.ts`, `server/app.ts`, provider adapter tests.
- **Work:** Add token-guarded `POST /api/follow-up`, enforce explicit Web consent and the plan 024 Tinyfish-first ordinary-retrieval policy, gather optional bounded Web evidence, issue server-owned evidence markers, call the thinker tier, reject fabricated markers/paths/URLs, expand valid citations from normalized evidence, append a revisioned turn, and return pin-display metadata without writing the vault.
- **Verification:** Web-off zero calls, consent refusal, Tinyfish-first and Exa-when-absent behavior, no hosted ordinary-search fallback, no runtime failover, combined evidence, Web failure choice, no-model state, no-evidence honesty, locale, valid marker expansion, fabricated citation rejection, stale append, and secret non-disclosure.

### U4. Reusable contextual composer

- **Depends on:** U3 and Plan 024 U7.
- **Covers:** R1-R6, R12-R13, R26-R29.
- **Files:** new `web/src/follow-up.ts` and tests, `web/index.html`, `web/src/main.ts`, `web/src/prefs.ts`, `web/src/prefs.test.ts`, `web/src/style.css`, `web/src/i18n.ts`.
- **Work:** Implement the data/state controller and one DOM vocabulary for note, Inbox, and Research hosts; add multiline submission, persisted Web toggle, consent handoff, model-disabled state, local errors, and lifecycle progress without panel takeover.
- **Verification:** Host/source mapping, shortcut behavior, toggle persistence/decline, stale requests, local error ownership, typecheck, and build.

### U5. Thread rendering and question unification

- **Depends on:** U3, U4.
- **Covers:** R2-R5, R20-R28.
- **Files:** `web/src/main.ts`, `web/src/style.css`, `web/src/i18n.ts`, focused frontend tests.
- **Work:** Render document-style thread turns and citations, append the composer, route generated note questions through it, add compact Ask context actions to web results, reorder Reader footer sections, and preserve pin/current-view behavior.
- **Verification:** Safe rendering, source links, thread continuation, generated-question routing, web-result source selection, footer order, pin-blocked arrival, and focus restoration.

### U6. End-to-end contextual research proof

- **Depends on:** U1-U5.
- **Covers:** AE1-AE10.
- **Files:** new `tests/e2e/research-followup.spec.ts`, existing fixtures/global setup, `DESIGN.md` if the final reusable composer contract needs documentation.
- **Work:** Exercise Reader, Inbox, article/web result, Wiki answer, local-only, Web-enabled, pinned, stale, save, desktop, and narrow-viewport flows with hermetic Tinyfish/Exa/hosted-provider fakes and diagnostics.
- **Verification:** Focused E2E plus the repository serial gate.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Focused persistence | `npm test -- --run server/integrations/research-history.test.ts server/integrations/research-thread.test.ts server/integrations/write.test.ts` | Thread schema, revisions, bounds, portable save, and guarded write ordering |
| Focused grounding | `npm test -- --run server/integrations/follow-up-context.test.ts server/integrations/follow-up.test.ts server/integrations/tinyfish.test.ts server/integrations/search-vault.test.ts server/app.test.ts` | Stable context, local retrieval, Tinyfish-first explicit Web policy, synthesis, failure visibility, and trust negatives |
| Focused frontend | `npm test -- --run web/src/follow-up.test.ts web/src/prefs.test.ts web/src/research-state.test.ts && npm run typecheck && npm run build` | Composer behavior, preferences, pin decisions, rendering state, and production compilation |
| Focused browser | `npm run test:e2e -- tests/e2e/research-followup.spec.ts` | Iteration across every artifact, Web toggle, pin/stale/save behavior, responsive layout, and clean diagnostics |
| Required serial gate | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Repository release contract remains green |

## Definition of Done

- Every full visible note or Research/Inbox artifact has one contextual follow-up path.
- Local context plus hybrid vault retrieval grounds every answer; qmd remains optional.
- Web enrichment happens only when the persisted user toggle is on and consent/provider gates pass.
- Follow-ups accumulate as readable, cited Research documents rather than chat bubbles.
- Generated questions use the same composer, and related notes follow it in the Reader footer.
- Threads respect pinning, stale updates, source immutability, and explicit Save to Inbox/wiki promotion.
- English/Spanish, trust negatives, desktop/narrow UI, diagnostics, and the full serial gate pass.

## Boundaries

- The command-bar routing, automatic intake, hybrid dropdown, and Wiki synthesis entry point belong to plan 024.
- Voice follow-up conversation, autonomous research planning, background agents, scheduled research, multi-user threads, and cross-device thread sync are excluded.
- Explicit deep research remains a knowledge-bar Web action; the follow-up Web toggle never selects it implicitly.
- Threads are app-local Research history until explicitly saved. This plan does not make Research history a permanent database.
- The plan does not update `ROADMAP.md`; roadmap ownership remains with the harness roadmap module.
