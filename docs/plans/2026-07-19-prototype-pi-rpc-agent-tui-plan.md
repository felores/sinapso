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
compatible_with: docs/plans/2026-07-20-feat-runtime-neutral-generative-ui-plan.md
replaces: null
---

# Pi RPC Agent TUI Prototype - Plan

## Goal Capsule

- **Objective:** Test whether an externally installed, version-pinned Pi coding agent can power a safe, browser-native agent TUI inside Sinapso while preserving Sinapso's registry, route guards, spatial research workflow, and artifact-first product model.
- **Decision sought:** Produce enough compatibility, security, interaction, and maintenance evidence to choose whether Pi RPC should become the implementation direction for grounded agent interaction. This prototype does not make that choice in advance.
- **Independent status:** This prototype owns agent execution, Pi sessions, RPC supervision, and a bounded baseline TUI. `docs/plans/2026-07-20-feat-runtime-neutral-generative-ui-plan.md` independently owns reusable tool/result presentation. Neither plan requires the other; whichever lands second adds the thin `ToolPresentationV1` adapter.
- **Product placement:** Build and stabilize the TUI first in a development-only browser lab, then mount the same module as an experimental `agent` collection in the existing research column. The graph and editable note remain primary. The session is runtime state; an Inbox note remains the intended durable artifact.
- **Trust boundary:** Sinapso remains the authorization authority. Pi supplies the agent loop, canonical session format, and RPC event stream. RPC process separation is not a sandbox.
- **Prototype limit:** The model may use exactly `search_vault`, `read_note`, and `browse_folder`. The prototype cannot write, edit, run shell commands, browse the web, mutate a wiki, operate Git, install packages or skills, or select arbitrary HTTP routes.
- **Implementation isolation:** After review, implementation starts from the clean commit containing the approved plan in a separate sibling worktree on branch `prototype/pi-rpc-agent-tui`. The current main worktree remains user-owned and is not copied, cleaned, stashed, reset, or otherwise changed. Prototype runtime state, ports, fixture vault, and Pi configuration are isolated as well as Git state.
- **Decision gate:** No prototype code is merged and no existing plan is superseded until the evidence gate in this document is reviewed.

## Product and Trust Requirements

### Product behavior

- **R1. Independent experiment.** The hidden prototype validates a Pi-backed agent runtime. Approval to implement it does not select, replace, delay, or supersede the runtime-neutral generative UI feature.
- **R2. Deep Sinapso module.** The TUI stays inside Sinapso because it depends directly on registry route declarations, token security, research-column geometry, Inbox switching, localization, accessibility, and browser diagnostics. Extraction requires demonstrated reuse by a second product, not a hypothetical future use.
- **R3. Lab first, spatial integration last.** The standalone lab must pass its browser gate before changing `ResearchCollection`, `web/index.html`, or `web/src/main.ts`. Final integration extends `ResearchCollection` from `"research" | "inbox"` to `"research" | "inbox" | "agent"` only while the hidden flag is enabled and reuses the research column's dock, float, resize, close, pin, responsive, and topbar behavior. Do not add a new product pane.
- **R4. Artifact-first outcome.** Pi sessions are resumable runtime records, not durable knowledge artifacts. The prototype performs no writes. A separately reviewed post-prototype slice may expose `write_document` so a user can deliberately create an Inbox artifact through `write.ts`.
- **R5. Hidden and optional.** Gate every route and final UI entry behind `SINAPSO_EXPERIMENTAL_PI_AGENT=1`. Vite may serve the development-only `agent-lab.html` shell, but it must mount no usable TUI when guarded `/api/agent/status` reports the feature disabled. If Pi is absent or incompatible, the normal application and full serial gate behave exactly as before. The lab is not a production build entry and introduces no production installer or Pi dependency.
- **R6. Localized and accessible.** All agent labels, errors, statuses, disclosure text, controls, and empty states use matching English and neutral-Spanish keys in `web/src/i18n.ts`. The TUI is keyboard-first, screen-reader labeled, focus-visible, and usable at the repository's narrow viewport.

### Pi compatibility and process contract

- **R7. External exact version.** Detect an external npm-installed Node entrypoint for `pi` and accept only `@earendil-works/pi-coding-agent` `0.80.10` for this prototype. Reject compiled Bun or other launchers because the prototype's actual-process network observer depends on Node preload. Record the resolved executable and entrypoint paths, reported version, Node version, help digest, validated flags, and compatibility result in `<dataDir>/agent/evidence/pi-compatibility.json`. Do not float the version, install it, or add it to `package.json`.
- **R8. Node floor.** Fail closed unless the child runtime satisfies Pi's current `node >=22.19.0` requirement. Sinapso's broader Node 22 statement is not sufficient evidence for this exact floor.
- **R9. RPC choice.** Spawn optional external `pi --mode rpc` as a child process. Do not use the direct Pi SDK, a PTY, xterm, `node-pty`, or `pi-agent-core` alone. Parse stdout as strict LF-delimited JSONL. Never split on generic Unicode line separators.
- **R10. Current Pi shape.** Compatibility evidence must use the current `earendil-works/pi` repository, redirected from `badlogic/pi-mono`, under MIT. At research time its packages are `agent`, `ai`, `coding-agent`, `orchestrator`, and `tui`. The current repository has no `web-ui` package. Generated references to `pi-web-ui` are stale and prohibited as a dependency or architecture premise.
- **R11. Supported RPC surface.** The mandatory prototype surface is streaming message and tool events, prompt submission, abort plus official settlement, state/model/session/token/cost data, canonical session start/resume, and `get_commands` including `skill:*`. U0 verifies those exact shapes against the installed version. Steer/follow-up, tree navigation, compaction controls, and extension UI are deferred until the core decision passes.
- **R12. Canonical sessions.** Keep Pi's JSONL session files as the sole runtime session format under `<dataDir>/agent/pi/sessions/`. Support list, start, and resume without translating messages into a second chat database, vault transcript, or canonical browser store. Derived in-memory view models and bounded browser rendering state are allowed.

### Process confinement and secrets

