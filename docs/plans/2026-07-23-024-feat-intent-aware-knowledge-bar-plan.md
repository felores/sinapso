---
title: Intent-Aware Knowledge Bar, Automatic Intake, and Grounded Wiki Research - Plan
type: feat
date: 2026-07-23
topic: intent-aware-knowledge-bar
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: accepted
---

# Intent-Aware Knowledge Bar, Automatic Intake, and Grounded Wiki Research - Plan

## Goal Capsule

- **Objective:** Turn the top search field into one capability-aware knowledge bar: ordinary text performs live hybrid vault search, explicit Wiki mode produces grounded synthesis from one wiki, explicit Web mode performs external research with Tinyfish as the ordinary-search default, and explicit Ingest mode accepts local paths, URLs, or browsed files.
- **Product authority:** `STRATEGY.md`, `PRODUCT.md`, `DESIGN.md`, and the user decisions recorded on 2026-07-23.
- **Depends on:** The vault catalog and durable Inbox workspace from plan 020, shared search helpers in `server/integrations/search-vault.ts`, current guarded ingestion, Research/Inbox panel ownership, and the contextual workflow presentation contract in RM007.
- **Stop conditions:** Do not add a second search index, another vault writer, a model-selected spending path, an Admin default-wiki field, a custom file-conversion pipeline, or a new panel.
- **Open blockers:** None.

## Product Contract

### Input routing

The knowledge bar has three explicit states and one independent file action:

| State | Input | Result |
|---|---|---|
| No mode | Ordinary text while typing | Live hybrid vault results, with filename/title precedence and MiniSearch-only fallback when qmd is unavailable |
| No mode | Submitted HTTP(S) URL | Capability-aware article fetch or markitdown conversion, immediately saved to Inbox and opened in the Research panel's Inbox collection |
| Wiki | Submitted question or instruction | Grounded, cited Markdown synthesis over the selected wiki, stored first in disposable Research history |
| Web | Submitted question | Consent-gated external research; Tinyfish handles ordinary result search when configured, while the existing Web Research provider remains the explicit deep-research provider |
| File action | User-selected local file | markitdown conversion, immediately saved to Inbox and opened in the Research panel's Inbox collection |

Explicit Wiki, Web, or Ingest mode determines submission behavior. No-mode text remains vault search. Ingest accepts typed local paths and URLs, while Browse selects local files.

### Requirements

**Hybrid vault search**

- R1. With no mode active, non-URL text keeps the current live dropdown behavior but uses `GET /api/search-vault?mode=auto` as the ranked backend.
- R2. Direct textual identity outranks inferred relevance: exact title/basename, title/basename prefix, then title/path substring. Remaining results follow Reciprocal Rank Fusion over qmd semantic rank and MiniSearch rank.
- R3. Native qmd and MiniSearch scores are never compared or presented as one percentage. The UI may identify contributing sources but uses final rank as the cross-engine order.
- R4. qmd absence, uncovered state, indexing, malformed output, or runtime failure degrades to MiniSearch without disabling normal search or displaying a false empty state.
- R5. Local title results remain immediate. The hybrid request is debounced, stale requests cannot replace newer results, and duplicate paths render once.

**Explicit ingestion**

- R6. Keep `ingest` in `ModeName`, `MODE_LIST`, `sinapso-mode`, mode chrome, and search placeholder behavior.
- R7. Ingest mode retargets the field to accept a local path or URL and reveals the existing Browse action for local-file selection.
- R8. Ingest mode is enabled only when markitdown is installed. Its disabled tooltip gives the existing Integrations action; submission or file selection starts conversion immediately and shows sole progress ownership through `#ops-status`.
- R9. Uploaded bytes continue through `convertBytes()`: a sanitized temporary filename, conversion through markitdown, and recursive temp-directory removal in `finally`. Do not duplicate this lifecycle in the browser or another server module.
- R10. Ingest performs no speculative work while the user is typing. Enter explicitly submits a typed source; Browse explicitly submits selected bytes.
- R11. Typed HTTP(S) URLs use the capability-aware intake classifier: known documents use markitdown, while webpages use Tinyfish Fetch or Exa under stored Web consent. Typed local paths and browsed files use markitdown.
- R12. Submitted paths, URLs, and files save immediately to the configured Inbox through `ingestText()`, `ingestDocument()`, or `ingestBytes()`, then open the canonical saved note in the Research panel's Inbox collection. They never write directly to a wiki.
- R13. Intake success does not require graph membership. Inbox refresh and opening use the path returned by the guarded write; graph refresh failure remains a non-blocking warning.
- R14. Enter submission and file selection are explicit user actions. Tinyfish and Exa require stored Web consent; declining performs no external-provider request. Markitdown conversion never runs from typing or model initiative.

