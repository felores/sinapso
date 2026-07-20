---
title: Pi RPC Agent TUI Prototype - Plan
type: prototype
date: 2026-07-19
topic: pi-rpc-agent-tui
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
prototype_status: pending-decision
implementation_branch: prototype/pi-rpc-agent-tui
parallel_to: docs/plans/2026-07-19-feat-grounded-chat-generative-ui-plan.md
replaces: null
---

# Pi RPC Agent TUI Prototype - Plan

## Goal Capsule

- **Objective:** Test whether an externally installed, version-pinned Pi coding agent can power a safe, browser-native agent TUI inside Sinapso while preserving Sinapso's registry, route guards, spatial research workflow, and artifact-first product model.
- **Decision sought:** Produce enough compatibility, security, interaction, and maintenance evidence to choose whether Pi RPC should become the implementation direction for grounded agent interaction. This prototype does not make that choice in advance.
- **Parallel status:** This is a parallel experiment, not a replacement. `docs/plans/2026-07-19-feat-grounded-chat-generative-ui-plan.md` remains unchanged and authoritative as the existing grounded-chat candidate until a reviewed prototype decision explicitly says otherwise.
- **Product placement:** Add an experimental `agent` collection to the existing research column. The graph and editable note remain primary. The session is runtime state; an Inbox note remains the intended durable artifact.
- **Trust boundary:** Sinapso remains the authorization authority. Pi supplies the agent loop, canonical session format, and RPC event stream. Pi extension UI is presentation only. RPC process separation is not a sandbox.
- **Prototype limit:** The model may use exactly `search_vault`, `read_note`, and `browse_folder`. The prototype cannot write, edit, run shell commands, browse the web, mutate a wiki, operate Git, install packages or skills, or select arbitrary HTTP routes.
- **Implementation isolation:** After review, implementation starts from the clean commit containing the approved plan in a separate sibling worktree on branch `prototype/pi-rpc-agent-tui`. The current dirty main worktree is not copied, cleaned, stashed, reset, or otherwise changed.
- **Decision gate:** No prototype code is merged and no existing plan is superseded until the evidence gate in this document is reviewed.

## Product and Trust Requirements

### Product behavior

- **R1. Parallel experiment.** The hidden prototype coexists conceptually with the grounded-chat plan. Approval to implement this prototype is not approval to delete, rewrite, or supersede that plan.
- **R2. Deep Sinapso module.** The TUI stays inside Sinapso because it depends directly on registry route declarations, token security, research-column geometry, Inbox switching, localization, accessibility, and browser diagnostics. Extraction requires demonstrated reuse by a second product, not a hypothetical future use.
- **R3. Existing spatial hierarchy.** Extend `ResearchCollection` from `"research" | "inbox"` to `"research" | "inbox" | "agent"` only while the hidden flag is enabled. Reuse the research column's dock, float, resize, close, pin, responsive, and topbar behavior. Do not add a new pane.
- **R4. Artifact-first outcome.** Pi sessions are resumable runtime records, not durable knowledge artifacts. The prototype performs no writes. A separately reviewed post-prototype slice may expose `write_document` so a user can deliberately create an Inbox artifact through `write.ts`.
- **R5. Hidden and optional.** Gate every route and UI entry behind `SINAPSO_EXPERIMENTAL_PI_AGENT=1`. If Pi is absent or incompatible, the normal application and full serial gate behave exactly as before. There is no production installer and no Pi production dependency.
- **R6. Localized and accessible.** All agent labels, errors, statuses, disclosure text, controls, dialogs, queue states, and empty states use matching English and neutral-Spanish keys in `web/src/i18n.ts`. The TUI is keyboard-first, screen-reader labeled, focus-visible, and usable at the repository's narrow viewport.

### Pi compatibility and process contract

- **R7. External exact version.** Detect an external npm-installed Node entrypoint for `pi` and accept only `@earendil-works/pi-coding-agent` `0.80.10` for this prototype. Reject compiled Bun or other launchers because the prototype's actual-process network observer depends on Node preload. Record the resolved executable and entrypoint paths, reported version, Node version, help digest, validated flags, and compatibility result in `<dataDir>/agent/evidence/pi-compatibility.json`. Do not float the version, install it, or add it to `package.json`.
- **R8. Node floor.** Fail closed unless the child runtime satisfies Pi's current `node >=22.19.0` requirement. Sinapso's broader Node 22 statement is not sufficient evidence for this exact floor.
- **R9. RPC choice.** Spawn optional external `pi --mode rpc` as a child process. Do not use the direct Pi SDK, a PTY, xterm, `node-pty`, or `pi-agent-core` alone. Parse stdout as strict LF-delimited JSONL. Never split on generic Unicode line separators.
- **R10. Current Pi shape.** Compatibility evidence must use the current `earendil-works/pi` repository, redirected from `badlogic/pi-mono`, under MIT. At research time its packages are `agent`, `ai`, `coding-agent`, `orchestrator`, and `tui`. The current repository has no `web-ui` package. Generated references to `pi-web-ui` are stale and prohibited as a dependency or architecture premise.
- **R11. Supported RPC surface.** The adapter may use current streaming message and tool events; abort; steer and follow-up; state, model, session, token, and cost data; `get_commands` including `skill:*`; session tree, entries, and compaction; and `extension_ui_request`/`extension_ui_response` for select, confirm, input, editor, notify, status, and widget. U0 must verify exact command and event shapes against the installed version before feature work.
- **R12. Canonical sessions.** Keep Pi's JSONL session trees, branching, and compaction as the sole runtime session format under `<dataDir>/agent/pi/sessions/`. Do not translate messages into a second chat database, vault transcript, or canonical browser store. Derived in-memory view models and bounded browser rendering state are allowed.

### Process confinement and secrets

