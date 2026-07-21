---
title: Live Link Graph Relayout and Camera Follow - Plan
type: feat
date: 2026-07-20
topic: live-link-graph-relayout
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Live Link Graph Relayout and Camera Follow - Plan

## Goal Capsule

- **Objective:** Make structural Markdown edits update the live 3D graph after autosave, locally reposition the edited note around its new references, and keep the camera attached to that moving note until the local simulation settles.
- **Product value:** Writing and graph navigation become one continuous action: creating a relationship in Markdown immediately changes the visible knowledge world.
- **Depends on:** The guarded editable-reader autosave contract from plan 018, durable note ownership from plan 020, incremental scanner, arrangement modes, merged structural-link buffer, and existing `applyGraphUpdate()` hot-swap path.
- **Stop conditions:** Do not add another vault writer, WebSocket, event bus, graph-delta protocol, continuous global simulation, new dependency, or graph refresh for prose-only edits.
- **Open blockers:** None.

## Research Findings

- `3d-force-graph.graphData()` is the supported dynamic update boundary. The official dynamic example replaces the nodes/links arrays and calls `graphData()` again.
- Internally, a `graphData()` change stops the D3 simulation, rebinds nodes and links, sets alpha to `1`, and resets its cooldown countdown. An additional `d3ReheatSimulation()` call is unnecessary.
- `d3-force-3d` supports `fx`, `fy`, and `fz`; fixed coordinates are reapplied after every tick and their corresponding velocities are zeroed. This permits a local relayout while the rest of the constellation remains stable.
- `onEngineTick()` is the correct synchronization point for moving merged link buffers and translating the camera with the edited node. `onEngineStop()` is the correct cleanup and layout-persistence boundary.
- `cameraPosition(..., ms)` is a one-shot transition. Repeated camera tweens on every tick would queue or fight transitions. The stable follow mechanism is to translate the exposed Three.js camera and controls target by the node's per-tick delta.
- Sinapso already preserves node object identity for retained nodes in `applyGraphUpdate()`, rebuilds adjacency and link buffers, and seeds new nodes near resolved neighbors. The missing pieces are edit-time topology detection, a structural save response, bounded local ticks, focus recomputation, and camera-follow state.

### Sources

- `https://github.com/vasturiano/3d-force-graph`
- `https://github.com/vasturiano/3d-force-graph/blob/master/example/dynamic/index.html`
- `https://github.com/vasturiano/d3-force-3d/blob/master/README.md`
- `https://github.com/vasturiano/three-forcegraph/blob/master/src/forcegraph-kapsule.js`

## Product Contract

### Structural updates

- R1. Adding, removing, or changing a resolvable `[[wikilink]]` or relative `[label](note.md)` link updates the structural graph after the successful autosave without manual rescan or reload.
- R2. Wiki aliases and headings resolve to the same structural target as their base link. External URLs, images, `mailto:`, `tel:`, pure anchors, and non-`.md` Markdown links do not trigger graph work.
- R3. Duplicate references preserve the scanner's existing edge-weight semantics. A changed duplicate count is a structural change even when the endpoint set is unchanged.
- R4. An unresolved wiki target creates or updates the existing phantom-node representation. A later real note creation continues to reconcile the phantom through the normal scanner path.
- R5. Prose-only edits retain the existing search/catalog refresh but do not scan, return, fetch, or reapply the presentation graph.

### Motion and camera behavior

- R6. A structural edit hot-swaps the new edge immediately and runs a bounded local force adjustment only in Links and Hybrid arrangements.
- R7. The edited source node is the only movable retained node during the local adjustment. Existing reference nodes and all unrelated nodes remain fixed at their current positions. A newly created phantom target remains fixed at its seeded neighbor position. A source that already has any fixed coordinate skips physics and camera follow rather than overriding the user's fixed state.
- R8. Existing `fx`, `fy`, and `fz` property presence and values, including `null` or `undefined`, are snapshotted and restored exactly for temporarily pinned non-source nodes. Cleanup runs on normal engine stop, replacement by a newer structural edit, arrangement change, vault change, and teardown.
- R9. Camera follow starts only when the edited source is the currently selected reader/research note. Each engine tick translates the camera and controls target by the source node's position delta, preserving view distance and angle.
- R10. Pointer, wheel, touch, or keyboard camera navigation cancels follow immediately but does not cancel the bounded graph settling.
- R11. Engine stop cancels follow, restores fixed-coordinate state, refreshes final link positions/colors, and persists the settled layout under the new graph fingerprint.
- R12. `prefers-reduced-motion: reduce` hot-swaps the edge and recomputes focus without running physics or camera movement.