**Shared Wiki target**

- R15. Replace the Vault mode button with Wiki. Wiki is enabled only when at least one wiki is enabled and a thinker/worker model resolves; qmd is optional because retrieval falls back to MiniSearch.
- R16. Persist the last selected enabled wiki as a vault-scoped `sinapso-wiki-target` preference. Every Wiki, Ingest, Research, and Reader wiki selector reads and updates this one preference.
- R17. Validate the stored target against the current enabled-wiki response. A missing or disabled value falls back to the first enabled wiki. No Admin default checkbox or config field is added.
- R18. One enabled wiki hides the selector. Multiple wikis show a narrow native `<select>` with a fixed closed width, clipped selected label, full-name tooltip/accessible label, and complete option labels in the opened native menu.
- R19. The selector and mode controls fit the existing desktop, rail, and `390x844` layouts without widening the knowledge bar or hiding the file and voice actions.

**Grounded Wiki research**

- R20. `POST /api/wiki-research` is token-guarded and accepts a non-empty query plus one enabled `wikiId`. It never accepts an arbitrary path or unconfigured wiki.
- R21. Retrieval runs hybrid search inside the selected wiki path. Semantic candidate collection over-fetches before path filtering so a globally lower-ranked wiki result is not silently lost.
- R22. qmd is optional. MiniSearch-only retrieval can still ground Wiki research. If no source matches, return an evidence-empty result without calling the model.
- R23. The server loads bounded, vault-confined excerpts from the highest-ranked sources and sends only those excerpts, source paths/titles, the question, locale, and selected wiki metadata to the resolved thinker tier.
- R24. The server assigns opaque citation markers to the supplied evidence. The model must answer only from that evidence, adapt the Markdown structure to the request, state uncertainty, and cite claims with those markers. After generation, the server rejects unknown markers and model-authored vault paths/URLs, then expands valid markers into code-generated clickable `[[path/to/note]]` links.
- R25. A successful validated answer creates a new app-local Research-history entry with mode `wiki`, query, selected wiki metadata, normalized Markdown answer, and bounded source metadata. It renders as a document-like page, not a chat bubble or result list.
- R26. Wiki answers support pinning, Research navigation, text selection actions, Save to Inbox, and the existing proposal-first wiki promotion. Save converts the answer and source list into portable Markdown.
- R27. Wiki research is Enter-driven and spending. It never runs while typing. Missing model configuration disables the mode with a localized Settings instruction.

**Trust and interface**

- R28. All new mutating or spending routes retain Host/Origin and session-token enforcement. Every write remains inside `server/integrations/write.ts` through existing guarded adapters.
- R29. User-facing labels, progress, empty states, capability failures, and accessibility text have matching English and neutral-Spanish entries.
- R30. The change preserves Research pin/current-view behavior, one-editor ownership, flush-before-switch, Web consent, mobile rail geometry, and RM007's single lifecycle-surface ownership.

**Web provider policy**

