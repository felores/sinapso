# Planning Task: URL Query Parameters For Direct Node Opens

You are one of four parallel Solaris planning orchestrators. Create an implementation-ready plan only. Do not implement code.

First, load the `ce-plan` skill if the tool is available. If the skill load fails, continue and report the failure.

## Output

Write one plan file:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-08-013-feat-url-node-query-plan.md`

Match the existing plan style in:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-07-011-refactor-rescan-reembed-admin-relocate-auto-maint-plan.md`

Use English in the plan. Keep it implementation-ready: goal, problem frame, in/out of scope, decisions, implementation units, tests/checks, risks, open questions. Prefer the smallest correct diff.

## Required Context To Load

Load these files by full path before planning:

- `/Users/felo/Documents/GitHub/solaris/CLAUDE.md`
- `/Users/felo/Documents/GitHub/solaris/web/index.html`
- `/Users/felo/Documents/GitHub/solaris/web/src/main.ts`
- `/Users/felo/Documents/GitHub/solaris/web/src/api.ts`
- `/Users/felo/Documents/GitHub/solaris/web/src/prefs.ts`
- `/Users/felo/Documents/GitHub/solaris/web/src/i18n.ts`
- `/Users/felo/Documents/GitHub/solaris/server/app.ts`
- `/Users/felo/Documents/GitHub/solaris/scanner/scan.ts`

Relevant anchors from initial triage:

- `web/src/main.ts:139-178` boots graph data and already reads `theme` query param.
- `web/src/main.ts:187-190` already reads `group` query param.
- `web/src/main.ts:1528-1613` is `openReader(n)`.
- `web/src/main.ts:2578-2722` is local search, results select nodes using `select(n, snippetText)`.
- `web/src/main.ts:4824-4837` shows how history navigation selects a node, updates focus set, flies camera, repaints, and opens reader without logging a fresh open.
- `web/index.html:30` has `#mi-copyfocus` labeled `Copy Link to Selected Note`.
- `server/app.ts:1618+` serves `/api/note?id=` using graph node ids as vault-relative note ids.

## User Intent

Add URL query parameters so external systems can link directly into Solaris and open a specific node. First important param: `node=<id>`. Use Solaris' own node id from graph/index, not qmd, because qmd is optional.

Desired behavior to plan:

- Loading `/?node=<encoded node id>` should select that graph node, focus/fly to it, and open the content panel.
- It should work after graph data and layout are ready, without racing physics/layout boot.
- If the node id is missing, phantom-only, or unknown, the app should ignore it or show a small non-blocking failure. Decide which is minimal and consistent.
- Existing params like `theme` and `group` must keep working.
- Existing copy-link behavior should likely produce a URL with `?node=<id>` for the selected note, preserving other safe query params when useful. Decide the minimal path.
- Avoid adding a router or backend endpoint unless there is a concrete need.

## Planning Constraints

- No qmd dependency.
- No new package.
- Prefer one tiny URL helper only if it materially improves tests. Otherwise keep code inline in `main.ts`.
- Include encoding/decoding details. Node ids can contain slashes and spaces, so use `URLSearchParams` and `encodeURIComponent` equivalent behavior.
- Include tests/checks: pure helper tests if a helper is introduced, plus `npm test`, `npm run typecheck`, `npm run build`, and manual browser URL smoke.

## Report Back In Final Message

At the end of your OpenCode run, include:

- Context loaded: each file and skill attempted, marked success or failure with error if failed.
- Execution: files loaded, tools invoked, decisions made, plan file written.
- Any open questions that should block implementation.
