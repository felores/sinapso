# Refactor: Relocate Full Rescan + Re-embed to Admin, Add Auto Update/Embed + Operation Bar

**Type:** refactor (with small features: auto-maint on load + global operation status)
**Depth:** lightweight
**Created:** 2026-07-07
**Status:** implementation-ready

## Goal

Consolidate the two destructive/expensive vault-wide operations (Full Rescan, Full Re-embed) into the Admin modal, make the lightweight Tools-menu maintenance ops (update, embed) auto-run on app load when their "auto" checkboxes are on (default on), and show active scanning/qmd maintenance in a global operation bar near the existing voice/spectrum HUD. Frees the File menu and Tools → Integrations → qmd-maint menu of duplicate/infrequent controls while keeping long-running work visible.

## Problem Frame

Today the two "cold" operations live in two different menus next to their cheap siblings:
- File menu: `Rescan Vault` (incremental) + `Full Rescan` (cold) - both always visible.
- Tools → Integrations → qmd-maint: `update`, `embed`, `re-embed` (full).

The cold ops are infrequent and easy to misfire. Auto-running the cheap incremental ops on load removes a manual step users do every session anyway. Long-running operations need a single global progress/status surface, because Admin is not where users should have to watch re-embedding or scanning. Net: fewer menu items, safer placement of destructive ops, visible background work, less ceremony per session.

## Scope

**In scope**
- Remove `Full Rescan` from File menu; keep `Rescan Vault` (incremental).
- Remove `re-embed` from Tools → qmd-maint; keep `update` + `embed`.
- Add `Full Vault Rescan` + `Full Re-embed` buttons to Admin modal, bottom-left of the `.admin-save-row`.
  - `Full Re-embed` renders **only when QMD is active** (`qmdStatus.state === "ready"`).
  - `Full Vault Rescan` always renders.
  - Both run only after the existing Admin save/discard confirmation has completed.
- Add an `auto` checkbox under each Tools-menu button (`update`, `embed`); default checked, persisted.
- On app load, when QMD is ready, auto-run whichever of update/embed has its checkbox on (once per page load).
- Add a global segmented operation bar near `#voice-status`, `#voice-spectrum`, and `#voice-hud` for rescan/full rescan, qmd update, qmd embed, and qmd re-embed.

**Out of scope**
- No server changes (all endpoints used already exist: `/api/rescan?full=true`, `/api/qmd/maintenance`). No new server-side progress streaming.
- No changes to the incremental `Rescan Vault` (File menu) or its handler.
- No progress UI inside the Admin modal for Full Re-embed; after confirmation the modal closes and progress appears in the global operation bar. The existing Tools → qmd-maint progress/status can remain as the detailed local surface.
- No rewording of other menu items or i18n refactors.
- No first-run onboarding work in this feature. Onboarding should later explain default-on qmd maintenance and possible CPU/disk usage for large vaults.

## Decisions

### D1. Admin modal button placement - bottom-left of `.admin-save-row`
The `.admin-save-row` is already the modal's bottom bar (flex, `justify-content: flex-end`). Change it to `justify-content: space-between` and prepend a left-aligned group `[Full Vault Rescan] [Full Re-embed]` before the status span. Save stays on the right. Minimal CSS delta; one shared bottom bar, no new rows.

**Why not a new row below Save:** Save is the bottom of the modal content area; a row below it drifts outside the visual chrome and needs new margins. The user explicitly asked for "bottom-left of the admin modal" - the save row IS the bottom.

### D2. Full Re-embed visibility gate = `qmdStatus.state === "ready"`
Only render the Full Re-embed button when QMD is installed AND a collection covers this vault AND embeddings exist. The `re-embed` op (`qmd embed -f`) is meaningless without a ready collection. Gate matches the existing pattern where `#qmd-maint` is shown only when qmd is available. The button is injected into the admin template at render time using the already-resolved `qmdStatus` closure; if qmd isn't ready at Admin open, the button simply isn't in the DOM.

### D3. Full Rescan click behavior - confirm Admin close, then run existing `rescan(true)`
`rescan(true)` already hot-swaps the graph. Reuse it, but do not start it until the Admin dirty-state flow completes. Change `hideModal()` to return `Promise<boolean>`: `false` when the user cancels or save fails, `true` after the modal closes. Click handler: `if (await hideModal()) void rescan(true);`. This preserves existing Admin save/discard protection.

