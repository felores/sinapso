# Planning Task: Mobile Search And Right Rail

You are one of four parallel Solaris planning orchestrators. Create an implementation-ready plan only. Do not implement code.

First, load the `ce-plan` skill if the tool is available. If the skill load fails, continue and report the failure.

## Output

Write one plan file:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-08-012-feat-mobile-search-rail-plan.md`

Match the existing plan style in:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-07-011-refactor-rescan-reembed-admin-relocate-auto-maint-plan.md`

Use English in the plan. Keep it implementation-ready: goal, problem frame, in/out of scope, decisions, implementation units, tests/checks, risks, open questions. Prefer the smallest correct diff.

## Required Context To Load

Load these files by full path before planning:

- `/Users/felo/Documents/GitHub/solaris/CLAUDE.md`
- `/Users/felo/Documents/GitHub/solaris/web/index.html`
- `/Users/felo/Documents/GitHub/solaris/web/src/style.css`
- `/Users/felo/Documents/GitHub/solaris/web/src/main.ts`
- `/Users/felo/Documents/GitHub/solaris/web/src/i18n.ts`
- `/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-05-006-feat-responsive-topbar-rail-plan.md`
- `/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-05-005-feat-topbar-zindex-collapse-mirror-plan.md`

Relevant anchors from initial triage:

- `web/index.html:191-216` has the single shared `#search-wrap`, mode buttons, search input, scopes, voice button, browse button, results.
- `web/index.html:219-240` has `#topbar-rail`. The last rail button is `data-idx="4"` Help, but desktop only has four `.menu` groups. Help actions live inside File.
- `web/index.html:251-265` has bottom corner buttons, `#voice-status`, `#ops-status`, `#voice-spectrum`, `#voice-hud` counters.
- `web/src/style.css:447-541` defines search positioning, rail mode, and rail search flyout.
- `web/src/style.css:708-837` defines bottom corner buttons, counters, voice spectrum/status, operation status.
- `web/src/style.css:1295-1399` defines integration mode search controls.
- `web/src/main.ts:4052-4153` is `layoutTopbar()` and decides `.topbar-rail`.
- `web/src/main.ts:5619-5664` proxy-clicks rail buttons into menus, modes, voice, search, panel reopen, filters, settings.

## User Intent

Mobile menu is currently broken. The middle rail buttons work, upper buttons are a mess because they proxy desktop components. On mobile, search should become a first-class persistent bottom bar instead of a hidden desktop flyout.

Desired shape:

- Use the existing search bar/components if possible. Do not duplicate search logic.
- On mobile, `#search-wrap` should live persistently at the bottom of the screen with a solid background matching the right rail (`var(--panel)`, `var(--border)`, blur as appropriate).
- The footer counters, voice spectrum, voice status, and operation status should move above the bottom search bar.
- Rail buttons related to search box modes can disappear on mobile if the persistent bottom search already includes those controls.
- Right rail should start at the upper border of the bottom search bar, not run behind it.
- Remove the extra Help rail item. It is not a desktop menu, so it should not exist in the rail.
- Preserve desktop behavior unless explicitly mobile/rail-related.

## Planning Constraints

- Do not create a second search input or duplicate handlers.
- Prefer CSS/layout changes plus small rail handler cleanup over new architecture.
- Keep accessibility basics: labels remain, focus works, search is reachable, no hidden interactive controls steal tab focus on mobile.
- Mention mobile viewport verification using real browser tooling, e.g. desktop plus at least one phone width.
- Include likely tests/checks: `npm test`, `npm run typecheck`, `npm run build`, and browser smoke with mobile viewport if implemented later.

## Report Back In Final Message

At the end of your OpenCode run, include:

- Context loaded: each file and skill attempted, marked success or failure with error if failed.
- Execution: files loaded, tools invoked, decisions made, plan file written.
- Any open questions that should block implementation.
