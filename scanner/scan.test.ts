import { describe, it, expect } from "vitest";
import {
  extractStructuralLinkTargets,
  scanVault,
  structuralLinkSignature,
} from "./scan";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "fixtures");

const scan = () => scanVault({ vault: FIXTURES });

describe("scanner: link resolution", () => {
  it("extracts the same targets used by the scanner", () => {
    expect(
      extractStructuralLinkTargets(
        "[[Alpha#section|label]] [Beta](../beta.md) ![image](image.md) [web](https://example.com)",
        "notes/source.md",
      ),
    ).toEqual(["Alpha", "beta"]);
  });

  it("compares structural links as an order-independent multiset", () => {
    const source = "notes/source.md";
    expect(
      structuralLinkSignature(
        "[[Alpha|first]] [[Beta]] [[Alpha#section]]",
        source,
      ),
    ).toBe(
      structuralLinkSignature(
        "Prose changed. [[beta|renamed]] [[alpha]] [[ALPHA]]",
        source,
      ),
    );
    expect(structuralLinkSignature("[[Alpha]]", source)).not.toBe(
      structuralLinkSignature("[[Alpha]] [[Alpha]]", source),
    );
  });

  it("canonicalizes mixed link syntax to resolved scanner endpoints", () => {
    const source = "folder/source.md";
    const nodes = [source, "folder/target.md"];
    expect(structuralLinkSignature("[[target]]", source, nodes)).toBe(
      structuralLinkSignature("[target](target.md)", source, nodes),
    );
    expect(
      structuralLinkSignature("[[target]] [target](target.md)", source, nodes),
    ).not.toBe(structuralLinkSignature("[[target]]", source, nodes));
  });

  it("ignores non-note Markdown targets in structural signatures", () => {
    const source = "notes/source.md";
    expect(
      structuralLinkSignature(
        "[anchor](#part) [site](https://example.com) [mail](mailto:a@b.com) [text](file.txt) ![image](image.md)",
        source,
      ),
    ).toBe("");
  });

  it("resolves [[wiki]] links by basename", () => {
    const g = scan();
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain("a.md");
    expect(ids).toContain("b.md");
    expect(
      g.links.some((l) => l.source === "a.md" && l.target === "b.md"),
    ).toBe(true);
  });

  it("resolves relative markdown links [text](path.md)", () => {
    const g = scan();
    expect(
      g.links.some((l) => l.source === "a.md" && l.target === "sub/c.md"),
    ).toBe(true);
  });

  it("normalizes ../ in markdown links", () => {
    const g = scan();
    expect(
      g.links.some((l) => l.source === "sub/c.md" && l.target === "a.md"),
    ).toBe(true);
  });

  it("creates a phantom node for unresolved wiki links", () => {
    const g = scan();
    const phantoms = g.nodes.filter((n) => n.phantom);
    expect(phantoms.length).toBe(1);
    expect(g.meta.phantoms).toBe(1);
  });
});

describe("scanner: frontmatter", () => {
  it("uses the OKF title as the node label", () => {
    const g = scan();
    const b = g.nodes.find((n) => n.id === "b.md");
    expect(b?.title).toBe("Banana");
  });

  it("reads frontmatter tags", () => {
    const g = scan();
    const a = g.nodes.find((n) => n.id === "a.md");
    expect(a?.tags).toEqual(expect.arrayContaining(["fruit", "red"]));
  });
});

describe("scanner: excludes", () => {
  it("omits DEFAULT_EXCLUDES directories (.gsd)", () => {
    const g = scan();
    const ids = g.nodes.map((n) => n.id);
    expect(ids.some((id) => id.includes(".gsd"))).toBe(false);
  });

  it("honors an explicit --exclude path", () => {
    const g = scanVault({ vault: FIXTURES, exclude: ["sub"] });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain("a.md");
    expect(ids.some((id) => id.startsWith("sub/"))).toBe(false);
  });
});
