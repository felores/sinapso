# Planning Task: Configurable Inbox And Archive Note Action

You are one of four parallel Solaris planning orchestrators. Create an implementation-ready plan only. Do not implement code.

First, load the `ce-plan` skill if the tool is available. If the skill load fails, continue and report the failure.

## Output

Write one plan file:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-08-014-feat-inbox-archive-config-plan.md`

Match the existing plan style in:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-07-011-refactor-rescan-reembed-admin-relocate-auto-maint-plan.md`

Use English in the plan. Keep it implementation-ready: goal, problem frame, in/out of scope, decisions, implementation units, tests/checks, risks, open questions. Prefer the smallest correct diff.

## Required Context To Load

Load these files by full path before planning:

- `/Users/felo/Documents/GitHub/solaris/CLAUDE.md`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/config.ts`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/write.ts`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/write.test.ts`
- `/Users/felo/Documents/GitHub/solaris/server/app.ts`
- `/Users/felo/Documents/GitHub/solaris/server/app.test.ts`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/api.test.ts`
- `/Users/felo/Documents/GitHub/solaris/web/index.html`
- `/Users/felo/Documents/GitHub/solaris/web/src/main.ts`
- `/Users/felo/Documents/GitHub/solaris/web/src/style.css`
- `/Users/felo/Documents/GitHub/solaris/web/src/i18n.ts`

Relevant anchors from initial triage:

- `server/integrations/config.ts:57-71` has `SolarisConfig`, with `writeDestination` at line 63.
- `server/integrations/config.ts:117-139` default config currently sets `writeDestination: "inbox"`.
- `server/app.ts:241-300` exposes and saves integration config.
- `server/app.ts:1171-1205` creates notes via `/api/notes` using `cfg.writeDestination` by default.
- `server/integrations/write.ts` is the only sanctioned vault-write path. Archive/move functionality must live here, not in random server route code.
- `web/src/main.ts:2862-2871` has Admin config payload shape.
- `web/index.html:354-364` content panel first-row actions currently include reader prev/next, path, Open in Obsidian, dock, close.
- `web/index.html:340-343` has `#research-trash`, which deletes research history only. Do not alter its workflow.
- `web/src/main.ts:4783-4795` implements research trash history deletion.
- `web/src/main.ts:4798-4880` implements reader/content history and navigation.

## User Intent

Make Inbox and Archive first-class configurable folders in Admin, and add a content-panel archive action.

Desired behavior to plan:

- Admin modal should show two fields in the same row: Inbox folder and Archive folder.
- Inbox default remains `inbox`. Archive default should be `archive`, but user can set it to `Archivo` or any vault-relative folder name.
- Labels must be translation-ready: Inbox, Archive, helper text, action title/status messages.
- Existing note creation should keep using the configured Inbox folder.
- Add a trash-can-style icon to the content panel first row, to the right side near reader controls, that archives the currently open note.
- This content archive action is not the same as `#research-trash`. Leave research trash untouched.
- Archive action should move the note into the configured Archive folder in the least destructive way: no overwrite, path confinement, `.md` only, symlink-safe, journaled.
- After archive, UI should close the current reader or reopen the moved note only if that is clearly better. Decide the minimal behavior and document it.

## Planning Constraints

- Vault writes must stay inside `server/integrations/write.ts`. Add a helper there if needed.
- Do not add a second writer path.
- Do not delete note contents. Archive means move to archive folder, not research history delete.
- Handle filename collisions with numeric suffix, same spirit as `guardedCreate`.
- Avoid trying to update git here. Git behavior belongs to the Git plan.
- Include tests/checks: config merge/default tests, archive helper tests, route token/traversal tests, i18n/static wiring, `npm test`, `npm run typecheck`, `npm run build`.

## Report Back In Final Message

At the end of your OpenCode run, include:

- Context loaded: each file and skill attempted, marked success or failure with error if failed.
- Execution: files loaded, tools invoked, decisions made, plan file written.
- Any open questions that should block implementation.