- **R13. App-owned locations.** Create real, symlink-checked directories under `<dataDir>/agent/` for `work/`, `pi/config/`, `pi/sessions/`, `tmp/`, and `evidence/`. Resolve all locations before spawn and fail if any location is inside or aliases into the vault. Use mode `0700` for directories and `0600` for app-created files. On the prototype's supported POSIX platforms, start Pi with code-owned arguments through `spawn("/bin/sh", ["-c", "umask 077; exec \"$@\"", "sinapso-pi", executable, ...args])`; no model or browser string enters the shell script. Never change the Sinapso server process umask. Windows is unsupported by this prototype rather than silently weakening file permissions.
- **R14. Non-vault cwd.** Spawn from `<dataDir>/agent/work/`, never the vault, repository, current shell directory, or user home. No current dirty worktree content is copied into this cwd.
- **R15. Disable all discovery.** Launch with `--no-builtin-tools`, `--no-extensions`, one explicit `--extension`, `--no-skills`, one explicit `--skill`, `--no-prompt-templates`, `--no-context-files`, `--no-themes`, `--no-approve`, and an exact tool allowlist. Point `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` at app-owned directories. User Pi config, packages, extensions, skills, prompts, themes, context files, trust state, and project resources must not load.
- **R16. Exactly two resources.** Explicitly load one trusted, repository-owned Sinapso bridge extension and one bundled instructions-only skill named `sinapso-grounding-demo`, exposed as `skill:sinapso-grounding-demo`. The bridge registers exactly the three prototype tools. Record both resource digests in U0 evidence. The skill exists only to prove explicit Agent Skills progressive disclosure and command discovery.
- **R17. Environment allowlist.** Construct the child environment from scratch. Include only the minimal executable/runtime path, locale, app-owned HOME/temp/Pi directories, `PI_OFFLINE=1`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1`, the dedicated gateway address and child capability, and the one credential variable required by the selected provider. Never inherit browser or MCP tokens, Exa, Git, SSH, Infisical, package-manager, unrelated cloud, proxy, tracing, or other provider secrets.
- **R18. Provider mapping.** Sinapso selects a supported provider and model. A code-owned mapping chooses Pi's provider/model arguments and one credential environment variable. The browser and model cannot supply a provider id, model id, endpoint, credential name, or endpoint URL. Unsupported mappings fail closed. U0 records the exact mapping exercised. U0 may generate one digested app-owned `models.json` that points only to its loopback fake provider; ordinary prototype runs receive no browser- or model-controlled provider configuration.
- **R19. Offline startup.** Starting, listing, and resuming sessions make zero external network requests. A submitted model turn may make external requests only to the selected provider. Loopback RPC gateway calls are local transport, not external egress. Tests must observe this behavior, while documentation must continue to state that trusted process configuration is not an OS sandbox.

### Authorization and tools

- **R20. Separate browser and child authority.** Browser actions use the normal Sinapso session token. Generate a random, per-child capability for the bridge. The capability is accepted only by the dedicated agent-tool gateway and is never accepted as a browser, MCP, Voice, CLI, write, Git, install, web, or general route token.
- **R21. No route credentials in Pi.** Do not pass the normal Sinapso token, MCP token, browser token, or existing route URLs to the child. The trusted bridge receives only the dedicated gateway URL and its scoped child capability.
- **R22. Closed gateway.** The gateway accepts `{ tool, arguments }`, validates the child identity and exact registry schema, and dispatches only a code-owned registry binding for `search_vault`, `read_note`, or `browse_folder`. The model cannot select a path, method, headers, host, token, timeout, or response decoder. Unknown, malformed, unbound, external, spending, mutating, and destructive requests return a bounded error and dispatch nothing.
- **R23. Exact initial tools.** Add `agent` to the registry `Surface` type and mark exactly `search_vault`, `read_note`, and `browse_folder`. No current or future registry entry becomes available by default. Explicit tests compare the sorted surface names to that exact set.
- **R24. No ambient capabilities.** Expose no direct filesystem, shell, built-in read/write/edit/bash, arbitrary HTTP, web, Git, wiki, note mutation, package installation, extension installation, credential, or process tool. Filter `get_commands` through a code-owned command allowlist containing only `skill:sinapso-grounding-demo`; session/tree/compaction actions use their dedicated RPC controls instead of slash commands. The model and browser cannot invoke Pi login, share, export, import, package, config, update, install, or arbitrary returned commands. The bundled skill cannot add tools.
- **R25. Pi UI is not approval.** `extension_ui_request` maps to browser presentation. A select, confirm, input, editor, notify, status, or widget response does not authorize a Sinapso action. Any future spending or mutation must add a server-owned approval record and normal browser-token decision before gateway dispatch.

### Egress, limits, and cancellation

- **R26. Disclosure before turn.** Starting or resuming returns a server-authored disclosure challenge without contacting a provider. Before the first model turn, and again after any provider/model or disclosure-content change, the browser must show and accept a localized disclosure naming the selected provider and stating that the submitted prompt, prior Pi session context, tool schemas, bundled skill instructions, and bounded tool results may leave the machine. Acceptance uses the normal Sinapso token and is bound to the server session, provider, model, disclosure digest, and current child generation.
- **R27. No silent send.** A turn without a matching accepted disclosure fails before writing to child stdin. Loading a session, opening the drawer, reading commands, viewing cost, or navigating the session tree never submits a model prompt.
- **R28. Enforceable bounds and observed usage.** Server-owned hard defaults are 16 KiB submitted text, 12 agent steps, 24 total tool calls, 128 KiB cumulative tool-result bytes, and 120 seconds wall time. A single rendered tool body is clipped to 8 KiB. Configure the selected provider with `maxTokens: 32_000` and reject submission when a conservative code-owned maximum-cost estimate exceeds USD 1.00. Reported generated tokens and incremental cost are observed after provider work; an excess aborts remaining work and prevents continuation but is not claimed as a pre-spend circuit breaker. Crossing an enforceable bound sends abort, closes the run, ignores later work events for that run generation, and emits a localized terminal reason. Lower provider limits may apply; increases require a plan revision.
- **R29. Abort authority.** Browser abort uses the normal token. Supervisor timeout, disconnect policy, process exit, protocol corruption, or bound violation may also abort. Mark the run terminal before sending abort, then reject all gateway and UI-response work until Pi emits the official `agent_settled` event. If settlement does not arrive within the tested grace bound, terminate the child, rotate the capability, and start a clean child before accepting another turn. No later tool dispatch, extension UI response, model output, or queued message from the old run generation may take effect.
- **R30. Queue semantics.** Expose Pi steer and follow-up as distinct keyboard-accessible queue actions. Queue items are bounded, visible, removable before delivery, and tagged with the active run generation. Do not emulate queue semantics in a second agent loop.

### Browser-native TUI

- **R31. Semantic event rendering.** Vanilla TypeScript maps RPC events to code-owned text messages, bounded tool cards, status, cost/token context, steer/follow-up queue, command palette, session drawer, tree/entry/compaction views, and terminal errors. Do not emulate ANSI or terminal cells.
- **R32. Native extension UI.** Map select and confirm to native `<dialog>` controls; input to `<input>`; editor to `<textarea>`; notify and status to live regions; and widget to a bounded code-owned text panel. Restore focus on close, support Escape where safe, and correlate each response to the exact request id and run generation.
- **R33. Safe content.** Render all model and tool text with `textContent`. Do not render model HTML, use `innerHTML`, linkify arbitrary output, expose raw reasoning, or show unbounded tool dumps. Reasoning events may become a generic localized activity state only.
- **R34. Research-column behavior.** Preserve Inbox flush-before-switch, research pinning, active item identity, dock/float geometry, close behavior, narrow viewport, and graph/reader availability. Agent content gets its own body root while existing Research and Inbox bodies retain current behavior.
- **R35. Diagnostics.** Every new E2E scenario uses the existing browser diagnostic collector and fails on unallowlisted console, page, request, or HTTP 500+ errors.

## Non-Goals

- No replacement, modification, or deletion of the existing grounded-chat plan.
- No merge to main before the decision gate.
- No separate repository, npm workspace, package, or standalone app.
- No production Pi installer, bundled Pi binary, Pi npm dependency, Pi SDK dependency, or automatic update.
- No React, AI SDK, assistant-ui, `json-render`, xterm, `node-pty`, PTY, or `pi-web-ui`.
- No second chat database, transcript notes, session conversion, or `localStorage` as canonical state.
- No generic route proxy, model-selected HTTP, arbitrary extension, auto-discovered resource, user Pi config, or project context.
- No filesystem, shell, write/edit, web, Git, wiki mutation, install, credential, or arbitrary network tool.
- No skill marketplace UI or live skill download/install/enable path.
- No raw chain-of-thought display or model-authored HTML.
- No automatic artifact creation. `write_document` is a later gated slice only if the prototype is approved.

## Planning Contract

### Key Technical Decisions

- **KTD1. [session-settled] Worktree and branch are complementary.** Implementation uses sibling worktree `../sinapso-pi-rpc-agent-tui` with branch `prototype/pi-rpc-agent-tui`, both created from the clean reviewed-plan commit. Rejected: implementation in the dirty main worktree, copying that worktree, a branch without an isolated worktree, a worktree with detached HEAD, a separate repository, and an npm workspace.
- **KTD2. [session-settled] Deep module until reuse is real.** Keep the TUI and supervisor in Sinapso. Rejected: premature standalone extraction that would duplicate security, registry, i18n, geometry, and E2E seams.
- **KTD3. [session-settled] External RPC child.** Use optional `pi --mode rpc`. Rejected: direct SDK embedding, `pi-agent-core` without coding-agent session/RPC behavior, PTY scraping, terminal emulation, and TUI package reuse in the browser.
- **KTD4. [session-settled] Pi owns runtime sessions.** Preserve Pi JSONL trees, branching, entries, and compaction under app-local data. Rejected: translating Pi sessions into a second Sinapso chat store or vault format.
- **KTD5. [session-settled] Sinapso owns authorization.** The bridge capability reaches only the dedicated gateway; browser decisions use the normal token. Rejected: giving Pi an existing token, treating extension UI as approval, or assuming process separation is a sandbox.
- **KTD6. [session-settled] Exact closed tool surface.** Registry metadata defines exactly three read tools and the gateway owns method/path/header selection. Rejected: built-in Pi tools, arbitrary HTTP, MCP from the child, generic commands, and inferred exposure from all registry reads.
- **KTD7. [session-settled] Browser-native semantic UI.** Render RPC meaning in vanilla TypeScript and native controls. Rejected: ANSI parsing, xterm, model HTML, React, assistant-ui, AI SDK, and stale `pi-web-ui` references.
- **KTD8. [session-settled] Offline launch and least environment.** Disable Pi startup networking and all discovery, and construct a fresh environment containing one provider credential. Rejected: inherited `process.env`, user Pi config, project trust, and best-effort secret deletion after inheritance.
- **KTD9. [session-settled] Bundled skill only.** The prototype explicitly loads one repository-owned, instructions-only skill and verifies its digest and contents. Skill discovery, scanning, installation, activation, and marketplace trust design require a separate plan if this prototype demonstrates value.
- **KTD10. [session-settled] Prototype first, mutation later.** Prove read-only agent value before adding `write_document`. Rejected: using the prototype to smuggle in note, wiki, Git, or skill mutation.
- **KTD11. Compatibility is a blocking preflight.** U0 validates the actual external executable, exact version, current help, flags, lockdown, RPC framing, provider mapping, and network behavior. Rejected: coding against stale generated docs or assuming current CLI syntax.
- **KTD12. Egress claim is scoped.** The prototype proves configured and observed egress, not sandbox-grade network confinement. If review requires enforcement against a compromised Pi or bridge process, stop and design an OS sandbox before productionization.

### Worktree Setup Contract

No setup command is run while this plan is being written. After approval and creation of a clean reviewed-plan commit, the implementation controller may run the equivalent of:

```bash
git worktree add ../sinapso-pi-rpc-agent-tui -b prototype/pi-rpc-agent-tui <reviewed-plan-commit>
```

Preconditions and invariants:

1. `<reviewed-plan-commit>` is an explicit clean commit that contains this reviewed plan.
2. The sibling destination does not already exist.
3. The branch does not already exist unless review explicitly chooses to resume it.
4. No command runs `clean`, `reset`, `checkout`, `stash`, or file copy against the current dirty main worktree.
5. `harness-progress init` runs only inside the isolated worktree after plan approval. This planning change does not create or modify `.harness/features.json`.

### Architecture

```text
Browser vanilla agent TUI in existing research column
  -> normal-token POST control endpoints + authenticated fetch-stream endpoint
  -> AgentSupervisor
       -> app-owned cwd/config/session/temp dirs under dataDir
       -> strict LF-delimited JSONL stdin/stdout
       -> external pi 0.80.10 --mode rpc
            -> one trusted version-pinned Sinapso bridge extension
            -> one explicit bundled demonstration skill
            -> no builtins or discovered resources
  -> per-child random capability
  -> dedicated agent-tool gateway
  -> exact registry agent allowlist
  -> existing guarded Express routes
  -> read-only vault services