### D4. Full Re-embed click behavior - confirm Admin close, then fire `startMaint(false, true, true)`
Same confirmation pattern: `if (await hideModal()) void startMaint(false, true, true);`. The maint job runs server-side; Tools → qmd-maint still updates via the existing poll loop, and the new global operation bar shows the same operation without requiring the Tools menu to stay open.

### D5. Auto checkboxes layout - column wrap under each Tools button
Current `.qmd-maint-btns` is a flat flex row of three buttons. Restructure to two columns, each holding a button + its `auto` label/checkbox stacked beneath. Remove the third button (`re-embed`) entirely from this group.

```html
<div class="qmd-maint-btns">
  <div class="qmd-maint-col">
    <button id="qmd-update">update</button>
    <label class="qmd-auto"><input type="checkbox" id="qmd-auto-update"> <span data-i18n="qmd.autoUpdate">auto update</span></label>
  </div>
  <div class="qmd-maint-col">
    <button id="qmd-embed">embed</button>
    <label class="qmd-auto"><input type="checkbox" id="qmd-auto-embed"> <span data-i18n="qmd.autoEmbed">auto embed</span></label>
  </div>
</div>
```

### D6. Persistence - two new prefs keys, default-on
- `akasha-qmd-auto-update` (default `"1"` = on)
- `akasha-qmd-auto-embed` (default `"1"` = on)

Use the existing `notOffFlag` reader pattern (value !== "0" → true) so absent key = default-on, matching the user's "selected by default" requirement without a special default path. Add to `KEY` map, the `Prefs` interface, and the `prefs.test.ts` inventory test (both keys written, both default-on when unset).

### D7. Auto-run trigger site - inside `refreshQmdStatus()`, once per load
Add a module-level guard `let autoMaintFired = false;` set true after the first fire. At the end of `refreshQmdStatus()`, after the status is known and `renderQmdSettings()` + `maybePromptSetup()` have run:
```
if (!autoMaintFired && qmdStatus.state === "ready") {
  autoMaintFired = true;
  const upd = prefs.getAutoUpdate();
  const emb = prefs.getAutoEmbed();
  if (upd || emb) void startMaint(upd, emb);  // incremental, no force
}
```
`refreshQmdStatus` already runs once per load via `integrationsLoaded.then(refreshQmdStatus)` and may re-run on rescan; the guard prevents repeat fires. Firing after `maybePromptSetup` keeps the one-time setup prompt authoritative for uncovered vaults (auto only fires when already `ready`).

### D8. Global operation bar - voice/spectrum HUD zone
Add a single global operation bar in the fixed bottom-center HUD zone next to `#voice-status`, `#voice-spectrum`, and `#voice-hud`. It should look like a segmented stamina/battery bar: one fill element over a divided track, using CSS divisions rather than many DOM nodes. Use determinate fill where the client already has signal and indeterminate/working fill where it does not:
- qmd embed/re-embed: use the existing pending-count logic from `refreshMaint()` (`maintMaxPending`, `pending`) to fill toward 100%.
- qmd update: show a small working/indeterminate fill because the endpoint does not expose total update work.
- rescan/full rescan: show a scanning label and indeterminate fill because `/api/rescan` returns only when done.

The global bar is a visibility surface, not a new job runner. It mirrors existing operations and hides when no operation is active.

## Implementation Units

### U1 - Prefs: add auto-update / auto-embed flags
**Files**
- `web/src/prefs.ts`
- `web/src/prefs.test.ts`

**Behavior**
- Add `autoUpdate: ${PREFIX}qmd-auto-update` and `autoEmbed: ${PREFIX}qmd-auto-embed` to `KEY`.
- Interface: `getAutoUpdate(): boolean`, `setAutoUpdate(v: boolean): void`, same for embed.
- Reader: `notOffFlag(get(KEY.autoUpdate))` (default true when unset).
- Writer: `set(KEY.autoUpdate, v ? "1" : "0")`.

**Tests** (`web/src/prefs.test.ts`)
- Inventory test: add both new keys to the `KNOWN_KEYS` array (or equivalent list) so the "writes only akasha-* keys" + "every key in inventory was written" tests cover them.
- New case: `default true; setAutoUpdate(false) writes "0" and reads back false; setAutoUpdate(true) writes "1"`. Same for embed.
- New case: `unset key → getAutoUpdate() === true` (default-on invariant).

### U2 - DOM: File menu + Tools menu + Admin modal markup
**Files**
- `web/index.html`
- `web/src/main.ts` (only the `openAdmin()` template literal)
- `web/src/style.css`

