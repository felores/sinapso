import { describe, expect, it } from "vitest";
import {
  buildInboxReview,
  mergeMarkdown,
  reviewCardId,
  type ReviewNote,
} from "./inbox-review";

const note = (
  path: string,
  content: string,
  title = path.replace(/\.md$/, ""),
): ReviewNote => ({
  path,
  title,
  hash: `hash:${path}:${content}`,
  content,
});

describe("buildInboxReview", () => {
  it.each([
    ["- [ ] send proposal", "unchecked task"],
    ["TODO finish this", "TODO or FIXME"],
    ["body\n\n## Next", "heading that has no body"],
  ])("suggests continue for explicit unfinished signal", (content, reason) => {
    expect(buildInboxReview([note("a.md", content)])[0]).toMatchObject({
      action: "continue",
      reason: expect.stringContaining(reason),
    });
  });

  it("does not infer unfinished work from age or ordinary prose", () => {
    expect(buildInboxReview([note("a.md", "Finished prose.\n")])).toEqual([]);
  });

  it("archives empty notes and exact duplicates, never age-only", () => {
    const cards = buildInboxReview([
      note("a.md", "same"),
      note("b.md", "same"),
      note("empty.md", "  \n"),
      note("old.md", "ordinary"),
    ]);
    expect(cards.filter((c) => c.action === "archive")).toHaveLength(2);
    expect(cards.find((c) => c.note.path === "b.md")).toMatchObject({
      action: "archive",
      target: { path: "a.md" },
    });
    expect(cards.some((c) => c.note.path === "old.md")).toBe(false);
    expect(
      cards.some((c) => c.note.path === "b.md" && c.action === "merge"),
    ).toBe(false);
  });

  it("merges normalized-title collisions", () => {
    const cards = buildInboxReview([
      note("a.md", "one", "Café Plan"),
      note("b.md", "two", "Cafe-plan"),
    ]);
    expect(cards).toContainEqual(
      expect.objectContaining({
        action: "merge",
        note: expect.objectContaining({ path: "b.md" }),
      }),
    );
  });

  it("uses the 0.90 semantic merge boundary and omits semantics when unavailable", () => {
    const notes = [note("a.md", "one"), note("b.md", "two")];
    expect(
      buildInboxReview(notes, {
        semanticEdges: [{ source: "a.md", target: "b.md", score: 0.9 }],
      }).filter((c) => c.action === "merge"),
    ).toHaveLength(2);
    expect(
      buildInboxReview(notes).some(
        (c) => c.action === "merge" || c.action === "link",
      ),
    ).toBe(false);
  });

  it("links a cached neighbor unless already linked", () => {
    const edge = [{ source: "a.md", target: "b.md", score: 0.8 }];
    expect(
      buildInboxReview(
        [note("a.md", "body"), note("b.md", "other", "Related")],
        { semanticEdges: edge },
      ),
    ).toContainEqual(
      expect.objectContaining({
        action: "link",
        note: expect.objectContaining({ path: "a.md" }),
      }),
    );
    expect(
      buildInboxReview(
        [note("a.md", "[[Related]]"), note("b.md", "other", "Related")],
        { semanticEdges: edge },
      ).some((c) => c.action === "link" && c.note.path === "a.md"),
    ).toBe(false);
  });

  it("offers explicit ingest per note only when a wiki exists and caps cards", () => {
    const notes = Array.from({ length: 60 }, (_, i) => note(`${i}.md`, "done"));
    expect(buildInboxReview(notes).some((c) => c.action === "ingest")).toBe(
      false,
    );
    expect(buildInboxReview(notes, { enabledWikiCount: 1 })).toHaveLength(50);
  });

  it("changes identity when source or target hash changes", () => {
    const source = note("a.md", "one");
    const target = note("b.md", "two");
    expect(reviewCardId(source, "merge", target)).not.toBe(
      reviewCardId({ ...source, hash: "changed" }, "merge", target),
    );
    expect(reviewCardId(source, "merge", target)).not.toBe(
      reviewCardId(source, "merge", { ...target, hash: "changed" }),
    );
  });
});

describe("mergeMarkdown", () => {
  it("keeps target frontmatter and strips source frontmatter + matching H1", () => {
    expect(
      mergeMarkdown(
        "---\ntitle: T\n---\n# Target\nBody\n",
        "---\ntitle: S\n---\n# Source\nMore\n",
        "Source",
      ),
    ).toBe(
      "---\ntitle: T\n---\n# Target\nBody\n\n## Merged from Source\n\nMore\n",
    );
  });

  it("uses target CRLF style", () => {
    const merged = mergeMarkdown(
      "# Target\r\nBody\r\n",
      "# Source\nMore\n",
      "Source",
    );
    expect(merged).toBe(
      "# Target\r\nBody\r\n\r\n## Merged from Source\r\n\r\nMore\r\n",
    );
    expect(merged.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
