/**
 * Vault-note editor ownership and transfer policy (plan 020 U3, KTD4/KTD5).
 *
 * Pure: no DOM, no CodeMirror. The host (main.ts) owns the real editors and
 * reports their save state; this module answers: "given a target owner and
 * the current owner/state of a canonical note path, what does the transfer
 * table call for?"
 *
 * One rule (R12): a canonical path has at most one mounted editor at a time.
 * When a path is already mounted in another owner, transfers follow this
 * table (R15-R17):
 *
 *   current state   action
 *   -------------   --------------------------------------
 *   none            mount in target owner
 *   target owner    already owns (in-place refresh / no-op)
 *   clean           transfer immediately
 *   saving          await, then transfer on clean
 *   dirty           flush first; transfer only on clean
 *   conflict        block: keep + focus existing editor (no discard)
 *   error           block: keep + focus existing editor (no discard)
 *
 * Stale async-open protection (R17/KTD4): an openVaultNote call may await
 * network (note fetch, transfer flush, save resolution). A newer open
 * capturing the same generation must invalidate it. GenerationToken is the
 * smallest monotonic guard that does that without touching the DOM.
 */
export type EditorOwner = "reader" | "research";

export type EditorSaveState =
  | "clean"
  | "dirty"
  | "saving"
  | "conflict"
  | "error";

export interface CurrentOwnership {
  path: string;
  owner: EditorOwner;
  state: EditorSaveState;
}

export type TransferDecision =
  | { kind: "mount" }
  | { kind: "already-owns" }
  | { kind: "transfer-clean"; from: EditorOwner }
  | { kind: "transfer-await-saving"; from: EditorOwner }
  | { kind: "transfer-flush-dirty"; from: EditorOwner }
  | { kind: "blocked-conflict"; from: EditorOwner }
  | { kind: "blocked-error"; from: EditorOwner };

/**
 * Decide what to do for an `openVaultNote(path, target)` call given the path's
 * current ownership and save state. Pure: callers branch on `kind` and own
 * the side effects (await / flush / focus / mount).
 */
export function decideTransfer(
  target: EditorOwner,
  current: CurrentOwnership | null,
): TransferDecision {
  if (!current) return { kind: "mount" };
  if (current.owner === target) return { kind: "already-owns" };
  const from = current.owner;
  switch (current.state) {
    case "clean":
      return { kind: "transfer-clean", from };
    case "saving":
      return { kind: "transfer-await-saving", from };
    case "dirty":
      return { kind: "transfer-flush-dirty", from };
    case "conflict":
      return { kind: "blocked-conflict", from };
    case "error":
      return { kind: "blocked-error", from };
  }
}

/** True when a transfer decision is one of the block kinds (keep + focus). */
export function isTransferBlocked(d: TransferDecision): boolean {
  return d.kind === "blocked-conflict" || d.kind === "blocked-error";
}

/**
 * Monotonic generation counter. Each open captures `next()`; an async open
 * that resolves after a newer open must check `isCurrent()` === false and
 * bail, so a slow note-fetch cannot overwrite a freshly-mounted different
 * path. The token is owned by the host session (one per app).
 */
export class GenerationToken {
  private gen = 0;
  next(): number {
    return ++this.gen;
  }
  isCurrent(g: number): boolean {
    return g === this.gen;
  }
}