Future approved mutation only:
  existing guarded route -> write.ts -> changes.jsonl
  existing guarded Git route -> git.ts
```

### Data Flows

#### Start or resume without model egress

1. Browser calls a guarded start/resume endpoint.
2. Server verifies the hidden flag, external Pi evidence, real app-owned paths, and requested canonical Pi session id/path.
3. Supervisor creates a child generation, fresh capability, and fresh environment allowlist.
4. Child starts in RPC mode with every discovery source disabled and exactly one extension plus one skill loaded.
5. Supervisor requests state, commands, session metadata, tree, and entries as needed.
6. Browser receives semantic state and a disclosure challenge. No prompt is submitted and no external network request is permitted.

#### Submitted turn

1. Browser accepts the current disclosure with the normal Sinapso token.
2. Browser submits bounded text against that accepted disclosure digest.
3. Supervisor writes one strict JSONL prompt command and starts turn counters.
4. Pi contacts only the selected provider and emits streaming semantic events.
5. Supervisor enforces step, call, byte, and duration bounds; provider `maxTokens` and conservative preflight cost estimation limit submission; reported token/cost excess stops continuation.
6. Browser parses the authenticated SSE response stream from `fetch`, rendering code-owned message, tool, queue, session, status, and cost views.

#### Tool call

1. Pi invokes one bridge-registered tool.
2. The trusted bridge posts only `{ tool, arguments }` with the per-child capability to the dedicated gateway.
3. Gateway resolves the exact `agent` registry entry, validates arguments, and selects the code-owned existing route binding.
4. Existing route guards and vault confinement run.
5. Gateway bounds the response before returning it to Pi; the browser card applies a smaller display bound.

#### Extension UI

1. Pi emits an `extension_ui_request` with request id and semantic kind.
2. Supervisor bounds and forwards supported fields only.
3. Browser renders a native control and returns the response with its normal token.
4. Supervisor checks request id, child generation, active run, and supported type before writing `extension_ui_response`.
5. This response changes presentation/input state only and never authorizes a route.

#### Abort

1. User, timeout, bound, disconnect policy, or protocol failure requests abort.
2. Supervisor marks the run generation terminal before sending Pi abort.
3. Gateway requests and UI responses remain rejected until Pi emits official `agent_settled`; later events from the terminal generation may be logged in bounded diagnostics but cannot dispatch tools, answer UI requests, or alter visible canonical state.
4. If Pi does not settle within the tested grace bound, terminate the child, rotate its capability, and require a clean child before accepting another turn.

### Directional Interfaces

```ts
type AgentToolName = "search_vault" | "read_note" | "browse_folder";

