---
title: Grounded Chat and Tool-Driven Generative UI - Plan
type: feat
date: 2026-07-19
topic: grounded-chat-generative-ui
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
replaces: docs/plans/2026-07-19-gen-ui-schema-renderer.md
---

# Grounded Chat and Tool-Driven Generative UI - Plan

## Goal Capsule

- **Objective:** Add a grounded conversational work surface that uses Sinapso's existing tools, renders safe tool-specific UI, and helps useful conversations become durable notes or documents.
- **Product authority:** `STRATEGY.md`, `PRODUCT.md`, `AGENTS.md`, and the session-settled architecture recorded in this plan.
- **Replacement:** This plan replaces and deletes `docs/plans/2026-07-19-gen-ui-schema-renderer.md`. It rejects that plan's generic schema renderer, generic commands, and `/api/generative-ui` route.
- **Placement:** A small React island lives inside the existing research column. The Three.js shell, editor, menus, and remaining frontend stay in vanilla TypeScript.
- **Trust boundary:** Local files remain canonical. Chat history is app-local runtime data outside the vault. Vault writes still pass through `server/integrations/write.ts`, and Git still passes through its existing user-triggered routes.
- **Stop conditions:** Do not add a direct Assistant Cloud dependency or use its hosted service, an application database, Vercel AI Gateway, model-selected endpoints, a second tool execution layer, or app-wide React.
- **Open blockers:** None. U0 is a mandatory compatibility preflight, not optional implementation work.

## Product and Trust Contract

### Product behavior

- R1. Chat is a third research-column collection beside Research and Inbox. It reuses the column's dock, float, resize, close, responsive, and topbar geometry rather than adding another pane.
- R2. The Chat collection remains visually subordinate to the graph and editable notes. Closing or switching the collection does not delete a thread, and chat does not replace the reader as the durable work surface.
- R3. Chat should guide useful outcomes toward existing durable actions such as `write_document`, `save_research_to_inbox`, and wiki ingest. A transcript alone is not presented as the product outcome.
- R4. The initial experience supports multiple local threads, streaming messages, tool lifecycle states, thread rename/archive/delete, and explicit new-thread creation.
- R5. All new labels, states, errors, tool summaries, approval copy, and empty states have matching English and neutral-Spanish entries in `web/src/i18n.ts`.

### Runtime and provider behavior

- R6. `@assistant-ui/react` supplies only the MIT UI primitives/runtime. `@assistant-ui/react-ai-sdk`, AI SDK Core, and `@ai-sdk/react` supply chat behavior and transport. U0 must select a mutually compatible current package set before feature implementation. This plan does not assume an AI SDK major. `assistant-cloud` is never a direct dependency, imported, configured, instantiated, called, or used as a hosted service. An unused transitive package required by assistant-ui is permitted in `package-lock.json` and `node_modules`.
- R7. `grounded_chat` is registered as a worker-tier HTTP operation. The server resolves it through the existing `operationTier()` and `resolveTier()` path. Provider, model, key, endpoint, and effort/thinking settings remain server-owned.
- R8. The server creates an AI SDK OpenAI-compatible model from the `ResolvedTier` result. It must preserve `llm.ts` code-owned `ENDPOINTS`, BYO provider keys, model selection, fallback order, and `extraBody` semantics. No provider URL, key, or model secret reaches the browser.
- R9. `POST /api/chat` is token-guarded because it spends model credit. It accepts bounded AI SDK `UIMessage` input, validates stored and submitted messages against the active tool definitions, and streams the compatible AI SDK UI message protocol. Canonical message persistence remains the thread history adapter's responsibility.
- R10. No Vercel AI Gateway dependency or provider string shortcut is used. The OpenAI-compatible adapter receives only the endpoint returned by `resolveTier()`.

### Local thread persistence