**Behavior**
- `web/index.html`:
  - Remove the `<button id="mi-rescan-full">…</button>` line (line 26) from the File menu.
  - In `#qmd-maint-btns`: replace the 3-button row with the 2-column layout from D5; delete `<button id="qmd-re-embed">`.
  - The `auto` checkboxes are `checked` by default in HTML (matches default-on prefs; prefs overrides on init).
- `web/src/main.ts` `openAdmin()`:
  - Change `.admin-save-row` template to prepend a left group: `<div class="admin-maint-actions">…</div>` containing `<button id="admin-rescan-full">${T("admin.rescanFull")}</button>` and (conditionally) `<button id="admin-reembed-full">${T("admin.reembedFull")}</button>` when `qmdStatus.state === "ready"`. Status span and Save button follow as today.
  - Wire `#admin-rescan-full` click → `if (await hideModal()) void rescan(true);`
  - Wire `#admin-reembed-full` click → `if (await hideModal()) void startMaint(false, true, true);`
  - Both handlers attached after `body.innerHTML = …` (same site as the existing `#admin-save` wiring).
  - Change `hideModal()` to return `Promise<boolean>` so callers can tell whether Admin actually closed. Existing callers can ignore the returned promise.
- `web/src/style.css`:
  - `.admin-save-row { justify-content: space-between; flex-wrap: wrap; gap: 8px; }` (was `flex-end`). At narrow widths, maintenance actions wrap above the status/Save controls instead of overflowing.
  - `.admin-maint-actions { display: flex; gap: 8px; }`
  - `.qmd-maint-col { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }`
  - `.qmd-auto { font-size: 0.8em; opacity: 0.8; display: flex; align-items: center; gap: 4px; }`
  - Existing `.qmd-maint-btns { display: flex; gap: 6px; }` stays (now wraps 2 columns instead of 3 buttons).

### U3 - Handlers: remove old, wire new, add auto-run
**Files**
- `web/src/main.ts`

**Behavior**
- Delete the `$("#mi-rescan-full").addEventListener("click", () => rescan(true));` line (~line 5373).
- Delete the `$("#qmd-re-embed").addEventListener("click", () => startMaint(false, true, true));` block (~lines 3620-3622) and its preceding comment line about re-embed.
- Add `let autoMaintFired = false;` near `qmdStatus` declaration.
- At end of `refreshQmdStatus()` (after `maybePromptSetup(); void refreshMaint();`), add the D7 auto-fire block.
- Wire the two auto checkboxes to persist on change:
  ```ts
  const cbUpd = $("#qmd-auto-update") as HTMLInputElement;
  const cbEmb = $("#qmd-auto-embed") as HTMLInputElement;
  cbUpd.checked = prefs.getAutoUpdate();
  cbEmb.checked = prefs.getAutoEmbed();
  cbUpd.addEventListener("change", () => prefs.setAutoUpdate(cbUpd.checked));
  cbEmb.addEventListener("change", () => prefs.setAutoEmbed(cbEmb.checked));
  ```
  Place this wiring right after the existing `$("#qmd-update")` / `$("#qmd-embed")` click handler block (~line 3619), inside the same init scope where `#qmd-maint` is already in the DOM.

### U4 - i18n: new labels
**Files**
- `web/src/i18n.ts`

**Behavior** - add to both `en` and `es` dictionaries:
- `admin.rescanFull` → `"Full Vault Rescan"` / `"Reescaneo completo de bóveda"`
- `admin.reembedFull` → `"Full Re-embed"` / `"Revectorización completa"`
- `qmd.autoUpdate` → `"auto update"` / `"auto actualización"`
- `qmd.autoEmbed` → `"auto embed"` / `"auto vectorización"`
- `ops.rescan` → `"scanning vault"` / `"escaneando bóveda"`
- `ops.fullRescan` → `"full vault rescan"` / `"reescaneo completo de bóveda"`
- `ops.qmdUpdate` → `"updating qmd"` / `"actualizando qmd"`
- `ops.qmdEmbed` → `"embedding qmd"` / `"vectorizando qmd"`
- `ops.qmdReembed` → `"re-embedding qmd"` / `"revectorizando qmd"`
- `ops.pending` → `"{count} pending"` / `"{count} pendientes"`
- Apply via `data-i18n` attributes on the new buttons and nested label spans (the admin modal uses runtime `T()` calls; use `T("admin.rescanFull")` there). For checkbox labels, put `data-i18n` on a nested `<span>` after the input so the existing i18n hydrator does not insert text before the checkbox.
- Keep `file.rescanFull` and `qmd.reembed` keys in place (cheap to leave; avoids chasing every reference). If a `grep` confirms they're now unreferenced after U2/U3, they may be removed - optional cleanup, not required.