### Arrangement and state behavior

- R13. Links arrangement uses structural edges for rendering and local physics. Hybrid uses its existing structural plus dampened semantic force set. Semantic arrangement renders the new structural edge but does not reposition nodes or move the camera.
- R14. After adjacency changes, a selected note's BFS `focusSet` is recomputed so newly linked neighbors and edges receive the correct visibility, labels, and highlight state.
- R15. The latest requested structural autosave wins across reader and research editors. One global monotonically increasing graph-save generation prevents an older response from replacing a newer topology. A new accepted update cleans up the previous pin/follow state before applying its graph.
- R16. A post-write scan failure never rolls back or reports failure for the already-durable Markdown edit. The response returns the new `baseHash` plus `graphRefreshFailed: true`; the current client presentation graph and camera remain unchanged. No rollback of an already atomically written `graph.json` is promised if a later reload step fails.
- R17. Existing create, manual rescan, vault switch, arrangement restore, semantic layout, autosave CAS, crash mirror, and history behavior remain unchanged.

## Interaction Contract

The recommended interaction is deliberately local:

```text
User edits selected note
        |
        v
1.8s autosave succeeds through guardedEdit()
        |
        +-- prose only --> refresh catalog/search --> done
        |
        +-- structural link delta
              |
              v
       incremental scanAndReload()
              |
              v
       response includes updated graph
              |
              v
       applyGraphUpdate(graph, { liveSourceId })
              |
              +-- render edge + recompute focus
              +-- pin all nodes except source
              +-- bounded D3 ticks
              +-- translate camera rig by source delta
              |
              v
       engine stop: restore pins + save layout
```

The source note moves toward the equilibrium of its references while established reference nodes remain anchors. Multiple added links pull the source toward their combined equilibrium. Removing a link lets the source settle against its remaining links.

## Planning Contract

### Key Technical Decisions

- KTD1. **Detect structure before scanning.** Export one pure scanner helper that extracts normalized structural link targets from Markdown and a vault-relative source path. Its comparison signature is an order-independent multiset, represented as sorted target/count pairs, so reordering links is not structural while changing duplicate count is. The scanner and edit route use the same parser; do not duplicate regexes in the frontend or server route.
- KTD2. **Reuse the writer's authoritative pre-write bytes.** `guardedEdit()` already reads the current file for CAS. Its internal result may return the previous content to the server caller, but that content is never serialized or journaled. The route compares old/new structural signatures only after the guarded write succeeds.
- KTD3. **Return the graph only for topology changes.** Successful structural PUT responses may include `graph`; prose responses remain `{ ok, id, baseHash }`. This avoids a second graph request and avoids sending the full graph on ordinary autosaves.
- KTD4. **Durability outranks presentation refresh.** Structural scan errors are caught after the write and represented by `graphRefreshFailed`; they do not turn a successful CAS write into an HTTP failure.
- KTD5. **Use `graphData()` once, not `d3ReheatSimulation()`.** The library already sets alpha to `1` for changed graph data. Local pinning plus a bounded cooldown controls the blast radius.
- KTD6. **Move the source, anchor the world.** Pin every node except the edited source. Do not globally reheat an unpinned cached constellation and do not reposition established target neighborhoods.
- KTD7. **Translate the camera rig, do not tween per tick.** Apply source-node delta to `graph.camera().position` and the controls target during `onEngineTick()`. Existing one-shot `flyTo()` remains for explicit navigation.
- KTD8. **One live-relayout lifecycle.** Store one small relayout record containing source id, previous source position, fixed-coordinate snapshots, follow state, and prior warmup/cooldown settings. Set `warmupTicks(0)` before live `graphData()` so no unobserved synchronous movement occurs before camera tracking. Cleanup restores both settings, is idempotent, and always precedes replacement.
- KTD9. **One graph-save ordering guard.** Reader and research autosaves share a monotonically increasing graph-save generation. A save response applies graph data only when its captured generation is still current; teardown also invalidates pending presentation effects without cancelling the durable HTTP write.
- KTD10. **No new preference.** Camera follow is intrinsic to a selected structural edit, cancellable by input, and disabled by reduced-motion. Add a preference only if user evidence later requires one.