- R31. Add a server-only `tinyfishKey` to the existing integrations config. `GET /api/integrations` exposes only configured/effective-provider booleans. Configuration adds one `Web Search and Fetch` section (`Búsqueda y extracción web` in Spanish) immediately before `Web Research`, with one provider selector and Tinyfish as the only current primary option, leaving the selector seam for future providers. The section owns the localized Tinyfish key field and an external-link-marked link to `https://agent.tinyfish.ai/api-keys`. The selected connected provider is green, Exa fallback is orange, and unavailable is red. No API key field is added to Tools, and key material never reaches browser responses, logs, history, or provider metadata.
- R32. Every external `http(s)` URL rendered inside Markdown content uses the content-link policy without changing the Markdown source. The shared content-editor mount enforces this for notes, Inbox notes, articles, and working documents; Markdown table previews and version previews follow the same policy. Configuration and other operational links remain ordinary external-only links.
- R33. One `server/integrations/tinyfish.ts` adapter owns Tinyfish's `X-API-Key` request shape. Ordinary Web Search uses Tinyfish when configured, otherwise Exa when configured, otherwise it is unavailable. Google/OpenAI/xAI remain deep-research providers and are never implicit ordinary-search or fetch fallbacks.
- R34. The existing `webResearchProvider` selector remains the authority for explicit deep research. Tinyfish is not added to that selector and does not replace hosted Google/OpenAI/xAI deep synthesis. When Tinyfish and Exa are both configured, ordinary search uses Tinyfish and an explicit deep request may use the selected deep provider.
- R35. Ordinary Web Search keeps pre-request provider precedence and surfaces runtime failure. Markdown content fetching uses explicit runtime fallback: Tinyfish Fetch, then Exa contents when configured, then external navigation. Empty provider content is failure, not an empty Research page. Hosted deep providers are never fetch fallbacks.
- R36. Every displayed external HTTP(S) link in Reader, Inbox, article, working-document, safe Research citation, and version-preview documents has two actions. Clicking link text routes through `/api/resource`; an adjacent localized external-link action always opens the origin in a new tab. Unsupported resources or missing handlers open externally without a consent prompt or failed provider request.
- R37. `/api/resource` classifies URLs before execution. Supported `pdf`, `docx`, `pptx`, `xls`, `xlsx`, `csv`, `json`, `xml`, `zip`, and `epub` resources use only local MarkItDown; exact known document routes such as `arxiv.org/pdf/<id>` classify as PDF even without a suffix. Legacy Office/ODF/RTF and unsupported cloud-share URLs open externally. Public Google Docs/Sheets/Slides URLs normalize to their export formats. Remote documents are downloaded to bounded temporary storage with public-address DNS pinning, redirect revalidation, MIME/signature checks, timeouts, and a 50 MB limit. Conversion persists only app-local Research evidence until the user explicitly saves it.

| Configured capability | Ordinary Web search | Article URL fetch | Explicit deep research |
|---|---|---|---|
| Tinyfish plus a configured selected deep provider | Tinyfish Search | Tinyfish Fetch | Selected `exa`/`google`/`openai`/`xai` provider |
| Tinyfish only | Tinyfish Search | Tinyfish Fetch | Disabled with the existing actionable provider-key state |
| No Tinyfish; Exa configured | Exa Search | Exa contents | Exa when selected |
| Hosted deep provider configured; no Tinyfish/Exa | Disabled | External navigation only | Selected hosted provider |
| No Web provider; markitdown available | Disabled | Known-document conversion only; article links open externally | Disabled |

### Acceptance Examples

