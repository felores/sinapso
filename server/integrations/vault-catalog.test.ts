/**
 * Focused tests for plan 020 U1: vault catalog + Inbox listing.
 *
 * Covers: recursive Inbox listing, configured destination, symlink/traversal
 * rejection, Admin hard exclusions, internal safety excludes, graph-independent
 * notes, mutation refresh (catalog reflects new files immediately, no rescan),
 * title/hash/mtime derivation, and that catalog shares the SHA-256 baseHash
 * contract with write.ts noteHash.
 */
import { describe, it, expect, afterAll } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildVaultCatalog,
  catalogHas,
  findCatalogEntry,
  INTERNAL_SAFETY_EXCLUDES,
  listInbox,
  type CatalogEntry,
} from "./vault-catalog";
import { noteHash } from "./write";

const ROOT = mkdtempSync(join(tmpdir(), "sinapso-catalog-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function note(rel: string, body = "# x\n"): string {
  const full = join(ROOT, rel);
  mkdirSync(join(full).slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, body);
  return rel;
}

describe("buildVaultCatalog: recursive walk + title/mtime/hash derivation", () => {
  it("walks nested folders, derives titles from frontmatter > basename (mirrors scanner), and emits iso mtime + sha256 baseHash", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-1-"));
    try {
      mkdirSync(join(vault, "inbox", "sub"), { recursive: true });
      writeFileSync(
        join(vault, "inbox", "alpha.md"),
        "---\ntitle: Alpha Title\n---\n# H1\n\nbody\n",
      );
      writeFileSync(join(vault, "inbox", "sub", "beta.md"), "# Beta\n\nbody\n");
      writeFileSync(join(vault, "gamma.md"), "no heading here\n");
      const t = new Date("2026-07-18T12:00:00Z");
      utimesSync(join(vault, "inbox", "alpha.md"), t, t);
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      const alpha = catalog.find((e) => e.id === "inbox/alpha.md")!;
      expect(alpha).toBeDefined();
      expect(alpha.title).toBe("Alpha Title"); // frontmatter wins
      expect(alpha.modifiedAt).toBe("2026-07-18T12:00:00.000Z");
      expect(alpha.baseHash).toBe(
        noteHash(readFileSync(join(vault, "inbox", "alpha.md"), "utf-8")),
      );
      const beta = catalog.find((e) => e.id === "inbox/sub/beta.md")!;
      // No frontmatter -> basename (mirrors scanner/scan.ts; H1 is body, not
      // a title source).
      expect(beta.title).toBe("beta");
      const gamma = catalog.find((e) => e.id === "gamma.md")!;
      expect(gamma.title).toBe("gamma"); // basename when nothing else
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("skips internal safety exclude folders (not part of the catalog, not searchable)", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-2-"));
    try {
      for (const ex of INTERNAL_SAFETY_EXCLUDES) {
        mkdirSync(join(vault, ex), { recursive: true });
        writeFileSync(join(vault, ex, "note.md"), "# excluded\n");
      }
      mkdirSync(join(vault, "Raw"), { recursive: true });
      writeFileSync(join(vault, "Raw", "raw-note.md"), "# Raw\n");
      mkdirSync(join(vault, "history"), { recursive: true });
      writeFileSync(join(vault, "history", "h.md"), "# History\n");
      writeFileSync(join(vault, "keep.md"), "# Keep\n");
      writeFileSync(join(vault, "readme.md"), "# Readme\n"); // root operational
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      const ids = catalog.map((e) => e.id).sort();
      // Internal safety excludes drop out; Raw/history are NOT in the safety
      // set (R28: they stay searchable). readme.md is a root operational file
      // and drops out.
      expect(ids).toEqual(["Raw/raw-note.md", "history/h.md", "keep.md"]);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("hard-excludes Admin exclude folders and their contents (AE9)", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-3-"));
    try {
      mkdirSync(join(vault, "Private"), { recursive: true });
      writeFileSync(join(vault, "Private", "secret.md"), "# secret\n");
      mkdirSync(join(vault, "saas", "climatia"), { recursive: true });
      writeFileSync(join(vault, "saas", "climatia", "plan.md"), "# Plan\n");
      writeFileSync(join(vault, "keep.md"), "# Keep\n");
      const catalog = buildVaultCatalog({
        vaultRoot: vault,
        adminExcludes: ["Private"],
      });
      const ids = catalog.map((e) => e.id);
      expect(ids).not.toContain("Private/secret.md");
      expect(ids).toContain("saas/climatia/plan.md");
      expect(ids).toContain("keep.md");
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked directory that escapes the vault", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-4-"));
    const outside = mkdtempSync(join(tmpdir(), "sinapso-cat-4-out-"));
    try {
      writeFileSync(join(outside, "stolen.md"), "# Stolen\n");
      symlinkSync(outside, join(vault, "escape"));
      writeFileSync(join(vault, "keep.md"), "# Keep\n");
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      const ids = catalog.map((e) => e.id);
      expect(ids).toContain("keep.md");
      expect(ids).not.toContain("escape/stolen.md");
    } finally {
      rmSync(vault, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked .md file whose realpath escapes the vault", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-filelink-"));
    const outside = mkdtempSync(join(tmpdir(), "sinapso-cat-filelink-out-"));
    try {
      // Outside-the-vault markdown file that should never enter the catalog.
      writeFileSync(join(outside, "smuggled.md"), "# Smuggled\n");
      symlinkSync(join(outside, "smuggled.md"), join(vault, "linked.md"));
      // In-vault real file as a sanity anchor.
      writeFileSync(join(vault, "keep.md"), "# Keep\n");
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      const ids = catalog.map((e) => e.id);
      expect(ids).toContain("keep.md");
      expect(ids).not.toContain("linked.md");
      // And the smuggled content is not reachable through the catalog.
      expect(catalog.find((e) => e.title === "Smuggled")).toBeUndefined();
    } finally {
      rmSync(vault, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects an in-vault symlink alias that points into an Admin/internal-excluded folder", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-alias-excl-"));
    try {
      // Internal safety exclude (.git) with a real note inside.
      mkdirSync(join(vault, ".git"), { recursive: true });
      writeFileSync(join(vault, ".git", "leaked.md"), "# Leaked Git\n");
      // Admin exclude (Private) with a real note inside.
      mkdirSync(join(vault, "Private"), { recursive: true });
      writeFileSync(join(vault, "Private", "secret.md"), "# Secret\n");
      // In-vault symlink aliases that try to bypass the excludes by another
      // name. Realpath resolution must re-apply the exclude set so the alias
      // is rejected too.
      symlinkSync(join(vault, ".git"), join(vault, "git-link"));
      symlinkSync(join(vault, "Private"), join(vault, "private-link"));
      // File-level alias too: a symlinked .md whose realpath is in Private.
      symlinkSync(
        join(vault, "Private", "secret.md"),
        join(vault, "alias-secret.md"),
      );
      writeFileSync(join(vault, "keep.md"), "# Keep\n");
      const catalog = buildVaultCatalog({
        vaultRoot: vault,
        adminExcludes: ["Private"],
      });
      const ids = catalog.map((e) => e.id).sort();
      // Only the legitimate keep.md survives. The symlinks are dropped because
      // their realpaths resolve into excluded folders.
      expect(ids).toEqual(["keep.md"]);
      expect(catalog.find((e) => e.title === "Leaked Git")).toBeUndefined();
      expect(catalog.find((e) => e.title === "Secret")).toBeUndefined();
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("breaks symlink cycles (a -> b -> a) without hanging or duplicating", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-cycle-"));
    try {
      mkdirSync(join(vault, "a"), { recursive: true });
      mkdirSync(join(vault, "b"), { recursive: true });
      writeFileSync(join(vault, "a", "in-a.md"), "# In A\n");
      writeFileSync(join(vault, "b", "in-b.md"), "# In B\n");
      // Cycle: a/link-to-b -> b, b/link-to-a -> a.
      symlinkSync(join(vault, "b"), join(vault, "a", "link-to-b"));
      symlinkSync(join(vault, "a"), join(vault, "b", "link-to-a"));
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      const ids = catalog.map((e) => e.id);
      // The cycle is broken: each real file appears exactly once. Depending
      // on readdir order, in-b.md may be catalogued via its alias path
      // (a/link-to-b/in-b.md) instead of its canonical path (b/in-b.md); the
      // contract is "exactly once, no duplicates, walk terminates".
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(2);
      expect(
        ids.includes("a/in-a.md") || ids.some((id) => id.endsWith("/in-a.md")),
      ).toBe(true);
      expect(
        ids.includes("b/in-b.md") || ids.some((id) => id.endsWith("/in-b.md")),
      ).toBe(true);
      // No alias path leaks the same FILE twice (the in-b.md content hash
      // appears at most once).
      const hashes = catalog.map((e) => e.baseHash);
      expect(new Set(hashes).size).toBe(hashes.length);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("is independent of graph.nodes: a graph-excluded note is still in the catalog", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-5-"));
    try {
      // A scanner "presentation default" the graph skips but the catalog keeps.
      mkdirSync(join(vault, "Raw"), { recursive: true });
      writeFileSync(join(vault, "Raw", "source.md"), "# Raw Source\n");
      // A note that exists on disk but never made it into graph.nodes.
      writeFileSync(join(vault, "loose.md"), "# Loose Note\n");
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      expect(catalogHas(catalog, "Raw/source.md")).toBe(true);
      expect(catalogHas(catalog, "loose.md")).toBe(true);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe("listInbox: recursive listing of the configured Inbox", () => {
  it("recursively lists every .md under the configured destination with path/title/modifiedAt/baseHash", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-inbox-1-"));
    try {
      mkdirSync(join(vault, "inbox", "deep", "deeper"), { recursive: true });
      writeFileSync(join(vault, "inbox", "q3.md"), "# Q3\n");
      writeFileSync(join(vault, "inbox", "deep", "client.md"), "# Client\n");
      writeFileSync(join(vault, "inbox", "deep", "deeper", "x.md"), "# Deep\n");
      writeFileSync(join(vault, "out.md"), "# Outside Inbox\n");
      const list = listInbox({
        vaultRoot: vault,
        destination: "inbox",
      });
      const ids = list.map((e) => e.id).sort();
      expect(ids).toEqual([
        "inbox/deep/client.md",
        "inbox/deep/deeper/x.md",
        "inbox/q3.md",
      ]);
      // Required fields per R6.
      for (const e of list) {
        expect(typeof e.id).toBe("string");
        expect(typeof e.title).toBe("string");
        expect(typeof e.modifiedAt).toBe("string");
        expect(typeof e.baseHash).toBe("string");
      }
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("honors an alternate configured destination", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-inbox-2-"));
    try {
      mkdirSync(join(vault, "captures"), { recursive: true });
      mkdirSync(join(vault, "inbox"), { recursive: true });
      writeFileSync(join(vault, "captures", "a.md"), "# A\n");
      writeFileSync(join(vault, "inbox", "b.md"), "# B\n");
      const list = listInbox({ vaultRoot: vault, destination: "captures" });
      expect(list.map((e) => e.id)).toEqual(["captures/a.md"]);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("returns [] when the destination does not exist or is outside the vault", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-inbox-3-"));
    try {
      writeFileSync(join(vault, "x.md"), "# X\n");
      expect(
        listInbox({ vaultRoot: vault, destination: "missing" }).length,
      ).toBe(0);
      // Traversal in destination is rejected.
      expect(
        listInbox({ vaultRoot: vault, destination: "../outside" }).length,
      ).toBe(0);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked Inbox destination that escapes the vault", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-inbox-4-"));
    const outside = mkdtempSync(join(tmpdir(), "sinapso-inbox-4-out-"));
    try {
      writeFileSync(join(outside, "stolen.md"), "# Stolen\n");
      symlinkSync(outside, join(vault, "inbox"));
      const list = listInbox({ vaultRoot: vault, destination: "inbox" });
      expect(list).toEqual([]);
    } finally {
      rmSync(vault, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("excludes Admin-excluded Inbox subfolders (AE9)", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-inbox-5-"));
    try {
      mkdirSync(join(vault, "inbox", "private"), { recursive: true });
      writeFileSync(join(vault, "inbox", "keep.md"), "# Keep\n");
      writeFileSync(join(vault, "inbox", "private", "secret.md"), "# Secret\n");
      const list = listInbox({
        vaultRoot: vault,
        destination: "inbox",
        adminExcludes: ["inbox/private"],
      });
      const ids = list.map((e) => e.id);
      expect(ids).toContain("inbox/keep.md");
      expect(ids).not.toContain("inbox/private/secret.md");
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe("catalog mutation refresh (R7/R10)", () => {
  it("reflects new, edited, and removed notes immediately without any rescan", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-refresh-"));
    try {
      writeFileSync(join(vault, "alpha.md"), "# Alpha\n");
      let catalog = buildVaultCatalog({ vaultRoot: vault });
      expect(catalogHas(catalog, "alpha.md")).toBe(true);
      expect(catalogHas(catalog, "beta.md")).toBe(false);

      // Create: a new note on disk appears in the next catalog read.
      writeFileSync(join(vault, "beta.md"), "---\ntitle: Beta\n---\n# Beta\n");
      catalog = buildVaultCatalog({ vaultRoot: vault });
      expect(catalogHas(catalog, "beta.md")).toBe(true);
      const betaBefore = findCatalogEntry(catalog, "beta.md")!;
      expect(betaBefore.title).toBe("Beta");

      // Edit: title + baseHash change reflected.
      writeFileSync(join(vault, "beta.md"), "# Beta V2\n");
      catalog = buildVaultCatalog({ vaultRoot: vault });
      const betaAfter = findCatalogEntry(catalog, "beta.md")!;
      // Title falls back to basename (mirrors scanner); the H1 is body content
      // so the title stays "beta" across the edit. baseHash is the canary.
      expect(betaAfter.title).toBe("beta");
      expect(betaAfter.baseHash).not.toBe(betaBefore.baseHash);

      // Delete: disappears.
      rmSync(join(vault, "beta.md"));
      catalog = buildVaultCatalog({ vaultRoot: vault });
      expect(catalogHas(catalog, "beta.md")).toBe(false);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("shares the exact SHA-256 baseHash contract with write.ts noteHash", () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-cat-hash-"));
    try {
      const body = "# Title\n\nbody with non-ascii: \u00e9\u00f1\n";
      writeFileSync(join(vault, "a.md"), body);
      const catalog = buildVaultCatalog({ vaultRoot: vault });
      const entry: CatalogEntry | undefined = catalog.find(
        (e) => e.id === "a.md",
      );
      expect(entry?.baseHash).toBe(noteHash(body));
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});
