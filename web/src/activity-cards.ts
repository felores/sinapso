/**
 * Activity card stack (ephemeral, non-blocking surface).
 *
 * Pure data-in/data-out model for the single bounded card stack shown opposite
 * the search bar. The DOM host (index.html + style.css) renders whatever this
 * model produces; main.ts owns the imperative wiring. Kept pure so the stack
 * contract (max 3, in-progress self-clears, ready/error persist, id-based
 * update/dismiss) is unit-testable without a DOM.
 *
 * Card states: `search` | `prepare` | `propose` are in-progress (auto-clear or
 * update on completion); `ready` | `error` persist with a CTA / dismiss.
 */

export type ActivityCardState =
  | "search"
  | "prepare"
  | "propose"
  | "ready"
  | "error";

/** Whether a state is transient (in-progress) or terminal (persists). */
export const TRANSIENT_STATES: ReadonlySet<ActivityCardState> = new Set([
  "search",
  "prepare",
  "propose",
]);

export interface ActivityCard {
  /** Stable id so callers update/dismiss the same card across state changes. */
  id: string;
  state: ActivityCardState;
  /** Short label key (i18n) or literal text. */
  label: string;
  /** Optional secondary line (hint / error message). */
  detail?: string;
  /** CTA label key (i18n) for ready/error cards. */
  cta?: string;
  /** Whether the CTA is keyboard-focusable / prominent. */
  ctaKind?: "primary" | "retry";
}

export const MAX_ACTIVITY_CARDS = 3;

/**
 * Insert/update a card. Transient cards replace a same-id card in place; a new
 * transient card pushes to the top. Terminal cards (ready/error) never get
 * evicted by a later transient push — they stay until dismissed. The stack is
 * capped at MAX_ACTIVITY_CARDS by dropping the OLDEST transient card first
 * (terminals are protected).
 */
export function upsertActivityCard(
  stack: ReadonlyArray<ActivityCard>,
  card: ActivityCard,
): ActivityCard[] {
  const next = [...stack];
  const idx = next.findIndex((c) => c.id === card.id);
  if (idx >= 0) {
    next[idx] = card;
    return prune(next);
  }
  next.unshift(card);
  return prune(next);
}

/** Remove a card by id. */
export function dismissActivityCard(
  stack: ReadonlyArray<ActivityCard>,
  id: string,
): ActivityCard[] {
  return stack.filter((c) => c.id !== id);
}

/** Drop every transient (in-progress) card, e.g. when its task completed. */
export function clearTransientActivityCards(
  stack: ReadonlyArray<ActivityCard>,
): ActivityCard[] {
  return stack.filter((c) => !TRANSIENT_STATES.has(c.state));
}

/**
 * Enforce the cap: while over MAX_ACTIVITY_CARDS, remove the OLDEST transient
 * card (highest index that is transient). Terminals are protected. If only
 * terminals remain and we're still over the cap (shouldn't happen with max 3),
 * drop the oldest terminal as a last resort.
 */
function prune(stack: ActivityCard[]): ActivityCard[] {
  let out = [...stack];
  while (out.length > MAX_ACTIVITY_CARDS) {
    const lastTransient = (() => {
      for (let i = out.length - 1; i >= 0; i--) {
        if (TRANSIENT_STATES.has(out[i].state)) return i;
      }
      return -1;
    })();
    const dropAt = lastTransient >= 0 ? lastTransient : out.length - 1;
    out = out.filter((_, i) => i !== dropAt);
  }
  return out;
}

/** True when a state should persist (ready/error) rather than auto-clear. */
export function isTerminal(state: ActivityCardState): boolean {
  return !TRANSIENT_STATES.has(state);
}
