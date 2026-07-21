---
title: Wikilink Autocomplete - Plan
type: feat
date: 2026-07-21
topic: wikilink-autocomplete
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Wikilink Autocomplete - Plan

## Goal Capsule

- **Objective:** Typing `[[` in a writable Markdown editor immediately opens a keyboard-accessible list of real vault notes; filtering and selecting a note inserts a complete, resolvable `[[target]]` without leaving the editor.
- **Product value:** Creating explicit graph relationships becomes a fast writing action instead of requiring the user to remember exact note names or paths.
- **Depends on:** The CodeMirror 6 editor and byte-preserving document contract from plan 018, the in-memory graph loaded by `boot()`, and the scanner's existing path-first wikilink resolution.
- **Stop conditions:** Do not add a server route, semantic search, slash-command framework, note creation flow, persistent index, preference, or second editor implementation.
- **Open blockers:** None.

## Research Findings

- CodeMirror 6 provides the required interaction through `@codemirror/autocomplete`: typed activation, custom completion sources, built-in fuzzy filtering, keyboard navigation, ARIA listbox behavior, custom application transactions, and `validFor` result reuse.
- The package is already present transitively through the installed CodeMirror language packages, but importing it from application code requires declaring it as a direct dependency.
- `createNoteEditor()` is shared by four production surfaces: the reader, editable Inbox/vault notes in Research, read-only fetched articles, and editable working documents. Autocomplete must be option-driven so writable vault-aware surfaces can enable it while read-only articles remain unchanged.
- The active graph already contains the necessary candidate data (`GNode.id`, `title`, `phantom`) and is updated in place by `applyGraphUpdate()`. A callback from the editor to the current graph avoids a duplicate index and stale snapshots.
- The scanner resolves wikilinks by exact vault-relative path before basename. Inserting a vault-relative path without `.md` is deterministic even when multiple folders contain the same filename; inserting only a title or basename is not.
- Current click navigation falls back to a title-keyed basename map and does not resolve an exact path first. Path-based completions therefore require a small matching navigation correction so the newly inserted link opens the same node the scanner resolves.

### Sources

- `https://codemirror.net/examples/autocompletion/`
- `https://codemirror.net/docs/ref/#autocomplete`
- `web/src/editor.ts`
- `web/src/main.ts`
- `scanner/scan.ts`

## Product Contract

### Trigger and filtering

- R1. In a writable editor with vault candidates configured, typing `[[` opens the note list immediately; no minimum query length, network request, or explicit keyboard shortcut is required.
- R2. Characters typed after `[[` filter and rank candidates using CodeMirror's native fuzzy matching. Candidate rows show the note title and its vault-relative path so duplicate titles are distinguishable.
- R3. Completion remains active only for the current unclosed wikilink target on one line. It closes when the cursor leaves that range, the link closes, or the user enters heading/alias syntax (`#` or `|`).
- R4. Completion does not activate in YAML frontmatter, inline code, or fenced code, and is absent from read-only editors.
- R5. Phantom graph nodes never appear as candidates. The currently edited note may remain in the list; existing scanner behavior already ignores self-links, and silently hiding it would make similarly named notes harder to distinguish.

### Selection and insertion

- R6. Arrow keys move through results, Enter accepts, and Escape dismisses using CodeMirror's standard completion keymap. Tab keeps its existing editor behavior and is not rebound.
- R7. Mouse selection is supported by the standard completion list.
- R8. Accepting a result replaces the active `[[query` range with `[[vault/relative/path]]`, omitting `.md`, appends exactly one closing `]]`, and leaves the cursor after the link. Acceptance is one CodeMirror transaction, so one undo restores the pre-acceptance `[[query`; the edit flows through existing autosave unchanged.
- R9. Inserted links use exact paths for deterministic scanner resolution. The visible completion label remains the note title; no alias is inserted automatically.
- R10. Clicking a rendered wikilink normalizes the target by removing heading and terminal `.md` syntax, then resolves exact lowercase path, filename basename, optional legacy display title, and phantom target in that order. This matches scanner path/basename behavior while preserving links created against historical title-based UI behavior.

### Scope and lifecycle

- R11. Autocomplete is enabled in the main reader, editable Research vault/Inbox notes, and editable working documents. Fetched articles and any other read-only editor remain unchanged.
- R12. Each new completion session reads candidates from the current graph, so rescans, note creation, archive/removal, and live structural graph updates are reflected without remounting the editor. Working documents read the same current candidate list but do not update the vault graph when their separate document autosave runs.
- R13. Existing live preview, frontmatter protection, selection toolbar, AI assist, wikilink rendering, autosave, graph relayout, CRLF restoration, and byte-preserving document behavior remain unchanged.
- R14. The list inherits Sinapso theme variables, stays within the viewport on desktop and mobile, and does not conflict visually with the selection toolbar.

