# Mobile Search Bar + Rail Cleanup

**Type:** feat
**Depth:** lightweight
**Created:** 2026-07-08
**Status:** implementation-ready

## Goal

On mobile (when `.topbar-rail` is active), make the search bar a persistent bottom-anchored bar instead of the current hidden flyout. Move footer elements (voice status, ops status, voice spectrum, brand stats) above it. Remove the orphan Help rail button. Adjust the right rail bottom edge to stop above the search bar.

No new search logic or duplicate handlers. Preserve all desktop behavior.

## Problem Frame

Today when the viewport is narrow enough to engage `.topbar-rail`, the search bar becomes a hidden flyout: tap the rail search icon, get a popup. This is one tap too many for the primary action on mobile. Meanwhile, the bottom of the screen has transient footer elements (voice/ops status, voice spectrum, brand stats) that float at viewport center, plus four corner buttons. The bottom rail edge runs all the way down behind these elements.

The desired shape moves search to a persistent bottom bar with a solid `--panel` background, pushes the transient voice/ops/brand-stats above it, and stops the rail where the search bar starts.

## Scope

**In scope**
- Remove the Help button (`data-idx="4"`) from `#topbar-rail` in `web/index.html`
- When `.topbar-rail` is active, reposition `#search-wrap` from the hidden flyout to a fixed bottom bar (full width, `--panel` background, `--border` top border)
- When `.topbar-rail` is active, bump `#voice-status`, `#ops-status`, `#voice-spectrum`, `#voice-hud`, `#brand-stats` up by the bottom-search-bar height (~56px)
- When `.topbar-rail` is active, set `#topbar-rail` bottom to stop above the search bar (`bottom: 56px`)
- Keep the existing rail-mode behavior that hides the bottom corner buttons; their rail proxy buttons stay in `#topbar-rail` above the mobile search bar
- Disable the `.search-open` flyout toggle behavior in rail mode — the search is always visible at the bottom
- Clean up the rail search icon: it no longer toggles a flyout, instead focuses the already-visible search input

**Out of scope**
- Changing search functionality, handlers, API calls, or results rendering
- Duplicating `#search-wrap` or its children — reuse the existing DOM node
- Desktop layout changes
- Large `layoutTopbar()` rewrite. A tiny measurement fix is in scope so rail mode can exit correctly after search becomes fixed-width.
- Animation polish on transitions
- Touch-keyboard interactions (mobile keyboard showing/hiding the search bar)

## Decisions

### D1. `topbar-rail` is the mobile gate
The existing `.topbar-rail` class (set by `layoutTopbar()` when available width < chrome minimum) already triggers on mobile viewports. No new breakpoint or mobile-detection logic. The search bar CSS must target `#topbar.topbar-rail #search-wrap` because `#search-wrap` is nested inside `#topbar`, while footer/rail siblings use the existing `#topbar.topbar-rail ~ ...` selector pattern.

### D2. Reuse `#search-wrap` with CSS-only repositioning
When `.topbar-rail` is active, override `#search-wrap` from `visibility: hidden; pointer-events: none` to a `position: fixed; bottom: 0;` bar. The existing DOM, search input, mode buttons, voice toggle, scope controls, and results dropdown all move with it. No JS changes to search handlers needed.

### D3. Disable `.search-open` flyout in rail mode
Currently the rail search icon toggles `.search-open` which makes `#search-wrap` a positioned flyout. With a persistent bottom bar, `.search-open` has no meaning in rail mode. The rail search icon handler should skip the `.search-open` toggle and instead focus the input. The rail-mode CSS rules for `.search-open` flyout become dead CSS in rail mode.

### D4. Footer elements move up by `--mobile-search-h`
Set a `--mobile-search-h` CSS variable (56px) when `.topbar-rail` is active. Element stacks that currently anchor to `bottom: Npx` offset by this variable. The four corner buttons stay at the true bottom.

### D4a. Measure search's natural width before applying bottom-bar CSS
`layoutTopbar()` currently uses `#search-wrap.offsetWidth` to decide whether rail mode is needed. Once the rail CSS makes `#search-wrap` `position: fixed; left: 0; right: 0`, that `offsetWidth` becomes the viewport width and can make rail mode sticky. Before measuring `searchWrapW`, temporarily remove `.topbar-rail` from `#topbar`, measure the natural inline search width, then restore the class synchronously before continuing. This is a tiny measurement-only change, not a layout rewrite.

