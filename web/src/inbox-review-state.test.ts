import { describe, expect, it } from "vitest";
import {
  findBlockingReviewOwnership,
  pinAfterReviewMove,
  reviewActionBlocked,
  updateReviewCard,
  type InboxReviewCard,
} from "./inbox-review-state";

const card: InboxReviewCard = {
  id: "a",
  note: { path: "inbox/a.md", title: "A", hash: "h" },
  action: "archive",
  reason: "empty",
  reasonKey: "inbox.review.reason.empty",
  state: "pending",
};

describe("Inbox Review client state", () => {
  it.each(["dirty", "saving", "conflict", "error"] as const)(
    "blocks mutations while the owned editor is %s",
    (state) => expect(reviewActionBlocked("archive", state)).toBe(true),
  );

  it("allows clean/unowned mutations and always allows Continue", () => {
    expect(reviewActionBlocked("archive", "clean")).toBe(false);
    expect(reviewActionBlocked("archive", null)).toBe(false);
    expect(reviewActionBlocked("continue", "conflict")).toBe(false);
  });

  it("blocks Merge when its target owner is dirty even if the source is clean", () => {
    expect(
      findBlockingReviewOwnership("merge", [
        { path: "inbox/source.md", owner: "research", state: "clean" },
        { path: "target.md", owner: "reader", state: "dirty" },
      ]),
    ).toMatchObject({ path: "target.md", owner: "reader", state: "dirty" });
  });

  it("clears only a pin whose note was moved", () => {
    expect(pinAfterReviewMove("inbox/a.md", "inbox/a.md")).toBeNull();
    expect(pinAfterReviewMove("inbox/b.md", "inbox/a.md")).toBe("inbox/b.md");
  });

  it("updates only the selected card for applying, stale, comments, and approval", () => {
    const other = { ...card, id: "b" };
    const applying = updateReviewCard([card, other], "a", {
      state: "applying",
    });
    expect(applying.map((item) => item.state)).toEqual(["applying", "pending"]);
    const stale = updateReviewCard(applying, "a", { state: "stale" });
    expect(stale[0].state).toBe("stale");
    const approved = updateReviewCard(stale, "a", {
      state: "approved",
      comment: "reviewed",
      resultPaths: ["archive/a.md"],
    });
    expect(approved[0]).toMatchObject({
      state: "approved",
      comment: "reviewed",
      resultPaths: ["archive/a.md"],
    });
  });
});
