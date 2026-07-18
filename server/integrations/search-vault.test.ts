/**
 * search_vault pure helpers (consolidated discovery): input parsing, path-mode
 * matching, scope checks, the bounded merge/dedup that every mode returns,
 * and the Reciprocal Rank Fusion that blends semantic + keyword in `auto`.
 * No file reads, no regex — pure data-in/data-out.
 */
import { describe, expect, it } from "vitest";
import {
  buildAutoResponse,
  clampLimit,
  inScope,
  MAX_VARIANTS,
  mergeResults,
  normalizeScope,
  parseMode,
  parseQueries,
  pathMatch,
  reciprocalRankFusion,
  RRF_K,
  tagRanked,
  type VaultSearchGraphNode,
  type VaultSearchResult,
} from "./search-vault";

describe("parseQueries", () => {
  it("splits newline- and pipe-separated variants", () => {
    expect(parseQueries("alpha\nbeta|gamma")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("trims, drops empties, and dedupes case-insensitively preserving order", () => {
    expect(parseQueries("  Alpha \n\n alpha \nbeta")).toEqual([
      "Alpha",
      "beta",
    ]);
  });

  it("caps the variant count", () => {
    const many = Array.from({ length: 10 }, (_, i) => `q${i}`).join("\n");
    expect(parseQueries(many).length).toBe(MAX_VARIANTS);
  });

  it("returns [] for empty / undefined", () => {
    expect(parseQueries(undefined)).toEqual([]);
    expect(parseQueries("   ")).toEqual([]);
    expect(parseQueries("")).toEqual([]);
  });
});

describe("normalizeScope + inScope", () => {
  it("strips leading/trailing slashes and trims", () => {
    expect(normalizeScope("/felo/wiki/")).toBe("felo/wiki");
    expect(normalizeScope("  a/b  ")).toBe("a/b");
  });
  it("returns '' for non-strings", () => {
    expect(normalizeScope(undefined)).toBe("");
    expect(normalizeScope(7)).toBe("");
  });
  it("treats empty scope as whole-vault", () => {
    expect(inScope("any/path.md", "")).toBe(true);
  });
  it("matches exact + prefix only", () => {
    expect(inScope("felo/wiki/n.md", "felo/wiki")).toBe(true);
    expect(inScope("felo/wiki", "felo/wiki")).toBe(true);
    expect(inScope("felo/wikis/x.md", "felo/wiki")).toBe(false);
    expect(inScope("other/n.md", "felo/wiki")).toBe(false);
  });
});

describe("parseMode + clampLimit", () => {
  it("accepts the four modes and defaults to auto", () => {
    expect(parseMode("exact")).toBe("exact");
    expect(parseMode("nope")).toBe("auto");
    expect(parseMode(undefined)).toBe("auto");
  });
  it("clamps with default and ceiling", () => {
    expect(clampLimit("5", 8, 20)).toBe(5);
    expect(clampLimit(undefined, 8, 20)).toBe(8);
    expect(clampLimit("999", 8, 20)).toBe(20);
    expect(clampLimit("0", 8, 20)).toBe(8);
    expect(clampLimit("not-a-number", 8, 20)).toBe(8);
  });
});

describe("pathMatch", () => {
  const nodes: VaultSearchGraphNode[] = [
    { id: "felo/wiki/notes.md", title: "Notes", phantom: false },
    { id: "saas/climatia/readme.md", title: "Climatia Readme", phantom: false },
    { id: "felo/phantom.md", title: "Phantom", phantom: true },
    { id: "inbox/x.md", title: "Inbox X", phantom: false },
  ];

  it("matches ids, basenames, and titles case-insensitively", () => {
    const r = pathMatch(nodes, ["readme"], "", 10);
    expect(r.map((x) => x.path)).toEqual(["saas/climatia/readme.md"]);
    const r2 = pathMatch(nodes, ["climatia"], "", 10);
    expect(r2.map((x) => x.path)).toEqual(["saas/climatia/readme.md"]);
    const r3 = pathMatch(nodes, ["inbox x"], "", 10);
    expect(r3.map((x) => x.path)).toEqual(["inbox/x.md"]);
  });

  it("honors a folder scope", () => {
    const r = pathMatch(nodes, ["notes"], "felo/wiki", 10);
    expect(r.map((x) => x.path)).toEqual(["felo/wiki/notes.md"]);
    expect(pathMatch(nodes, ["notes"], "saas", 10)).toEqual([]);
  });

  it("skips phantom nodes", () => {
    expect(pathMatch(nodes, ["phantom"], "", 10)).toEqual([]);
  });

  it("caps at limit and dedupes by path", () => {
    const many: VaultSearchGraphNode[] = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}/match.md`,
      title: `M${i}`,
      phantom: false,
    }));
    expect(pathMatch(many, ["match"], "", 3).length).toBe(3);
  });

  it("returns [] for no queries", () => {
    expect(pathMatch(nodes, [], "", 10)).toEqual([]);
  });
});

describe("mergeResults", () => {
  it("dedupes by path for note-level results", () => {
    const a = [
      { path: "a.md", title: "A", snippet: "1" },
      { path: "b.md", title: "B", snippet: "2" },
    ];
    const b = [{ path: "a.md", title: "A", snippet: "1" }];
    expect(mergeResults([a, b], 10).length).toBe(2);
  });

  it("dedupes by path:line for exact results and keeps distinct lines", () => {
    const exact = [
      { path: "a.md", title: "A", snippet: "s1", line: 1, terms: ["t"] },
      { path: "a.md", title: "A", snippet: "s2", line: 2, terms: ["t"] },
      { path: "a.md", title: "A", snippet: "s1", line: 1, terms: ["t"] },
    ];
    expect(mergeResults([exact], 10).length).toBe(2);
  });

  it("caps at limit", () => {
    const big = Array.from({ length: 5 }, (_, i) => ({
      path: `n${i}.md`,
      title: "T",
      snippet: "",
    }));
    expect(mergeResults([big], 3).length).toBe(3);
  });

  it("preserves native score from the first-seen hit (for standalone tagging)", () => {
    const a = [{ path: "a.md", title: "A", snippet: "", score: 0.9 }];
    const b = [{ path: "a.md", title: "A", snippet: "", score: 0.1 }];
    const merged = mergeResults([a, b], 10);
    expect(merged.length).toBe(1);
    expect(merged[0].score).toBe(0.9);
  });
});

describe("tagRanked", () => {
  const hit = (path: string): VaultSearchResult => ({
    path,
    title: path,
    snippet: "",
  });

  it("assigns stable 1-based rank and the given scoreKind", () => {
    const out = tagRanked([hit("a"), hit("b"), hit("c")], "path", 10);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(out.every((r) => r.scoreKind === "path")).toBe(true);
  });

  it("preserves a native score (semantic/keyword) and caps at limit", () => {
    const out = tagRanked(
      [
        { path: "a.md", title: "A", snippet: "", score: 1.5 },
        { path: "b.md", title: "B", snippet: "", score: 0.7 },
      ],
      "keyword",
      1,
    );
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({
      path: "a.md",
      rank: 1,
      score: 1.5,
      scoreKind: "keyword",
    });
  });

  it("emits no score for exact/path (rank is the only meaningful order)", () => {
    const out = tagRanked([hit("a")], "exact", 10);
    expect(out[0].score).toBeUndefined();
    expect(out[0].rank).toBe(1);
  });
});

describe("reciprocalRankFusion", () => {
  const hit = (path: string, score = 0): VaultSearchResult => ({
    path,
    title: path,
    snippet: "",
    score,
  });

  it("fuses two ranked lists and tags scoreKind=rrf with sources", () => {
    const semantic = [hit("a.md", 0.9), hit("b.md", 0.7)];
    const keyword = [hit("b.md", 5), hit("c.md", 3)];
    const out = reciprocalRankFusion(
      [
        { source: "semantic", results: semantic },
        { source: "keyword", results: keyword },
      ],
      10,
    );
    // Every result is tagged rrf with a final rank + sources.
    expect(out.every((r) => r.scoreKind === "rrf")).toBe(true);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
    // b.md is found by BOTH engines → highest RRF score, ranked first.
    expect(out[0].path).toBe("b.md");
    expect(out[0].sources).toEqual(["semantic", "keyword"]);
    // Single-engine hits carry only their source label.
    const a = out.find((r) => r.path === "a.md")!;
    expect(a.sources).toEqual(["semantic"]);
    const c = out.find((r) => r.path === "c.md")!;
    expect(c.sources).toEqual(["keyword"]);
  });

  it("RRF score = sum of 1/(k+rank) across lists (verifies the formula)", () => {
    const out = reciprocalRankFusion(
      [
        { source: "s", results: [hit("only-s")] }, // rank 1 in s
        { source: "k", results: [hit("only-k")] }, // rank 1 in k
      ],
      10,
    );
    const expected = 1 / (RRF_K + 1);
    expect(out[0].score).toBeCloseTo(expected, 10);
    expect(out[1].score).toBeCloseTo(expected, 10);
  });

  it("dedupes a doc appearing in both lists into one entry with summed score", () => {
    const out = reciprocalRankFusion(
      [
        { source: "s", results: [hit("dual")] }, // 1/(k+1)
        { source: "k", results: [hit("dual")] }, // + 1/(k+1)
      ],
      10,
    );
    expect(out.length).toBe(1);
    expect(out[0].score).toBeCloseTo(2 / (RRF_K + 1), 10);
    expect(out[0].sources).toEqual(["s", "k"]);
  });

  it("produces a stable order on score ties (first-seen wins)", () => {
    // Two docs each appear once at rank 1 in different lists → equal score.
    // The one from the FIRST input list must come first (stable tiebreak).
    const out = reciprocalRankFusion(
      [
        { source: "s", results: [hit("first")] },
        { source: "k", results: [hit("second")] },
      ],
      10,
    );
    expect(out[0].score).toBe(out[1].score);
    expect(out.map((r) => r.path)).toEqual(["first", "second"]);
  });

  it("respects the limit cap (top/bounds)", () => {
    const big = Array.from({ length: 5 }, (_, i) => hit(`n${i}.md`));
    const out = reciprocalRankFusion([{ source: "s", results: big }], 3);
    expect(out.length).toBe(3);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("dedupes by path:line for exact-style hits that carry a line", () => {
    const l1 = { path: "a.md", title: "A", snippet: "", line: 1 };
    const l2 = { path: "a.md", title: "A", snippet: "", line: 2 };
    const out = reciprocalRankFusion(
      [
        { source: "s", results: [l1, l2] },
        { source: "k", results: [l1] },
      ],
      10,
    );
    // Two distinct lines survive; line 1 is boosted by appearing in both.
    expect(out.length).toBe(2);
    expect(out[0].line).toBe(1);
    expect(out[0].sources).toEqual(["s", "k"]);
  });

  it("handles empty input and empty lists without throwing", () => {
    expect(reciprocalRankFusion([], 10)).toEqual([]);
    expect(
      reciprocalRankFusion(
        [
          { source: "s", results: [] },
          { source: "k", results: [] },
        ],
        10,
      ),
    ).toEqual([]);
  });
});

describe("buildAutoResponse", () => {
  const hit = (path: string): VaultSearchResult => ({
    path,
    title: path,
    snippet: "",
  });

  it("is hybrid (source=hybrid, scoreKind=rrf) when both engines contribute", () => {
    const res = buildAutoResponse([hit("a")], [hit("b")], 10);
    expect(res.mode).toBe("auto");
    expect(res.source).toBe("hybrid");
    expect(res.results.every((r) => r.scoreKind === "rrf")).toBe(true);
    expect(res.results.every((r) => typeof r.score === "number")).toBe(true);
    expect(res.results.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("degrades to the single contributing engine when only one has results", () => {
    const res = buildAutoResponse([hit("a")], [], 10);
    expect(res.source).toBe("semantic");
    // Auto is always RRF-scored for consistency within the mode.
    expect(res.results[0].scoreKind).toBe("rrf");
    expect(res.results[0].sources).toEqual(["semantic"]);

    const res2 = buildAutoResponse([], [hit("b")], 10);
    expect(res2.source).toBe("keyword");
    expect(res2.results[0].sources).toEqual(["keyword"]);
  });

  it("returns an empty keyword-shaped response when neither engine has results", () => {
    expect(buildAutoResponse([], [], 10)).toEqual({
      mode: "auto",
      source: "keyword",
      results: [],
    });
  });

  it("boosts consensus: a doc found by both engines outranks single-engine docs", () => {
    const res = buildAutoResponse(
      [hit("a"), hit("b")],
      [hit("b"), hit("c")],
      10,
    );
    expect(res.results[0].path).toBe("b");
    expect(res.results[0].sources).toEqual(["semantic", "keyword"]);
  });
});