- **R13. App-owned locations.** Create real, symlink-checked directories under `<dataDir>/agent/` for `work/`, `pi/config/`, `pi/sessions/`, `tmp/`, and `evidence/`. Resolve all locations before spawn and fail if any location is inside or aliases into the vault. Use mode `0700` for directories and `0600` for app-created files. On the prototype's supported POSIX platforms, start Pi with code-owned arguments through `spawn("/bin/sh", ["-c", "umask 077; exec \"$@\"", "sinapso-pi", executable, ...args])`; no model or browser string enters the shell script. Never change the Sinapso server process umask. Windows is unsupported by this prototype rather than silently weakening file permissions.
- **R14. Non-vault cwd.** Spawn from `<dataDir>/agent/work/`, never the vault, repository, current shell directory, or user home. No current dirty worktree content is copied into this cwd.
- **R15. Disable all discovery.** Launch with `--no-builtin-tools`, `--no-extensions`, one explicit `--extension`, `--no-skills`, one explicit `--skill`, `--no-prompt-templates`, `--no-context-files`, `--no-themes`, `--no-approve`, and an exact tool allowlist. Point `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` at app-owned directories. User Pi config, packages, extensions, skills, prompts, themes, context files, trust state, and project resources must not load.
- **R16. Exactly two resources.** Explicitly load one trusted, repository-owned Sinapso bridge extension and one bundled instructions-only skill named `sinapso-grounding-demo`, exposed as `skill:sinapso-grounding-demo`. The bridge registers exactly the three prototype tools. Record both resource digests in U0 evidence. The skill exists only to prove explicit Agent Skills progressive disclosure and command discovery.
- **R17. Environment allowlist.** Construct the child environment from scratch. Include only the minimal executable/runtime path, locale, app-owned HOME/temp/Pi directories, `PI_OFFLINE=1`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1`, the dedicated gateway address and child capability, and the one credential variable required by the selected provider. Never inherit browser or MCP tokens, Exa, Git, SSH, Infisical, package-manager, unrelated cloud, proxy, tracing, or other provider secrets.
- **R18. Provider mapping.** Sinapso selects a supported provider and model. A code-owned mapping chooses Pi's provider/model arguments and one credential environment variable. The browser and model cannot supply a provider id, model id, endpoint, credential name, or endpoint URL. Unsupported mappings fail closed. U0 records the exact mapping exercised. U0 may generate one digested app-owned `models.json` that points only to its loopback fake provider; ordinary prototype runs receive no browser- or model-controlled provider configuration.
- **R19. Offline startup.** Starting, listing, and resuming sessions make zero external network requests. A submitted model turn may make external requests only to the selected provider. Loopback RPC gateway calls are local transport, not external egress. Tests must observe this behavior, while documentation must continue to state that trusted process configuration is not an OS sandbox.
- **R19a. Isolated lab runtime.** Manual lab runs use frontend `127.0.0.1:6273`, backend `127.0.0.1:6275`, an explicit `SINAPSO_PI_BIN`, and a generated fixture vault/graph/data root under the prototype worktree's ignored `.scratchpad/pi-agent-lab/`. They never use development ports `5173/5175`, hermetic E2E ports `6173/6175`, the user's real vault, or user Pi config. E2E keeps its existing dedicated ports and temp root.

### Authorization and tools

- **R20. Separate browser and child authority.** Browser actions use the normal Sinapso session token. Generate a random, per-child capability for the bridge. The capability is accepted only by the dedicated agent-tool gateway and is never accepted as a browser, MCP, Voice, CLI, write, Git, install, web, or general route token.
- **R21. No route credentials in Pi.** Do not pass the normal Sinapso token, MCP token, browser token, or existing route URLs to the child. The trusted bridge receives only the dedicated gateway URL and its scoped child capability.
- **R22. Closed gateway.** The gateway accepts `{ tool, arguments }`, validates the child identity and exact registry schema, and dispatches only a code-owned registry binding for `search_vault`, `read_note`, or `browse_folder`. The model cannot select a path, method, headers, host, token, timeout, or response decoder. Unknown, malformed, unbound, external, spending, mutating, and destructive requests return a bounded error and dispatch nothing.
- **R23. Exact initial tools.** Add `agent` to the registry `Surface` type and mark exactly `search_vault`, `read_note`, and `browse_folder`. No current or future registry entry becomes available by default. Explicit tests compare the sorted surface names to that exact set.
- **R24. No ambient capabilities.** Expose no direct filesystem, shell, built-in read/write/edit/bash, arbitrary HTTP, web, Git, wiki, note mutation, package installation, extension installation, credential, or process tool. Filter `get_commands` through a code-owned command allowlist containing only `skill:sinapso-grounding-demo`. The model and browser cannot invoke Pi login, share, export, import, package, config, update, install, or arbitrary returned commands. The bundled skill cannot add tools.

### Egress, limits, and cancellation

- **R26. Disclosure before turn.** Starting or resuming returns a server-authored disclosure challenge without contacting a provider. Before the first model turn, and again after any provider/model or disclosure-content change, the browser must show and accept a localized disclosure naming the selected provider and stating that the submitted prompt, prior Pi session context, tool schemas, bundled skill instructions, and bounded tool results may leave the machine. Acceptance uses the normal Sinapso token and is bound to the server session, provider, model, disclosure digest, and current child generation.
- **R27. No silent send.** A turn without a matching accepted disclosure fails before writing to child stdin. Listing, starting, resuming, opening the panel, reading commands, or viewing cost never submits a model prompt.
- **R28. Enforceable bounds and observed usage.** Server-owned hard defaults are 16 KiB submitted text, 12 agent steps, 24 total tool calls, 128 KiB cumulative tool-result bytes, and 120 seconds wall time. A single rendered tool body is clipped to 8 KiB. Configure the selected provider with `maxTokens: 32_000` and reject submission when a conservative code-owned maximum-cost estimate exceeds USD 1.00. Reported generated tokens and incremental cost are observed after provider work; an excess aborts remaining work and prevents continuation but is not claimed as a pre-spend circuit breaker. Crossing an enforceable bound sends abort, closes the run, ignores later work events for that run generation, and emits a localized terminal reason. Lower provider limits may apply; increases require a plan revision.
- **R29. Abort authority.** Browser abort uses the normal token. Supervisor timeout, disconnect policy, process exit, protocol corruption, or bound violation may also abort. Mark the run terminal before sending abort, then reject all gateway work until Pi emits the official `agent_settled` event. If settlement does not arrive within the tested grace bound, terminate the child, rotate the capability, and start a clean child before accepting another turn. No later tool dispatch or model output from the old run generation may take effect.

### Browser-native TUI

- **R31. Semantic event rendering.** Vanilla TypeScript maps RPC events to code-owned text messages, bounded baseline tool cards, status, cost/token context, session resume, command discovery, and terminal errors. Do not emulate ANSI or terminal cells. When the runtime-neutral generative UI adapter is present on the same branch, every Pi tool lifecycle uses `Pi event -> adapter -> ToolPresentationV1 -> shared renderer`; baseline Pi tool cards exist only when that adapter is absent.
- **R33. Safe content.** Render all model and tool text with `textContent`. Do not render model HTML, use `innerHTML`, linkify arbitrary output, expose raw reasoning, or show unbounded tool dumps. Reasoning events may become a generic localized activity state only.
- **R34. Research-column behavior.** Preserve Inbox flush-before-switch, research pinning, active item identity, dock/float geometry, close behavior, narrow viewport, and graph/reader availability. Agent content gets its own body root while existing Research and Inbox bodies retain current behavior.
- **R35. Diagnostics.** Every new E2E scenario uses the existing browser diagnostic collector and fails on unallowlisted console, page, request, or HTTP 500+ errors.
- **R36. One TUI module, two hosts.** `agent-tui.ts` owns state, transport, rendering, and lifecycle. `agent-lab.ts` and the final research-column integration are thin hosts. The lab cannot fork or duplicate TUI behavior.

## Non-Goals

- No dependency on, replacement of, or duplicate implementation of the runtime-neutral generative UI plan.
- No merge to main before the decision gate.
- No separate repository, npm workspace, package, or standalone product. The development-only browser lab is a test host for the same TUI module.
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

- **KTD1. [session-settled] Worktree and branch are complementary.** Implementation uses sibling worktree `../sinapso-pi-rpc-agent-tui` with branch `prototype/pi-rpc-agent-tui`, both created from the clean reviewed-plan commit. Rejected: implementation in the user-owned main worktree, copying between worktrees, a branch without an isolated worktree, a worktree with detached HEAD, a separate repository, and an npm workspace.
- **KTD2. [session-settled] Deep module until reuse is real.** Keep the TUI and supervisor in Sinapso. Rejected: premature standalone extraction that would duplicate security, registry, i18n, geometry, and E2E seams.
- **KTD3. [session-settled] External RPC child.** Use optional `pi --mode rpc`. Rejected: direct SDK embedding, `pi-agent-core` without coding-agent session/RPC behavior, PTY scraping, terminal emulation, and TUI package reuse in the browser.
- **KTD4. [session-settled] Pi owns runtime sessions.** Preserve Pi JSONL session files under app-local data and support start/resume. Rejected: translating Pi sessions into a second Sinapso chat store or vault format.
- **KTD5. [session-settled] Sinapso owns authorization.** The bridge capability reaches only the dedicated gateway; browser decisions use the normal token. Rejected: giving Pi an existing token or assuming process separation is a sandbox.
- **KTD6. [session-settled] Exact closed tool surface.** Registry metadata defines exactly three read tools and the gateway owns method/path/header selection. Rejected: built-in Pi tools, arbitrary HTTP, MCP from the child, generic commands, and inferred exposure from all registry reads.
- **KTD7. [session-settled] Browser-native semantic UI.** Render RPC meaning in vanilla TypeScript and native controls. Keep bounded baseline cards so Pi works alone. On an integrated branch, the Pi-side `ToolPresentationV1` adapter gives the shared renderer sole tool-card authority, including fallback. Rejected: dual renderers, ANSI parsing, xterm, model HTML, React, assistant-ui, AI SDK, and stale `pi-web-ui` references.
- **KTD8. [session-settled] Offline launch and least environment.** Disable Pi startup networking and all discovery, and construct a fresh environment containing one provider credential. Rejected: inherited `process.env`, user Pi config, project trust, and best-effort secret deletion after inheritance.
- **KTD9. [session-settled] Bundled skill only.** The prototype explicitly loads one repository-owned, instructions-only skill and verifies its digest and contents. Skill discovery, scanning, installation, activation, and marketplace trust design require a separate plan if this prototype demonstrates value.
- **KTD10. [session-settled] Prototype first, mutation later.** Prove read-only agent value before adding `write_document`. Rejected: using the prototype to smuggle in note, wiki, Git, or skill mutation.
- **KTD11. Compatibility is a blocking preflight.** U0 validates the actual external executable, exact version, current help, flags, lockdown, RPC framing, provider mapping, and network behavior. Rejected: coding against stale generated docs or assuming current CLI syntax.
- **KTD12. Egress claim is scoped.** The prototype proves configured and observed egress, not sandbox-grade network confinement. If review requires enforcement against a compromised Pi or bridge process, stop and design an OS sandbox before productionization.
- **KTD13. Lab before shell integration.** Stabilize the complete read-only vertical slice in `agent-lab.html` before editing shared shell files. Rejected: debugging Pi process, transport, renderer, and research-column geometry simultaneously.
- **KTD14. Minimize collision surfaces.** Keep routes in `pi-agent-routes.ts`, styles in `agent-tui.css`, and browser behavior in `agent-tui.ts`. Add required agent EN/ES keys in U4 so the lab follows repository i18n policy, but defer `main.ts`, `index.html`, `research-state.ts`, and integration-specific shell copy to U5. Rejected: hardcoded lab copy or spreading prototype behavior through shared files before its isolated browser gate passes.

### Worktree Setup Contract

No setup command is run while this plan is being written. After approval and creation of a clean reviewed-plan commit, the implementation controller may run the equivalent of:

```bash
git worktree add ../sinapso-pi-rpc-agent-tui -b prototype/pi-rpc-agent-tui <reviewed-plan-commit>
```

Preconditions and invariants:

1. `<reviewed-plan-commit>` is an explicit clean commit that contains this reviewed plan.
2. The sibling destination does not already exist.
3. The branch does not already exist unless review explicitly chooses to resume it.
4. No command runs `clean`, `reset`, `checkout`, `stash`, or file copy against the user-owned main worktree.
5. `harness-progress init` runs only inside the isolated worktree after plan approval. This planning change does not create or modify `.harness/features.json`.

### Parallel Work Contract

1. The user owns `main`; the prototype agent owns only `../sinapso-pi-rpc-agent-tui` and `prototype/pi-rpc-agent-tui`.
2. Prototype commands, generated data, processes, and browser runs execute only from the prototype worktree.
3. No source file is copied between worktrees. User work enters the prototype only through committed `main` history.
4. Sync from `main` happens only at two clean checkpoints: immediately before research-column integration and immediately before the final serial gate. Use a normal non-destructive merge inside the prototype worktree; never rewrite or force-update `main`.
5. Before either merge, inspect both worktrees and the incoming diff. If shared files conflict, resolve only in the prototype worktree and rerun its focused gates before continuing.
6. Until the first sync checkpoint, avoid edits to `web/src/main.ts`, `web/index.html`, `web/src/research-state.ts`, and shared shell CSS. The required isolated agent keys are the only early `web/src/i18n.ts` edit. Backend `server/app.ts` receives only the minimal router mount after the isolated route module passes.
7. Prototype commits are small unit checkpoints. They are not merged, pushed, or converted into a PR without explicit user direction.

### Architecture

```text
Development-only browser lab                 Final integration host
  web/agent-lab.html                            existing research column
  web/src/agent-lab.ts                          thin mount in main.ts
             \                                  /
              -> web/src/agent-tui.ts + agent-tui.css
              -> normal-token POST control endpoints + authenticated fetch stream
              -> pi-agent-routes.ts
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