### D5. Remove Help rail button
`data-idx="4"` on the last `.rail-icon` in `#topbar-rail` opens a Help menu that does not exist as a desktop `.menu`. Help actions live inside File. Remove this button. The rail click handler loops through `menus[Number(btn.dataset.idx)]` — removing the button means no click path reaches `menus[4]` (which would be `undefined` and return early).

### D6. Results dropdown anchors above the bottom bar
In rail mode, `#search-results` currently positions at `top: 64px` relative to the flyout. When search is a bottom bar, results should open above the bar (bottom-anchored, opening upward). Position `position: absolute; bottom: 100%;` within `#search-wrap`.

## Implementation Units

### U1. CSS: mobile bottom search bar + footer reflow

**Files**
- `web/src/style.css`

**Behavior**
- Remove or override the rail flyout rules for `.search-open` when `.topbar-rail` is active — the search is always visible at the bottom
- Add new rail-mode bottom-bar rules:
  ```css
#topbar.topbar-rail #search-wrap {
    visibility: visible;
    pointer-events: auto;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    margin: 0;
    background: var(--panel);
    border-top: 1px solid var(--border);
    backdrop-filter: blur(8px);
    z-index: 26;
    padding: 8px 10px;
    gap: 6px;
    display: flex;
    align-items: center;
  }
  ```
- Set `--mobile-search-h: 56px` on `:root` when `.topbar-rail` is active (add via the existing `.topbar.topbar-rail ~` selector pattern, or via a CSS var set by JS in `layoutTopbar()`)
- Bump voice/ops/brand-stats above the bar:
  ```css
  #topbar.topbar-rail ~ #voice-hud {
    bottom: calc(14px + var(--mobile-search-h, 0px));
  }
  #topbar.topbar-rail ~ #voice-spectrum {
    bottom: calc(29px + var(--mobile-search-h, 0px));
  }
  #topbar.topbar-rail ~ #voice-status {
    bottom: calc(36px + var(--mobile-search-h, 0px));
  }
  #topbar.topbar-rail ~ #ops-status {
    bottom: calc(66px + var(--mobile-search-h, 0px));
  }
  ```
- Keep the existing rail-mode rules that hide the four bottom corner buttons; the matching rail proxy buttons remain visible above the search bar
- Bottom-anchor the search results above the bar:
  ```css
  #topbar.topbar-rail #search-results {
    position: absolute;
    bottom: 100%;
    top: auto;
    left: 0;
    right: 0;
    width: auto;
    max-height: 40vh;
    z-index: 26;
  }
  ```
- Shorten the rail to stop above the search bar:
  ```css
  #topbar.topbar-rail ~ #topbar-rail {
    bottom: var(--mobile-search-h, 0px);
  }
  ```

**Test scenarios** (manual — no frontend framework)
- Narrow viewport (< 640px): bottom search bar appears with modes, input, voice toggle, scope controls visible
- Voice/ops status text is above the search bar, not hidden behind it
- Search results dropdown opens upward, above the bar
- Rail icons clip above the search bar (bottom 56px)
- Desktop (wide viewport): unchanged behavior
- Search results dropdown works (type in bottom bar → results appear above)

### U2. Remove Help rail button + clean up search flyout toggle

**Files**
- `web/index.html`
- `web/src/main.ts`

**Behavior**
- `web/index.html`: Remove the Help button at line 239 (`<button class="rail-icon" data-rail="menu" data-idx="4" ...`)
- `web/src/main.ts`: In the rail click handler (line 5658-5663), when `kind === "search"`, skip the `.search-open` toggle. Instead, just focus the search input:
  ```ts
  } else if (kind === "search") {
    ($("#search") as HTMLInputElement | null)?.focus();
  }
  ```
  The `.search-open` class and its CSS rules can stay (harmless dead code) or be removed as optional cleanup.

**Test scenarios**
- Rail has no Help icon (4 menu icons: File, Layers, View, Tools)
- Clicking the rail search icon focuses the search input immediately instead of toggling a flyout
- All other rail buttons (mode, voice, reopen-content, filters, settings, reopen-research, File/Layers/View/Tools menus) work as before

### U3. JS: measure natural search width + set `--mobile-search-h`

**Files**
- `web/src/main.ts`

**Behavior**
- In `layoutTopbar()`, replace the direct `const searchWrapW = $("#search-wrap").offsetWidth;` read with a natural-width measurement that temporarily removes `.topbar-rail` if present:
  ```ts
  const topbar = $("#topbar");
  const wasRail = topbar.classList.contains("topbar-rail");
  if (wasRail) topbar.classList.remove("topbar-rail");
  const searchWrapW = $("#search-wrap").offsetWidth;
  if (wasRail) topbar.classList.add("topbar-rail");
  ```
  This prevents fixed bottom-bar width from feeding back into the rail threshold.
