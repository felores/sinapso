---
title: Manual Inbox Review Advisory Cards - Plan
type: feat
date: 2026-07-18
topic: manual-inbox-review
roadmap_id: RM002
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Manual Inbox Review Advisory Cards - Plan

## Goal Capsule

- **Objective:** Add an explicitly triggered Inbox Review that turns conservative local signals into advisory cards the user can approve, dismiss, or comment on without any unattended note mutation or spending.
- **Product authority:** `STRATEGY.md`, `PRODUCT.md`, `ROADMAP.md` RM002, and the 2026-07-18 planning decisions.
- **Dependency:** RM001 must be delivered. Review reads the durable Inbox collection and relies on path+hash identity and single-editor ownership.
- **Stop conditions:** No schedule, startup scan, badge pressure, background mutation, automatic LLM call, hard delete, or second vault writer.
- **Open blockers:** None after RM001.

## Product Contract

### Summary

Inbox Review is a button, not a daemon. Clicking **Review Inbox** computes a bounded set of local suggestions from the current configured Inbox and displays them inline in the research panel. Each card explains one proposed action and waits for the user.

The initial version favors conservative, explainable signals over speculative AI judgment. Wiki ingest may invoke the existing thinker-tier proposal only after the user chooses Ingest and remains approval-gated. Generating the review itself never spends money or sends content off-device.

### Requirements

**Trigger and presentation**

- R1. A `Review Inbox` button appears in the Inbox collection header. It is disabled only while the Inbox list is loading or a review request is already running.
- R2. Clicking it fetches a fresh review snapshot. No review runs on startup, timer, file change, agent action, or panel open.
- R3. Results render inline in the research panel as an accessible list of advisory cards. Do not introduce a modal or reuse the bounded activity-card toast stack.
- R4. Each card shows note title/path, a concise local reason, proposed action, relevant target when known, and Approve, Dismiss, and Comment controls.
- R5. Empty review teaches the state: the Inbox is empty or no conservative suggestions were found; it never implies an LLM inspected the notes.

**Deterministic local suggestions**

- R6. `continue` is suggested only for explicit unfinished signals: unchecked tasks, TODO/FIXME markers, or a terminal heading with no following body.
- R7. `link` is suggested when a note has no link to a locally known high-confidence related note. Prefer an existing cached semantic neighbor; otherwise no link card is emitted.
- R8. `merge` is suggested only for exact normalized-title collisions or a locally cached semantic similarity of at least 0.90. Exact content duplicates produce Archive-duplicate cards instead of Merge cards. The reason names the matching signal and proposed target.
- R9. `archive` is suggested only for empty/whitespace-only notes or an exact duplicate whose retained counterpart is named. Age alone is never an archive reason.
- R10. `ingest` is available as a manual action on every Inbox note when an enabled wiki exists, but the local review does not pretend it can choose the correct wiki or derived structure automatically.
- R11. If local vectors/semantic cache are unavailable or stale, link/semantic-merge cards are omitted; Review still returns deterministic text signals.

**Card state**

- R12. Card identity is deterministic over `{notePath, noteHash, action, targetPath?, targetHash?}`. A source or target content change produces a new identity and invalidates the old pending decision.
- R13. App-local state persists in a bounded runtime file under `data/`, not in the vault. States are `pending`, `dismissed`, and `approved`; an optional comment belongs to the same card.
- R14. Adding or editing a comment does not mutate the note and leaves the card pending unless it was already dismissed/approved.
- R15. Dismiss hides that exact card identity across Review runs. It does not suppress a new suggestion after the note or target changes.
- R16. Approved records store action time and resulting path(s), then render as completed history for the current review. State is advisory audit metadata, not a source of truth for note content.
- R17. The state store is pruned to the newest 500 records and tolerates a missing/corrupt file by starting empty without affecting notes.

**Approval and mutation**

- R18. `continue` approval performs no write; it opens the note in the research-panel Inbox editor under RM001 ownership rules.
- R19. `link` approval shows the proposed wikilink and requires the card’s source hash to still match before calling a `write.ts` helper. Existing links remain idempotent.
- R20. `merge` approval first shows the complete combined Markdown preview. The target is the proposed collision/similarity match. The pure merge keeps the target bytes first, keeps only the target frontmatter, strips source frontmatter and one leading source H1 that matches its title, then appends `## Merged from <source title>` plus the remaining source body. It uses the target's existing CRLF/LF style and exactly one blank line around the appended section. Apply replaces the target using its expected hash and leaves the source note untouched; archiving the source is a separate decision.
- R21. `archive` approval uses `guardedMove()` and checks the reviewed source hash before moving. Archive is never a delete.
- R22. `ingest` approval first selects a wiki, then uses the existing `/api/wiki-ingest/propose` and `/api/wiki-ingest/apply` flow. The proposal may spend only after this explicit choice, and apply still requires explicit approval.
- R23. Every mutating approval revalidates source and target hashes. A changed note moves the card to a stale state with Refresh; it is not force-applied.
- R24. The frontend blocks review mutations for a note it currently owns in `dirty`, `saving`, `conflict`, or `error` state. Continue may focus it; other actions explain the block. This is an interaction guarantee, not a distributed server lock: server hash-CAS remains authoritative, and a concurrent external mutation makes the open editor conflict on its next save.
- R25. Successful actions refresh Inbox and search state immediately. Actions that move a visible note obey RM001 editor teardown, pin clearing, and destination-open rules.

