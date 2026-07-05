---
title: Topbar Z-Index Flip and Left-Panel Collapse Mirror - Plan
type: feat
date: 2026-07-05
topic: topbar-zindex-collapse-mirror
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Topbar Z-Index Flip and Left-Panel Collapse Mirror - Plan

## Goal Capsule

- **Objective:** Raise the topbar (menu + search/buttons) above all panels, and make a docked left panel trigger the same row-2 collapse that a docked right panel already triggers.
- **Product authority:** Felo's personal Solaris tool. Feature-tier: refines the existing topbar and docked-panel UX.
- **Open blockers:** None. Implementation-ready. Z-index overlay accepted; collapse mechanic confirmed centered-then-jump.
- **Execution profile:** Code, manual UI verification (no frontend test framework).
- **Tail ownership:** implementer owns the build; `harness-verify` before commit per AGENTS.md.

## Product Contract

*Product Contract unchanged from brainstorm. One implementation unit (U1) added below. Independent of Plan 004's regions; runs after Plan 004 per the user's no-conflict-parallelization call.*

### Summary

The topbar (menubar plus search field and mode/voice buttons) is raised above all docked and floating panels so it is never obscured. And a docked left panel, when expanded rightward into the centered menu, now triggers the same row-2 collapse as the right panel: the menu jumps to the right of the panel and the search/buttons wrap below it.

### Problem Frame

Two annoyances sit in the topbar today. First, docked panels (`z-index: 20`) paint over the topbar (`z-index: 10`), so when a panel is open the menu and search can be partly hidden behind it. Second, expanding a docked right panel leftward correctly pushes the search into the menu and wraps it to row 2, but expanding a docked left panel rightward does nothing. The asymmetry lives entirely inside `layoutTopbar()`, which feeds left-panel width only to the corner-button insets, never to the collision math.

### Key Decisions

- **Topbar above all panels.** Raise the topbar's `z-index` above docked panels (20); floating panels (5) already sit below. Dropdowns (50) and the modal (100) stay above the topbar. Overlay of a docked panel's top band is accepted; the top of a docked note is near-empty (user-verified).
- **Centered-then-jump, not continuous slide.** The left-panel collapse keeps the menu centered until contact, then jumps it to right-of-panel. Intentionally discontinuous, not the symmetric mirror of the right side's continuous slide.
- **Fix localized to `layoutTopbar()` and `z-index` values.** The resize wiring is already symmetric (a `MutationObserver` watches both panels); only the collision math and the `z-index` values change.

### Requirements

- R1. The topbar (menu + search/buttons) renders above every panel, docked and floating, so the menu and search are never obscured by a panel.
- R2. While a left panel is docked and its right edge has not reached the centered menu's left edge, the menu remains centered and the search stays in row 1 (current behavior preserved).
- R3. When the left panel's right edge reaches the menu's left edge, the menu jumps to sit just right of the panel and the search/buttons wrap to row 2 below the menu.
- R4. The collision detection for the left side is computed inside `layoutTopbar()` alongside the existing right-side logic, so a panel crowding the menu from either side resolves to the same `search-stacked` outcome.
- R5. The collapse is reactive to live drag: dragging the left panel's resize handle updates the menu/search position in real time via the existing observer-driven `relayout()`.

### Key Flows

- F1. Topbar render order.
  - **Trigger:** any panel docks, floats, or resizes; page load.
  - **Actors:** `web/src/style.css` z-index, `layoutTopbar()`.
  - **Steps:** the topbar's z-index stays above panel z-index in every panel state.
  - **Outcome:** menu and search are always visible and clickable above panels.
- F2. Left-panel collapse.
  - **Trigger:** left panel docks or its width changes during drag.
  - **Actors:** `layoutTopbar()`, `relayout()`.
  - **Steps:** compute whether the panel's right edge has reached the centered menu's left edge; if not, leave the menu centered and the search in row 1; if yes, jump the menu to right-of-panel and toggle `search-stacked`.
  - **Outcome:** the search wraps to row 2 exactly when the left panel crowds the menu.

### Acceptance Examples

- AE1. Topbar above docked panel.
  - **Given** a docked right panel that today overlays the search field.
  - **When** the change ships, the search field and menu paint on top of the panel, not behind it.
  - **Covers R1.**
- AE2. Left panel, no contact.
  - **Given** a docked left panel narrow enough that its right edge is left of the centered menu.
  - **Then** the menu stays centered and the search remains in row 1.
  - **Covers R2.**
- AE3. Left panel contact during drag.
  - **Given** the user drags the left panel's right edge rightward.
  - **When** the edge reaches the menu's left edge, the menu jumps to the right of the panel and the search wraps to row 2.
  - **Covers R3, R5.**
- AE4. Right-side regression.
  - **Given** a docked right panel expanded leftward into the search.
  - **Then** the search wraps to row 2 as it does today, with no regression.
  - **Covers R4.**

### Scope Boundaries

- **Deferred for later:** a continuous-slide mirror of the right-side behavior (the discontinuous jump was chosen instead); any redesign of the topbar layout system.
- **Outside this feature:** changes to the panel resize-handle mechanics; changes to what the menus contain.

### Sources / Research