Manual lab runtime:
  frontend 127.0.0.1:6273 -> backend 127.0.0.1:6275
  fixture vault + graph + data -> .scratchpad/pi-agent-lab/<run>/
  explicit SINAPSO_PI_BIN -> externally installed Pi 0.80.10

Future approved mutation only:
  existing guarded route -> write.ts -> changes.jsonl
  existing guarded Git route -> git.ts
```

### Data Flows

#### Isolated browser lab

1. The lab starts from the prototype worktree with dedicated ports, explicit Pi path, hidden flag, and generated fixture graph/data root.
2. Vite serves `agent-lab.html`, which mounts the same `agent-tui.ts` module later used by Sinapso.
3. Fake Pi drives deterministic browser and security scenarios. The real Pi is used only by U0 and an explicit post-fake smoke.
4. The lab gate must pass before the prototype edits the research-column host files.

#### Start or resume without model egress

1. Browser calls a guarded start/resume endpoint.
2. Server verifies the hidden flag, external Pi evidence, real app-owned paths, and requested canonical Pi session id/path.
3. Supervisor creates a child generation, fresh capability, and fresh environment allowlist.
4. Child starts in RPC mode with every discovery source disabled and exactly one extension plus one skill loaded.
5. Supervisor requests state, commands, and session metadata as needed.
6. Browser receives semantic state and a disclosure challenge. No prompt is submitted and no external network request is permitted.

#### Submitted turn

1. Browser accepts the current disclosure with the normal Sinapso token.
2. Browser submits bounded text against that accepted disclosure digest.
3. Supervisor writes one strict JSONL prompt command and starts turn counters.
4. Pi contacts only the selected provider and emits streaming semantic events.
5. Supervisor enforces step, call, byte, and duration bounds; provider `maxTokens` and conservative preflight cost estimation limit submission; reported token/cost excess stops continuation.
6. Browser parses the authenticated SSE response stream from `fetch`, rendering code-owned message, tool, session, status, and cost views.

#### Tool call

1. Pi invokes one bridge-registered tool.
2. The trusted bridge posts only `{ tool, arguments }` with the per-child capability to the dedicated gateway.
3. Gateway resolves the exact `agent` registry entry, validates arguments, and selects the code-owned existing route binding.
4. Existing route guards and vault confinement run.
5. Gateway bounds the response before returning it to Pi; the browser card applies a smaller display bound.

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
| `GET` | `/api/agent/sessions/:id/state` | Current state, model, cost, commands, and session metadata. |
| `POST` | `/api/agent/sessions/:id/disclosure` | Record browser acceptance bound to disclosure digest and child generation. |
| `POST` | `/api/agent/sessions/:id/turns` | Submit one bounded turn only after disclosure acceptance. |
| `POST` | `/api/agent/sessions/:id/abort` | Abort the current run generation. |
| `POST` | `/api/agent-tools` | Child-capability-only gateway for the exact three tools. |

No route accepts a provider endpoint, arbitrary session path, filesystem path outside a confined Pi session id, route path, HTTP method, header map, extension path, skill path, or executable path from the browser or model.

## Expected Files and Dependencies

The list reflects the current repository's flat `server/integrations/` modules, `server/app.ts` route composition, vanilla `web/src/main.ts`, `ResearchCollection` in `web/src/research-state.ts`, and Playwright coverage under `tests/e2e/`.

### Create

- `server/integrations/pi-agent.ts` - compatibility probe, strict JSONL parser, supervisor, bounds, process lifecycle, canonical session confinement, and semantic event normalization.
- `server/integrations/pi-agent.test.ts` - fake-child unit tests plus opt-in installed-Pi U0 black-box proof.
- `server/integrations/pi-agent-gateway.ts` - capability verification, exact registry allowlist, argument validation, and bounded dispatch to existing routes.
- `server/integrations/pi-agent-gateway.test.ts` - capability, route ownership, exact-tool, and rejection tests.
- `server/integrations/pi-agent-routes.ts` - hidden guarded control/stream router and teardown registration, mounted minimally by `server/app.ts`.
- `server/integrations/pi-agent-routes.test.ts` - route tokens, disclosure, stream, session, abort, and hidden-mode tests.
- `server/integrations/pi-bridge-extension.ts` - the only explicitly loaded trusted Pi extension.
- `server/integrations/pi-demo-skill/SKILL.md` - one bundled instructions-only demonstration skill.
- `web/agent-lab.html` - development/E2E-only standalone host; not a production build entry.
- `web/src/agent-lab.ts` - thin lab mount and fixture status; contains no duplicate TUI behavior.
- `web/src/agent-tui.ts` - semantic state reducer, DOM renderer, keyboard controls, disclosure, authenticated fetch-stream client, and host-neutral lifecycle.
- `web/src/agent-tui.css` - isolated TUI/lab styles imported by `agent-tui.ts`.
- `web/src/agent-tui.test.ts` - pure state, event, bounds, session resume, abort, and safe-render tests.
- `playwright.agent.config.ts` - dedicated one-worker agent suite on `6173/6175`; enables the hidden feature and fake Pi without changing the default suite.
- `tests/agent-e2e/agent-server.ts` - injected fake-Pi server runner used by dedicated Playwright and manual fake-Pi lab smoke.
- `tests/agent-e2e/agent-tui.spec.ts` - enabled hidden-mode browser flow, geometry, accessibility, and diagnostics outside the default E2E test directory.
- `tests/agent-e2e/fixtures/fake-pi.mjs` - deterministic strict-JSONL RPC child used only by the dedicated agent suite.

### Modify

- `server/app.ts` - minimal mount/injection for the isolated Pi router and gateway after their focused tests pass.
- `server/app.test.ts` - mount behavior, session confinement, no-write proofs, and existing security negatives.
- `server/integrations/registry.ts` - add `agent` surface to exactly three existing read entries.
- `server/integrations/registry.test.ts` - exact surface snapshot and no mutation/external entries.
- `web/index.html` - final integration only: hidden agent collection control and stable agent body root.
- `web/src/main.ts` - final integration only: thin mount, collection switching, Inbox flush, geometry, and pin behavior.
- `web/src/research-state.ts` - final integration only: add the `agent` collection value and pure transition behavior.
- `web/src/research-state.test.ts` - final integration only: Research/Inbox/Agent switching and pin invariants.
- `web/src/i18n.ts` - agent EN/ES keys added in U4; U5 adds only integration-specific shell labels if needed.
- `tests/e2e/smoke.spec.ts` - one default-suite assertion that the feature-disabled lab shell mounts no usable TUI and no Agent collection appears.

### Explicitly unchanged

- `package.json` and `package-lock.json`: no Pi, SDK, frontend framework, terminal emulator, or other dependency.
- `web/vite.config.ts`: dedicated manual lab ports use existing CLI/env overrides; production build remains single-entry and excludes `agent-lab.html`.
- `web/src/style.css`: shared shell CSS stays unchanged; TUI styles remain in `agent-tui.css`.
- `playwright.config.ts` and `tests/e2e/server.ts`: default serial suite remains Pi-disabled and unchanged; the dedicated config uses `tests/agent-e2e/` so default discovery cannot execute enabled-agent scenarios.
- `server/integrations/write.ts` and `server/integrations/git.ts`: prototype tools cannot reach them.
- `docs/plans/2026-07-20-feat-runtime-neutral-generative-ui-plan.md`: independent presentation feature; not modified or required by this prototype.
- `.harness/features.json`: not initialized or modified by this plan.

## Implementation Units

Each unit is sized to become one harness feature only after `harness-progress init` runs inside the approved isolated worktree.

### U0. Installed Pi compatibility and lockdown proof

- **Depends on:** none. U1-U6 cannot start until U0 passes.
- **Requirements:** R7-R19a, KTD3, KTD8, KTD11-KTD13.
- **Files:** `pi-agent.ts`, `pi-agent.test.ts`, `pi-bridge-extension.ts`, `pi-demo-skill/SKILL.md`, app-local compatibility evidence only.
- **Implement:** Detect the external executable without installing it. Require version `0.80.10` and Node `>=22.19.0`. Capture `pi --help` and verify the installed executable's exact spellings and behavior for RPC mode, provider/model, session/session-dir, built-in tool disablement, explicit tool allowlist, extension disablement plus explicit extension, skill disablement plus explicit skill, prompt/context/theme disablement, project non-approval, and offline behavior. Probe strict LF JSONL framing, request/response correlation, streaming message/tool events, prompt submission, abort plus official settlement, state/model/session/token/cost, session resume, and `get_commands`.
- **Lockdown proof:** Run from an app-controlled non-vault cwd with empty app-owned session/temp dirs, generated app-owned config limited to the digested loopback test provider, and the fresh environment allowlist. Load the minimal bridge and bundled skill fixtures in U0, before gateway authorization exists. Assert the command palette allowlist contains only `skill:sinapso-grounding-demo`, the tool inventory contains exactly the three bridge tools, and the loaded resource digests match the one bridge plus one bundled skill. Assert the bundled skill contains instructions only, with no extension, script, or lifecycle hook. Assert no user config or discovered extension/skill/prompt/theme/context appears and no other returned command can be invoked through the browser adapter.
- **Network proof:** Restrict accepted executables to the npm Node entrypoint and use a deterministic Node preload observer that blocks and records external socket/fetch attempts, plus the generated `models.json` and local fake selected-provider endpoint for the submitted-turn probe. Start and resume must record zero external requests. One turn may reach only the fake selected provider. Any other destination fails U0. Fake-child E2E later proves policy wiring, not actual Pi egress.
- **Parser proof:** Feed split records, multiple records per chunk, CR characters inside JSON strings, Unicode separators inside strings, malformed lines, overlong lines, EOF fragments, and valid records after malformed lines. The parser resynchronizes only at LF, emits a bounded protocol error, and never executes malformed content. Supervisor terminates or cleanly restarts a corrupted child generation.
- **Fail closed:** Absent binary means hidden feature unavailable, not test failure. Present but wrong version, low Node, changed help, missing flag/event, extra loaded resource, startup network, unsupported provider mapping, or framing mismatch blocks the prototype. Do not adapt silently or continue with partial lockdown.
- **Evidence:** `<dataDir>/agent/evidence/pi-compatibility.json` contains exact values and hashes, not `latest` or a semver range.

### U1. Supervisor, canonical sessions, budgets, and cancellation

- **Depends on:** U0.
- **Requirements:** R9-R19, R26-R30.
- **Files:** `pi-agent.ts`, `pi-agent.test.ts`.
- **Implement:** Confine and permission app-owned directories; launch through the fixed POSIX umask wrapper; create one child generation and capability per active session; preserve Pi JSONL files untouched; validate the canonical session header cwd before resume and revalidate runtime cwd after startup through the trusted bridge's `ExtensionContext.cwd` attestation, not `get_state`; normalize supported events; correlate requests; expose state/commands/session resume; enforce runtime budgets and provider submission limits; mark abort terminal before sending it; reject gateway work until official settlement; replace unresponsive children with rotated capabilities; and dispose children on server shutdown.
- **Tests:** Child cwd outside vault; session header and reported cwd must equal the app-owned work directory; modified or mismatched session cwd rejected; symlinked data, work, config, temp, session, and evidence paths rejected; mode checks where supported; child-created file mode proves `umask 077` without changing server umask; environment exact-key snapshot; unrelated secrets absent; canonical session bytes unchanged by reads; no second history file; malformed-line recovery; stale generation ignored; timeout and every enforceable bound abort; provider `maxTokens`, preflight cost rejection, and post-response usage stop; abort rejects gateway work until settlement; missing settlement replaces child and rotates capability; crash and restart isolation.
- **Acceptance evidence:** Starting, resuming, listing, reading state, and command discovery change only Pi's own app-local session behavior and leave the vault plus `changes.jsonl` byte-identical.

### U2. Dedicated child-capability gateway and exact registry surface

- **Depends on:** U0, U1.
- **Requirements:** R20-R25.
- **Files:** `pi-agent-gateway.ts`, its test, bridge extension, `registry.ts`, `registry.test.ts`.
- **Implement:** Add the `agent` surface to exactly three entries. Generate, hash, expire, rotate, and revoke one capability per child generation. Implement a dedicated handler that accepts that capability only, validates the exact registry schema, chooses method/path/query/body server-side, calls the existing loopback route with server authority where needed, and bounds results. Bridge extension registers exactly three tools and has no general fetch or route API exposed to the model.
- **Tests:** Exact sorted names; exact expected commands and demonstration skill; normal token rejected at child gateway if capability is required; child capability rejected by every guarded non-gateway route; old/revoked/foreign capability rejected; unknown and malformed calls rejected; all mutating, web, install, Git, wiki, shell, filesystem, and arbitrary HTTP attempts rejected; route/method/header injection ignored; oversized request/result rejected; existing route confinement still runs.
- **Acceptance evidence:** The fake Pi can complete all three read tools, and no capability-bearing request can authorize any other operation.

### U3. Guarded control/SSE API and disclosure gate

- **Depends on:** U1, U2.
- **Requirements:** R5, R19-R30.
- **Files:** `pi-agent-routes.ts`, its test, `server/app.ts`, `server/app.test.ts`, `pi-agent.ts`.
- **Implement:** Add hidden status, session, start/resume, state, disclosure, turn, abort, SSE, and child-gateway routes in one isolated router. Validate ids and bodies with small route-specific limits. Bind disclosure acceptance to session, provider, model, text digest, and generation. Redact executable paths, capabilities, environment, and credentials from browser responses and logs. Mount the router in `server/app.ts` with one small injected seam after its focused tests pass.
- **Tests:** Hidden flag off returns no usable feature; no Pi returns redacted unavailable status; every browser route requires the normal token; foreign Host/Origin rejected; disclosure absent/stale/wrong generation/wrong provider/wrong model rejected before child prompt; start/resume zero external requests; turn selected-provider-only; authenticated fetch-stream reconnect does not replay unbounded history; native `EventSource` and query-string token paths do not exist; disconnect cannot orphan work.
- **Acceptance evidence:** A deterministic fake-child route test covers a complete disclosed turn, streaming tool call, cost/status update, and abort without vault or journal change.

### U4. Standalone browser lab

- **Depends on:** U1, U3.
- **Requirements:** R5-R6, R26-R33, R35-R36, KTD13-KTD14.
- **Files:** `agent-lab.html`, `agent-lab.ts`, `agent-tui.ts`, `agent-tui.css`, `agent-tui.test.ts`, `web/src/i18n.ts`, `tests/e2e/smoke.spec.ts`, fake Pi fixture, `agent-server.ts`, `playwright.agent.config.ts`, lab Playwright coverage.
- **Implement:** Mount the host-neutral TUI in the development-only lab with semantic event reducer, authenticated `apiRaw(..., { token: true })` fetch-stream transport, composer, text/baseline tool cards, status/cost/token line, session resume, command palette containing only `skill:sinapso-grounding-demo`, disclosure dialog, abort, and bounded error states. On stream `403`, call `resetApiToken()` before one bounded reconnect. Native `EventSource` and query-string tokens are prohibited. Use fake Pi by default; allow an explicit real-Pi smoke only after fake scenarios pass. Keep DOM writes safe and code-owned.
- **Tests:** Default feature-disabled browser assertion; injected missing-Pi unit/route state; served-but-disabled lab shell mounts no usable TUI; dedicated enabled fake-Pi streaming states; all three tools; session resume; disclosure; abort; stream reconnect; malformed/unknown events; desktop/narrow geometry; keyboard order; exact agent EN/ES parity; diagnostics; and no `innerHTML`, ANSI renderer, raw reasoning, or unbounded dump.
- **Acceptance evidence:** The lab passes focused Playwright on E2E ports and a manual fake-Pi run on `6273/6275`; `npm run build` proves `agent-lab.html` is absent from production output. No research-column host file has changed in U4.

### U5. Thin research-column integration

- **Depends on:** U4 plus the first clean `main` sync checkpoint.
- **Requirements:** R1-R6, R31-R36.
- **Files:** `web/index.html`, `web/src/main.ts`, `web/src/research-state.ts`, its test, integration-specific `web/src/i18n.ts` keys only if needed, integration assertions in `agent-tui.spec.ts`.
- **Implement:** Add only the hidden collection control/body root, thin TUI mount, collection transitions, Inbox flush, geometry, pin behavior, and any integration-specific shell labels. Do not move TUI state or rendering into `main.ts`. If `ToolPresentationV1` exists after the `main` sync, add the Pi-side adapter and route every tool lifecycle through the shared renderer; otherwise retain the standalone baseline cards.
- **Tests:** Inbox flush before switch; pinning and visible identity unchanged; research geometry unchanged; lab and integrated hosts drive the same TUI reducer; hidden flag off has no control; narrow layout and keyboard access pass; existing Research/Inbox tests remain green.
- **Acceptance evidence:** The integrated host is a small adapter, the lab still passes unchanged, and the focused diff shows no duplicated TUI behavior or shared CSS additions.

### U6. End-to-end trust and decision evidence

- **Depends on:** U0-U5 plus the final clean `main` sync checkpoint.
- **Requirements:** all.
- **Files:** `agent-tui.spec.ts`, fake Pi fixture, `agent-server.ts`, `playwright.agent.config.ts`, existing files only where dedicated fixture wiring requires it.
- **Implement:** Exercise lab and integrated activation, absent-Pi degradation, start/resume without egress, disclosure, one turn, all three tools, streaming states, command palette and demonstration skill, abort, narrow viewport, and browser diagnostics.
- **Tests:** Assert exact commands/skill and exact three tools; child cwd outside vault; child environment excludes seeded browser/MCP/Exa/Git/SSH/Infisical/unrelated cloud secrets; capability is gateway-only; unknown/mutating calls fail; malformed JSONL recovers safely; session operations leave fixture vault and journal byte-identical; fake-child fixtures verify policy wiring while U0 alone proves actual-Pi egress; abort blocks later work; lab and integrated host agree; the default serial gate passes with the feature disabled and without invoking Pi, while injected detection proves absent-Pi degradation.
- **Acceptance evidence:** Produce a compact review packet from unit, lab, integrated-browser, real-Pi U0, and serial-gate output. Do not merge, supersede the other plan, or add write tools.

## Deterministic Verification

Run focused checks inside the isolated prototype worktree. The installed-Pi compatibility probe is explicit and separate so the repository's normal gate never requires Pi.

| Gate | Command | Proves |
|---|---|---|
| Installed Pi U0 | `SINAPSO_PI_BIN="$(command -v pi)" SINAPSO_PI_PROBE=1 npm test -- --run server/integrations/pi-agent.test.ts` | Exact 0.80.10, Node floor, current help/flags, lockdown, RPC, network, provider, and parser evidence. Fails if the requested binary is absent or incompatible. |
| Supervisor and gateway | `npm test -- --run server/integrations/pi-agent.test.ts server/integrations/pi-agent-gateway.test.ts server/integrations/registry.test.ts server/app.test.ts` | Fake-child lifecycle, sessions, exact tools, tokens, capability scope, routes, egress gate, bounds, and abort. |
| Lab frontend | `npm test -- --run web/src/agent-tui.test.ts web/src/api.test.ts` | Host-neutral semantic rendering, token client, lifecycle, and safe bounds before shell integration. |
| Integrated frontend | `npm test -- --run web/src/agent-tui.test.ts web/src/research-state.test.ts web/src/api.test.ts` | Same TUI module in the research column, collection behavior, localization, and safe bounds. |
| Type and build | `npm run typecheck && npm run build` | Optional integration compiles without Pi or a new dependency. |
| Focused browser | `npx playwright test --config playwright.agent.config.ts` | Dedicated enabled-feature lab plus integrated geometry, keyboard/accessibility, fake RPC stream, security negatives, and diagnostics. |
| Required serial gate, feature disabled | `env -u SINAPSO_EXPERIMENTAL_PI_AGENT -u SINAPSO_PI_BIN -u SINAPSO_PI_PROBE npm test && npm run typecheck && npm run build && npm run test:e2e` | Default suite stays Pi-disabled and Sinapso has no external Pi runtime dependency, in repository-required order. Injected detector tests separately prove absent-Pi degradation despite a globally installed executable. |

The fake Pi fixture must implement strict LF JSONL and deterministic events, but it cannot satisfy U0. U0 must run against the actual external executable selected for prototype evidence.

Manual fake-Pi lab smoke uses two shells from the prototype worktree after its fixture graph exists. The dedicated runner injects the fake child and does not inspect the global Pi executable:

```bash
SINAPSO_PORT=6275 SINAPSO_GRAPH="<lab-root>/data/graph.json" SINAPSO_EXPERIMENTAL_PI_AGENT=1 ./node_modules/.bin/tsx tests/agent-e2e/agent-server.ts
SINAPSO_API_URL=http://127.0.0.1:6275 npm run dev:web -- --host 127.0.0.1 --port 6273 --strictPort
```

Open `http://127.0.0.1:6273/agent-lab.html`. The manual smoke checklist requires the generated lab graph path and must not substitute a real-vault graph.

