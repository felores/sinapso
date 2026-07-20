---
title: Runtime-Neutral Tool Presentation and Generative UI - Plan
type: feat
date: 2026-07-20
topic: runtime-neutral-generative-ui
roadmap_id: RM007
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
compatible_with: docs/plans/2026-07-19-prototype-pi-rpc-agent-tui-plan.md
---

# Runtime-Neutral Tool Presentation and Generative UI - Plan

## Goal Capsule

- **Objective:** Present grounded results, proposed actions, and decisions as safe interactive cards across existing Research and Inbox workflows, with a small presentation contract that any future agent runtime can adapt to.
- **Independent value:** The first shipped slice improves current Research history, web/article results, and wiki-ingest proposal/apply states. It requires no chat pane, agent runtime, model session, or new provider transport.
- **Runtime neutrality:** Pi RPC, Voice, MCP, CLI, and any future text runtime remain event sources, not foundations of the renderer. This plan neither selects nor implements an agent runtime.
- **Collaboration rule:** The renderer accepts a Sinapso-owned `ToolPresentationV1` envelope. If Pi lands first, this plan adds the Pi adapter. If this plan lands first, the Pi plan adds the adapter. Absence of the other feature never blocks either Definition of Done.
- **Product placement:** Cards render inside the existing Research and Inbox bodies or their existing decision dialog. No Chat/Agent collection, transcript, activity feed, or new pane is introduced by this plan.
- **Trust boundary:** Tool and workflow execution remains server-owned. Presentation can request a user decision, but it cannot authorize, dispatch, spend, mutate, choose a route, or invent a tool.
- **Technology limit:** Use vanilla TypeScript and native DOM controls. Add no React, assistant-ui, AI SDK, `json-render`, A2UI, AG-UI, iframe app, schema-to-component framework, or application database.

## Product and Trust Contract

### Product behavior

- **R1. Existing surfaces first.** Enhance the current Research and Inbox workflows. Do not resurrect deprecated Inbox Review behavior, routes, state, plans, controls, or advisory cards.
- **R2. Durable-work bias.** Cards expose the source, result, next safe action, and resulting canonical path or revision when available. They do not make a transcript or presentation envelope canonical.
- **R3. Progressive detail.** Default cards show a concise title, state, summary, and relevant action. Excerpts, operation lists, bounded JSON fallback, and errors expand on demand.
- **R4. Existing geometry.** Cards reuse the research column, current dock/float/resize behavior, narrow viewport, pin semantics, Inbox flush-before-switch, and reader availability.
- **R5. Localized and accessible.** New labels, lifecycle states, errors, actions, dialogs, tool summaries, and empty states have matching English and neutral-Spanish entries. Cards and decisions are keyboard-operable, screen-reader labeled, focus-visible, and restore focus after dialogs.

### Presentation contract

- **R6. One versioned envelope.** `ToolPresentationV1` is a data-only, runtime-neutral view input. It contains a code-owned tool/workflow name, instance id, lifecycle state, bounded validated input/result summaries, and optional server-issued decision metadata.
- **R7. Code-owned renderer selection.** A closed renderer map chooses UI by tool/workflow name. The producer cannot supply HTML, JSX, component names, imports, CSS, routes, methods, headers, tokens, commands, executable code, or navigation targets.
- **R8. Safe fallback.** Unknown or intentionally unstyled names render escaped name, lifecycle state, and bounded JSON text. Fallback rendering creates no controls or links from arbitrary keys.
- **R9. Lifecycle semantics.** The shared states are `queued`, `running`, `decision-required`, `success`, `denied`, `error`, and `cancelled`. Adapters may omit unsupported states but may not redefine their meaning.
- **R10. Runtime adapters are shallow.** An adapter only maps an existing trusted lifecycle/result into `ToolPresentationV1`. It does not execute tools, persist sessions, call a provider, invent approval records, or duplicate route logic.
- **R11. No canonical event store.** Envelopes are ephemeral view data. Existing Research history, vault notes, app-local runtime state, and future Pi sessions keep their current owners.

### Initial standalone adapters and renderers

