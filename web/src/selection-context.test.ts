import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXT_WORDS,
  buildKeywordQuery,
  buildSelectionSnapshot,
  buildSemanticQuery,
  clearSelectionSlot,
  emptySelectionState,
  selectionSlot,
  sourceChips,
  updateSelectionSlot,
} from "./selection-context";

const words = (n: number, prefix = "w") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

describe("selection context helpers", () => {
  it("ignores empty and whitespace-only text", () => {
    expect(selectionSlot({ source: "reader", text: " \n\t " })).toBeNull();
  });

  it("keeps reader and research slots independent", () => {
    let state = emptySelectionState();
    state = updateSelectionSlot(
      state,
      selectionSlot({
        source: "reader",
        text: "reader text",
        noteId: "notes/a.md",
        noteTitle: "A",
      }),
    );
    state = updateSelectionSlot(
      state,
      selectionSlot({
        source: "research",
        text: "research text",
        entryId: "r1",
        title: "Question",
      }),
    );

    expect(state.reader?.text).toBe("reader text");
    expect(state.research?.text).toBe("research text");
    expect(state.lastSource).toBe("research");

    const next = clearSelectionSlot(state, "reader");
    expect(next.reader).toBeNull();
    expect(next.research?.text).toBe("research text");
  });

  it("caps a long single slot to 300 words", () => {
    const state = updateSelectionSlot(
      emptySelectionState(),
      selectionSlot({ source: "reader", text: words(400) }),
    );
    const snap = buildSelectionSnapshot(state);
    expect(snap.reader?.text.split(/\s+/)).toHaveLength(MAX_CONTEXT_WORDS);
    expect(snap.reader?.truncated).toBe(true);
    expect(snap.reader?.originalWordCount).toBe(400);
  });

  it("caps a long unbroken slot by 3000 characters", () => {
    const text = "x".repeat(4000);
    const state = updateSelectionSlot(
      emptySelectionState(),
      selectionSlot({ source: "reader", text }),
    );
    const snap = buildSelectionSnapshot(state);
    expect(snap.reader?.text).toHaveLength(3000);
    expect(snap.reader?.truncated).toBe(true);
    expect(snap.reader?.originalCharCount).toBe(4000);
  });

  it("caps two long slots with last-source priority", () => {
    let state = emptySelectionState();
    state = updateSelectionSlot(
      state,
      selectionSlot({ source: "reader", text: words(200, "r") }),
    );
    state = updateSelectionSlot(
      state,
      selectionSlot({ source: "research", text: words(200, "s") }),
    );
    const snap = buildSelectionSnapshot(state);

    expect(snap.research?.text.split(/\s+/)).toHaveLength(200);
    expect(snap.reader?.text.split(/\s+/)).toHaveLength(100);
    expect(snap.reader?.truncated).toBe(true);
    expect(snap.lastSource).toBe("research");
  });

  it("builds readable source chips", () => {
    let state = emptySelectionState();
    state = updateSelectionSlot(
      state,
      selectionSlot({ source: "reader", text: "a", noteId: "x.md", noteTitle: "X" }),
    );
    state = updateSelectionSlot(
      state,
      selectionSlot({ source: "research", text: "b", title: "Research Q" }),
    );
    expect(sourceChips(buildSelectionSnapshot(state))).toEqual([
      "Reader: X",
      "Research: Research Q",
    ]);
  });

  it("builds typed semantic and keyword effective queries", () => {
    const state = updateSelectionSlot(
      emptySelectionState(),
      selectionSlot({
        source: "reader",
        text: "selected passage",
        noteId: "notes/a.md",
        noteTitle: "A",
      }),
    );
    const snap = buildSelectionSnapshot(state);

    const semantic = buildSemanticQuery("typed question", snap);
    expect(semantic.startsWith("vec:")).toBe(true);
    expect(semantic).toContain("typed question");
    expect(semantic).toContain("Reader: A");
    expect(semantic).toContain("Note: notes/a.md");
    expect(semantic).toContain("selected passage");

    const keyword = buildKeywordQuery("typed question", snap);
    expect(keyword.startsWith("vec:")).toBe(false);
    expect(keyword).toContain("typed question");
  });
});