### Directional API Contract

```ts
type NoteEditResponse = {
  ok: true;
  id: string;
  baseHash: string;
  graph?: Graph;
  graphRefreshFailed?: boolean;
};

type GraphUpdateOptions = {
  liveSourceId?: string;
};

type LiveRelayout = {
  sourceId: string;
  previousSource: { x: number; y: number; z: number };
  fixedSnapshots: Map<string, {
    hasFx: boolean;
    hasFy: boolean;
    hasFz: boolean;
    fx: number | null | undefined;
    fy: number | null | undefined;
    fz: number | null | undefined;
  }>;
  followCamera: boolean;
  previousWarmupTicks: number;
  previousCooldownTicks: number;
};
```

These are directional shapes, not requirements for generic classes or exported framework abstractions.

## Implementation Units

### U1. Shared structural-link extraction

- **Files:** `scanner/scan.ts`, `scanner/scan.test.ts`.
- **Work:** Extract the existing wiki-link and Markdown-link loops into a pure exported helper that receives Markdown plus the source note path and returns normalized targets with duplicates preserved. Keep global basename/path resolution and phantom creation in `scanVault()`.
- **Tests:** Wiki basename/path, alias, heading, relative `.md`, `../`, URL decoding, duplicate weight input, reordered-identical multiset, changed duplicate count, image/external/anchor/non-Markdown exclusions, and prose-invariant signature.

### U2. Guarded structural edit response

- **Depends on:** U1.
- **Files:** `server/integrations/write.ts`, `server/integrations/write.test.ts`, `server/app.ts`, `server/app.test.ts`.
- **Work:** Return previous content internally from changed `guardedEdit()` results. In user and agent note PUT routes, compare old/new structural signatures. Always retain `refreshAfterWrite()` for catalog/search. Only a structural delta calls guarded incremental `scanAndReload()` and adds the resulting graph to the response. Catch scan failure after write and return the durable edit response with `graphRefreshFailed`.
- **Tests:** Prose PUT returns no graph and performs no graph scan; wiki/Markdown add/remove/weight changes return the updated graph; unchanged targets with changed alias/heading do not; CAS conflict performs neither write nor scan; scan failure preserves disk content and new base hash.

### U3. Frontend save integration

- **Depends on:** U2.
- **Files:** `web/src/main.ts`, focused autosave/E2E tests.
- **Work:** Extend reader and research vault-note save response handling. Increment one shared graph-save generation when either editor starts a save and capture it for that response. When `graph` is present and the generation is still current, call `applyGraphUpdate(graph, { liveSourceId: noteId })` after promoting the new base hash. Teardown invalidates pending presentation effects without cancelling the durable request. Reuse the existing localized graph-refresh error when `graphRefreshFailed` is true. Keep keepalive/unload saves presentation-free.
- **Tests:** Reader and research autosave apply structural graph responses; prose response does not call graph update; an older reader or research response cannot replace a newer graph or start motion for the wrong note; teardown invalidates late presentation effects.

### U4. Local graph relayout lifecycle

- **Depends on:** U3.
- **Files:** `web/src/types.ts`, `web/src/main.ts`.
- **Work:** Add optional fixed-coordinate fields to `GNode`. Extend `applyGraphUpdate()` with the optional live source id. Before `graphData()`, clean any old relayout, skip motion for a pre-fixed source, snapshot/pin unaffected nodes, recompute the active arrangement edge set and selected BFS focus, and rerun the same degree-based structural/semantic link-strength configuration used by `applyArrangement()`. Snapshot warmup/cooldown, set warmup to zero plus bounded cooldown ticks, and defer `saveLayout()` until engine stop. For non-live updates preserve the existing zero-tick path exactly.
- **Tests:** Pure property-presence/value snapshot and restore assertions where practical; pre-fixed source stays fixed; browser proof that source coordinates change only through observed engine ticks, unrelated coordinates stay within tolerance, Hybrid uses refreshed degrees, the new edge exists, and cleanup removes temporary pins and restores warmup/cooldown.