- R11. Threads and encoded UI message history live under `<dataDir>/chat/`, outside the vault and graph. There is no application cloud or database.
- R12. `server/integrations/chat-history.ts` owns this store. Thread ids are server-generated opaque ids. Modeled on `write.ts`, the store verifies the real `dataDir`, rejects a symlinked chat directory or thread file with `lstat`, confines `realpath` targets under the verified directory, uses no-follow/exclusive opens where supported, and atomically replaces a regular file with temp-file plus rename. Prefix checks alone are insufficient.
- R13. One JSON file per thread stores an opaque revision/ETag, metadata, assistant-ui history rows, and server-owned pending approval records. Every mutation of an existing thread supplies `If-Match` with its last revision, executes as one serialized per-thread read-modify-write, and returns the new ETag. Create returns the initial ETag.
- R14. Guarded Express routes provide list, create, fetch, rename, archive, unarchive, delete, message list, message append, and message update. All chat-history routes, including reads, require `x-sinapso-token` because history may contain private note content. Thread reads return the current ETag; existing-thread mutation without it returns `412` and writes nothing.
- R15. Multi-thread wiring is exact: `useRemoteThreadListRuntime({ runtimeHook: () => useChatRuntime(...), adapter })` wraps the active AI SDK runtime. `RemoteThreadListAdapter.unstable_Provider` stays synchronously mounted, always renders `children` on its first commit, and supplies the active remote thread's `ThreadHistoryAdapter.withFormat`. Async list/history loads happen inside the mounted runtime; they never withhold `children`.
- R16. Thread title generation is deterministic from the first user message in the initial version. It does not trigger a second model call. Permanent thread deletion requires an explicit UI confirmation; archive remains the default removal action.
- R17. Missing or corrupt thread files fail closed for that thread without affecting vault data. A malformed id, traversal attempt, symlinked directory/file, duplicate message id, stale ETag, or concurrent mutation cannot write outside the thread file or silently replace another thread.

### Registry-derived tools

- R18. Add `chat` to `Surface` and explicitly mark the initial chat tool set in `REGISTRY`. Chat tools are derived from those entries' existing names, descriptions, parameter schemas, tiers, and route bindings.
- R19. The initial chat surface includes local discovery and verification tools plus existing durable-work actions that have complete safe route bindings. Browser-only voice actions, Gemini-only delegation, unbound operations, Git operations, and `edit_vault_note` are excluded.
- R20. Extract the closed registry route-binding proxy from `mcp-bridge.ts` into a shared server module used by MCP and Chat. The model can select only a registered chat tool and its schema-valid arguments. The server alone supplies the HTTP method, path, base URL, and session token.
- R21. Every tool call still traverses the existing Express route. Existing Host/Origin checks, `x-sinapso-token`, web consent, provider/spending gates, MCP edit opt-in, route validation, CAS checks, wiki contract validation, and sanctioned writers remain authoritative.
- R22. Existing Voice, MCP, and CLI behavior remains unchanged except for one intentional shared-schema correction: in `registry.ts`, add optional `baseHash: { type: "string" }` to `apply_wiki_ingest.params.properties.operations.items.properties`. The existing operation item fields remain `type`, `path`, `content`, `title`, `raw`, and `sourceNote`; only `type` and `path` remain required. This matches existing server proposal/apply handling and corrects the shared declaration without changing behavior. Update derived Voice/realtime/MCP/CLI snapshots. Old payloads without `baseHash` remain accepted, and supplied hashes are forwarded unchanged to the existing apply route.
- R23. Do not add a generic command enum, `/api/generic-action`, rename endpoint, tag endpoint, arbitrary action endpoint, or model-controlled HTTP executor.
- R23a. `edit_vault_note` remains excluded because its current registry contract does not carry `baseHash`. Initial CAS-safe note updates use `write_document` with `note` and `baseHash`. Adding `edit_vault_note` later requires registry/API contract work plus explicit Voice/MCP/CLI cross-surface review; Chat must not silently change those declarations.

### Tool-driven generative UI

- R24. Generative UI is the rendering of existing tool lifecycle and result parts. Each allowlisted tool name maps to a code-owned assistant-ui React renderer that handles running, approval-requested, success, denied, error, and cancelled states as applicable.
- R25. Discovery tools render bounded result lists; read tools render excerpts; web tools render server-returned citations; durable-work tools render canonical note paths and hashes/revisions; wiki proposal tools render the returned target and operations.
- R26. A tool without a dedicated renderer uses a safe generic fallback: escaped tool name, status, and bounded JSON text. The fallback does not use `innerHTML`, linkify strings, import components, or create controls from result keys.
- R27. The generative-UI contract accepts no HTML, JSX, JavaScript, component import, route, HTTP method, or navigation URL from the model. Renderer choice is the registry tool name. Any displayed external URL comes only from a validated server tool result and is rendered by a code-owned component with safe link attributes.
- R28. Ordinary tool UI stays inline in the thread. Center-screen UI is reserved for user decisions and approvals. Approval dialogs use an app-owned React portal, focus trap, initial focus, visible focus, Escape-to-deny, focus restoration, and a polite status announcement.
- R29. `json-render` is deferred. Add it only if repeated tool-specific cards demonstrate a concrete need for arbitrary catalog-driven layouts. It does not supply the chat shell, thread runtime, persistence, or approval policy.

### Server-owned approval policy