After U0 and all fake-Pi lab scenarios pass, the explicit real-Pi smoke replaces only the backend command:

```bash
SINAPSO_PORT=6275 SINAPSO_GRAPH="<lab-root>/data/graph.json" SINAPSO_EXPERIMENTAL_PI_AGENT=1 SINAPSO_PI_BIN="/Users/felo/.npm-global/bin/pi" npm run dev:server
```

## Security Negatives

The prototype decision is blocked unless deterministic tests prove all of the following:

- Hidden flag off exposes no Agent control and does not start or detect Pi during ordinary application use.
- Vite may serve the lab HTML shell while disabled, but `/api/agent/status` prevents mounting a usable TUI; the lab uses only its generated fixture vault/data root and is absent from `web/dist` after production build.
- Manual lab ports `6273/6275` and E2E ports `6173/6175` do not collide with ordinary development `5173/5175`.
- Injected absent-Pi detection leaves all normal tests and product behavior green even when another Pi executable exists on the developer's global `PATH`.
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
- Starting, listing, resuming, reading session state, and viewing commands/cost produce zero external network requests.
- After disclosure, a submitted turn contacts only the selected provider externally. Any unexpected host blocks U0 and the decision gate.
- Session operations do not translate or duplicate Pi JSONL and leave vault files plus `changes.jsonl` byte-identical.
- Search/read/browse tool calls also leave vault files and journal byte-identical.
- Missing, stale, or mismatched disclosure prevents prompt submission and external provider contact.
- Step, call, byte, and duration bounds terminate the run; provider `maxTokens` and conservative preflight cost estimation limit submission; observed token/cost excess prevents continuation.
- Abort marks the generation terminal before acknowledgement and rejects gateway work until official settlement; missing settlement replaces the child and capability before another turn.
- Model/tool text is bounded and inserted with `textContent`; no model HTML, dynamic component, ANSI control, raw reasoning, or arbitrary URL becomes executable UI.
- Research pinning, Inbox flush-before-switch, graph/reader interaction, narrow geometry, EN/ES parity, focus, and browser diagnostics remain intact.
- The bundled skill is instructions-only and digest-verified; no route or code path implements marketplace discovery, scanning, download, installation, or enablement.