type PiCompatibilityEvidence = {
  executable: string;
  package: "@earendil-works/pi-coding-agent";
  version: "0.80.10";
  nodeVersion: string;
  helpSha256: string;
  validatedFlags: string[];
  providerMapping: { provider: string; model: string; credentialEnv: string };
  startupExternalRequests: 0;
  resumeExternalRequests: 0;
  checkedAt: string;
};

type ChildCapability = {
  childId: string;
  generation: number;
  secretSha256: string; // store hash server-side, send raw value only to child
  expiresAt: string;
  tools: readonly AgentToolName[];
};

type TurnBudget = {
  maxInputBytes: 16_384;
  maxSteps: 12;
  maxToolCalls: 24;
  maxToolResultBytes: 131_072;
  maxDurationMs: 120_000;
  providerMaxGeneratedTokens: 32_000;
  maxEstimatedCostUsd: 1;
};

```

### Prototype Routes

All routes below require the normal browser token except the child-only gateway. They exist only when the hidden flag is enabled.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/agent/status` | External Pi availability and redacted compatibility status. |
| `GET`, `POST` | `/api/agent/sessions` | Derive session list from Pi JSONL files; start a new canonical session. |
| `POST` | `/api/agent/sessions/resume` | Resume a confined canonical Pi session without a model turn. |
| `GET` | `/api/agent/sessions/:id/events` | Token-guarded SSE response consumed through authenticated `fetch`, never native `EventSource` or a query-string token. |
| `GET` | `/api/agent/sessions/:id/state` | Current state, model, cost, commands, tree, entries, and compaction status. |
| `POST` | `/api/agent/sessions/:id/disclosure` | Record browser acceptance bound to disclosure digest and child generation. |
| `POST` | `/api/agent/sessions/:id/turns` | Submit one bounded turn only after disclosure acceptance. |
| `POST` | `/api/agent/sessions/:id/steer` | Queue a Pi steering message. |
| `POST` | `/api/agent/sessions/:id/follow-up` | Queue a Pi follow-up message. |
| `POST` | `/api/agent/sessions/:id/abort` | Abort the current run generation. |
| `POST` | `/api/agent/sessions/:id/ui-response` | Correlated extension UI response; presentation only. |
| `POST` | `/api/agent-tools` | Child-capability-only gateway for the exact three tools. |

No route accepts a provider endpoint, arbitrary session path, filesystem path outside a confined Pi session id, route path, HTTP method, header map, extension path, skill path, or executable path from the browser or model.

## Expected Files and Dependencies

The list reflects the current repository's flat `server/integrations/` modules, `server/app.ts` route composition, vanilla `web/src/main.ts`, `ResearchCollection` in `web/src/research-state.ts`, and Playwright coverage under `tests/e2e/`.

