# Planning Task: Git Commit And Sync UX

You are one of four parallel Solaris planning orchestrators. Create an implementation-ready plan only. Do not implement code.

First, load the `ce-plan` skill if the tool is available. If the skill load fails, continue and report the failure.

## Output

Write one plan file:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-08-015-feat-git-commit-sync-plan.md`

Match the existing plan style in:

`/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-07-011-refactor-rescan-reembed-admin-relocate-auto-maint-plan.md`

Use English in the plan. Keep it implementation-ready: goal, problem frame, in/out of scope, decisions, implementation units, tests/checks, risks, open questions. Prefer the smallest correct diff.

## Required Context To Load

Load these files by full path before planning:

- `/Users/felo/Documents/GitHub/solaris/CLAUDE.md`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/git.ts`
- `/Users/felo/Documents/GitHub/solaris/server/app.ts`
- `/Users/felo/Documents/GitHub/solaris/server/app.test.ts`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/detect.ts`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/write.ts`
- `/Users/felo/Documents/GitHub/solaris/server/integrations/config.ts`
- `/Users/felo/Documents/GitHub/solaris/web/index.html`
- `/Users/felo/Documents/GitHub/solaris/web/src/main.ts`
- `/Users/felo/Documents/GitHub/solaris/web/src/style.css`
- `/Users/felo/Documents/GitHub/solaris/web/src/i18n.ts`
- `/Users/felo/Documents/GitHub/solaris/docs/plans/2026-07-06-008-feat-git-note-versions-plan.md`

Relevant anchors from initial triage:

- `server/integrations/git.ts` currently has only read-only history helpers: `gitTopLevel`, `gitFileHistory`, `gitFileAtCommit`.
- `server/app.ts:956-965` creates git context for a note.
- `server/app.ts:1532-1613` exposes note version endpoints and restore via `guardedEdit` only.
- `server/app.test.ts:330-445` tests no-git, tracked note history, traversal rejection, restore without changing HEAD, and token guard.
- Repo convention says Git history restore must never run `git checkout/reset/revert` or move HEAD. This plan may explicitly update that contract for user-triggered Git sync only: clean tree, fetch, fast-forward only, push, no checkout/reset/rebase/force.
- `server/integrations/detect.ts` defines the `Runner` pattern used for execFile-style commands. Keep using runner/execFile, never shell strings.
- Admin modal lives in `web/src/main.ts` around the `openAdmin()` implementation.

## User Intent

If the vault/repository has Git, Solaris should make Git a first-class, user-friendly maintenance surface. User should not need to know much Git.

Desired behavior to plan:

- Detect Git repository and show Git status/actions in Admin.
- Make commit an important citizen: easy commit of vault changes with a useful default message and optional custom message.
- Add push and sync behavior that handles common cases automatically in the least destructive way.
- Sync should pull/fetch/push as appropriate without making the user choose in common clean cases.
- The system should avoid destructive operations and avoid silently solving conflicts in risky ways.
- If conflicts or unusual repo state occur, it should stop and explain the smallest next action rather than guessing.

## Planning Constraints

- No `git reset --hard`, no `git checkout --`, no force push, no amend.
- Use `execFile`/Runner only, never shell command strings.
- Do not stage files outside the vault root if the vault is a subfolder of a larger Git repo.
- Do not store credentials or tokens.
- Token-guard all mutating/spending routes.
- Keep note history restore behavior unchanged.
- Favor a small safe command set:
  - status: `rev-parse`, `status --porcelain=v1 -z`, branch/upstream/ahead-behind queries.
  - commit: stage vault path only, commit if dirty, no-op if clean.
  - sync: fetch, then fast-forward only when safe, push to existing upstream, stop on conflicts/divergence/unknown upstream.
- Document exactly which cases are auto-resolved and which cases are surfaced to user.
- Include tests/checks with temp git repos and bare remotes: clean repo, dirty commit, push to upstream, behind fast-forward, diverged/conflict stops safely, no-git unavailable, token guard.

## Report Back In Final Message

At the end of your OpenCode run, include:

- Context loaded: each file and skill attempted, marked success or failure with error if failed.
- Execution: files loaded, tools invoked, decisions made, plan file written.
- Any open questions that should block implementation.