## Prototype Decision Gate

### Required evidence

Reviewers receive:

1. U0 compatibility evidence for external Pi `0.80.10`, including executable/version/Node/help hashes, exact validated flags, loaded resources, provider mapping, and observed network destinations.
2. Focused agent-config output plus the default serial gate with the feature disabled and no external Pi runtime dependency; injected detector evidence covers the absent-Pi case.
3. Security-negative results for env, cwd, capabilities, exact tools, parser recovery, disclosure, egress, budgets, abort, and vault/journal immutability.
4. Separate desktop and narrow browser evidence from the standalone lab and final research-column host for messages, all tool states, cost/status, commands, session resume, keyboard use, and diagnostics.
5. A short compatibility assessment against the independent runtime-neutral generative UI plan, confirming no duplicated renderer authority and identifying whether the thin adapter was exercised.

### Outcomes

- **Approve Pi direction:** Keep the prototype branch isolated while writing and reviewing a production implementation plan. That later review may authorize production dependencies, installer work, sandboxing, or `write_document`; it does not supersede the independent generative UI plan.
- **Reject Pi direction:** Leave the independent generative UI plan intact. Remove the sibling prototype worktree and branch only after explicit confirmation. App-local prototype data may be removed separately after user confirmation.
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
- Pi requires extension UI, steer/follow-up, tree navigation, or compaction controls to demonstrate the mandatory feasibility core.
- The prototype needs write/edit, shell, web, Git, wiki, install, or arbitrary HTTP capability to demonstrate value.
- The full default serial gate fails, enables the feature, or depends on invoking an external Pi executable.
- Research-column geometry, Inbox flush, pinning, localization, accessibility, or browser diagnostics regress.
- The lab requires the real vault, normal development ports, production bundling, or duplicated TUI behavior to function.
- Production review requires sandbox-grade filesystem or egress enforcement not provided by process separation.