- Verified grounding dossier: `/tmp/compound-engineering/ce-brainstorm/audio-spectrum-footer-2026-07-05/topbar-grounding.md`. Key code: `layoutTopbar()` at `web/src/main.ts:3787-3828` (collision math at `:3820-3827`, asymmetric: `rightPanelW` feeds it, `leftPanelW` does not); `--right-inset` set at `main.ts:3806`, consumed at `style.css:246`; `menu-centered` toggled at `main.ts:3807`, CSS at `style.css:253-258`; `search-stacked` CSS at `style.css:259-268`; z-index values at `style.css:94` (topbar 10), `:606` and `:1353` (docked panels 20), `:625` and `:1375` (floating 5), `:143` (dropdowns 50), `:192` (modal 100); the symmetric `MutationObserver` on both panels at `main.ts:5153-5158` driving `relayout()` at `:5148-5152`.

## Planning Contract

### Key Technical Decisions

- KTD1. **Minimal z-index bump, not a scale restructure.** Raise `#topbar` from 10 to 25 (above docked panels at 20, below dropdowns at 50 and the modal at 100). Floating panels already sit at 5 and are untouched. One-line change.
- KTD2. **Centered-then-jump via a state class, not continuous slide.** Add a `menu-jumped-right` class on `#topbar`. CSS positions `#nav-group` at `left: calc(var(--btn-left-inset, 0px) + 18px)` when that class is on, overriding the `menu-centered` centering. In `layoutTopbar()`, compute the left-collision and toggle both `menu-jumped-right` and the existing `search-stacked`.
- KTD3. **Feed `leftPanelW` into the collision math.** The existing `collides` check (`main.ts:3826`) only uses `rightPanelW` on the search side. Add a left-collision check: when `leftDocked`, the panel's right edge (`leftPanelW`) reaches the centered menu's left edge (`vw/2 - groupW/2`). At contact, toggle the jump and the stack.

### High-Level Technical Design

Topbar collapse states:

```mermaid
stateDiagram-v2
  [*] --> Default
  Default: menu at left PAD, search row 1
  Default --> MenuCentered: left panel docks, no contact
  Default --> RightStacked: right panel grows into search
  MenuCentered: menu centered, search row 1
  MenuCentered --> Jumped: left panel touches menu
  RightStacked: search stacked row 2
  Jumped: menu right-of-panel, search stacked row 2
```

### Sequencing

Single unit. Independent of Plan 004's regions (topbar vs bottom-center). Runs after Plan 004 per the user's no-conflict-parallelization call; no shared edit regions with Plan 004.

## Implementation Units

### U1. Topbar z-index flip and left-panel collapse mirror

- **Goal:** Topbar paints above all panels; a docked left panel crowds the menu the same way a docked right panel does.
- **Requirements:** R1, R2, R3, R4, R5.
- **Dependencies:** none within this plan.
- **Files:** `web/src/style.css` (`#topbar` z-index at `:94`; new `#topbar.menu-jumped-right #nav-group` rule near `:253-268`), `web/src/main.ts` (`layoutTopbar()` at `:3787-3828`: add left-collision detection and toggles). No test file - frontend has no test framework.
- **Approach:** Bump `#topbar` z-index `10 -> 25`. In `layoutTopbar()`, after the existing right-side collision logic, add: if `leftDocked` and `leftPanelW + PAD > vw/2 - groupW/2` (panel reached the centered menu), toggle `menu-jumped-right` and `search-stacked`; otherwise preserve the current `menu-centered` behavior. Add CSS: `#topbar.menu-jumped-right #nav-group { position:absolute; left: calc(var(--btn-left-inset, 0px) + 18px); top:50%; transform: translateY(-50%); }` to jump the menu to right-of-panel. Ensure both classes clear on undock.
- **Patterns to follow:** the existing `menu-centered` and `search-stacked` CSS rules (`style.css:253-268`); the existing `collides` toggle pattern in `layoutTopbar()` (`main.ts:3826-3827`).
- **Test scenarios:** (manual - no frontend framework)
  - Covers AE1: dock a right panel that today overlays the search; confirm the search paints above the panel now.
  - Covers AE2: dock a narrow left panel; menu stays centered, search row 1.
  - Covers AE3: drag the left panel's right handle rightward; on contact with the menu, the menu jumps right-of-panel and the search wraps to row 2.
  - Covers AE4: dock and expand the right panel; the search wraps to row 2 as before (regression check).
  - Both panels docked and crowding: confirm no broken layout.
  - Undock: confirm both classes clear and the layout returns to default.
- **Verification:** menu and search always visible above panels across the full dock/float/resize range; right-side collapse unchanged; `npm run typecheck` clean.

## Verification Contract

- `npm run typecheck` (`tsc --noEmit`).
- `npm test` - no regression in scanner/server tests.
- Manual: `npm run dev`, exercise each AE by dragging both panels through their full ranges.
- Trust-model negatives untouched; keep `server/app.test.ts` and `server/integrations/*.test.ts` green.

## Definition of Done

- **Global:** `npm run typecheck` clean; `npm test` green; right-side collapse unchanged (regression-safe).
- **U1:** topbar above all panels in every dock/float state; left-panel centered-then-jump collapse works under live drag; both-panels case not broken.
- **Cleanup:** no dead CSS or JS left in the diff.
