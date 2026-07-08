import { describe, expect, it, vi } from "vitest";
import {
  buildContextualQuery,
  fallbackContextQuery,
  selectedSlots,
} from "./contextual-query";

const contexts = {
  reader: {
    source: "reader",
    text: "selected note passage",
    noteTitle: "Note A",
  },
  research: {
    source: "research",
    text: "selected research passage",
    title: "Prior research",
    truncated: true,
  },
  lastSource: "research",
};

describe("contextual query helpers", () => {
  it("sanitizes selected context slots", () => {
    expect(selectedSlots(contexts).map((s) => [s.source, s.label, s.text])).toEqual([
      ["reader", "Note A", "selected note passage"],
      ["research", "Prior research", "selected research passage"],
    ]);
  });

  it("builds a deterministic fallback query", () => {
    const out = fallbackContextQuery("zettelkasten", contexts);
    expect(out).toContain("zettelkasten");
    expect(out).toContain("Reader (Note A): selected note passage");
    expect(out).toContain("Research (Prior research): selected research passage");
  });

  it("uses OpenRouter rewrite when configured", async () => {
    const chat = vi.fn(async () => JSON.stringify({ query: "rewritten web query" }));
    const out = await buildContextualQuery("original", contexts, {
      openrouterKey: "or-key",
      model: "test/model",
      chat,
    });

    expect(chat).toHaveBeenCalledOnce();
    expect(out).toMatchObject({
      effectiveQuery: "rewritten web query",
      contextApplied: true,
      contextRewriteSource: "openrouter",
      contextWarning: "Selected context was trimmed before research.",
    });
  });

  it("falls back when no OpenRouter key is configured", async () => {
    const out = await buildContextualQuery("original", contexts);
    expect(out.contextRewriteSource).toBe("fallback");
    expect(out.effectiveQuery).toContain("selected note passage");
  });

  it("leaves plain queries unchanged without context", async () => {
    const out = await buildContextualQuery("original", null);
    expect(out).toEqual({
      effectiveQuery: "original",
      contextApplied: false,
      contextRewriteSource: "none",
      contextWarning: null,
    });
  });
});