**Trust and accessibility**

- R26. Review generation is local and read-only. It makes no Exa, OpenRouter, hosted search, qmd LLM-expansion, or Git call.
- R27. All mutations remain token-guarded, path-confined, journaled, and implemented inside `server/integrations/write.ts` or the existing wiki-ingest apply path.
- R28. Cards use list semantics, visible keyboard focus, descriptive labels, polite status updates, and English/Spanish copy.
- R29. Dismiss/comment/approval state is not inserted into note frontmatter or Markdown.

### Acceptance Examples

- AE1. Review is never requested until the user clicks the button. Opening Inbox, restarting the app, and waiting do not create cards or call an external provider.
- AE2. A note containing `- [ ] send proposal` produces a Continue card that explains the unchecked task. Approve opens it and writes nothing.
- AE3. An orphan note with a cached high-confidence neighbor produces a Link card. Approve appends the shown wikilink only after hash revalidation.
- AE4. Two exact-content duplicates produce Archive-duplicate cards naming the retained counterpart, not Merge cards. No age-only Archive card is generated.
- AE5. Approving Merge shows the deterministic combined target preview with one target frontmatter block, one `Merged from` heading, the target's line-ending style, and no duplicate source H1; it updates only the target and leaves the source intact.
- AE6. Dismissing a card keeps it hidden on the next run. Editing the note changes its hash and permits a new card.
- AE7. A comment survives panel close/reopen and changes no vault file or changelog entry.
- AE8. Choosing Ingest opens wiki selection/proposal. No LLM call occurs before the choice, and no operation applies before proposal approval.
- AE9. A source note changes after review. Approve returns stale, performs no write/move, and offers Refresh.
- AE10. A reviewed note is dirty in the reader. Archive is blocked and no second editor or forced flush is created by Review.
- AE11. Without qmd/vectors, unfinished/duplicate/empty cards still work while semantic link/merge cards are absent.
- AE12. No Inbox suggestions yields an explanatory empty state, not a blank panel.

## Planning Contract

### Key Technical Decisions

- KTD1. **Review is an inline right-panel mode.** It belongs beside the Inbox collection it evaluates and avoids modal/focus complexity.
- KTD2. **One card proposes one action.** Cards stay explainable and independently dismissible; they are not generic note cards containing a toolbar of unrelated actions.
- KTD3. **No review-generation LLM.** Initial value comes from deterministic Markdown, hash, topology, and cached semantic signals. Wiki-ingest synthesis remains the only LLM path and is explicitly selected.
- KTD4. **State keys include content hashes.** A dismissal never suppresses future advice after the underlying evidence changes.
- KTD5. **Merge is deterministic and preserves the source.** The proposal fixes the target. A pure function removes source frontmatter/title duplication, appends one named section using target line endings, updates only the target, and leaves archive as a separate auditable action.
- KTD6. **Approval routes are thin adapters over the sanctioned writer.** Add CAS support to link/move helpers where needed; do not write files in the review module.
- KTD7. **Conservative omission beats weak advice.** Missing/stale semantic evidence produces fewer cards, not guessed relationships.
- KTD8. **Comments are review metadata.** They help the user refine a decision but do not pollute portable note content.

### Directional Contracts

```ts
type ReviewAction = "continue" | "link" | "merge" | "archive" | "ingest";
type ReviewState = "pending" | "dismissed" | "approved";

type InboxReviewCard = {
  id: string; // hash(path, noteHash, action, targetPath?, targetHash?)
  note: { path: string; title: string; hash: string };
  action: ReviewAction;
  reason: string;
  target?: { path: string; title: string; hash: string };
  state: ReviewState;
  comment?: string;
  approvedAt?: string;
  resultPaths?: string[];
};
```

`GET /api/inbox/review` computes cards and joins persisted state. `PUT /api/inbox/review/:id` changes only dismissal/comment metadata. `POST /api/inbox/review/:id/apply` re-derives the card from current files, compares hashes, and applies only the requested action.

## Implementation Units

### U1. Pure suggestion engine