- R30. `chat.ts` owns a closed approval policy keyed by registry tool name. Local read-only tools may run without approval. Network/spending tools and every mutating or destructive tool require explicit user approval in the initial version.
- R31. Approval is mandatory for `write_document`, `save_research_to_inbox`, `apply_wiki_ingest`, and `archive_vault_note`. `propose_wiki_ingest`, `web_research`, and `fetch_url` also require approval because they can spend credit or send selected context externally.
- R32. Git tools are not exposed to Chat initially. If later added to the registry's chat surface, Git init, commit, sync, checkpoint, restore, or any other repository mutation must be approval-gated and must keep the current Git route safeguards.
- R33. AI SDK approval parts are transport/UI signals, not authorization. Before emitting one, the server requires the current thread ETag and writes a pending approval keyed by thread id plus approval/tool-call id. Canonical arguments use recursively sorted object keys, preserved array order, and UTF-8 JSON before SHA-256. The record contains the canonical tool name, argument hash, a 15-minute expiry, and consumed state.
- R34. On approval or denial, the server reloads the thread under its serialized mutation lock, requires the current ETag, revalidates and canonicalizes the submitted tool arguments, matches tool name and argument hash, checks expiry and unconsumed state, then atomically consumes the record before any approved route dispatch. Forged, stale, changed, expired, or replayed responses fail closed. A consumed approval is never reusable, including after dispatch failure.
- R34a. `apply_wiki_ingest` approval binds the exact validated arguments shown to the user: `wikiId`, `researchId` and/or `sourceNote`, and every operation including its `baseHash`. The existing apply route remains authoritative.
- R35. Denial is persisted as a tool result visible to both user and model. The system instruction tells the model not to retry a denied action automatically. A retry requires a new user request.
- R36. Approval is not inferred from a prior conversational statement or from a presentational danger style. Execution requires the matching unexpired server pending record plus the user's recorded response; neither the approval part nor callback is sufficient.

### Acceptance examples

- AE1. A user opens Chat in the research column, starts a thread, searches the vault, verifies a note, drafts a durable Inbox note through `write_document`, and can reopen the thread after reload. The graph and reader stay usable throughout.
- AE2. With no configured provider key, sending a message returns a localized unavailable state, makes no external request, and writes no fake assistant response.
- AE3. A model calls `search_vault`. The existing route runs without approval, results appear in an allowlisted result card, and no vault file changes.
- AE4. A model calls `write_document` with `operation: "update"`, `note`, complete Markdown, and the `baseHash` returned by `read_working_document`. A center-screen approval appears before dispatch; a stale hash produces a conflict card and no write.
- AE5. A model calls `apply_wiki_ingest`. The pending approval hashes the exact shown `wikiId`, `researchId`/`sourceNote`, and operations including `baseHash` values. Changed arguments, expiry, or replay cannot apply; denial is shown in the thread and is not retried.
- AE6. A model emits an unknown tool part or an unexpected result shape. The thread renders escaped bounded JSON, no executable markup, no dynamic link, and no crash.
- AE7. Requests without the session token cannot list, read, create, mutate, or stream chat. Foreign Host/Origin, traversal ids, and model-selected route attempts are rejected.
- AE8. Voice, MCP, and CLI retain their existing tool lists and behavior. Their derived `apply_wiki_ingest` schema additionally declares optional operation `baseHash`; old payloads still dispatch, hashed payloads forward each value unchanged, and snapshots change only for this field plus intentional chat-surface metadata.
- AE9. At narrow width, Chat remains inside the existing research-column/rail geometry, has no horizontal overflow, and supports composer, thread switch, tool cards, and approvals using keyboard only.
- AE10. Archiving or deleting a thread changes only `<dataDir>/chat/`. Saving or editing a note still journals through `write.ts`; Git still uses `git.ts`.

## Non-Goals

- No app-wide React migration or replacement of `web/src/main.ts`.
- No direct `assistant-cloud` dependency, import, configuration, instantiation, call, or hosted service. An unused assistant-ui transitive package in the lockfile/install is allowed.
- No Vercel AI Gateway.
- No `/api/generative-ui`, generic command enum, generic action route, speculative rename/tag endpoints, or freeform endpoint execution.
- No model-generated HTML, JSX, JavaScript, component imports, CSS, route names, methods, or UI URLs.
- No `json-render` in the initial implementation.
- No A2UI, AG-UI migration, MCP Apps, iframe apps, or model-generated mini-apps.
- No automatic background chat, automatic artifact creation, automatic web spend, or automatic mutation.
- No change to current Voice, MCP, or CLI behavior beyond the optional `apply_wiki_ingest.operations[].baseHash` schema correction in R22.

## Planning Contract

### Key Technical Decisions

