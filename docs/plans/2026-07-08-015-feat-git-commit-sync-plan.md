---
title: Git Commit & Sync - Plan
type: feat
date: 2026-07-08
topic: git-commit-sync
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Git Commit & Sync - Plan

## Goal Capsule

- **Objective:** Add safe Git status, commit, and sync UX to Solaris's Admin modal, including fetch, fast-forward inbound updates, clean divergent merge commits, and push to the current branch's upstream.
- **Product authority:** User request in this session. Builds atop the existing read-only Git note-history feature (`2026-07-06-008-feat-git-note-versions-plan.md`).
- **Execution profile:** Server + frontend. Security-sensitive: all mutating routes are token-guarded; git commands run through `execFile`/`Runner` with no shell strings, no `--all`, no `git reset --hard`/`git checkout --`, no amend, no force push. Sync is a new explicit Git contract exception to the single-writer rule: a user-triggered, clean-tree repo operation may update vault files through Git using fast-forward or a normal merge commit on clean divergence.
- **Stop conditions:** Stop and ask before adding rebase, stash/unstash, manual conflict resolution, bisect, submodule support, commit message editing, or anything that modifies files outside Git sync's fetch/merge/push path. Stop before any automatic commit of scanner output (graph.json, data/).

---

## Product Contract

### Summary

Solaris already has read-only Git version history for individual notes in the reader. When the vault is inside a Git repo, the Admin modal should surface vault-level Git status: dirty/clean indicator, change counters, and action buttons to stage+commit and sync the current branch with its upstream. Commit messages are generated automatically, using OpenRouter when configured and a local summary fallback otherwise. Sync handles the safe common cases automatically: fetch, fast-forward inbound changes when the local branch is only behind, push local commits when the local branch is only ahead, create a normal merge commit when clean branches diverge, and abort failed conflict merges. The vault's `.gitignore` must be respected (no forced adds). The feature is purely optional: vaults without Git repos show nothing.

### Requirements

- **R1.** Admin modal shows a "Git" section with vault-level status (clean/dirty, created/modified/deleted counts) when the vault is in a Git repo.
- **R2.** Commit flow: one "Commit changes" button. Stages all changed files under the vault path (respecting `.gitignore`), generates a message, then commits. Reports success or failure inline.
- **R3.** Sync flow: one "Sync" button that requires a clean working tree, resolves the current branch's upstream, fetches it, fast-forward-merges when only behind, creates a normal merge commit when clean branches diverge, aborts on conflicts, then pushes local commits when needed. Never runs `git pull`, `git rebase`, or manual conflict resolution.
- **R4.** All mutating routes are token-guarded (`guarded` middleware). All git commands use `execFile` via `Runner`/`realRunner` with arg arrays.
- **R5.** No git state-changing commands outside the commit/sync endpoints and the documented Git contract exception. No `--all`, `git reset --hard`, `git checkout --`, `git commit --amend`, `git push --force`.
- **R6.** The "Git" section and its buttons update after each action (poll server for fresh status). Non-Git vaults show nothing and never fetch these endpoints.

### Key Flows

- **F1. View Git status in Admin.** Admin modal resolves the vault repo's status (dirty staged/untracked/changed files, branch name, ahead/behind counts). Renders a `.admin-section` with branch name, dirty/clean badge, change counters, commit and sync buttons. Non-Git vault → section absent entirely.
- **F2. Commit changes.** User clicks Commit. POST to token-guarded `/api/git/commit`. Server generates a message, stages vault-relative changed files (`git add -- <paths>`), and commits (`git commit -m <msg>`). Returns `{ ok: true }` or error. Admin refreshes status.
- **F3. Sync (fetch + merge + push).** User clicks Sync. POST to token-guarded `/api/git/sync`. Server refuses dirty trees, resolves the actual upstream, fetches it, computes ahead/behind, runs `git merge --ff-only <upstream>` when only behind, runs `git merge --no-edit <upstream>` when both ahead and behind, aborts failed conflict merges with `git merge --abort`, then runs `git push <upstream-remote> HEAD:<upstream-branch>` when ahead. Returns `{ ok: true, output: "..." }`. On failure returns `{ ok: false, error: "..." }` (dirty tree, conflict, no upstream).

### Acceptance Examples