### U5 - Global operation bar
**Files**
- `web/index.html`
- `web/src/main.ts`
- `web/src/style.css`
- `web/src/i18n.ts`

**Behavior**
- Add a hidden operation status block near the existing voice HUD markup, after `#voice-status` and before `#voice-spectrum`:
  ```html
  <div id="ops-status" class="hidden" aria-live="polite">
    <span id="ops-label"></span>
    <span id="ops-detail"></span>
    <div id="ops-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>
  </div>
  ```
- CSS places `#ops-status` fixed bottom-center in the same zone as `#voice-status`, `#voice-spectrum`, and `#voice-hud`, high enough not to overlap `#brand-stats`. `#ops-bar` uses a repeating-linear-gradient overlay for divisions and one fill span for the battery/stamina effect.
- Add a small helper in `web/src/main.ts`:
  ```ts
  type OpsStatus = { label: string; detail?: string; pct?: number; indeterminate?: boolean } | null;
  function setOpsStatus(status: OpsStatus): void { /* update text, width, classes, aria */ }
  ```
- `rescan(full)` calls `setOpsStatus({ label: T(full ? "ops.fullRescan" : "ops.rescan"), indeterminate: true })` before starting and clears it when the operation finishes or fails.
- `startMaint(update, embed, force)` records whether the current embed was forced so `refreshMaint()` can label it as re-embed while the client that started it is still alive.
- `refreshMaint()` updates `#ops-status` whenever qmd maintenance is running:
  - embed/re-embed uses the existing `maintMaxPending` percentage.
  - update uses `indeterminate: true` or the existing small working sliver.
  - when maintenance stops, clear `#ops-status` unless a rescan is currently active.
- Keep the existing `#qmd-maint-bar` in Tools. It remains the detailed status for users who open Integrations; the new bar is the global always-visible surface.

**Tests / checks**
- Add minimal DOM-helper coverage only if the existing test setup can exercise the helper without browser plumbing; otherwise keep this to manual verification.

## Key Technical Decisions Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Buttons share `.admin-save-row` (space-between) | "Bottom-left of admin modal" = the save row; minimal CSS |
| D2 | Full Re-embed gated on `qmdStatus.state === "ready"` | `qmd embed -f` meaningless without a ready collection |
| D3 | Full Rescan → `if (await hideModal()) rescan(true)` | Honors Admin save/discard confirmation before scanning |
| D4 | Full Re-embed → `if (await hideModal()) startMaint(false,true,true)` | Honors Admin save/discard confirmation; progress appears globally |
| D5 | Two-column `qmd-maint-btns` with `auto` checkbox under each | User-specified layout |
| D6 | Prefs default-on via `notOffFlag` | "Selected by default" with no special-case reader |
| D7 | Auto-run in `refreshQmdStatus()` with `autoMaintFired` guard | Fires once per load, only when qmd ready, after setup prompt |
| D8 | Global operation bar in voice/spectrum HUD zone | Long-running scan/qmd work stays visible after Admin closes |

## Risks & Mitigations

- **Auto-maint fires on every refresh of qmd status** - mitigated by `autoMaintFired` guard (D7). One fire per page lifetime.
- **Auto-maint costs CPU/disk on very large vaults** - accepted for this feature because auto-update/embed is default-on by product decision and can be toggled off. Future onboarding should explain this before first heavy embedding.
- **Auto-maint slows first paint** - `startMaint` is already async fire-and-forget; does not block graph render. The `/api/qmd/maintenance` POST returns immediately and polls; same as manual click today.
- **Admin changes lost when clicking Full Rescan/Re-embed** - mitigated by making Admin maintenance handlers await the existing save/discard confirmation before starting work.
- **Operation bar progress is approximate for update/rescan** - accepted. qmd embed/re-embed is determinate from pending counts; update and rescan use indeterminate status because existing endpoints do not expose totals.
- **i18n keys orphaned** (`file.rescanFull`, `qmd.reembed`) - harmless; optional cleanup noted in U4.
- **Checkbox state drift between HTML `checked` attr and prefs** - resolved by explicitly setting `cb.checked = prefs.get...` on init (U3), so prefs is authoritative regardless of the HTML default.