- KTD1. **[session-settled] Small React island, not React migration.** Mount one `createRoot()` under the existing research column and keep the current shell in vanilla TypeScript. Rejected: app-wide React and the old vanilla schema renderer.
- KTD2. **[session-settled] assistant-ui is local UI/runtime only.** Use its MIT packages and custom adapters. Never directly depend on or invoke Assistant Cloud; tolerate an unused transitive package when assistant-ui requires it. Rejected: configuring or using Assistant Cloud or any hosted thread service.
- KTD3. **[session-settled] AI SDK uses Sinapso's provider authority.** After U0 verifies a compatible package set, build the OpenAI-compatible model from `resolveTier()` output and preserve code-owned endpoints, BYO keys, and provider options. Rejected: Vercel AI Gateway, browser-held keys, config-supplied endpoints, and replacing `llm.ts`.
- KTD4. **[session-settled] Threads are app-local files with optimistic concurrency.** Use `<dataDir>/chat/` with symlink-safe confinement, atomic per-thread JSON, serialized mutation, and required ETags. Rejected: vault transcripts, SQLite, cloud persistence, prefix-only confinement, and `localStorage` as canonical history.
- KTD5. **[session-settled] Registry is the tool declaration source.** Add a chat surface and share its existing closed route-binding proxy with MCP. Rejected: a duplicate chat command catalog and a second execution framework.
- KTD6. **[session-settled] Tool parts are the generative-UI protocol.** Code-owned React renderers consume validated tool lifecycle/results. Rejected: `/api/generative-ui`, freeform schemas, HTML/JSX, A2UI, and MCP Apps.
- KTD7. **[session-settled] Server records authorize actions.** AI SDK approval parts carry the prompt and response, but only a matching unexpired pending record in the thread store can authorize dispatch. The server atomically consumes it first. Rejected: treating transport parts, client buttons, prompts, or danger styles as authorization.
- KTD8. **[session-settled] Center-screen means decision.** Tool status and results stay inline; only approvals interrupt the spatial workspace. Rejected: mid-screen status cards and model-selected overlays.
- KTD9. **[session-settled] `json-render` is evidence-gated.** Tool-specific cards are the smaller initial solution. Rejected now: arbitrary catalog-driven layouts before repetition proves the need.
- KTD10. **Compatibility is a prerequisite, not an assumption.** U0 checks current npm manifests and primary docs, locks one mutually compatible assistant-ui/AI SDK set, and proves the minimum Express, tool, approval, React, typecheck, and build path before U1-U7. Rejected: freezing unverified majors in this plan.
- KTD11. **Grounded chat starts on the worker tier.** Existing thinker-tier operations such as wiki synthesis keep their own tier. This avoids a new model selector or routing policy in the chat island.

### Architecture and Data Flow

```text
Research column #chat-root
  -> React assistant-ui primitives
  -> useRemoteThreadListRuntime({
       runtimeHook: () => useChatRuntime(...),
       adapter: RemoteThreadListAdapter
     })
       -> unstable_Provider renders children synchronously
       -> active remote thread gets ThreadHistoryAdapter.withFormat
  -> POST /api/chat with x-sinapso-token
  -> operationTier("grounded_chat") + resolveTier()
  -> @ai-sdk/openai-compatible using ResolvedTier endpoint/key/model/options
  -> AI SDK streamText + registry-derived chat tools
       -> local read tool: shared registry route proxy -> existing Express route
       -> gated tool: persist pending record + emit approval part
       -> user response + If-Match
       -> lock thread, hash canonical validated args, match, expire-check
       -> atomically consume pending record
       -> approved only: bound existing Express route
  -> UIMessage/tool parts stream back
  -> allowlisted assistant-ui renderer or safe fallback
  -> ThreadHistoryAdapter.withFormat
  -> guarded ETag mutations -> <dataDir>/chat/<thread-id>.json

Vault mutation -> existing route -> server/integrations/write.ts -> journal
Git mutation   -> existing route -> server/integrations/git.ts
```

### Directional Contracts

```ts
type ChatThreadFile = {
  id: string;
  revision: string; // opaque ETag, replaced after each mutation
  title?: string;
  status: "regular" | "archived";
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    parent_id: string | null;
    format: string;
    content: unknown; // opaque adapter encoding
  }>;
  pendingApprovals: Array<{
    threadId: string;
    id: string; // approval/tool-call id
    toolName: string;
    argsSha256: string; // stable-key canonical JSON after schema validation
    expiresAt: string;
    consumed: boolean;
    decision?: "approved" | "denied";
    consumedAt?: string;
  }>;
};

type ChatApprovalClass = "read" | "external" | "mutating" | "destructive";
```

