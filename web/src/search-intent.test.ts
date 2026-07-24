import { describe, expect, it } from "vitest";
import {
  isCurrentSearchGeneration,
  normalizeVaultSearchResults,
  searchSubmitIntent,
} from "./search-intent";

describe("normalizeVaultSearchResults", () => {
  it("keeps the backend rank order and renders each path once", () => {
    expect(
      normalizeVaultSearchResults({
        results: [
          { path: "later.md", title: "Later", snippet: "later", rank: 2 },
          { path: "first.md", title: "First", snippet: "first", rank: 1 },
          {
            path: "first.md",
            title: "Duplicate",
            snippet: "duplicate",
            rank: 3,
          },
          { title: "Missing path", snippet: "ignored", rank: 4 },
        ],
      }),
    ).toEqual([
      { path: "first.md", title: "First", snippet: "first", rank: 1 },
      { path: "later.md", title: "Later", snippet: "later", rank: 2 },
    ]);
  });
});

describe("isCurrentSearchGeneration", () => {
  it("rejects stale response generations", () => {
    expect(isCurrentSearchGeneration(3, 3)).toBe(true);
    expect(isCurrentSearchGeneration(2, 3)).toBe(false);
  });
});

describe("searchSubmitIntent", () => {
  it("routes a no-mode HTTP(S) URL to intake only on submit", () => {
    expect(searchSubmitIntent("https://example.com/report", null)).toBe(
      "intake",
    );
  });

  it("keeps explicit modes, invalid URLs, and non-HTTP schemes local", () => {
    expect(searchSubmitIntent("https://example.com", "web")).toBe("local");
    expect(searchSubmitIntent("not a url", null)).toBe("local");
    expect(searchSubmitIntent("file:///tmp/report.pdf", null)).toBe("local");
  });
});