### Create

- `server/integrations/pi-agent.ts` - compatibility probe, strict JSONL parser, supervisor, bounds, process lifecycle, canonical session confinement, and semantic event normalization.
- `server/integrations/pi-agent.test.ts` - fake-child unit tests plus opt-in installed-Pi U0 black-box proof.
- `server/integrations/pi-agent-gateway.ts` - capability verification, exact registry allowlist, argument validation, and bounded dispatch to existing routes.
- `server/integrations/pi-agent-gateway.test.ts` - capability, route ownership, exact-tool, and rejection tests.
- `server/integrations/pi-bridge-extension.ts` - the only explicitly loaded trusted Pi extension.
- `server/integrations/pi-demo-skill/SKILL.md` - one bundled instructions-only demonstration skill.
- `web/src/agent-tui.ts` - semantic state reducer, DOM renderer, keyboard controls, native dialogs, authenticated fetch-stream client, and research-column adapter.
- `web/src/agent-tui.test.ts` - pure state, event, bounds, queue, extension UI, and safe-render tests.
- `tests/e2e/agent-tui.spec.ts` - hidden-mode browser flow, geometry, accessibility, diagnostics, and no-Pi degradation.
- `tests/e2e/fixtures/fake-pi.mjs` - deterministic strict-JSONL RPC child used only by E2E.

### Modify

- `server/app.ts` - hidden guarded POST/SSE routes, injected supervisor dependencies, gateway mount, and teardown.
- `server/app.test.ts` - route tokens, flag behavior, session confinement, no-write proofs, SSE, and security negatives.
- `server/integrations/registry.ts` - add `agent` surface to exactly three existing read entries.
- `server/integrations/registry.test.ts` - exact surface snapshot and no mutation/external entries.
- `web/index.html` - hidden agent collection control and stable agent body root.
- `web/src/main.ts` - collection switching, Inbox flush integration, geometry, pin behavior, and agent TUI lifecycle.
- `web/src/research-state.ts` - add the `agent` collection value and pure transition behavior.
- `web/src/research-state.test.ts` - Research/Inbox/Agent switching and pin invariants.
- `web/src/style.css` - research-column-native agent layout, responsive cards, dialogs, focus, queue, and drawer styles.
- `web/src/i18n.ts` - exact EN/ES agent, disclosure, status, error, and accessibility keys.
- `tests/e2e/server.ts` - enable the hidden flag and inject the fake Pi path only for the agent TUI E2E fixture.

### Explicitly unchanged

- `package.json` and `package-lock.json`: no Pi, SDK, frontend framework, terminal emulator, or other dependency.
- `server/integrations/write.ts` and `server/integrations/git.ts`: prototype tools cannot reach them.
- `docs/plans/2026-07-19-feat-grounded-chat-generative-ui-plan.md`: preserved pending the decision gate.
- `.harness/features.json`: not initialized or modified by this plan.

## Implementation Units

Each unit is sized to become one harness feature only after `harness-progress init` runs inside the approved isolated worktree.

### U0. Installed Pi compatibility and lockdown proof

- **Depends on:** none. U1-U5 cannot start until U0 passes.
- **Requirements:** R7-R19, KTD3, KTD8, KTD11, KTD12.
- **Files:** `pi-agent.ts`, `pi-agent.test.ts`, `pi-bridge-extension.ts`, `pi-demo-skill/SKILL.md`, app-local compatibility evidence only.
- **Implement:** Detect the external executable without installing it. Require version `0.80.10` and Node `>=22.19.0`. Capture `pi --help` and verify the installed executable's exact spellings and behavior for RPC mode, provider/model, session/session-dir, built-in tool disablement, explicit tool allowlist, extension disablement plus explicit extension, skill disablement plus explicit skill, prompt/context/theme disablement, project non-approval, and offline behavior. Probe strict LF JSONL framing, request/response correlation, streaming events, abort, steer/follow-up, state/model/session/cost, `get_commands`, tree/entries/compaction, and every supported extension UI request/response kind.
- **Lockdown proof:** Run from an app-controlled non-vault cwd with empty app-owned session/temp dirs, generated app-owned config limited to the digested loopback test provider, and the fresh environment allowlist. Load the minimal bridge and bundled skill fixtures in U0, before gateway authorization exists. Assert the command palette allowlist contains only `skill:sinapso-grounding-demo`, the tool inventory contains exactly the three bridge tools, and the loaded resource digests match the one bridge plus one bundled skill. Assert the bundled skill contains instructions only, with no extension, script, or lifecycle hook. Assert no user config or discovered extension/skill/prompt/theme/context appears and no other returned command can be invoked through the browser adapter.
- **Network proof:** Restrict accepted executables to the npm Node entrypoint and use a deterministic Node preload observer that blocks and records external socket/fetch attempts, plus the generated `models.json` and local fake selected-provider endpoint for the submitted-turn probe. Start and resume must record zero external requests. One turn may reach only the fake selected provider. Any other destination fails U0. Fake-child E2E later proves policy wiring, not actual Pi egress.
- **Parser proof:** Feed split records, multiple records per chunk, CR characters inside JSON strings, Unicode separators inside strings, malformed lines, overlong lines, EOF fragments, and valid records after malformed lines. The parser resynchronizes only at LF, emits a bounded protocol error, and never executes malformed content. Supervisor terminates or cleanly restarts a corrupted child generation.
- **Fail closed:** Absent binary means hidden feature unavailable, not test failure. Present but wrong version, low Node, changed help, missing flag/event, extra loaded resource, startup network, unsupported provider mapping, or framing mismatch blocks the prototype. Do not adapt silently or continue with partial lockdown.
- **Evidence:** `<dataDir>/agent/evidence/pi-compatibility.json` contains exact values and hashes, not `latest` or a semver range.

### U1. Supervisor, canonical sessions, budgets, and cancellation