Rollback is branch-local: stop child processes, revoke capabilities, and remove the isolated worktree/branch after confirmation. Do not clean, reset, or copy from the user-owned main worktree. Do not alter the independent generative UI plan as part of rollback.

## Definition of Done

- The reviewed plan was implemented only in the specified sibling worktree and branch from a clean reviewed-plan commit.
- U0 pins and records external Pi `0.80.10`, validates Node `>=22.19.0`, current flags/help, strict RPC, lockdown, provider mapping, and network behavior.
- The browser-native vanilla TUI runs in the hidden `agent` research collection with responsive, localized, keyboard-accessible behavior.
- Before shell integration, the same TUI passes in a development-only browser lab using dedicated ports, generated fixture data, and fake Pi; the lab is absent from production output.
- Pi remains canonical for app-local runtime sessions and resume; no second chat database exists.
- The child runs outside the vault with app-owned private directories, a fresh environment, one credential, one bridge, one skill, and exactly three tools.
- Sinapso browser tokens stay out of Pi; a random per-child capability works only at the dedicated gateway.
- Disclosure, enforceable bounds, provider submission limits, observed-usage stops, malformed-line handling, abort settlement barriers, and safe rendering pass.
- Start/resume has zero external egress; a submitted turn is observed contacting only the selected provider.
- Vault and journal remain byte-identical throughout prototype operations.
- The default required serial gate passes with the feature disabled and without invoking Pi; injected detector tests prove absent-Pi degradation.
- Both clean `main` sync checkpoints complete in the prototype worktree without changing or blocking the user's main worktree.
- Decision evidence is reviewed before any merge, write-tool slice, extraction, or installer. The independent generative UI plan remains valid regardless of the Pi decision.

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
- `docs/plans/2026-07-20-feat-runtime-neutral-generative-ui-plan.md` only as the independent presentation contract and optional adapter target.