Expected routes:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Token-guarded AI SDK UI-message stream; `If-Match` required whenever the turn issues or answers approval. |
| `GET`, `POST` | `/api/chat/threads` | List and create local threads. |
| `GET`, `PUT`, `DELETE` | `/api/chat/threads/:id` | Fetch, ETag-guarded rename/status update, and confirmed delete. |
| `GET`, `POST` | `/api/chat/threads/:id/messages` | Load and ETag-guarded append of adapter-encoded messages. |
| `PUT` | `/api/chat/threads/:id/messages/:messageId` | ETag-guarded finalization of streamed or approval-paused messages. |

Every route above uses the existing `guarded` middleware. No route accepts a provider endpoint, HTTP method, filesystem path, or arbitrary command from the model.

### Initial Chat Tool Surface

| Class | Registry entries | Approval |
|---|---|---|
| Local read | `current_view`, `search_vault`, `read_note`, `browse_folder`, `list_wikis`, `read_wiki_contract`, `read_working_document` | None |
| External/spending | `web_research`, `fetch_url`, `propose_wiki_ingest` | Required |
| Durable mutation | `write_document`, `save_research_to_inbox` | Required |
| Destructive or irreversible-looking | `archive_vault_note`, `apply_wiki_ingest` | Required |

`open_note`, `edit_vault_note`, and Git stay out of the first chat surface. Adding `edit_vault_note` requires a `baseHash`-carrying contract and cross-surface review; Chat must not alter its existing Voice/MCP/CLI declaration in this implementation.

## Expected Files and Dependencies

### Create

- `server/integrations/chat-history.ts`
- `server/integrations/chat-history.test.ts`
- `server/integrations/chat.ts`
- `server/integrations/chat.test.ts`
- `server/integrations/registry-dispatch.ts`
- `server/integrations/registry-dispatch.test.ts`
- `web/src/chat.tsx`
- `web/src/chat.test.ts`
- `tests/e2e/chat.spec.ts`

### Modify