- AE1. Typing `climate strategy` with qmd ready first shows immediate title hits, then one deduplicated list ordered by title identity and hybrid rank.
- AE2. The same search without qmd returns useful MiniSearch results and no disabled-search state.
- AE3. Activating Ingest, pasting `https://example.com/report.pdf`, and pressing Enter converts it through markitdown, writes one Inbox note, opens that note in Research/Inbox, and leaves no temp file.
- AE4. In Ingest mode, an article URL with Tinyfish consent/key fetches Markdown through Tinyfish, writes it once through the guarded Inbox path, and opens the editable Inbox note. Without Tinyfish it uses configured Exa; without both providers it does not use markitdown for the article.
- AE5. Typing a path or URL in Ingest mode does nothing until Enter. Declining the Web consent gate performs zero Tinyfish/Exa calls and writes nothing.
- AE6. Activating Ingest and browsing for a local DOCX converts, saves, and opens it while preserving Ingest mode.
- AE7. Selecting `Climatia` in any wiki selector makes it the validated default in Wiki mode and all later wiki actions for that vault.
- AE8. At `390x844`, a long wiki label stays clipped in the closed selector while the opened native menu exposes the full label and all controls remain reachable.
- AE9. Asking Wiki mode to compare two concepts returns a cited Markdown synthesis grounded only in notes under that wiki. With qmd missing, keyword evidence still grounds the answer.
- AE10. Saving a Wiki answer creates an Inbox note; promoting it still requires the existing wiki proposal and explicit apply approval.
- AE11. With Tinyfish and Exa configured, an ordinary Web query calls Tinyfish and selecting deep research calls the configured deep provider. A Markdown webpage fetch tries Tinyfish, falls back to Exa on failure or empty content, and opens externally only after both are exhausted.
- AE12. Clicking a PDF link with MarkItDown available converts it locally, stores one Research-history article, and opens Research only after conversion. With MarkItDown unavailable or the format unsupported, it opens externally and performs zero Tinyfish/Exa calls.
- AE12. Clicking an external link in a note opens a fetched article in Research and leaves an adjacent action that opens the origin in a new tab. With neither Tinyfish nor Exa configured, the same link text opens externally and performs no `/api/article` request.

## Planning Contract

### Key Technical Decisions

- KTD1. **session-settled: user-directed. One knowledge bar, deterministic routing.** No-mode text is hybrid search; explicit Wiki, Web, and Ingest modes retarget submission. Rejected: a model intent router, because routing is cheap, deterministic, and may cross spend/write boundaries.
- KTD2. **session-settled: user-directed. Ingest writes immediately to Inbox.** The explicit Enter/file-selection action authorizes conversion and one guarded Inbox create, followed by opening that durable note in Research/Inbox. Rejected: disposable Research preview first.
- KTD3. **session-settled: user-directed amendment. Ingest remains a mode.** Its field accepts local paths and URLs, and Browse remains available for file selection. Rejected: removing the Ingest button and leaving only a standalone file action.
- KTD4. **session-settled: user-approved. Wiki synthesis enters Research first.** A Wiki answer remains disposable until Save to Inbox, avoiding a vault note per question. Rejected: immediate Inbox creation for every Wiki query.
- KTD5. **session-settled: user-directed. Last selected Wiki is the default.** A validated vault-scoped browser preference coordinates existing selectors. Rejected: an Admin checkbox/dropdown and config schema.
- KTD6. **Rank fusion stays rank-based.** RRF combines qmd and MiniSearch; title/path identity is a separate deterministic precedence tier. Do not manufacture a unified relevance percentage.
- KTD7. **Capability policy is code-owned.** A pure classifier chooses among existing adapters. It may degrade based on installed/configured tools but never permits a model or extension to select routes, writes, consent, or spend.
- KTD8. **No second ingestion path.** Reuse markitdown conversion, `ingestText()`/`ingestBytes()`, guarded writes, Inbox refresh, and the existing article adapter. Add only the smallest orchestration seam needed to classify and sequence them.
- KTD9. **Tinyfish is a retrieval capability, not a fifth deep-research choice.** Prefer it for ordinary search and fetch when configured; preserve the existing provider selector for explicit deep research. Rejected: replacing the selector or silently failing over after an upstream request starts.

### Directional Contracts

```ts
type KnowledgeBarMode = "wiki" | "web" | "ingest" | null;

type KnowledgeIntent =
  | { kind: "vault-search"; query: string }
  | { kind: "ingest"; source: string | File }
  | { kind: "wiki-research"; query: string; wikiId: string }
  | { kind: "web-research"; query: string };

type IntakeMethod =
  | "tinyfish-fetch"
  | "exa-article"
  | "markitdown-url"
  | "markitdown-upload";

type WikiResearchEntry = {
  mode: "wiki";
  query: string;
  wiki: { id: string; label: string; path: string };
  answer: string;
  sources: Array<{ path: string; title: string; snippet: string; rank: number }>;
};
```