## Test Scenarios

### U1 - prefs
- `getAutoUpdate()` returns `true` when key unset (default-on).
- `setAutoUpdate(false)` → localStorage `akasha-qmd-auto-update === "0"`, `getAutoUpdate() === false`.
- Same round-trip for embed.
- Inventory test passes with the two new keys added.

### U2/U3 - DOM + handlers
- File menu no longer contains a Full Rescan item.
- Tools → qmd-maint shows exactly two buttons (`update`, `embed`), each with an `auto` checkbox beneath; `re-embed` is gone.
- Admin modal opens with `Full Vault Rescan` visible bottom-left.
- Admin modal shows `Full Re-embed` ONLY when qmd is ready (mock `qmdStatus.state` to `missing` → button absent; to `ready` → present).
- Clicking `Full Vault Rescan` in Admin closes the modal and shows the "Full rescan…" overlay.
- Clicking `Full Re-embed` in Admin closes the modal and triggers a POST to `/api/qmd/maintenance?embed=1&force=1`.
- If Admin has unsaved changes, clicking either Admin maintenance button runs only after the existing save/discard confirmation completes. Canceling the confirmation starts no operation.
- Old handlers (`#mi-rescan-full`, `#qmd-re-embed`) are absent; no console errors about missing elements (guard with `$("#...")` null-check is not needed because the elements no longer exist - the `addEventListener` calls are deleted too).

### U3 - auto-run
- On load with qmd ready + both checkboxes on: one POST to `/api/qmd/maintenance?update=1&embed=1` fires (once).
- Uncheck `auto update`, reload: only embed fires.
- Uncheck both, reload: no maint POST fires.
- qmd not ready (`state === "missing"`): no maint POST fires regardless of checkboxes.
- Triggering a rescan (which re-runs `refreshQmdStatus`) does NOT fire auto-maint again (guard holds).

### U4 - i18n
- Switch language to `es`: Admin buttons and auto labels render in Spanish where translated.

### U5 - operation bar
- `npm run dev` manual pass: rescan and full rescan show the global operation bar near the voice/spectrum HUD, then hide when complete.
- qmd update shows a working/indeterminate global operation bar.
- qmd embed/re-embed shows a segmented bar that fills as pending chunks decrease.
- Existing Tools → qmd-maint progress/status still works.
- Voice HUD/spectrum and operation bar do not overlap at desktop or narrow widths.

## Dependencies & Sequencing

- U1 (prefs) is independent - implement first; tests give a foundation.
- U4 (i18n) is independent - implement in parallel with U1.
- U2 (markup) depends on U4 keys for labels; the HTML can land before prefs is wired because defaults hold.
- U3 (handlers) depends on U2 (new DOM IDs present) and U1 (prefs methods).
- U5 depends on U4 labels and hooks into U3's rescan/startMaint paths.
- Suggested order: U1 + U4 in parallel → U2 → U3 → U5 → `npm test` + `npm run typecheck` + manual `npm run dev` pass.

## Verification

- `npm test` - prefs inventory + new cases green; existing scanner/server tests untouched.
- `npm run typecheck` - no new TS errors (deleted handlers don't leave dangling refs; new prefs methods typed).
- `npm run dev` manual pass:
  1. File menu: only `Rescan Vault` (incremental) present.
  2. Tools → Integrations → qmd-maint: 2 buttons + 2 auto checkboxes; no `re-embed`.
  3. Admin modal: Full Vault Rescan bottom-left; Full Re-embed appears only with qmd ready.
  4. Admin maintenance buttons honor save/discard confirmation before starting.
  5. On load with qmd ready: maint fires once (check Network tab for the POST) and the global operation bar appears.
  6. Toggle auto checkboxes, reload: behavior matches.
  7. Rescan/full rescan/qmd update/qmd embed/qmd re-embed all display in the global operation bar.

## Resolved Review Decisions

### From 2026-07-07 review

- **Admin dirty-state behavior:** Full Vault Rescan and Full Re-embed run only after the existing save/discard confirmation completes.
- **Default-on maintenance premise:** Auto update/embed remains default-on for QMD-ready users. Users can turn it off with the toggles. Future onboarding should warn about CPU/disk usage for large vaults.
- **Full rebuild discoverability:** Full Vault Rescan and Full Re-embed live only in the Admin modal. Progress visibility is handled by the global operation bar near the voice/spectrum HUD.