### Pi evidence current at research time

- Official repository: `https://github.com/earendil-works/pi`, redirected from `badlogic/pi-mono`, MIT.
- Official package: `@earendil-works/pi-coding-agent` `0.80.10`, published 2026-07-16, with Node engine `>=22.19.0`.
- Local planning precheck on 2026-07-20 resolved `/Users/felo/.npm-global/bin/pi` at `0.80.10` with Node `v22.22.3`; U0 still revalidates and records the executable rather than trusting this note.
- Official coding-agent docs and source: `packages/coding-agent/README.md`, `packages/coding-agent/docs/rpc.md`, `packages/coding-agent/docs/session-format.md`, `packages/coding-agent/docs/skills.md`, `packages/coding-agent/docs/extensions.md`, and current CLI argument source/help.
- Verified current capabilities used by this plan: strict LF JSONL RPC; streaming message/tool events; prompt; abort plus settlement; state/model/session/token/cost; session resume; commands and `skill:*`.
- Verified current repository package directories supplied to this plan: `agent`, `ai`, `coding-agent`, `orchestrator`, and `tui`. No current `web-ui` package exists. Generated `pi-web-ui` documentation is treated as stale and cannot support an implementation decision.

U0 must revalidate executable behavior locally because web pages and generated documentation cannot prove the installed binary's exact protocol or lockdown behavior.
