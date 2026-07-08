# Feat: URL Query Parameter for Direct Node Opens

**Type:** feat
**Depth:** lightweight
**Created:** 2026-07-08
**Status:** implementation-ready

## Goal

Add a `?node=<id>` URL query parameter so external systems can link directly into Solaris and open a specific graph node. The existing `?focus=<title>` param is kept for backward compatibility but copy-link switches to the new id-based param.

## Problem Frame

Today copy-link (File menu, Ctrl+C) produces `?focus=<title>` which resolves by basename — fragile (title collisions, rename breaks the link) and uses a fixed 2500ms setTimeout that races physics settlement. External systems (chat, launchers, dashboards) have no stable way to deep-link into a specific note by its graph node id, which is the natural stable key (vault-relative path).

## Scope

**In scope**
- `?node=<id>` query param: select + fly + open reader for the matching graph node.
- Process param after graph data + layout are ready, using the settled/cached-ready signal instead of a fixed delay.
- Handle unknown node ids silently. Phantom node ids should behave like graph clicks: select the phantom node and show the existing unwritten placeholder.
- Change copy-link from `?focus=<title>` to `?node=<id>` (encodeURIComponent).
- Keep `?focus=<title>` as a fallback when `?node` is absent (backward compat).
- Keep `?theme` and `?group` params working unchanged.

**Out of scope**
- No new packages, no router, no backend endpoint.
- No qmd integration.
- No new URL helper module (code stays inline in main.ts).
- No Electron-specific URL handling (Electron loads the same page URL).
- No history.pushState or URL bar updates on click — deep links are external-entry only.
- No toast, modal, or error feedback for unknown node ids. Silent ignore matches the existing invalid-theme/group behavior.

## Decisions

### D1. Use graph node id, not title or qmd id

Node ids are vault-relative paths (`folder/subfolder/file.md`), stable across rescans, and already serve as the key for `/api/note?id=`. No qmd dependency. Title-based `?focus` resolves by basename and breaks on rename. The graph `byId` map (`Map<string, GNode>`) already exists and is populated at boot.

### D2. Process at the end of boot(), gated on ready signals

The existing `?focus` and `solaris-pending-select` handlers live at the end of `web/src/main.ts:6394-6408`. The new `?node` handler goes in the same area. Instead of the fixed `setTimeout(2500)` that races physics, use a ready dispatch that fires:

- Immediately in the cached-positions path (positions already settled, `hideLoading()` fires from `setTimeout(0)` at line 858).
- On `onEngineStop` in the warm-start path (physics finished, `dbg.settled = true` at line 849).

A single-shot `tryHandleNodeParam()` function called from both paths avoids the fixed delay. The `?focus` handler also uses this same mechanism instead of the old `setTimeout(2500)`.

### D3. Silent ignore for unknown ids; preserve phantom placeholder behavior

If `byId.get(id)` returns `undefined`, the param is silently ignored. If the node exists and is a phantom, `select()` fires and `openReader()` renders the existing phantom placeholder — the same behavior as clicking a phantom node in the graph. No new error UI.

### D4. Copy-link produces `?node=<id>` with encodeURIComponent

Change `web/src/main.ts:5864-5866` from `?focus=${encodeURIComponent(selected.title)}` to `?node=${encodeURIComponent(selected.id)}`. Node ids can contain `/`, spaces, and special characters — `encodeURIComponent` handles all of them.

### D5. Keep `?focus` as fallback; process both at the same hook point

The existing `?focus` param still works for anyone who has saved old links. Process `?node` first; if absent and `?focus` is present, fall back to the title-based lookup via `byBasename`. The old `byBasename.get(focusParam.toLowerCase())` line stays unchanged.

## Implementation Units

### U1 — Node param handler + settled dispatch

**Files**
- `web/src/main.ts`

**Behavior**
- Near the end of `boot()` (after `graph.graphData()` and all graph setup, ~line 6390), before the `focusParam` block:
  - Remove the existing `focusParam` block at lines 6396-6400.
  - Remove the `pendingSelect` block at lines 6403-6408.
- Add a helper near the top of `boot()` (~line 200 area):
  ```ts
  let nodeParamHandled = false;
  function tryHandleNodeParam() {
    if (nodeParamHandled) return;
    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get("node");
    const target = nodeId ? (byId.get(nodeId) ?? null) : null;
    if (target) { select(target); nodeParamHandled = true; return; }
    // Fallback: ?focus=<title> (backward compat)
    const focusParam = params.get("focus");
    if (focusParam) {
      const t = byBasename.get(focusParam.toLowerCase());
      if (t) { select(t); nodeParamHandled = true; }
    }
  }
  ```