- `server/app.ts`
- `server/app.test.ts`
- `server/integrations/registry.ts`
- `server/integrations/registry.test.ts`
- `server/integrations/mcp-bridge.ts`
- `server/integrations/mcp-bridge.test.ts`
- `web/index.html`
- `web/src/main.ts`
- `web/src/research-state.ts`
- `web/src/research-state.test.ts`
- `web/src/style.css`
- `web/src/i18n.ts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `THIRD_PARTY_LICENSES.md`

`web/vite.config.ts` is not expected to change. Vite already builds TypeScript; `tsconfig.json` only needs `jsx: "react-jsx"`. Do not add `@vitejs/plugin-react` unless a focused build proves it necessary.

### Minimal runtime dependencies

- `react` and `react-dom`
- `@assistant-ui/react`
- `@assistant-ui/react-ai-sdk`
- `assistant-stream` for the deterministic `RemoteThreadListAdapter.generateTitle` stream
- `ai`
- `@ai-sdk/react`
- `@ai-sdk/openai-compatible`

Add `@types/react` and `@types/react-dom` as development dependencies. U0 selects the compatible versions from current package manifests and primary docs; `package-lock.json` owns the exact installed set. Reuse the existing `zod`; do not add Tailwind, shadcn, a React router, a state library, a database driver, `json-render`, a direct `assistant-cloud` dependency, or a Gateway package.

## Implementation Units

### U0. Package compatibility and minimum vertical proof

- **Depends on:** none. U1-U7 do not start until this passes.
- **Requirements:** R6-R10, KTD10.
- **Files:** `package.json`, `package-lock.json`, `tsconfig.json`, minimal seams in the planned `chat.ts`, `chat.test.ts`, and `chat.tsx` files.
- **Behavior:** Check current npm peer manifests and primary assistant-ui/AI SDK docs; install one mutually compatible set using only the package names above; record exact versions only in the lockfile. Prove a minimal Express endpoint can stream one assistant text part and one tool part, pause and resume one approval roundtrip, and use the OpenAI-compatible adapter without Gateway. Mount and unmount one React island with the compatible assistant-ui runtime. Do not directly import or configure `assistant-cloud`, even if it appears transitively.
- **Tests:** Focused fake-provider stream and approval test, React mount smoke in jsdom, static check for no direct `assistant-cloud` dependency/import/config, network spy proving zero Assistant Cloud requests, `npm run typecheck`, and `npm run build`.
- **Acceptance evidence:** The lockfile resolves with no peer override; any transitive `assistant-cloud` package remains unused; static and network checks prove no direct integration; the stream/tool/approval smoke passes; the React root mounts; and typecheck/build pass. If any proof fails, change only the package set and repeat U0 before feature work; do not claim an AI SDK major from documentation alone.

### U1. Confined atomic chat-history store and routes

- **Depends on:** U0.
- **Requirements:** R11-R17, R33-R35, AE5, AE7, AE10.
- **Files:** `chat-history.ts`, its test, `server/app.ts`, `server/app.test.ts`.
- **Behavior:** Implement verified real-directory confinement, `lstat`/`realpath`/no-follow symlink defenses, atomic per-thread files, opaque revision/ETag, and a keyed per-thread mutation queue. Every existing-thread mutation checks `If-Match`, performs one read-modify-write, and returns a new ETag. Store message rows and pending approval records with canonical tool name, canonical-args SHA-256, expiry, consumed state, decision, and timestamps. Add guarded CRUD/message routes, deterministic title fallback, and body/count bounds.
- **Tests:** Traversal; symlinked chat directory; symlinked thread file; corrupt JSON isolation; atomic replacement; archive/list filtering; duplicate messages; missing/stale ETag; two concurrent mutations where only the matching serialized revision succeeds; pending approval persistence/expiry/consume/replay; token on every route; no vault/changelog writes.
- **Acceptance evidence:** Focused tests show reloadable thread and approval-paused state, monotonic opaque ETags, no lost update, no symlink escape, and one-time approval consumption.

### U2. Chat surface and one shared registry route dispatcher

- **Depends on:** U0.
- **Requirements:** R18-R23a, AE3, AE8.
- **Files:** `registry.ts`, `registry.test.ts`, new `registry-dispatch.ts` and test, `mcp-bridge.ts` and test.
- **Behavior:** Add `chat` to `Surface`; mark only the initial table entries; move MCP's path filling, legacy document route selection, query/body mapping, and loopback request logic into the shared closed dispatcher; let MCP and Chat supply their own scoped token source.
- **Tests:** Exact chat names; no unbound entries; no Git/open-note/delegate/`edit_vault_note` exposure; methods and paths remain registry-owned; legacy `documentId` behavior remains; `apply_wiki_ingest` operation items expose optional `baseHash` beside `type`, `path`, `content`, `title`, `raw`, and `sourceNote`; old payloads remain valid; hashes forward unchanged; Voice/realtime/MCP/CLI snapshots update only for that field; MCP 403 scoping remains unchanged.
- **Acceptance evidence:** Existing cross-surface behavior tests pass with the explicit optional `baseHash` schema correction, and a chat tool cannot dispatch an entry absent from the chat surface.

### U3. AI SDK streaming, provider adaptation, and approvals

- **Depends on:** U0, U1, U2.
- **Requirements:** R6-R10, R30-R36, AE2-AE7.
- **Files:** new `chat.ts` and test, `server/app.ts`, `server/app.test.ts`, `registry.ts`.
- **Behavior:** Register worker-tier `grounded_chat`; resolve through `resolveTier()`; create the compatible OpenAI model adapter from `ResolvedTier`; preserve provider `extraBody`; build tools from registry schemas; validate `UIMessage`; and apply the closed approval map. Before streaming an approval part, create the pending record through U1 and emit the new thread revision. On response, require thread id plus current ETag, revalidate/canonicalize args, compare SHA-256/name/id/expiry under the thread lock, atomically consume, then dispatch only an approved match through the shared registry proxy. Denial consumes without dispatch and is sent to the model with a no-auto-retry instruction.
- **Tests:** Each provider uses its code-owned endpoint and key without exposing either; thinker/worker fallback remains; extra body survives; malformed messages fail; absent key makes no fetch; consent/spending failures propagate; forged, changed, expired, replayed, or stale-ETag approval fails; concurrent approval responses dispatch at most once; denial reaches the next model turn without dispatch; `write_document` keeps `baseHash`; wiki apply hashes exact `wikiId`, source identity, operations, and operation hashes.
- **Acceptance evidence:** A fake OpenAI-compatible stream proves text, tool call, pending-record persistence, approval, denial, and approved dispatch with no Gateway request.

### U4. React island, thread runtime, and local adapters

- **Depends on:** U0, U1, U3.
- **Requirements:** R1-R6, R14-R16.
- **Files:** `web/src/chat.tsx`, `chat.test.ts`, `web/index.html`, `web/src/main.ts`, `package.json`, lockfile, `tsconfig.json`, third-party licenses.
- **Behavior:** Mount one React root into a stable `#chat-root` sibling of `#research-body`; compose assistant-ui primitives with Sinapso-owned markup/styles; configure token-bearing AI SDK transport. Implement `useRemoteThreadListRuntime({ runtimeHook: () => useChatRuntime(...), adapter })`. The adapter's `unstable_Provider` renders `children` synchronously and injects a `ThreadHistoryAdapter.withFormat` resolved from the active remote thread. It awaits id initialization before first append, keeps a per-thread ETag/mutation queue, updates the ETag from every response/stream metadata event, and reloads on `412`. Keep the root mounted but hidden when another collection is active; dispose only on app teardown.
- **Tests:** Exact active remote thread selects the matching history adapter; `unstable_Provider` never withholds children; first message awaits one stable remote id; rapid thread switches cannot append to the previous thread; per-thread ETag queue preserves order; token headers, CRUD, append/update, reload restoration, `412` reload, and transport error mapping.
- **Acceptance evidence:** `npm run typecheck` and `npm run build` compile TSX without an app-wide React entry or Vite plugin.

