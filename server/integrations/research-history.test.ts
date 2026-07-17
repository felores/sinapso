import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveEntry,
  upsertEntry,
  listEntries,
  getEntry,
  deleteEntry,
  clearEntries,
  convertedFromResearchEntry,
} from "./research-history";

let DATA: string;
beforeEach(() => {
  DATA = mkdtempSync(join(tmpdir(), "sinapso-rh-"));
});

const webEntry = (query: string) => ({
  mode: "web" as const,
  query,
  answer: { content: "answer", citations: [{ url: "https://x", title: "X" }] },
  results: [],
});

describe("research history", () => {
  it("saves and lists newest-first", () => {
    const a = saveEntry(DATA, webEntry("first"));
    const b = saveEntry(DATA, webEntry("second"));
    const list = listEntries(DATA);
    expect(list.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(list[0].query).toBe("second");
    expect(list[0].answer?.content).toBe("answer");
  });

  it("generates a safe kebab id from the query", () => {
    const e = saveEntry(DATA, webEntry("Quantum Computing 101!"));
    expect(e.id).toMatch(/^[a-z0-9-]+$/);
    expect(e.id).toContain("quantum-computing-101");
  });

  it("deletes one entry, leaving the rest", () => {
    const a = saveEntry(DATA, webEntry("keep"));
    const b = saveEntry(DATA, webEntry("drop"));
    expect(deleteEntry(DATA, b.id)).toBe(true);
    expect(listEntries(DATA).map((e) => e.id)).toEqual([a.id]);
  });

  it("rejects path-traversal ids and missing files", () => {
    saveEntry(DATA, webEntry("x"));
    expect(deleteEntry(DATA, "../../etc/passwd")).toBe(false);
    expect(deleteEntry(DATA, "..%2Fescape")).toBe(false);
    expect(deleteEntry(DATA, "nonexistent")).toBe(false);
    expect(listEntries(DATA).length).toBe(1); // nothing was removed
  });

  it("reads one validated entry directly and rejects traversal or mismatched data", () => {
    const saved = saveEntry(DATA, webEntry("direct"));
    expect(getEntry(DATA, saved.id)?.query).toBe("direct");
    expect(getEntry(DATA, "../../etc/passwd")).toBeNull();
    expect(getEntry(DATA, "missing")).toBeNull();
  });

  it("clears all history", () => {
    saveEntry(DATA, webEntry("a"));
    saveEntry(DATA, webEntry("b"));
    expect(clearEntries(DATA)).toBe(2);
    expect(listEntries(DATA)).toEqual([]);
    expect(existsSync(join(DATA, "research"))).toBe(true); // dir stays, empty
  });

  it("listEntries is empty when nothing has been saved", () => {
    expect(listEntries(DATA)).toEqual([]);
  });

  it("keeps two document entries with different ids", () => {
    upsertEntry(DATA, {
      id: "doc-a",
      mode: "document",
      query: "A",
      document: { title: "A", content: "one", revision: "r1" },
    });
    upsertEntry(DATA, {
      id: "doc-b",
      mode: "document",
      query: "B",
      document: { title: "B", content: "two", revision: "r1" },
    });

    expect(
      listEntries(DATA)
        .map((e) => e.id)
        .sort(),
    ).toEqual(["doc-a", "doc-b"]);
  });

  it("upserting one document does not remove another", () => {
    upsertEntry(DATA, {
      id: "doc-a",
      mode: "document",
      query: "A",
      document: { title: "A", content: "one", revision: "r1" },
    });
    upsertEntry(DATA, {
      id: "doc-b",
      mode: "document",
      query: "B",
      document: { title: "B", content: "two", revision: "r1" },
    });
    upsertEntry(DATA, {
      id: "doc-a",
      mode: "document",
      query: "A",
      document: { title: "A", content: "one edited", revision: "r2" },
    });

    const byId = new Map(listEntries(DATA).map((e) => [e.id, e]));
    expect(byId.get("doc-a")?.document?.content).toBe("one edited");
    expect(byId.get("doc-b")?.document?.content).toBe("two");
  });

  it("converts web research into complete, readable markdown", () => {
    const converted = convertedFromResearchEntry({
      id: "web-1",
      ts: "2026-01-01T00:00:00.000Z",
      mode: "web",
      query: "Market map",
      answer: {
        content: "Short synthesis.\n\n\nMore detail.",
        citations: [
          { title: "First", url: "https://example.com/1" },
          { title: "Second", url: "https://example.com/2" },
        ],
      },
      results: [
        {
          title: "Result A",
          url: "https://example.com/a",
          snippet: "Useful excerpt.",
          publishedDate: "2026-01-02T12:00:00Z",
        },
      ],
    });

    expect(converted?.markdown).toContain("## Synthesis\n\nShort synthesis.");
    expect(converted?.markdown).toContain(
      "1. [First](https://example.com/1)\n2. [Second](https://example.com/2)",
    );
    expect(converted?.markdown).toContain(
      "## Result excerpts\n\n### [Result A](https://example.com/a)",
    );
    expect(converted?.markdown).toContain("Published: 2026-01-02");
    expect(converted?.markdown).not.toContain("\n\n\n");
  });

  it("converts articles without duplicating the leading title", () => {
    const converted = convertedFromResearchEntry({
      id: "article-1",
      ts: "2026-01-01T00:00:00.000Z",
      mode: "article",
      query: "Fallback",
      article: {
        title: "Article Title",
        url: "https://example.com/article",
        content: "# Article Title\n\nBody.",
        author: "Author",
        publishedDate: "2026-01-02T12:00:00Z",
      },
    });

    expect(converted?.markdown.match(/^# Article Title/gm)).toHaveLength(1);
    expect(converted?.markdown).toContain("Author: Author");
    expect(converted?.markdown).toContain("Body.");
  });
});