## Interaction Contract

```text
User types [[
      |
      v
CodeMirror completion source confirms:
- writable editor
- unclosed target on current line
- not frontmatter/code
      |
      v
getWikiLinkCandidates() reads current real graph nodes
      |
      v
Native fuzzy list: title + relative path
      |
      +-- Escape --> dismiss; document remains "[["
      |
      +-- Enter/click --> replace active range with
                          [[folder/note]]
                                   |
                                   v
                          normal onChange/autosave
```

## Planning Contract

### Key Technical Decisions

- KTD1. **Use CodeMirror's native autocomplete extension.** Add `@codemirror/autocomplete` as a direct dev dependency and use `autocompletion({ override: [...] })`; do not build a custom tooltip, focus manager, fuzzy matcher, or keyboard controller.
- KTD2. **Keep the editor generic and option-driven.** Add an optional `getWikiLinkCandidates` callback to `NoteEditorOptions`. Install autocomplete only when the callback exists, and have its source reject `context.state.readOnly` so `setReadOnly()` changes take effect without rebuilding the editor. The editor must not import graph/application state.
- KTD3. **Read graph state lazily.** The callback maps the current `data.nodes` at the start of a completion session and excludes phantoms. Return `validFor` so CodeMirror reuses that result while the user continues typing instead of rebuilding candidates on every character.
- KTD4. **Insert canonical path targets.** Candidate `target` is `GNode.id` without the terminal `.md`; `label` is `GNode.title`; `detail` is the target path. The completion's custom `apply` replaces the opener and query as one transaction with `[[${target}]]`.
- KTD5. **Let CodeMirror own filtering and interaction.** Use its native fuzzy ranking and default completion keymap. Do not add MiniSearch, qmd, semantic ranking, API calls, Tab acceptance, custom result virtualization, or a bespoke empty state.
- KTD6. **Respect Markdown syntax context.** The source recognizes only an unclosed same-line `[[target` immediately before the cursor and rejects frontmatter/code syntax-tree contexts. Alias and heading completion are separate future features.
- KTD7. **Resolve targets with scanner-equivalent normalization and ordering.** Normalize a clicked target by trimming it, removing any `#heading`, and removing a terminal `.md`; aliases are already excluded by the editor's wikilink parser. Add lowercase path-without-extension and filename-basename maps beside the existing title-keyed lookup, maintain them in `applyGraphUpdate()`, and preserve the scanner's first-file-wins behavior for duplicate basenames. Resolve exact path first, then filename basename even when the supplied path missed, then the existing title-keyed map as a legacy UI fallback, then `phantom:${normalized}`. Reuse this resolver for the delegated reader-body click handler rather than maintaining two resolution expressions.
- KTD8. **No localized copy is needed.** Rows contain note-owned title/path data and CodeMirror provides interaction semantics. If implementation introduces any app-owned label, status, or empty-state text, it must be added to both English and Spanish in `web/src/i18n.ts`.

### Directional API Contract

```ts
export interface WikiLinkCandidate {
  target: string; // vault-relative path without .md
  label: string;  // display title
}

export interface NoteEditorOptions {
  content: string;
  onChange?: () => void;
  onWikiLinkClick?: (target: string) => void;
  getWikiLinkCandidates?: () => readonly WikiLinkCandidate[];
  readOnly?: boolean;
  toolbarExtras?: ToolbarExtras;
}
```

These shapes are directional. Keep the final API smaller if CodeMirror's `Completion` type can remain internal without reducing testability.

## Implementation Units

### U1. Completion source and editor integration

- **Files:** `package.json`, `package-lock.json`, `web/src/editor.ts`, `web/src/editor.test.ts`.
- **Work:** Declare `@codemirror/autocomplete` directly. Add the optional candidate callback, a focused wikilink completion source, the native autocomplete extension, and standard completion keymap. Detect only the active unclosed target, reject protected/code contexts, and apply a complete path-based wikilink as one transaction.
- **Tests:** `[[` activates immediately; typing filters by title; Enter and click insert the exact path and one closing pair; Escape preserves source; one undo restores the pre-acceptance `[[query`; no activation outside the target, after `#`/`|`, in frontmatter/code, when initially or dynamically read-only, or without the callback; phantoms are absent when the supplied list excludes them; CRLF and existing round-trip tests remain green.

