export type ResearchDisplayDecision =
  | "shown"
  | "blocked-pinned"
  | "blocked-dirty"
  | "missing";

export interface ResearchDisplayState {
  targetId: string;
  visibleId: string | null;
  pinnedId: string | null;
  hasUnsavedLocalEdits: boolean;
  targetExists: boolean;
}

export interface ResearchDisplayAcknowledgment {
  decision: ResearchDisplayDecision;
  visibleId: string | null;
  pinnedId: string | null;
}

export function decideAgentResearchDisplay(
  state: ResearchDisplayState,
): ResearchDisplayDecision {
  if (!state.targetExists) return "missing";
  if (state.pinnedId !== null && state.targetId !== state.pinnedId)
    return "blocked-pinned";
  if (state.targetId === state.visibleId && state.hasUnsavedLocalEdits)
    return "blocked-dirty";
  return "shown";
}

export function clearStaleResearchPin(
  pinnedId: string | null,
  historyIds: readonly string[],
): string | null {
  return pinnedId !== null && !historyIds.includes(pinnedId) ? null : pinnedId;
}

// ---- Research/Inbox collections (plan 020 U4, KTD9) ----
//
// The right panel hosts two navigation collections that share chrome but keep
// independent arrays/cursors (R8). The pin identity is path-or-history: it can
// match either a research history id or a vault note path, so R10's "pin
// protects the visible right-panel item regardless of collection" works.

export type ResearchCollection = "research" | "inbox";

export interface CollectionCursor<T> {
  items: T[];
  /** -1 = none; otherwise index into items. */
  cursor: number;
}

/** Pure clamp+slide. Returns the same reference when nothing changed. */
export function moveCursor<T extends { id: string }>(
  c: CollectionCursor<T>,
  delta: number,
): CollectionCursor<T> {
  if (!c.items.length) return c.cursor === -1 ? c : { ...c, cursor: -1 };
  const next = Math.max(0, Math.min(c.cursor + delta, c.items.length - 1));
  return next === c.cursor ? c : { ...c, cursor: next };
}

/** Pure set the cursor to the given id if present. No-op otherwise. */
export function setCursorTo<T extends { id: string }>(
  c: CollectionCursor<T>,
  id: string,
): CollectionCursor<T> {
  const idx = c.items.findIndex((it) => it.id === id);
  if (idx < 0 || idx === c.cursor) return c;
  return { ...c, cursor: idx };
}

/**
 * R10 / AE2: agent-created Inbox note arrival against a possibly-pinned
 * visible item. Returns "shown" when the new note can take over the visible
 * slot, or "blocked-pinned" when a different item is pinned (the new note
 * still enters Inbox navigation; the visible item is preserved).
 *
 * U4 lays the groundwork — the actual agent-driven caller is U5. The pin id
 * can be a research history id or a vault note path (path-or-history identity).
 */
export function crossCollectionArrival(
  pinnedId: string | null,
  visible: { collection: ResearchCollection; id: string } | null,
  target: { collection: ResearchCollection; id: string },
): "shown" | "blocked-pinned" {
  if (pinnedId === null) return "shown";
  if (visible && pinnedId === visible.id && target.id === visible.id)
    return "shown";
  return "blocked-pinned";
}

/** True when the pin id matches the visible right-panel item, regardless of
 *  which collection it lives in. */
export function pinMatchesVisible(
  pinnedId: string | null,
  visible: { collection: ResearchCollection; id: string } | null,
): boolean {
  if (!pinnedId || !visible) return false;
  return pinnedId === visible.id;
}

export function nextViewActionPollDelay(
  currentMs: number,
  succeeded: boolean,
): number {
  return succeeded ? 750 : Math.min(Math.max(currentMs, 750) * 2, 15_000);
}
