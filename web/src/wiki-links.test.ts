import { describe, expect, it } from "vitest";
import { createWikiTargetResolver, type WikiTarget } from "./wiki-links";

const nodes: WikiTarget[] = [
  { id: "team/a/brief.md", title: "Quarterly Brief" },
  { id: "team/b/brief.md", title: "Other Brief" },
  { id: "notes/filename.md", title: "Frontmatter Title" },
  { id: "phantom:missing note", title: "Missing Note", phantom: true },
];

describe("wiki target resolution", () => {
  const resolve = createWikiTargetResolver(nodes);

  it("prefers an exact case-insensitive path over duplicate basenames", () => {
    expect(resolve("TEAM/B/BRIEF")?.id).toBe("team/b/brief.md");
  });

  it("uses first-file-wins for basename resolution and path misses", () => {
    expect(resolve("brief")?.id).toBe("team/a/brief.md");
    expect(resolve("missing/folder/brief")?.id).toBe("team/a/brief.md");
  });

  it("resolves filename basenames when frontmatter title differs", () => {
    expect(resolve("filename")?.id).toBe("notes/filename.md");
  });

  it("strips headings and a terminal markdown extension", () => {
    expect(resolve("notes/filename.md#section")?.id).toBe("notes/filename.md");
  });

  it("retains the legacy title and phantom fallbacks", () => {
    expect(resolve("Frontmatter Title")?.id).toBe("notes/filename.md");
    expect(resolve("Missing Note")?.id).toBe("phantom:missing note");
  });
});