- **R12. Research result adapter.** Existing web, article, semantic, and keyword Research entries map their current loading/success/error/source metadata into presentation envelopes without changing their persistence format.
- **R13. Wiki proposal adapter.** The existing wiki-ingest proposal and apply lifecycle maps to `decision-required`, `running`, `success`, `denied`, or `error`. Existing proposal operations, source identity, target wiki, and `baseHash` values remain authoritative and unchanged.
- **R14. Durable-result adapter.** Genuine current save and conflict outcomes may render canonical note path, revision/base hash status, and error state. No new mutation route or agent-only `write_document` browser lifecycle is added.
- **R15. Initial dedicated renderers.** Add code-owned renderers only for current browser states: web/article Research results, semantic/keyword Research results, wiki proposal/apply, and genuine save/conflict outcomes. `search_vault`, `read_note`, and `write_document` remain fallback-only until an installed runtime emits those tool lifecycles.
- **R16. Source links.** External links render only from validated server-returned source fields using code-owned safe anchors with `rel="noopener noreferrer"`. Arbitrary strings are never linkified.

### Decisions and authorization

- **R17. Presentation is not authorization.** `decision-required` is display state only. A positive UI response delegates to the existing guarded route and its server-owned validation. The renderer never dispatches directly.
- **R18. Decision identity matches real authority.** A `decision` id/expiry appears only for a workflow that actually issues server-owned decision records. Current wiki ingest does not; it uses its existing guarded host confirmation and leaves `decision` absent. Model-authored decision metadata is rejected.
- **R19. Current wiki guarantees are not overstated.** Wiki decision UI displays and submits the same host-held operations. The existing server remains authoritative for token, source eligibility/classification, selected-wiki path and RAW-destination boundaries, create absence, and proposal-time `baseHash` checks. This plan does not claim semantic contract enforcement, source-content binding, a proposal digest, immutable create content, expiry, one-time consumption, or replay protection that the current route does not implement.
- **R20. Center-screen means decision.** Result and progress cards stay inline. Only explicit user decisions use the existing dialog layer with initial focus, Escape-to-deny where safe, focus trap, focus restoration, and polite status announcement.

### Optional runtime collaboration

- **R21. Pi adapter seam.** When the Pi prototype exists, a shallow adapter maps its normalized tool lifecycle events to `ToolPresentationV1` and hands rendering to this module. Pi remains responsible for RPC correlation, sessions, cancellation, limits, and capability-gated execution.
- **R22. Deterministic renderer ownership.** Pi keeps bounded baseline cards only when the shared adapter is absent. Once integrated on a target branch, every Pi tool lifecycle, including unknown-name fallback, follows `Pi event -> adapter -> ToolPresentationV1 -> shared renderer`; Pi no longer renders a competing tool card.
- **R23. Second-landing ownership.** The feature present second on the same target branch owns the small adapter and its focused integration test. The presentation module never imports Pi. Pi may import the presentation contract through its adapter, but neither feature edits the other's persistence, transport, authorization, or process supervision.

## Directional Contract

```ts
export type ToolPresentationState =
  | "queued"
  | "running"
  | "decision-required"
  | "success"
  | "denied"
  | "error"
  | "cancelled";

export type ToolPresentationV1 = {
  version: 1;
  id: string;
  name: string;
  state: ToolPresentationState;
  input?: unknown;
  result?: unknown;
  decision?: {
    id: string;
    expiresAt: string;
  };
};
```

The boundary is intentionally small. Tool-specific validation and renderer narrowing use existing code-owned response types. Do not add a generic recursive UI schema, layout language, component catalog protocol, or generic command bus.

## Acceptance Examples

- **AE1.** A saved web research result renders a concise source card with validated citations and safe links; opening it still uses current Research history and reader behavior.
- **AE2.** A wiki-ingest proposal renders target, exact host-held operation summaries, and an explicit decision dialog. Approval calls the existing guarded apply route, which enforces its current token, source eligibility/classification, selected-wiki path and RAW-destination boundaries, create absence, and `baseHash` checks without any new proposal-identity claim.
- **AE3.** A write conflict renders the canonical path and conflict state without overwriting the note or bypassing `baseHash`.
- **AE4.** An unknown tool/result renders bounded escaped JSON and no action, link, HTML, or crash.
- **AE5.** With Pi absent, all standalone cards and the full serial gate pass. With generative UI absent, the Pi prototype's baseline cards remain valid.
- **AE6.** When both features exist, every Pi tool lifecycle uses the shared renderer or its bounded unknown-name fallback while Pi retains RPC/session ownership.
- **AE7.** No UI or route named Inbox Review reappears.