### U5. Allowlisted tool renderers and decision portal

- **Depends on:** U2, U3, U4.
- **Requirements:** R24-R36, AE3-AE6.
- **Files:** `web/src/chat.tsx`, `web/src/chat.test.ts`, `web/src/style.css`, `web/src/i18n.ts`.
- **Behavior:** Register tool-specific renderers for the initial surface; map lifecycle states; implement bounded safe fallback; render only server-returned links as safe anchors; open a centered portal only for approval. The assistant-ui callback sends the user's response and current thread ETag, but never authorizes execution by itself. Render server-confirmed consumed/denied/expired states and refresh on `412`.
- **Tests:** Tool-name allowlist, lifecycle mapping, fallback bounds/escaping, no dynamic URL or HTML, approval focus/keyboard reducer, one response per approval, stale/expired/denied states, and proof that the UI callback alone cannot dispatch.
- **Acceptance evidence:** Component behavior is covered through pure helper tests and Playwright, consistent with the repo's lack of a React component test runner.

### U6. Research-column integration, accessibility, and CSS cleanup

- **Depends on:** U4, U5.
- **Requirements:** R1-R5, R28, AE1, AE9.
- **Files:** `web/index.html`, `web/src/main.ts`, `research-state.ts` and test, `style.css`, `i18n.ts`.
- **Behavior:** Extend `ResearchCollection` to `"research" | "inbox" | "chat"`; add a Chat collection control with `aria-pressed`; hide research-only nav/footer/pin in Chat; preserve Inbox flush-before-switch; reuse CSS variables and research geometry; provide responsive thread list/composer; restore focus after dialogs and collection switches.
- **Tests:** Collection transitions, Inbox flush before Chat, Chat stays mounted, pin semantics unchanged for Research/Inbox, EN/ES key parity, keyboard order, narrow layout.
- **Acceptance evidence:** Desktop and narrow Playwright assertions show no panel regression, overflow, trapped focus, or browser diagnostic.

**Dormant CSS migration:** `web/src/style.css` currently contains `#agent-*` and `.agent-msg` rules, while no matching live HTML/TypeScript references exist. Remove those dormant selectors only after the new chat classes land and a repository search confirms they remain unused. Do not reuse their hard-coded colors or treat them as an existing chat implementation.

### U7. End-to-end trust and durable-work proof

- **Depends on:** U0-U6.
- **Requirements:** all.
- **Files:** new `tests/e2e/chat.spec.ts`, existing server/frontend tests only where fixture integration requires it.
- **Behavior:** Add hermetic provider and tool fixtures covering local grounding, exact remote-thread identity, first-message initialization, thread reload, spending approval, one-time server approval consumption, `write_document` update with `baseHash`, wiki argument-hash binding, denial, stale ETag/CAS, unknown fallback, collection switching, and narrow viewport. Keep browser diagnostics strict.
- **Tests:** AE1-AE10, with explicit assertions that chat data stays under the E2E data directory and note mutations use the existing journal.
- **Acceptance evidence:** Focused Playwright passes with zero skips, zero unallowlisted diagnostics, zero Assistant Cloud network requests, and no request to Vercel Gateway or a model-selected endpoint.

## Verification Contract

Run in this order:

| Gate | Command | Proves |
|---|---|---|
| U0 compatibility | `npm test -- --run server/integrations/chat.test.ts web/src/chat.test.ts && npm run typecheck && npm run build` | Locked packages can stream text/tool parts, round-trip approval UI, mount React, avoid direct Assistant Cloud integration, and make zero Assistant Cloud requests. |
| Focused history/routes | `npm test -- --run server/integrations/chat-history.test.ts server/app.test.ts` | Confined atomic persistence and route guards. |
| Focused registry/provider | `npm test -- --run server/integrations/registry-dispatch.test.ts server/integrations/registry.test.ts server/integrations/mcp-bridge.test.ts server/integrations/chat.test.ts server/integrations/llm.test.ts` | Surface isolation, optional wiki-operation `baseHash`, cross-surface compatibility, provider authority, approvals, and dispatch. |
| Focused frontend | `npm test -- --run web/src/chat.test.ts web/src/research-state.test.ts web/src/api.test.ts` | Adapter, fallback, collection, and token behavior. |
| Type and build | `npm run typecheck && npm run build` | TSX, React island, server stream, and bundle integration compile. |
| Focused browser | `npm run test:e2e -- tests/e2e/chat.spec.ts` | Real thread, tools, approvals, accessibility, geometry, and diagnostics. |
| Repository serial gate | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Full release contract remains green in the required order. |