### U5. Camera follow and interruption

- **Depends on:** U4.
- **Files:** `web/src/main.ts`, `tests/e2e/editable-reader.spec.ts` or a focused graph-motion spec.
- **Work:** Replace the single engine-tick callback with one composite callback that updates merged structural/semantic buffers and, when active, translates camera position plus controls target by source delta. Cancel follow on navigation input and all relayout state on engine stop/replacement. Honor reduced motion and arrangement rules.
- **Tests:** Camera-to-source offset remains stable across ticks; selected source follows; unselected/background updates do not move camera; pointer/wheel cancels follow; reduced-motion and Semantic mode remain stationary; Links and Hybrid settle.

### U6. Release proof and repository contract

- **Depends on:** U1-U5.
- **Files:** `AGENTS.md`, browser diagnostics expectations, focused tests.
- **Work:** Document live structural autosave behavior, local source-only relayout, arrangement differences, reduced-motion behavior, and the no-second-writer boundary. Exercise normal and narrow viewport without introducing UI controls.
- **Tests:** Full serial repository gate.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Scanner | `npm test -- --run scanner/scan.test.ts` | One parser owns structural-link detection and scanner semantics remain stable. |
| Persistence | `npm test -- --run server/integrations/write.test.ts server/app.test.ts` | CAS, durable-write precedence, selective scan, and response shape. |
| Frontend logic | `npm test -- --run web/src/autosave.test.ts` plus any extracted pure graph-motion test | Autosave sequencing and cleanup math. |
| Focused browser | `npm run test:e2e -- tests/e2e/editable-reader.spec.ts --grep "live graph"` or the final focused spec path | Edge appearance, local motion, camera follow, interruption, modes, and browser diagnostics. |
| Full gate | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Repository release contract. |

## Acceptance Examples

- AE1. Adding `[[Reference]]` to the selected note autosaves, draws the edge, moves only the selected source toward Reference, and keeps the camera framing constant around the moving source.
- AE2. Adding `[Reference](../reference.md)` produces the same behavior using relative path resolution.
- AE3. Changing `[[Reference|old label]]` to `[[Reference|new label]]` saves Markdown but performs no graph scan or movement.
- AE4. Adding ordinary prose saves and refreshes search/catalog without returning or applying graph data.
- AE5. Adding `[[Missing Note]]` creates a phantom near the source; the source settles locally and the camera follows it.
- AE6. During movement, wheel or pointer navigation stops camera follow immediately while the source completes its bounded settling.
- AE7. In Semantic arrangement, reduced-motion mode, or when the source has a pre-existing fixed coordinate, the edge appears but node and camera positions remain stable.
- AE8. If graph scanning fails, the link remains durably saved, the current graph remains usable, and the UI reports the soft refresh failure.
- AE9. Two structural autosaves in quick succession leave no stale fixed coordinates or camera-follow state; the second graph is authoritative.

## Definition of Done

- Structural internal-link edits appear in the live graph without manual rescan or reload.
- Prose-only autosaves perform no graph scan, payload, hot-swap, physics, or camera work.
- Local relayout moves only an unfixed edited source while preserving established constellation geometry and applying all movement through observable engine ticks.
- Camera follow preserves framing, is interruptible, and cleans up deterministically.
- Links, Hybrid, Semantic, reduced-motion, phantom targets, duplicate weights, CAS conflicts, and scan failures follow the stated contracts.
- No new writer, listener, dependency, event bus, generic delta protocol, preference, or persistent state is introduced.
- Focused tests and the full serial gate pass with zero browser diagnostic failures.

## Supersession and Boundaries

- Extends plan 018 autosave behavior without changing editor bytes, debounce, CAS, conflict, mirror, or frontmatter contracts.
- Extends plan 020 durable note editing without changing Inbox membership, ownership transfer, promotion, or graph-independent searchability.
- Preserves manual rescan and create-time graph refresh as recovery/general topology paths.
- Does not make semantic edges writable, infer links from prose, continuously animate the graph, or synchronize edits from external filesystem watchers.