### U2. Live graph candidates and exact navigation

- **Depends on:** U1.
- **Files:** `web/src/main.ts`, focused pure/frontend tests if resolver extraction is warranted.
- **Work:** Supply one lazy candidate callback to the reader, editable Research vault-note editor, and editable working-document editor. Map current non-phantom graph nodes to title plus path-without-extension. Add and maintain exact lowercase path and filename-basename lookups across initial graph load and `applyGraphUpdate()`. Route both editor widget clicks and delegated `.wiki` clicks through one normalized scanner-equivalent resolver. Leave fetched article setup unchanged because it is read-only. Do not connect working-document autosave to vault graph refresh.
- **Tests:** Duplicate basenames in different folders produce separate rows and the selected exact path opens the intended node; case-insensitive exact paths resolve; a frontmatter title differing from the filename does not break filename-basename resolution; `[[path#heading]]` opens its base note; a missing exact path falls back to filename basename as the scanner does; basename-only, optional legacy title, and phantom links retain their fallback behavior; a graph update changes candidates in the next completion session without editor remount; archived/removed and phantom nodes are absent.

### U3. Theme and browser proof

- **Depends on:** U1-U2.
- **Files:** `web/src/style.css`, `tests/e2e/editable-reader.spec.ts`.
- **Work:** Add only the CSS needed to bridge CodeMirror's autocomplete classes to existing panel, foreground, muted, border, accent, and shadow variables. Verify clipping and stacking in docked/floating reader layouts and a `390x844` viewport. Do not create custom list markup.
- **Tests:** Browser test types `[[`, observes an accessible list, filters, selects a duplicate-safe path, verifies the exact Markdown through the editor/save boundary, and opens the rendered link. Exercise keyboard dismissal and assert zero browser diagnostics. Check one dark and one light theme; at `390x844`, assert the popup bounding box remains within the viewport and visible reader panel without overlapping fixed chrome.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Editor | `npm test -- --run web/src/editor.test.ts` | Trigger boundaries, insertion transaction, keyboard behavior, and editor regressions. |
| Type/build | `npm run typecheck && npm run build` | Direct dependency, completion API, and production bundling are valid. |
| Focused browser | `npm run test:e2e -- tests/e2e/editable-reader.spec.ts --grep "wikilink autocomplete"` | Real popup, filtering, selection, save/render/open loop, responsive placement, and diagnostics. |
| Full gate | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Repository release contract remains green. |

## Acceptance Examples

- AE1. Given a writable note, typing `[[` immediately opens real-note suggestions without a request to the server.
- AE2. Typing `[[clm` fuzzy-filters the list; selecting “Climatia roadmap” inserts `[[saas/climatia/roadmap]]` and positions the cursor after `]]`.
- AE3. Given `team/a/brief.md` and `team/b/brief.md`, both rows show their paths; selecting the second inserts `[[team/b/brief]]`, and clicking the rendered link opens `team/b/brief.md`.
- AE4. Pressing Escape after typing `[[road` closes the list and leaves `[[road` unchanged.
- AE5. Typing `[[` inside frontmatter, inline code, fenced code, or a read-only fetched article opens no list.
- AE6. After a rescan adds a note, opening a new completion session shows it without remounting or reloading the editor.
- AE7. In reader and editable Research vault-note surfaces, choosing a completion triggers the normal dirty/saving/saved lifecycle and the existing live structural graph update after autosave. In working documents it triggers only the existing document autosave. Autocomplete itself performs no write or graph mutation.

## Definition of Done

- `[[` autocomplete works immediately in every writable vault-aware editor surface and nowhere read-only.
- Results are local, fuzzy-filtered, keyboard/mouse accessible, themed, and duplicate-safe.
- Selection inserts one complete canonical path wikilink as one undoable edit.
- Exact path navigation, basename fallback, and phantom fallback agree with scanner behavior.
- Candidate sessions reflect the current graph without a new index, API, preference, or persistent state.
- Existing editor integrity, autosave, graph update, mobile layout, and browser diagnostic gates remain green.

## Supersession and Boundaries

- Extends plan 018's deferred cursor-context insertion behavior only for wikilinks; slash commands remain reserved and out of scope.
- Integrates with plan 022 only when a reader or Research vault-note save already uses the vault autosave/structural-link path. Working-document saves remain graph-independent. Autocomplete does not scan, save, or mutate the graph directly.
- Does not autocomplete aliases, headings, blocks, tags, people, attachments, or unresolved/new notes.
- Does not rank semantically, search note bodies, create notes from missing queries, or introduce `/` commands.