## Security Negatives

Release is blocked unless tests prove:

- Missing or invalid `x-sinapso-token` cannot stream chat or read/mutate chat history.
- Foreign Host/Origin is rejected before chat or tool dispatch.
- Thread/message traversal, malformed ids, symlinked chat directory, symlinked thread file, corrupt JSON, oversize bodies, and duplicate ids fail without vault impact.
- Every existing-thread mutation requires the current ETag and runs through one serialized per-thread read-modify-write; concurrent stale mutations cannot overwrite newer state.
- Browser or model input cannot choose provider endpoint, request base, HTTP method, route path, headers, component, import, or executable markup.
- Chat cannot dispatch tools absent from the registry's chat surface.
- Web and provider calls fail behind existing consent, key, and spending gates.
- An AI SDK approval part or client callback without a matching pending server record never executes a route.
- Forged, stale-ETag, changed-argument, expired, replayed, cancelled, consumed, or denied approvals never execute a route.
- Concurrent responses for one approval dispatch at most once because consumption commits before route execution.
- Archive, `write_document`, wiki apply, save, and any future Git action never execute before explicit approval.
- `baseHash`, legacy `revision`, wiki source identity, exact operation list, operation hashes, and existing apply-route validation survive the chat adapter unchanged.
- `edit_vault_note` is absent from the initial chat surface; adding it requires a CAS contract and Voice/MCP/CLI cross-surface review.
- Denial is persisted and visible to the model; the same action is not retried automatically.
- Unknown tool output renders bounded escaped text only, with no `innerHTML` or automatic links.
- All vault writes still enter `write.ts`; all Git changes still enter `git.ts`; chat files never enter the vault or graph.
- Voice, MCP, and CLI surface and token behavior remain unchanged; only the optional `apply_wiki_ingest.operations[].baseHash` declaration changes, with old payload compatibility and unchanged hash forwarding proven.

## Definition of Done

- Grounded multi-thread chat runs as one React island in the existing research column.
- assistant-ui and AI SDK use no direct Assistant Cloud dependency/integration or hosted request, database, Gateway, or browser-held key; an unused required transitive package is acceptable.
- Threads, ETags, pending approvals, and `UIMessage` history survive reload in symlink-safe, serialized, atomic app-local files.
- Chat tools derive from the registry and traverse existing guarded routes.
- The shared `apply_wiki_ingest` schema declares optional operation `baseHash`; old Voice/MCP/CLI payloads remain valid and supplied hashes reach the existing route unchanged.
- Tool-specific UI and safe fallback cover every lifecycle state without model-supplied UI code.
- Server-owned pending records, not AI SDK parts alone, protect spending, mutations, destructive actions, CAS identities, and wiki apply arguments.
- Useful chat work can become a durable Inbox note or approved wiki update without making chat the canonical artifact.
- EN/ES copy, keyboard/focus behavior, responsive geometry, focused tests, and the repository serial gate pass.

## Open Questions and Delegated Details

No product or architecture question blocks implementation. U0 may select the latest mutually compatible assistant-ui and AI SDK major, but it cannot skip the compatibility proof. If current symbols differ, the executor may use documented equivalents while preserving the exact remote-thread wiring, synchronous provider mounting, `withFormat` history, server pending-approval authorization, and every requirement above.

## Evidence Consulted

- Repository: `AGENTS.md`, `STRATEGY.md`, `PRODUCT.md`, `package.json`, `server/integrations/registry.ts`, `llm.ts`, `research-history.ts`, `mcp-bridge.ts`, `server/app.ts`, and the current research-column HTML, state, CSS, i18n, and E2E coverage.
- assistant-ui docs: runtime integration, custom thread persistence, thread concepts, Tool UI, and architecture. U0 must recheck these against current npm peer manifests before selecting versions.
- AI SDK docs: OpenAI-compatible provider, UI message persistence/validation, transport, and tool approvals. Approval parts are treated only as transport/UI; server pending records provide authorization. Exact compatible versions belong only in `package-lock.json`.