The exact exported names may follow repository style. The closed unions, route precedence, write behavior, and source boundaries are normative.

## Implementation Units

### U1. Identity-first hybrid ranking

- **Covers:** R1-R4.
- **Files:** `server/integrations/search-vault.ts`, `server/integrations/notes-index.ts`, `server/app.ts`, focused tests.
- **Work:** Add deterministic title/basename/path match tiers to the normalized auto response, preserve RRF for the remainder, return one path per result, and preserve MiniSearch-only degradation.
- **Verification:** Focused search-vault, notes-index, and route tests prove title tiers, consensus ranking, score separation, deduplication, scope, and qmd failure fallback.

### U2. Live hybrid browser search

- **Depends on:** U1.
- **Covers:** R5, R29-R30.
- **Files:** `web/src/main.ts`, a small pure `web/src/search-intent.ts` only if needed, `web/src/i18n.ts`, `web/src/style.css`, focused tests.
- **Work:** Replace the split client-title plus `/api/search` append path with immediate local title feedback followed by debounced normalized hybrid results; abort/discard stale calls and keep Enter-to-open behavior.
- **Verification:** Pure stale/dedup/order tests plus typecheck; E2E coverage lands in U8.

### U3. Tinyfish retrieval and capability-aware intake backend

- **Covers:** R9-R14, R28, R31-R35.
- **Files:** new `server/integrations/tinyfish.ts`, new `server/integrations/intake.ts`, `server/integrations/config.ts`, `server/integrations/ingest.ts`, `server/integrations/research-history.ts` only where article-to-Inbox conversion is reused, `server/integrations/registry.ts`, `server/integrations/voice.ts`, `server/app.ts`, `web/index.html`, `web/src/main.ts`, `web/src/editor.ts`, `web/src/style.css`, `web/src/i18n.ts`, focused tests.
- **Work:** Add secret-safe Tinyfish config/status and one thin Search/Fetch adapter, implement Tinyfish-then-Exa ordinary search/fetch policy and token-guarded intake over guarded writes, add the combined provider-ready Configuration section, and route document links through provider-aware `/api/article` with a separate external-navigation action. Preserve temp cleanup, avoid runtime provider failover, and return the created Inbox path plus non-blocking graph state.
- **Verification:** Config sanitization and non-disclosure, Tinyfish request/response/error mapping, exact Tinyfish/Exa/unavailable precedence, no hosted ordinary-search fallback, no runtime failover, consent refusal, one write, known-document conversion, article no-markitdown behavior, link dual actions, EN/ES labels, and missing-capability errors.

### U4. Ingest mode and source submission UI

- **Depends on:** U3.
- **Covers:** R6-R8, R10-R14, R29-R30.
- **Files:** `web/index.html`, `web/src/main.ts`, `web/src/prefs.ts`, `web/src/prefs.test.ts`, `web/src/style.css`, `web/src/i18n.ts`.
- **Work:** Retain Ingest mode and its persisted state, accept typed local paths and URLs, retain Browse for local files, show progress only in `#ops-status`, and open the returned path in Research/Inbox through existing ownership controls.
- **Verification:** Persisted mode behavior, disabled capability state, path/URL/file routing, localized intake errors, and Inbox open behavior.

### U5. Shared compact Wiki target

- **Covers:** R15-R19, R29-R30.
- **Files:** `web/index.html`, `web/src/main.ts`, `web/src/prefs.ts`, `web/src/prefs.test.ts`, `web/src/style.css`, `web/src/i18n.ts`.
- **Work:** Replace Vault with Wiki, add the vault-scoped preference resolver, wire every existing selector to it, and implement the one-wiki/multi-wiki narrow-control behavior across responsive layouts.
- **Verification:** Preference validation and synchronization tests, typecheck/build, and U8 narrow-viewport proof.

### U6. Grounded Wiki research backend