- Call `tryHandleNodeParam()` from three sites:
  1. `onEngineStop` callback (~line 850): `tryHandleNodeParam();` right after `hideLoading()`.
  2. The cached-positions `setTimeout(0)` block (~line 858): `tryHandleNodeParam();` right after `hideLoading()`.
  3. The `pendingSelect` path (moved from old line 6403-6408): replace `setTimeout(() => select(target), 2500)` with `if (!nodeParamHandled) { select(target); nodeParamHandled = true; }`.

**Why three sites:**
- Warm-start: engine eventually stops → dispatch.
- Cached positions: no engine tick → dispatch from the `setTimeout(0)` render pass.
- Pending select (ingest → rescan → reload): must dispatch even if no `?node` param is present. The guard `nodeParamHandled` prevents double-fire when e.g. a cached-position load also has a pendingSelect.

### U2 — Copy-link produces `?node=<id>`

**Files**
- `web/src/main.ts`

**Behavior**
- Line 5864-5866: change from:
  ```
  `${window.location.origin}/?focus=${encodeURIComponent(selected.title)}`
  ```
  to:
  ```
  `${window.location.origin}/?node=${encodeURIComponent(selected.id)}`
  ```

### U3 — Tests and verification

Files changed: `web/src/main.ts` only.

**Checks**
- `npm test` — existing scanner + server + prefs tests must stay green (no server or prefs changes).
- `npm run typecheck` — no new TS errors.
- `npm run build` — production build succeeds.

**Manual smoke tests** (`npm run dev`):
1. Open `/?node=some%2Fpath%2Ffile.md` (where `some/path/file.md` is a real node id) → node selected, camera flies, reader opens.
2. Open `/?node=nonexistent` → nothing happens (no console error, no toast).
3. Open `/?node=<phantom-node-id>` → phantom node selected, reader shows "unwritten" placeholder.
4. Open `/?focus=Some%20Title` (old style) → still works, selects + flies.
5. Open `/?theme=gilded&node=foo` → both theme and node apply.
6. Ctrl+C on a selected node → clipboard contains `?node=<encoded-id>`.
7. Ctrl+C → paste in browser address bar → loads and opens the note.
8. Paste a `?node=` URL into existing session → page reloads (no SPA routing, page load is the entry path).
9. `/?node=X` with cached layout (no physics warm-up) → fires immediately, no flash.
10. `/?node=X` with warm start (fresh vault, no cached positions) → fires after engine settles, no fixed timeout.

## Key Technical Decisions Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Use graph node id (`byId`) | Stable key, already indexed, no qmd dep |
| D2 | Dispatch on ready signal, not fixed setTimeout | Eliminates 2500ms race; works for both cached and warm boots |
| D3 | Unknown ids no-op; phantom ids open placeholder | Matches existing invalid-param and graph-click behavior |
| D4 | Copy-link uses `?node=<encoded-id>` | Stable, rename-safe, externalizable |
| D5 | `?focus` kept as fallback | Backward compat; no migration burden |

## Risks & Mitigations

- **Setting race** — `tryHandleNodeParam()` fires from three sites with a `nodeParamHandled` guard; only the first applicable signal dispatches. If the `onEngineStop` fires before the `setTimeout(0)` (theoretical with warm-up but no cached positions), the guard prevents double fire.
- **pendingSelect stomp** — If a page load has both `?node=X` and a `pendingSelect` in sessionStorage, `?node` wins (it processes first in `tryHandleNodeParam`). The pendingSelect block then sees `nodeParamHandled === true` and skips. This is correct — the URL param is the more explicit intent.
- **Phantom node with URL** — `select()` on a phantom calls `openReader()` which renders the "unwritten" UI. No crash; the user sees the expected placeholder.
- **Node id with special characters** — `encodeURIComponent` handles `/`, spaces, `#`, `%` etc. The `URLSearchParams` getter auto-decodes. Round-trip via `/?node=` is correct by spec.

## Test Scenarios

### U1 — node param
- Known node id → select, fly, reader open.
- Unknown node id → silent no-op.
- Phantom node id → phantom selected, reader shows placeholder.
- `?focus=Title` (old, no `?node`) → still works.
- Both `?node` and `?focus` present → `?node` wins.
- Cached layout load with `?node` → fires before loading overlay fades.
- Warm-start load with `?node` → fires after engine settles.

### U2 — copy-link
- Ctrl+C → clipboard text is valid URL with `?node=<encoded id>`.
- Paste URL → page reloads and opens the expected note.

## Dependencies & Sequencing

U1 (param handler) and U2 (copy-link change) are independent edits in the same file. Suggested order:
1. U2 first (simple one-line change, verify copilot).
2. U1 (the core logic; depends on understanding the boot flow).
3. Manual smoke tests + `npm test` + `npm run typecheck` + `npm run build`.

## Verification

- `npm test` — all existing tests pass.
- `npm run typecheck` — clean.
- `npm run build` — builds without errors.
- Manual smoke: 10 scenarios listed above.