- **Depends on:** U0.
- **Requirements:** R9-R19, R26-R30.
- **Files:** `pi-agent.ts`, `pi-agent.test.ts`.
- **Implement:** Confine and permission app-owned directories; launch through the fixed POSIX umask wrapper; create one child generation and capability per active session; preserve Pi JSONL files untouched; validate the canonical session header cwd before resume and revalidate runtime cwd after startup through the trusted bridge's `ExtensionContext.cwd` attestation, not `get_state`; normalize supported events; correlate requests; expose state/commands/tree/entries/compaction; enforce runtime budgets and provider submission limits; implement steer/follow-up; mark abort terminal before sending it; reject gateway/UI work until official settlement; replace unresponsive children with rotated capabilities; and dispose children on server shutdown.
- **Tests:** Child cwd outside vault; session header and reported cwd must equal the app-owned work directory; modified or mismatched session cwd rejected; symlinked data, work, config, temp, session, and evidence paths rejected; mode checks where supported; child-created file mode proves `umask 077` without changing server umask; environment exact-key snapshot; unrelated secrets absent; canonical session bytes unchanged by reads; no second history file; malformed-line recovery; stale generation ignored; timeout and every enforceable bound abort; provider `maxTokens`, preflight cost rejection, and post-response usage stop; abort rejects all gateway/UI work until settlement; missing settlement replaces child and rotates capability; crash and restart isolation.
- **Acceptance evidence:** Starting, resuming, listing, tree navigation, entry reads, command discovery, and compaction inspection change only Pi's own app-local session behavior and leave the vault plus `changes.jsonl` byte-identical.

### U2. Dedicated child-capability gateway and exact registry surface

- **Depends on:** U0, U1.
- **Requirements:** R20-R25.
- **Files:** `pi-agent-gateway.ts`, its test, bridge extension, `registry.ts`, `registry.test.ts`, `server/app.ts`, `server/app.test.ts`.
- **Implement:** Add the `agent` surface to exactly three entries. Generate, hash, expire, rotate, and revoke one capability per child generation. Mount a dedicated route that accepts that capability only, validates the exact registry schema, chooses method/path/query/body server-side, calls the existing loopback route with server authority where needed, and bounds results. Bridge extension registers exactly three tools and has no general fetch or route API exposed to the model.
- **Tests:** Exact sorted names; exact expected commands and demonstration skill; normal token rejected at child gateway if capability is required; child capability rejected by every guarded non-gateway route; old/revoked/foreign capability rejected; unknown and malformed calls rejected; all mutating, web, install, Git, wiki, shell, filesystem, and arbitrary HTTP attempts rejected; route/method/header injection ignored; oversized request/result rejected; existing route confinement still runs.
- **Acceptance evidence:** The fake Pi can complete all three read tools, and no capability-bearing request can authorize any other operation.

### U3. Guarded control/SSE API and disclosure gate

- **Depends on:** U1, U2.
- **Requirements:** R5, R19-R30.
- **Files:** `server/app.ts`, `server/app.test.ts`, `pi-agent.ts`.
- **Implement:** Add hidden status, session, start/resume, state, disclosure, turn, steer, follow-up, abort, UI-response, and SSE routes. Validate ids and bodies with small route-specific limits. Bind disclosure acceptance to session, provider, model, text digest, and generation. Redact executable paths, capabilities, environment, and credentials from browser responses and logs.
- **Tests:** Hidden flag off returns no usable feature; no Pi returns redacted unavailable status; every browser route requires the normal token; foreign Host/Origin rejected; disclosure absent/stale/wrong generation/wrong provider/wrong model rejected before child prompt; start/resume zero external requests; turn selected-provider-only; authenticated fetch-stream reconnect does not replay unbounded history; native `EventSource` and query-string token paths do not exist; disconnect cannot orphan work; extension UI fixtures round-trip only matching ids/types/generations.
- **Acceptance evidence:** A deterministic fake-child route test covers a complete disclosed turn, streaming tool call, UI request, queue, cost/status update, and abort without vault or journal change.

### U4. Vanilla browser agent TUI and research-column integration

- **Depends on:** U1, U3.
- **Requirements:** R1-R6, R26-R35.
- **Files:** `agent-tui.ts`, its test, `index.html`, `main.ts`, `research-state.ts`, its test, `style.css`, `i18n.ts`.
- **Implement:** Add the hidden Agent collection, semantic event reducer, authenticated `apiRaw(..., { token: true })` fetch-stream transport with bounded manual reconnect, composer, text/tool cards, status/cost/token line, steer/follow-up queue, command palette containing only `skill:sinapso-grounding-demo`, session drawer/tree/entries/compaction, disclosure dialog, native extension UI controls, abort, and bounded error states. On stream `403`, call the existing `resetApiToken()` before one bounded reconnect so a server restart can refresh the header token. Native `EventSource` and query-string tokens are prohibited. Keep DOM writes safe and code-owned.
- **Tests:** Inbox flush completes before switch; pinning and visible identity remain correct; research geometry unchanged; agent state survives collection switch without becoming canonical persistence; semantic event mapping; stream `403` resets the token before bounded reconnect; malformed/unknown event fallback; extension UI select/confirm/input/editor/notify/status/widget fixtures; focus restoration; Escape; keyboard order; exact EN/ES parity; no `innerHTML`, ANSI renderer, raw reasoning, or unbounded dump.
- **Acceptance evidence:** Unit tests and manual DOM inspection show a responsive panel at desktop and narrow widths with no graph/reader regression.

### U5. End-to-end trust and decision evidence

- **Depends on:** U0-U4.
- **Requirements:** all.
- **Files:** `agent-tui.spec.ts`, fake Pi fixture, `tests/e2e/server.ts`, existing files only where fixture wiring requires it.
- **Implement:** Exercise hidden activation, absent-Pi degradation, start/resume without egress, disclosure, one turn, all three tools, streaming states, command palette and demonstration skill, extension UI kinds, queues, session tree, compaction view, abort, narrow viewport, and browser diagnostics.
- **Tests:** Assert exact commands/skill and exact three tools; child cwd outside vault; child environment excludes seeded browser/MCP/Exa/Git/SSH/Infisical/unrelated cloud secrets; capability is gateway-only; unknown/mutating calls fail; malformed JSONL line recovers safely; session operations leave vault and journal byte-identical; fake-child network fixtures verify supervisor policy wiring while U0 alone proves actual-Pi egress; abort blocks work until settlement or child replacement; panel has no horizontal overflow and remains keyboard-operable; full serial gate passes with Pi absent.
- **Acceptance evidence:** Produce a compact review packet from test output and the app-local compatibility evidence. Do not merge, supersede the other plan, or add write tools.

