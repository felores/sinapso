import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInboxReviewState } from "./inbox-review-state";
import type { InboxReviewCard } from "./inbox-review";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "sinapso-review-state-"));
  roots.push(root);
  return join(root, "review.json");
};
const card = (id: string): InboxReviewCard => ({
  id,
  note: { path: "inbox/a.md", title: "A", hash: "h" },
  action: "continue",
  reason: "reason",
  reasonKey: "reason",
  state: "pending",
});

describe("createInboxReviewState", () => {
  it("persists comments without changing pending state", () => {
    const file = setup();
    createInboxReviewState(file).put("a", { comment: "consider later" });
    expect(createInboxReviewState(file).join([card("a")])[0]).toMatchObject({
      state: "pending",
      comment: "consider later",
    });
  });

  it("hides only the dismissed identity", () => {
    const file = setup();
    const store = createInboxReviewState(file);
    store.put("old", { state: "dismissed" });
    expect(
      store.join([card("old"), card("new")]).map((item) => item.id),
    ).toEqual(["new"]);
  });

  it("records approval time and paths", () => {
    const file = setup();
    const store = createInboxReviewState(
      file,
      () => new Date("2026-07-19T00:00:00Z"),
    );
    store.put("a", { comment: "ok" });
    expect(store.approve("a", ["archive/a.md"])).toMatchObject({
      state: "approved",
      comment: "ok",
      approvedAt: "2026-07-19T00:00:00.000Z",
      resultPaths: ["archive/a.md"],
    });
  });

  it("recovers from a corrupt file", () => {
    const file = setup();
    writeFileSync(file, "not-json");
    const store = createInboxReviewState(file);
    expect(store.load()).toEqual([]);
    store.put("a", { comment: "recovered" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(1);
  });

  it("prunes to the newest 500 records and stores no note body", () => {
    const file = setup();
    const store = createInboxReviewState(file);
    store.save(
      Array.from({ length: 510 }, (_, i) => ({
        id: String(i),
        state: "pending" as const,
        updatedAt: new Date(i * 1000).toISOString(),
      })),
    );
    const records = store.load();
    expect(records).toHaveLength(500);
    expect(records[0].id).toBe("509");
    expect(JSON.stringify(records)).not.toContain("content");
  });
});