- **AE1.** Vault with no `.git` repo → Admin modal shows no Git section.
- **AE2.** Vault with a Git repo and no changes → Git section shows "clean", branch name, ahead/behind. Commit button present but disabled if nothing changed.
- **AE3.** Modify a tracked file, open Admin → dirty status shown, modified count increments.
- **AE4.** Click Commit → server generates a message, stages paths under vault, commits, returns ok, Admin refreshes to clean.
- **AE5.** Click Sync with no upstream → error shown inline, no crash.
- **AE6.** Click Sync when local is behind upstream → fetch + fast-forward succeeds, output shown.
- **AE7.** Click Sync when local is ahead of upstream → push succeeds, output shown.
- **AE8.** Click Sync with divergent non-conflicting history → merge commit + push succeeds. Divergent conflicts abort and show an error with the working tree clean.
- **AE9.** POST to `/api/git/commit` or `/api/git/sync` without a valid token → 403.

### Scope Boundaries

**In scope**

- Admin-modal Git section: status, branch, dirty/clean, created/modified/deleted counters.
- Commit button with generated message (stages vault paths only).
- Sync button (fetch + fast-forward/merge + push; aborts on conflicts).
- Token guard on all new endpoints.
- Inline status refresh after each action.
- i18n strings for en + es.

**Deferred for later**

- Diff preview in Admin.
- Custom commit author date/name.
- Stash before sync / auto-stash.
- Manual conflict resolution.
- Rebase-based sync.
- Automatic commit on rescan.
- Git LFS, submodules, worktrees outside vault.

**Outside this product's identity**

- `--all` or `-A` staging of files outside vault path.
- `git reset --hard` or `git checkout --` to discard changes.
- Force push, amend, rebase, interactive commit.
- Server-side hooks or repo configuration.
- Git mutators outside these guarded endpoints.

### Sources and Research

- Existing read-only git adapter: `server/integrations/git.ts` (gitTopLevel, gitFileHistory, gitFileAtCommit).
- Contract update target: `AGENTS.md` conventions and `git.ts` architecture bullet (`CLAUDE.md` is only the symlink for Claude Code).
- Existing git route patterns: `server/app.ts` note-versions/restore endpoints (`~line 1532`), token-guard middleware pattern (`guarded` at line 226, `requireToken`).
- Existing test patterns: `gitFixture()` in `server/app.test.ts:302`, route tests lines 330-445.
- Existing Runner contract: `server/integrations/detect.ts` `Runner` type + `realRunner`.
- Existing admin modal pattern: `web/src/main.ts` `openAdmin()` (`~line 5877`), sections follow `.admin-section` with `<h3>` header.
- Existing i18n pattern: `web/src/i18n.ts` EN + ES dict blocks.
- Existing admin section with action buttons + status span: rescan/reembed at bottom of admin-save-row.
- External research: skipped — standard git porcelain, established local patterns.

---

## Planning Contract

### Key Technical Decisions

- **KTD1.** New functions in `server/integrations/git.ts`: `gitStatus(run, repoRoot, vaultPath)`, `gitStageAndCommit(run, repoRoot, vaultRelPaths, message)`, `gitSync(run, repoRoot)`. Keep the Runner injectable. The `gitStatus` helper returns `{ branch, upstream, ahead, behind, files: { path, status }[], clean }`.
- **KTD2.** Stage only files under the vault path within the repo. Use `git -C <repoRoot> add -- <vaultRelPaths...>` (respects gitignore). Never `git add .`, `git add -A`, or `git add --all`.
- **KTD3.** Sync = clean-tree check, resolve upstream (`@{u}` plus remote/merge config), `git fetch <remote>`, ahead/behind check, `git merge --ff-only <upstream>` when only behind, `git merge --no-edit <upstream>` when clean branches diverge, `git merge --abort` if that merge fails, then `git push <remote> HEAD:<branch>` if ahead. If the tree is dirty or fetch fails, return error and skip mutation beyond fetch. No `git pull`, no `--rebase`, no force push.
- **KTD4.** Two new routes: `POST /api/git/commit` (guarded, optional body `{ message }` for tests/manual calls) and `POST /api/git/sync` (guarded, empty body). `GET /api/git/status` is read-only and has no token guard.
- **KTD5.** Admin UI: new `<section class="admin-section">` between wikis and prompts. Shows branch badge, dirty badge, change counters, commit button, sync button. Status span for operation feedback. Non-Git vault → not rendered; `GET /api/git/status` returns `{ available: false }`.
- **KTD6.** Refresh pattern: after commit/sync success, re-fetch `GET /api/git/status` and re-render the section. Set a `data-git-refresh` attribute or use a simple `refreshGitSection()` function.
- **KTD7.** Update the repo contract in `AGENTS.md`: app-authored note writes still go through `write.ts`; user-triggered Git sync is the only sanctioned repo-level exception and lives in `git.ts`, token-guarded, clean-tree, fast-forward when possible, merge commit on clean divergence, abort on conflict, no checkout/reset/rebase/force.