- After `const railW = rail ? 56 : 0;` and the existing CSS var assignments, add:
  ```ts
  const mobileSearchH = rail ? 56 : 0;
  root.style.setProperty("--mobile-search-h", `${mobileSearchH}px`);
  ```
- This is a single line addition. The value 56px matches the approximate height of the bottom search bar including padding. CSS consumes the var for bottom offsets.

**Test scenarios**
- Manual: narrow viewport invokes rail → `--mobile-search-h` set to 56px → voice/ops elements shift up
- Wide viewport → `--mobile-search-h` set to 0px → no layout change
- Wide viewport after resizing up from mobile → rail exits correctly because `searchWrapW` is measured in natural inline mode, not full viewport fixed mode

### U4. i18n: no new keys needed

No new i18n keys. The Help button removal does not affect i18n (it used a hardcoded `data-tip="Help"` with no `data-i18n` attribute). The search bar elements are already translated via existing `data-i18n`/`data-i18n-ph` attributes.

**Test scenarios**
- Language switch retains existing search translations
- No console errors or missing translation keys

## Key Technical Decisions Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | `.topbar-rail` gate | Reuses existing mobile detection; no new breakpoint |
| D2 | CSS-only repositioning of `#search-wrap` | Minimal diff; existing search JS works unchanged |
| D3 | Disable `.search-open` in rail mode | Redundant with persistent bar; simplifies UX |
| D4 | `--mobile-search-h` var for footer shift | Follows existing `--btn-left-inset` / `--rail-w` pattern |
| D4a | Natural-width search measurement | Prevents bottom-bar CSS from making rail mode sticky |
| D5 | Remove Help button entirely | No matching desktop menu; one fewer broken rail item |
| D6 | Results open upward | Bottom bar has no room below it |

## Risks & Mitigations

- **Search results positioning** — results currently use `position: absolute; top: calc(100% + 4px)`. When the search bar is at the bottom, this would render below the viewport. Mitigated by D6 (bottom-anchor results above the bar in rail mode).
- **Voice spectrum/status overlap with bottom bar** — the voice elements currently anchor to `bottom: 14px` etc. Adding `var(--mobile-search-h, 0px)` to the offset pushes them above the bar.
- **Rail bottom edge covers search** — the rail bottom is set to `--mobile-search-h` so it ends where the search bar begins.
- **Corner/proxy controls could overlap the search bar** — existing rail mode hides the real bottom corner buttons; shortening `#topbar-rail` keeps their proxy buttons above the search bar.
- **Search bar height mismatch** — if padding changes and the bar grows taller than 56px, the `--mobile-search-h` value needs updating. Mitigated by documenting the constant in code.

## Test Scenarios

### U1 (CSS)
- Narrow viewport: bottom search bar with `--panel` bg and `--border` top border
- Voice-status, ops-status, voice-spectrum, brand-stats above the search bar, not overlapped
- Rail bottom edge clips at the search bar's top edge
- Search results open upward, above the bar
- Desktop viewport: no changes from current behavior

### U2 (rail cleanup)
- No Help icon in rail (4 menu icons remain)
- Rail search icon focuses the input, does not toggle flyout
- No `.search-open` flash or state change on rail search click
- All other rail buttons work unchanged

### U3 (JS variable)
- Narrow viewport: `--mobile-search-h` = 56px in computed styles on `:root`
- Wide viewport: `--mobile-search-h` = 0px or absent

### Integration
- Search works end to end from the bottom bar (type → results → click note)
- Modes switch correctly from bottom bar
- Voice toggle works from bottom bar
- All menu operations from rail icons work
- Research panel opens and docks correctly
- `npm run typecheck` clean

## Dependencies & Sequencing

U1 and U2 are independent — implement in parallel. U3 depends on knowing the final search bar height from U1. Suggested: U2 first (quick DOM edit), then U1 (CSS), then U3 (JS variable). U4 (i18n check) is part of U2.

## Verification

- `npm run typecheck` — no new TS errors
- `npm run build` — production build succeeds
- Manual `npm run dev` pass with browser DevTools mobile viewport (375px width and 768px width):
  1. Bottom search bar visible on narrow viewport
  2. Voice/ops elements above the bar
  3. Rail ends above the bar
  4. Help icon absent
  5. Search works from bottom bar
  6. Desktop viewport shows no changes
- `npm test` — existing scanner and server tests stay green (frontend-only change)
