import type { EditorOwner, EditorSaveState } from "./vault-note-session";

export type ReviewAction = "continue" | "link" | "merge" | "archive" | "ingest";
export type ReviewCardState =
  | "pending"
  | "dismissed"
  | "approved"
  | "applying"
  | "stale";

export interface InboxReviewCard {
  id: string;
  note: { path: string; title: string; hash: string };
  action: ReviewAction;
  reason: string;
  reasonKey: string;
  reasonArgs?: Record<string, string | number>;
  target?: { path: string; title: string; hash: string };
  preview?: string;
  state: ReviewCardState;
  comment?: string;
  approvedAt?: string;
  resultPaths?: string[];
}

export function reviewActionBlocked(
  action: ReviewAction,
  editorState: EditorSaveState | null,
): boolean {
  return (
    action !== "continue" && editorState !== null && editorState !== "clean"
  );
}

export interface ReviewOwnership {
  path: string;
  owner: EditorOwner;
  state: EditorSaveState;
}

export function findBlockingReviewOwnership(
  action: ReviewAction,
  ownerships: Array<ReviewOwnership | null>,
): ReviewOwnership | null {
  return (
    ownerships.find(
      (ownership): ownership is ReviewOwnership =>
        ownership !== null && reviewActionBlocked(action, ownership.state),
    ) ?? null
  );
}

export function pinAfterReviewMove(
  pinnedPath: string | null,
  movedPath: string,
): string | null {
  return pinnedPath === movedPath ? null : pinnedPath;
}

export function updateReviewCard(
  cards: InboxReviewCard[],
  id: string,
  patch: Partial<InboxReviewCard>,
): InboxReviewCard[] {
  return cards.map((card) => (card.id === id ? { ...card, ...patch } : card));
}
