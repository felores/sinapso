import { describe, expect, it } from "vitest";
import {
  clearStaleResearchPin,
  crossCollectionArrival,
  decideAgentResearchDisplay,
  moveCursor,
  pinMatchesVisible,
  setCursorTo,
  type CollectionCursor,
} from "./research-state.js";

const base = {
  targetId: "B",
  visibleId: "A",
  pinnedId: null,
  hasUnsavedLocalEdits: false,
  targetExists: true,
};

describe("decideAgentResearchDisplay", () => {
  it("keeps pinned A visible when an agent opens B", () => {
    expect(decideAgentResearchDisplay({ ...base, pinnedId: "A" })).toBe(
      "blocked-pinned",
    );
  });

  it("allows a clean same-id refresh", () => {
    expect(
      decideAgentResearchDisplay({
        ...base,
        targetId: "A",
        visibleId: "A",
        pinnedId: "A",
      }),
    ).toBe("shown");
  });

  it("preserves a dirty same-id working document", () => {
    expect(
      decideAgentResearchDisplay({
        ...base,
        targetId: "A",
        visibleId: "A",
        pinnedId: "A",
        hasUnsavedLocalEdits: true,
      }),
    ).toBe("blocked-dirty");
  });

  it("allows an unpinned agent open", () => {
    expect(decideAgentResearchDisplay(base)).toBe("shown");
  });
});

describe("clearStaleResearchPin", () => {
  it("clears a pin removed by reload, deletion, or promotion", () => {
    expect(clearStaleResearchPin("A", ["B"])).toBeNull();
  });

  it("retains a pin while user navigation changes the visible entry", () => {
    expect(clearStaleResearchPin("A", ["B", "A"])).toBe("A");
  });
});

describe("collection cursors", () => {
  type Item = { id: string };
  const research: CollectionCursor<Item> = {
    items: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
    cursor: 0,
  };
  const inbox: CollectionCursor<Item> = {
    items: [{ id: "i1" }, { id: "i2" }],
    cursor: 0,
  };

  it("moves each cursor independently", () => {
    const r1 = moveCursor(research, 1);
    const i1 = moveCursor(inbox, 1);
    expect(r1.cursor).toBe(1);
    expect(i1.cursor).toBe(1);
    // moving research again does not change inbox state
    const r2 = moveCursor(r1, 1);
    expect(r2.cursor).toBe(2);
    expect(i1.cursor).toBe(1);
  });

  it("clamps at the ends and is a no-op when unchanged", () => {
    const c0: CollectionCursor<Item> = { items: research.items, cursor: 2 };
    expect(moveCursor(c0, 1)).toBe(c0); // already at the end
    const c1 = moveCursor(c0, -5);
    expect(c1.cursor).toBe(0);
  });

  it("setCursorTo finds an id or returns the same reference", () => {
    const c = setCursorTo(research, "r3");
    expect(c.cursor).toBe(2);
    const same = setCursorTo(research, "missing");
    expect(same).toBe(research);
  });

  it("treats an empty collection as cursor -1", () => {
    const empty: CollectionCursor<Item> = { items: [], cursor: -1 };
    expect(moveCursor(empty, 1)).toBe(empty);
  });
});

describe("crossCollectionArrival", () => {
  const inboxNote = { collection: "inbox" as const, id: "inbox/new.md" };
  const inboxVisible = {
    collection: "inbox" as const,
    id: "inbox/visible.md",
  };

  it("shows an unpinned agent arrival", () => {
    expect(crossCollectionArrival(null, inboxVisible, inboxNote)).toBe("shown");
  });

  it("blocks when a different item is pinned", () => {
    expect(
      crossCollectionArrival("inbox/visible.md", inboxVisible, inboxNote),
    ).toBe("blocked-pinned");
  });

  it("allows re-showing the pinned same-id item", () => {
    expect(
      crossCollectionArrival("inbox/visible.md", inboxVisible, inboxVisible),
    ).toBe("shown");
  });

  it("pinMatchesVisible works for any collection", () => {
    expect(
      pinMatchesVisible("inbox/x.md", {
        collection: "inbox",
        id: "inbox/x.md",
      }),
    ).toBe(true);
    expect(
      pinMatchesVisible("research-id-1", {
        collection: "research",
        id: "research-id-1",
      }),
    ).toBe(true);
    expect(
      pinMatchesVisible("inbox/x.md", {
        collection: "inbox",
        id: "inbox/y.md",
      }),
    ).toBe(false);
    expect(pinMatchesVisible(null, inboxVisible)).toBe(false);
  });
});