- **Depends on:** U1.
- **Covers:** R20-R24, R27-R30.
- **Files:** new `server/integrations/wiki-research.ts`, `server/integrations/registry.ts`, `server/integrations/research-history.ts`, `server/app.ts`, focused tests.
- **Work:** Validate enabled wiki, retrieve scoped hybrid evidence with semantic over-fetch, load bounded excerpts through confined paths, issue server-owned citation markers, call the thinker tier only with evidence, reject or strip citations outside the supplied set, expand valid markers into code-owned wikilinks, and persist mode `wiki` history.
- **Verification:** Disabled wiki/path rejection, no-evidence no-call, qmd fallback, source bounds, locale, valid marker expansion, fabricated marker/path/URL rejection, model failure, token guard, and secret non-disclosure.

### U7. Wiki document rendering and curation

- **Depends on:** U5, U6.
- **Covers:** R25-R30.
- **Files:** `web/src/main.ts`, `web/src/style.css`, `web/src/i18n.ts`, `server/integrations/research-history.ts`, related tests.
- **Work:** Render Wiki answers as safe document-like Research pages with clickable wikilinks and source notes; integrate history, pin, selection context, Save to Inbox, and existing proposal-first promotion.
- **Verification:** History round-trip, Markdown conversion, pin preservation, safe rendering, Save to Inbox, and no direct wiki write.

### U8. End-to-end command-bar proof

- **Depends on:** U2, U4, U5, U7.
- **Covers:** AE1-AE10.
- **Files:** new `tests/e2e/knowledge-bar.spec.ts`, existing E2E fixtures/global setup, `DESIGN.md` if the implemented control contract needs documentation.
- **Work:** Exercise desktop and `390x844` flows with hermetic qmd/Tinyfish/Exa/hosted-provider/model/markitdown fakes, including configured-capability precedence, visible provider failure, and clean browser diagnostics.
- **Verification:** Focused E2E plus the repository serial gate.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Focused search | `npm test -- --run server/integrations/search-vault.test.ts server/integrations/notes-index.test.ts server/integrations/qmd.test.ts server/app.test.ts` | Identity precedence, RRF, scope, catalog coverage, and no-qmd fallback |
| Focused intake | `npm test -- --run server/integrations/tinyfish.test.ts server/integrations/intake.test.ts server/integrations/ingest.test.ts server/integrations/config.test.ts server/integrations/api.test.ts server/integrations/research-history.test.ts server/app.test.ts web/src/editor.test.ts server/integrations/registry.test.ts server/integrations/voice-tools.test.ts` | Tinyfish mapping/secrecy, search/fetch precedence, consent, dual link actions, temp cleanup, one guarded Inbox write, and openable result identity |
| Focused frontend | `npm test -- --run web/src/prefs.test.ts web/src/search-intent.test.ts && npm run typecheck && npm run build` | Mode removal, deterministic input intent, stale handling, shared wiki preference, and production compilation |
| Focused browser | `npm run test:e2e -- tests/e2e/knowledge-bar.spec.ts` | Real input routing, responsive selector, file action, Wiki answer, Inbox opening, and clean diagnostics |
| Required serial gate | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Repository release contract remains green |

## Definition of Done

- Normal note discovery is one hybrid ranked list with MiniSearch-only fallback.
- Vault is replaced by Wiki; Web and Ingest remain explicit modes.
- Ingested paths, URLs, and local files run only after explicit submission/selection, create one Inbox note, and open it in Research/Inbox.
- Every wiki selector shares one validated last-selected preference without Admin configuration.
- Wiki mode returns grounded, cited, curatable Research documents and never writes directly to a wiki.
- Desktop, narrow viewport, English/Spanish, trust negatives, and the full serial gate pass.

## Boundaries

- Follow-up conversation over notes/results belongs to plan 025.
- Drag-and-drop, multi-file batches, clipboard attachments, OCR configuration, attachment chips, and background URL detection are excluded.
- Explicit semantic-neighbor expansion is excluded until real Wiki queries show retrieval gaps; hybrid retrieval already supplies semantic relations.
- The plan does not update `ROADMAP.md`; roadmap ownership remains with the harness roadmap module.