- **Files:** new `server/integrations/inbox-review.ts` and test.
- **Work:** Parse conservative unfinished markers and Markdown links; detect empty/exact duplicates/normalized-title collisions; consume optional cached semantic neighbors; include target hashes in ids; emit deterministic ids/reasons; cap results to 50 pending cards per run.
- **Tests:** Every signal and omission rule, source- and target-hash identity changes, 0.90 threshold boundary, exact duplicates omit Merge, no age-only archive, unavailable semantic data.

### U2. Bounded app-local review state

- **Files:** new `server/integrations/inbox-review-state.ts` and test.
- **Work:** Atomic JSON persistence under `data/`, join state by card id, comment/dismiss/approve transitions, corruption fallback, 500-record pruning. Store no note body.
- **Tests:** persistence, changed-hash identity, comment without mutation, corruption recovery, prune order.

### U3. Review and metadata routes

- **Files:** `server/app.ts`, new module tests in `server/app.test.ts` or focused integration test.
- **Work:** Add fresh manual review GET plus metadata PUT. Reuse RM001 Inbox catalog, graph/topology, and read-only semantic cache. Do not call provider or qmd query routes while generating.
- **Tests:** manual invocation only, empty state, local fallback, token on state mutation, Admin exclusions.

### U4. CAS-safe approval adapters

- **Files:** `server/integrations/write.ts`, `server/app.ts`, `wiki-ingest.ts` where source hash must travel, write/app tests.
- **Work:** Add expected-hash checks to link and move operations. Implement review apply for link, deterministic merge target replace, archive, and continue response. Ingest returns the existing proposal handoff rather than applying. Re-derive and validate card identity before action. Server CAS handles concurrent clients; the browser separately blocks actions against its own non-clean editor.
- **Tests:** stale source/target no-op, idempotent link, merge fixtures for YAML/H1/CRLF/LF and source preservation, archive move, frontend dirty ownership block, concurrent mutation becomes editor conflict, proposal-only ingest.

### U5. Inline review cards

- **Files:** `web/index.html`, `web/src/main.ts`, new `web/src/inbox-review-state.ts` if pure client transitions help, `web/src/style.css`, `web/src/i18n.ts`, tests.
- **Work:** Add Review Inbox button and review view inside the Inbox collection; render one action per card; inline comment editing; approve/dismiss/stale/applying/approved states; focus and live-region behavior. Reuse panel spacing/type/icon vocabulary, not activity-card toast limits.
- **Tests:** client state transitions, comments, stale refresh, no accidental row-open from controls, EN/ES keys.

### U6. Action-specific UX

- **Files:** `web/src/main.ts`, existing wiki proposal UI, editor ownership helpers from RM001, E2E.
- **Work:** Continue opens/focuses. Link displays target. Merge displays complete combined preview and confirms. Archive confirms move. Ingest selects wiki then enters existing proposal/approval UI. Successful moves clear matching editor/pin and refresh Inbox.
- **Tests:** each action, cancel paths, blocked dirty editor, pin teardown, no external request before Ingest selection.

### U7. Browser diagnostics proof

- **Files:** new or focused `tests/e2e/inbox-review.spec.ts`.
- **Work:** Hermetic Inbox fixture covering manual trigger, deterministic cards, comment/dismiss persistence, stale hash, one safe mutation, wiki proposal interception, narrow viewport, and zero browser diagnostics.

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Focused review units | `npm test -- --run server/integrations/inbox-review.test.ts server/integrations/inbox-review-state.test.ts` | Local signals and bounded state are deterministic. |
| Focused write/routes | `npm test -- --run server/integrations/write.test.ts server/app.test.ts server/integrations/wiki-ingest.test.ts` | CAS, approval, archive, merge, and ingest boundaries are safe. |
| Frontend units | `npm test -- --run web/src/inbox-review-state.test.ts web/src/research-state.test.ts` | Card and panel transitions are deterministic. |
| Full gates | `npm test && npm run typecheck && npm run build && npm run test:e2e` | Repository serial gate and browser diagnostics pass. |

## Definition of Done

- Review runs only from the user button and generates no external spending.
- Conservative local cards cover continue, link, merge, and archive; ingest is an explicit per-note action.
- Pending, dismissed, approved, and commented state survives reopening without modifying notes.
- Every mutation is separately approved, hash-revalidated, guarded, journaled, and conflict-aware.
- Merge preserves its source; archive never hard-deletes; ingest remains proposal-first.
- RM001 editor ownership, pin, Inbox refresh, search, English/Spanish, and diagnostics contracts remain intact.

## Explicit Exclusions

- No schedule, timer, startup review, background worker, due date, notification badge, or unattended routine. Those are RM003 only after manual Review proves useful.
- No review-generation LLM, Exa call, hosted search, or qmd LLM expansion.
- No bulk approval, multi-select, or automatic chain of actions.
- No hard delete and no implicit archive after merge.
- No card state in Markdown/frontmatter and no new database.