## Deterministic Verification

Run focused checks inside the isolated prototype worktree. The installed-Pi compatibility probe is explicit and separate so the repository's normal gate never requires Pi.

| Gate | Command | Proves |
|---|---|---|
| Installed Pi U0 | `SINAPSO_PI_BIN="$(command -v pi)" SINAPSO_PI_PROBE=1 npm test -- --run server/integrations/pi-agent.test.ts` | Exact 0.80.10, Node floor, current help/flags, lockdown, RPC, network, provider, and parser evidence. Fails if the requested binary is absent or incompatible. |
| Supervisor and gateway | `npm test -- --run server/integrations/pi-agent.test.ts server/integrations/pi-agent-gateway.test.ts server/integrations/registry.test.ts server/app.test.ts` | Fake-child lifecycle, sessions, exact tools, tokens, capability scope, routes, egress gate, bounds, and abort. |
| Frontend | `npm test -- --run web/src/agent-tui.test.ts web/src/research-state.test.ts web/src/api.test.ts` | Semantic rendering, native UI mapping, collections, token client, localization, and safe bounds. |
| Type and build | `npm run typecheck && npm run build` | Optional integration compiles without Pi or a new dependency. |
| Focused browser | `npm run test:e2e -- tests/e2e/agent-tui.spec.ts` | Real browser geometry, keyboard/accessibility, fake RPC stream, security negatives, and diagnostics. |
| Required serial gate without Pi | `env -u SINAPSO_EXPERIMENTAL_PI_AGENT -u SINAPSO_PI_BIN -u SINAPSO_PI_PROBE npm test && npm run typecheck && npm run build && npm run test:e2e` | Sinapso remains releasable with no Pi installed, in repository-required order. |

The fake Pi fixture must implement strict LF JSONL and deterministic events, but it cannot satisfy U0. U0 must run against the actual external executable selected for prototype evidence.

## Security Negatives

The prototype decision is blocked unless deterministic tests prove all of the following:

- Hidden flag off exposes no Agent control and does not start or detect Pi during ordinary application use.
- Missing Pi leaves all normal tests and product behavior green.
- Wrong Pi version, Node below `22.19.0`, changed required help, unsupported provider, or incomplete lockdown fails closed.
- Child real cwd and every app-owned child directory resolve outside the vault; symlink aliases are rejected.
- A resumed session's stored header cwd and Pi's reported runtime cwd both equal the app-owned work directory; mismatch fails closed before a turn.
- Child environment contains only allowlisted keys and exactly one provider credential; seeded browser, MCP, Exa, Git, SSH, Infisical, proxy, package-manager, and unrelated cloud secrets are absent.
- User Pi config, trust state, extensions, skills, prompt templates, themes, context files, packages, and project resources are not loaded.
- Loaded model tools equal `search_vault`, `read_note`, and `browse_folder`, with no built-ins.
- Loaded custom resources equal one trusted bridge extension and one bundled demonstration skill, with exact recorded digests. The browser command allowlist equals `skill:sinapso-grounding-demo`; no discovered, built-in interactive, package, login, share, export, import, install, update, or arbitrary returned command can be invoked.
- Child capability authorizes only `/api/agent-tools`; it is not accepted as a normal, MCP, Voice, CLI, write, Git, web, wiki, or install token.
- Pi receives no existing Sinapso token or existing route URL.
- Gateway rejects unknown tools, malformed schemas, route/method/header/host injection, oversize data, and every mutating, spending, shell, filesystem, Git, web, wiki, install, credential, or arbitrary HTTP operation.
- Strict parser splits only at LF, bounds line size and buffer size, reports malformed lines, safely resynchronizes, and prevents malformed content from dispatching work.
- Extension UI fixtures correlate exact request id, type, session, and generation; stale or invented responses do nothing. UI response is never authorization.
- Starting, listing, resuming, reading session state/tree/entries, and viewing commands/cost produce zero external network requests.
- After disclosure, a submitted turn contacts only the selected provider externally. Any unexpected host blocks U0 and the decision gate.
- Session operations do not translate or duplicate Pi JSONL and leave vault files plus `changes.jsonl` byte-identical.
- Search/read/browse tool calls also leave vault files and journal byte-identical.
- Missing, stale, or mismatched disclosure prevents prompt submission and external provider contact.
- Step, call, byte, and duration bounds terminate the run; provider `maxTokens` and conservative preflight cost estimation limit submission; observed token/cost excess prevents continuation.
- Abort marks the generation terminal before acknowledgement and rejects gateway/UI work until official settlement; missing settlement replaces the child and capability before another turn.
- Model/tool text is bounded and inserted with `textContent`; no model HTML, dynamic component, ANSI control, raw reasoning, or arbitrary URL becomes executable UI.
- Research pinning, Inbox flush-before-switch, graph/reader interaction, narrow geometry, EN/ES parity, focus, and browser diagnostics remain intact.
- The bundled skill is instructions-only and digest-verified; no route or code path implements marketplace discovery, scanning, download, installation, or enablement.

## Prototype Decision Gate

### Required evidence

Reviewers receive:

1. U0 compatibility evidence for external Pi `0.80.10`, including executable/version/Node/help hashes, exact validated flags, loaded resources, provider mapping, and observed network destinations.
2. Focused and serial gate output with the serial gate run without Pi installed.
3. Security-negative results for env, cwd, capabilities, exact tools, parser recovery, disclosure, egress, budgets, abort, and vault/journal immutability.
4. Desktop and narrow browser evidence for messages, all tool states, cost/status, queues, commands, sessions, extension UI, keyboard use, and diagnostics.
5. A short comparison against the preserved grounded-chat plan on dependency footprint, provider authority, session ownership, authorization complexity, UI fit, operational risk, and path to durable artifacts.

### Outcomes