## Non-Goals

- No agent loop, chat runtime, thread history, transcript persistence, provider adapter, model selector, or prompt endpoint.
- No React island, assistant-ui, AI SDK, Assistant Cloud, Vercel AI Gateway, `json-render`, A2UI, AG-UI, MCP Apps, iframe apps, or schema-generated components.
- No generic `/api/generative-ui`, arbitrary command enum, generic action route, model-selected HTTP, or client-side tool dispatcher.
- No model-generated HTML, JSX, JavaScript, CSS, component imports, routes, methods, headers, tokens, or URLs.
- No new write, Git, wiki, web, spending, or approval route.
- No Inbox Review replacement, suggestion engine, persistent routine, advisory-action generator, or background work.
- No requirement that Pi or any other runtime be installed.

## Architecture

```text
Existing trusted workflow/result             Optional future runtime
  Research history / wiki ingest / writes      Pi normalized tool events
                  |                                      |
                  +------------ shallow adapter ----------+
                                      |
                            ToolPresentationV1
                                      |
                      code-owned renderer registry
                         |                    |
               dedicated safe card    bounded fallback
                         |
             existing Research/Inbox body or decision dialog

Execution and authorization stay outside:
  existing guarded route -> existing service -> write.ts / wiki apply / read path
```

## Expected Files

### Create

- `web/src/tool-presentation.ts` - envelope types, state validation, bounds, and pure adapter helpers.
- `web/src/tool-presentation.test.ts` - lifecycle, bounds, unknown-name, and adapter fixtures.
- `web/src/tool-renderers.ts` - closed code-owned DOM renderer map and safe fallback.
- `web/src/tool-renderers.test.ts` - renderer selection, escaping, links, and decision-state tests.
- `tests/e2e/tool-presentations.spec.ts` - standalone Research/wiki presentation, decision, geometry, accessibility, and diagnostics.

### Modify

- `web/src/main.ts` - adapt existing trusted Research/wiki/write states and mount rendered cards in current hosts.
- `web/src/style.css` - shared card, state, expandable detail, and decision styles using existing variables.
- `web/src/i18n.ts` - matching EN/ES presentation labels and states.
- Existing pure response types only where extraction avoids duplicate local interfaces.
- Pi files only if the Pi prototype already exists when this plan lands; otherwise the Pi plan owns the later adapter.

### Explicitly unchanged

- `package.json`, `package-lock.json`, and `tsconfig.json`: no new runtime or UI dependency.
- `server/integrations/write.ts`, `git.ts`, registry dispatch, consent gates, and provider resolution.
- Research history persistence and Pi canonical session storage.
- Historical Inbox Review plan and immutable `.harness/features.json` evidence.

## Implementation Units

### U1. Presentation envelope and bounded adapters

- **Depends on:** none.
- **Requirements:** R6-R16.
- **Files:** `tool-presentation.ts`, its test, existing response types only where needed.
- **Implement:** Validate version, id, name, lifecycle state, bounded input/result payloads, decision metadata, and shallow adapters for current trusted Research/wiki/save-conflict states. Reject executable or transport fields rather than carrying them through. Do not invent browser adapters for registry-only tools.
- **Verify:** State table, size/depth/string bounds, unknown fields, malformed decision metadata, deterministic adapter output, and no persistence/network side effects.

### U2. Code-owned renderers and decision view

- **Depends on:** U1.
- **Requirements:** R3-R5, R7-R20.
- **Files:** `tool-renderers.ts`, its test, `style.css`, `i18n.ts`.
- **Implement:** Native DOM renderers, safe fallback, validated source links, expandable bounded details, lifecycle announcements, and a decision dialog that returns a response to its host without dispatching execution.
- **Verify:** `textContent` safety, no dynamic imports/HTML/linkification, exact renderer map, EN/ES parity, keyboard order, focus restoration, Escape behavior, and bounded fallback.

### U3. Standalone Research and wiki workflow integration

- **Depends on:** U1, U2.
- **Requirements:** R1-R20, AE1-AE5, AE7.
- **Files:** `main.ts`, existing trusted response types, focused tests.
- **Implement:** Replace only the corresponding bespoke presentation branches for current Research results, wiki proposals/apply, and genuine save/conflict states. Preserve their current route calls, persistence, pinning, collection navigation, editing, and confirmation behavior.
- **Verify:** Existing workflows produce equivalent actions with richer cards; no Inbox Review symbol or route returns; vault writes and wiki apply still traverse existing guarded paths.