### Directional Data Shape

```ts
// GET /api/git/status response
interface GitStatus {
  available: boolean; // false when vault has no git
  branch?: string;
  upstream?: string;
  clean?: boolean;
  ahead?: number;
  behind?: number;
  files?: { path: string; status: string }[]; // staged/untracked/modified
}

// POST /api/git/commit body
{ message?: string }

// POST /api/git/commit /sync response
{ ok: boolean; output?: string; error?: string }
```

### Assumptions

- `git` must be available. Detection uses the same path resolution as the existing `gitTopLevel` helper (through `realRunner`).
- The vault path is a directory inside a git worktree at or above the vault root. The existing `gitTopLevel(vaultRoot)` pattern applies.
- The current branch tracks an upstream. Resolve it dynamically; do not hard-code `origin`.
- `.gitignore` is respected implicitly by `git add -- <paths>`.

---

## Implementation Units

### U0. Update the Git write contract

- **Goal:** Make the sanctioned Git exception explicit before adding a route that can move HEAD and update vault files.
- **Requirements:** R3, R5.
- **Files:** `AGENTS.md`.
- **Approach:** Update the write-path convention and `git.ts` architecture bullet to say app-authored note writes still go through `write.ts`, while user-triggered Git sync is a separate guarded repo-level operation. Keep the allowed command set narrow: `fetch`, `merge --ff-only`, `merge --no-edit`, `merge --abort`, `push`, status queries, and commit. Keep reset/checkout/rebase/force/amend prohibited.
- **Verification:** Manual grep for the updated exception plus `npm run typecheck` after implementation.

### U1. Add git status, commit, and sync functions to git adapter

- **Goal:** Provide typed, injectable, safe git mutators for stage+commit and fetch+ff-merge+push, plus a status reader.
- **Requirements:** R2, R3, R4, R5.
- **Files:** `server/integrations/git.ts`, `server/integrations/git.test.ts` (new file for adapter tests).
- **Approach:**
  - Add `gitStatus(run, repoRoot, vaultRelPath)`: runs `git -C <repoRoot> status --porcelain=v1 -- <vaultRelPath>` and `git -C <repoRoot> rev-parse --abbrev-ref HEAD`, parses porcelain into branch + file list + clean flag. Resolve upstream with `git rev-parse --abbrev-ref --symbolic-full-name @{u}` and compute ahead/behind with `git rev-list --left-right --count HEAD...@{u}` when available.
  - Add `gitStage(run, repoRoot, vaultRelPaths)`: `git -C <repoRoot> add -- <paths...>`.
  - Add `gitCommit(run, repoRoot, message)`: `git -C <repoRoot> commit -m <message>`. The existing Runner has no stdin channel; use an argv message, not `-F-`.
  - Add `gitSync(run, repoRoot)`: refuse dirty working trees, resolve upstream, fetch the upstream remote/branch, compute ahead/behind, fast-forward merge if behind, normal merge if clean-diverged, abort failed conflict merges, push if ahead, and return combined output.
  - All functions return typed results. Reject empty/noop commits. Reject syncs that would not be ff.
- **Patterns to follow:** Existing `gitTopLevel`/`gitFileHistory` function signatures. Runner for process calls. `execFile` internally via Runner.
- **Test scenarios:** porcelain parsing for clean/dirty/modified/untracked; stage respects gitignore; commit writes object; sync fetch+ff succeeds when behind; sync push succeeds when ahead; sync refuses dirty tree; sync clean divergence merges and pushes; sync conflicting divergence aborts and leaves tree clean; empty message rejected; sync without upstream returns error; non-`origin` upstream works.
- **Verification:** `npm run typecheck && npm test -- server/integrations/git.test.ts`.

### U2. Add GET /api/git/status, POST /api/git/commit, POST /api/git/sync routes