- **Approve Pi direction:** Keep the prototype branch isolated while writing and reviewing a new implementation plan that explicitly supersedes or revises the grounded-chat plan. Only that later review may alter the existing plan or authorize production dependencies, installer work, sandboxing, or `write_document`.
- **Reject Pi direction:** Leave the grounded-chat plan intact. Remove the sibling prototype worktree and branch only after explicit confirmation. App-local prototype data may be removed separately after user confirmation.
- **Extend experiment:** Revise this plan with the exact unresolved evidence. Do not merge a partial prototype or expand tools while a trust failure remains.

Passing tests proves technical feasibility, not automatic product adoption. Because this read-only prototype does not produce durable artifacts, adoption remains blocked until a separately reviewed artifact-producing slice demonstrates product value.

## Rollback and Stop Conditions

Stop implementation and return to review if any of these occurs:

- Exact Pi `0.80.10` or Node `>=22.19.0` cannot be validated.
- Required disable/explicit-load flags do not produce the exact resource inventory.
- Startup or resume makes an external request, or a turn reaches an unexpected external host.
- Pi requires inherited user config, ambient credentials, vault cwd, PTY behavior, direct SDK embedding, or a second session store.
- The child capability can authorize an existing non-gateway route or the normal token must enter the child.
- Exact three-tool exposure cannot be proven from registry declarations and runtime inventory.
- Malformed JSONL can desynchronize correlation or dispatch work.
- Abort cannot prevent later generation work.
- A browser control or Pi extension UI response must be trusted as authorization.
- The prototype needs write/edit, shell, web, Git, wiki, install, or arbitrary HTTP capability to demonstrate value.
- The full serial gate fails or depends on Pi being installed.
- Research-column geometry, Inbox flush, pinning, localization, accessibility, or browser diagnostics regress.
- Production review requires sandbox-grade filesystem or egress enforcement not provided by process separation.

Rollback is branch-local: stop child processes, revoke capabilities, and remove the isolated worktree/branch after confirmation. Do not clean, reset, or copy from the current dirty main worktree. Do not alter the grounded-chat plan as part of rollback.

## Definition of Done

- The reviewed plan was implemented only in the specified sibling worktree and branch from a clean reviewed-plan commit.
- U0 pins and records external Pi `0.80.10`, validates Node `>=22.19.0`, current flags/help, strict RPC, lockdown, provider mapping, and network behavior.
- The browser-native vanilla TUI runs in the hidden `agent` research collection with responsive, localized, keyboard-accessible behavior.
- Pi remains canonical for app-local runtime sessions, trees, branching, entries, and compaction; no second chat database exists.
- The child runs outside the vault with app-owned private directories, a fresh environment, one credential, one bridge, one skill, and exactly three tools.
- Sinapso browser tokens stay out of Pi; a random per-child capability works only at the dedicated gateway.
- Disclosure, enforceable bounds, provider submission limits, observed-usage stops, malformed-line handling, abort settlement barriers, safe rendering, and extension UI correlation pass.
- Start/resume has zero external egress; a submitted turn is observed contacting only the selected provider.
- Vault and journal remain byte-identical throughout prototype operations.
- The required serial gate passes without Pi installed.
- Decision evidence is reviewed before any merge, write-tool slice, extraction, installer, or change to the existing grounded-chat plan.

## Evidence Sources

### Repository evidence inspected

- `AGENTS.md` for architecture, trust boundaries, i18n, research-column behavior, browser diagnostics, and the required serial gate.
- `package.json` for Node-era tooling, existing dependencies, test commands, and confirmation that no Pi/frontend-agent dependency is present.
- `server/app.ts` for `localOnly`, normal/MCP token creation, guarded route composition, injected integration dependencies, and `dataDir = dirname(graphPath)`.
- `server/integrations/security.ts` for loopback Host/Origin checks and scoped-token behavior.
- `server/integrations/registry.ts` for the current `Surface`, route bindings, and exact existing definitions of `search_vault`, `read_note`, and `browse_folder`.
- `server/integrations/mcp-bridge.ts` for the current registry-to-guarded-route proxy pattern. The prototype uses a dedicated child gateway rather than giving the child the MCP token.
- `server/integrations/detect.ts` for injectable external executable detection patterns. Pi detection stays prototype-specific so ordinary integration detection does not gain a production dependency.
- `web/src/research-state.ts`, `web/src/main.ts`, `web/index.html`, `web/src/style.css`, and `web/src/i18n.ts` for current Research/Inbox collection, geometry, pin, switch, DOM, and localization seams.
- `tests/e2e/research-pinning.spec.ts`, `tests/e2e/diagnostics.ts`, and `tests/e2e/server.ts` for current browser fixture and diagnostics patterns.
- `docs/plans/2026-07-19-feat-grounded-chat-generative-ui-plan.md` only as the preserved parallel candidate and comparison baseline.

### Pi evidence current at research time

- Official repository: `https://github.com/earendil-works/pi`, redirected from `badlogic/pi-mono`, MIT.
- Official package: `@earendil-works/pi-coding-agent` `0.80.10`, published 2026-07-16, with Node engine `>=22.19.0`.
- Official coding-agent docs and source: `packages/coding-agent/README.md`, `packages/coding-agent/docs/rpc.md`, `packages/coding-agent/docs/session-format.md`, `packages/coding-agent/docs/compaction.md`, `packages/coding-agent/docs/skills.md`, `packages/coding-agent/docs/extensions.md`, and current CLI argument source/help.
- Verified current capabilities supplied to this plan: strict LF JSONL RPC; streaming message/tool events; abort; steer/follow-up; state/model/session/cost; commands and `skill:*`; tree/entries/compaction; and extension UI requests/responses for select, confirm, input, editor, notify, status, and widget.
- Verified current repository package directories supplied to this plan: `agent`, `ai`, `coding-agent`, `orchestrator`, and `tui`. No current `web-ui` package exists. Generated `pi-web-ui` documentation is treated as stale and cannot support an implementation decision.

U0 must revalidate executable behavior locally because web pages and generated documentation cannot prove the installed binary's exact protocol or lockdown behavior.