### U4. Conditional Pi adapter

- **Depends on:** U1 and an implemented Pi prototype. Skipped without Pi and not required for standalone completion.
- **Requirements:** R21-R23, AE6.
- **Files:** one shallow adapter beside the Pi event reducer plus focused test; no supervisor, gateway, session, or renderer duplication.
- **Implement:** Add the Pi-side adapter that maps normalized tool id/name/state/input/result into `ToolPresentationV1`. When present, route every Pi tool lifecycle through the shared renderer; retain Pi baseline cards only in builds without the adapter.
- **Verify:** Dedicated and unknown Pi tool names both use shared renderer authority; cancellation/error correlation remains Pi-owned; repository search shows no second active Pi tool-card renderer on the integrated branch.

### U5. Browser and release proof

- **Depends on:** U1-U3. Include U4 only when Pi already exists.
- **Requirements:** all standalone requirements.
- **Files:** `tool-presentations.spec.ts` and fixture wiring only.
- **Verify:** Desktop/narrow layouts, keyboard/focus, safe citations, wiki decision, stale/conflict states, unknown fallback, collection switching, strict browser diagnostics, and repository serial gate.

## Deterministic Verification

| Gate | Command | Proves |
|---|---|---|
| Presentation units | `npm test -- --run web/src/tool-presentation.test.ts web/src/tool-renderers.test.ts` | Contract, adapters, bounds, safe renderer selection, and decisions. |
| Existing workflow regression | `npm test -- --run web/src/research-state.test.ts web/src/api.test.ts server/app.test.ts` | Collection, token, route, and guarded workflow behavior remains. |
| Type and build | `npm run typecheck && npm run build` | Dependency-free vanilla integration compiles. |
| Focused browser | `npm run test:e2e -- tests/e2e/tool-presentations.spec.ts` | Real geometry, accessibility, decisions, safe links, and diagnostics. |
| Required serial gate | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Full release contract remains green without Pi. |

## Security Negatives

- Producers cannot select components, imports, HTML, CSS, routes, methods, headers, tokens, commands, or arbitrary links.
- Unknown names and result shapes render bounded escaped text only.
- Decision UI without a real server-issued identity or an existing guarded host confirmation cannot appear actionable.
- A renderer response alone cannot dispatch, approve, spend, mutate, or consume a server decision.
- Existing stale hash, consent, key, token, Host/Origin, source eligibility/classification, selected-wiki path, RAW-destination, and create-absence failures remain authoritative and visible; no semantic contract or stronger wiki proposal-binding guarantee is claimed.
- External links come only from validated server source fields and use safe attributes.
- Envelopes are not persisted as a second Research, Inbox, note, or agent store.
- No Inbox Review runtime, route, control, state, suggestion, or routine is recreated.

## Definition of Done

- Existing Research and wiki workflows render safe, localized, accessible lifecycle/result/decision cards through `ToolPresentationV1`.
- The renderer is vanilla TypeScript, dependency-free, runtime-neutral, and ignorant of provider, session, transport, and authorization internals.
- Existing guarded execution, consent, approvals, CAS, `write.ts`, and wiki validation remain authoritative.
- Unknown output falls back safely; no model or producer can select executable UI.
- The feature passes its standalone focused checks and full serial gate with Pi absent.
- If Pi already exists, the thin adapter passes; if not, generative UI is still complete and Pi remains independently implementable.
- Deprecated Inbox Review behavior remains absent.

## Evidence Consulted

- `STRATEGY.md` and `PRODUCT.md`: durable-artifact, local-first, explicit-action, and non-chatbot principles.
- `ROADMAP.md`: mutable outcome sequencing; RM002/RM003 deprecation is corrected separately without rewriting historical plan/ledger evidence.
- Current `web/src/main.ts`: existing Research history, wiki proposal/apply, durable document, and activity-card presentation paths.
- `web/src/research-state.ts`: current Research/Inbox collections, cursor, pin, and arrival behavior.
- `server/integrations/registry.ts`, `write.ts`, wiki-ingest routes, and security middleware: execution and authorization remain outside presentation.
- `docs/plans/2026-07-19-prototype-pi-rpc-agent-tui-plan.md`: optional runtime collaborator, never a prerequisite.