- **Goal:** Expose git mutators as token-guarded HTTP routes, plus a read-only status endpoint.
- **Requirements:** R1, R2, R3, R4, R5.
- **Files:** `server/app.ts`, `server/app.test.ts`, `server/integrations/git.ts` (import new functions).
- **Approach:**
  - `GET /api/git/status`: resolve `vaultRoot → gitTopLevel`, call `gitStatus`, return JSON. No token guard (read-only). If no git repo → `{ available: false }`.
  - `POST /api/git/commit` (guarded, express.json): accepts optional `message`; when omitted, generate one from the change summary. Resolve vault root relative paths for files under vault, call `gitStage` + `gitCommit`. Return `{ ok: true }` or 400/500 error.
  - `POST /api/git/sync` (guarded): resolve repo and branch, call `gitSync`. Return `{ ok: true, output }` or `{ ok: false, error }` with appropriate HTTP status.
  - Import new functions at top of app.ts alongside existing git imports.
  - Mount routes near the existing note-version routes (post-restore section).
- **Patterns to follow:** Note-version route pattern (`guarded`, `express.json`, error handling with try/catch). `gitContextForNote`-style repo resolution but for the vault root itself.
- **Test scenarios:** non-git vault returns `available:false`; commit with token succeeds; commit without token 403; sync with upstream succeeds; sync without remote/tracking returns error; generated fallback message is used when no message is provided; status after commit shows clean; sync without token 403.
- **Verification:** `npm run typecheck && npm test -- server/app.test.ts`.

### U3. Add Git section to Admin modal

- **Goal:** Show vault git status, commit, and sync controls in the Admin modal.
- **Requirements:** R1, R6.
- **Files:** `web/src/main.ts`, `web/src/i18n.ts`, `web/src/style.css`.
- **Approach:**
  - In `openAdmin()`, after vault section and before wikis section, add a `<section class="admin-section" id="admin-git">`. Initially render a loading/muted text or empty placeholder.
  - Add `renderGitSection()`: calls `GET /api/git/status`. If `available: false`, set innerHTML to `""` (section hidden/removed). If available, render branch badge, clean/dirty badge, change counters, commit button, sync button.
  - Add `refreshGitSection()` called after commit/sync to re-fetch and re-render.
  - Wire commit button click: POST `/api/git/commit`, disable button during flight, flash status message.
  - Wire sync button click: POST `/api/git/sync`, show output in an inline `<pre>` result area, flash status.
  - Add i18n keys for "git", "gitBranch", "gitClean", "gitDirty", "gitCreated", "gitModified", "gitDeleted", "gitOther", "gitCommit", "gitSync", "gitSyncing", "gitCommitted", "gitSynced", "gitError", "gitNoRemote".
  - CSS: git section change counters use small colored pills. Buttons styled as `.maint-action-btn` or reuse `.ghost` pattern.
- **Patterns to follow:** `renderAdminWikis()` and `saveAdmin()` patterns for async fetch + DOM rebuild. `rescan(true)` or `startMaint()` patterns for button enabling/disabling during flight.
- **Test scenarios:** Manual checklist via `npm run dev` with a scratch git vault: status shows, commit creates object, sync fast-forwards and pushes, non-git vault shows no section.
- **Verification:** `npm run typecheck && npm run build`, then manual `npm run dev`.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Adapter unit tests | `npm test -- server/integrations/git.test.ts` | U1 |
| Route integration tests | `npm test -- server/app.test.ts` | U2 |
| Full test suite | `npm test` | U1, U2 regression |
| Type safety | `npm run typecheck` | U1, U2, U3 |
| Production build | `npm run build` | U3 |
| Manual web smoke | `npm run dev` | U3 (all flows) |

Manual checklist:

- Open Admin on vault with no `.git` → no Git section.
- Open Admin on git vault with clean status → shows branch, "clean" badge, commit button, sync button.
- Modify a tracked file → Admin shows dirty, modified count increments.
- Click Commit → success flash, section refreshes clean.
- Click Sync with remote → output shown, success or failure banner.
- Click Sync with no upstream → error shown, no crash, no file change.
- POST to commit/sync without token → 403.
- Switch to non-git vault → Admin shows no Git section.

---

## Definition of Done

- Git adapter exposes `gitStatus`, `gitStageAndCommit`, `gitSync` with typed returns and injectable Runner.
- `GET /api/git/status`, `POST /api/git/commit`, `POST /api/git/sync` routes exist with token guard on mutating endpoints.
- Admin modal shows a Git section with status, change counters, commit button, sync button.
- Non-Git vaults show no Git section, no errors.
- `npm test`, `npm run typecheck`, `npm run build` pass.
- No `git reset --hard`, `git checkout --`, `git commit --amend`, `git push --force`, or `--all` flag is introduced.
- Sync is fetch + fast-forward or clean merge only; conflicts return clear errors after `merge --abort` restores a clean working tree.
