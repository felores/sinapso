/**
 * Vault catalog and Inbox listing (plan 020 U1, KTD6).
 *
 * A filesystem-backed catalog of every Markdown note in the vault that is NOT
 * in the internal safety exclusions or the active Admin exclusions.
 * Independent of `graph.nodes` — a note can be searchable, openable, and
 * Inbox-listed even when the scanner keeps it out of the presentation graph
 * (e.g. `Raw/`/`history/` presentation defaults). Admin-excluded folders are
 * hard-excluded here too, so AE9 holds: an Admin-excluded note is absent from
 * graph, catalog, search, and Inbox.
 *
 * Internal safety excludes mirror scanner/scan.ts's non-content set
 * (editor/tool metadata + the root operational files). `Raw` and `history`
 * (scanner "presentation defaults") are NOT hard-excluded here (R28): they
 * stay out of the graph but remain searchable by path/keyword, exactly so a
 * catalog-only note can be opened by MCP/CLI (R29a).
 *
 * Symlink-aware: a directory whose realpath escapes the vault is skipped, so a
 * symlinked folder cannot pull out-of-vault content into the catalog. This
 * matches write.ts's writer confinement; read routes (/api/note etc.) keep
 * their existing per-file behavior.
 *
 * The single sanctioned writer (write.ts) stays the only code that creates,
 * edits, or moves vault notes; this module only reads.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";

/** Catalog entry: one Markdown note in the vault. */
export interface CatalogEntry {
  /** Vault-relative .md path with forward slashes. */
  id: string;
  title: string;
  /** ISO mtime of the file. */
  modifiedAt: string;
  /** SHA-256 hex over UTF-8 bytes (matches write.ts noteHash). */
  baseHash: string;
}

/**
 * Internal safety excludes — editor/tool metadata and root operational files.
 * Same set as scanner/scan.ts DEFAULT_EXCLUDES minus the presentation defaults
 * (`Raw`, `history`) which stay searchable per R28. Keep in sync with the
 * scanner's non-content folders if it changes.
 */
export const INTERNAL_SAFETY_EXCLUDES = [
  ".obsidian",
  ".trash",
  ".agents",
  ".claude",
  ".git",
  "graphify-out",
  "node_modules",
  ".firecrawl",
  ".gsd",
  ".n8n",
  ".opencode",
] as const;

/** Root operational files excluded from both graph and catalog. Mirrors
 *  scanner/scan.ts ROOT_FILE_EXCLUDES. */
const ROOT_FILE_EXCLUDES = new Set([
  "claude.md",
  "log.md",
  ".log.md",
  "suggestions.md",
  "vault_index.md",
  "readme.md",
]);

export interface CatalogDeps {
  vaultRoot: string;
  /** Active Admin excludes (vault-relative paths). */
  adminExcludes?: string[];
}

/** @deprecated use CatalogDeps (carries adminExcludes). Kept for the
 *  signature parallel; buildVaultCatalog reads adminExcludes off CatalogDeps. */
export interface CatalogOptions {
  adminExcludes?: string[];
}

function buildExcludeSet(adminExcludes?: string[]): Set<string> {
  const out = new Set<string>();
  for (const e of INTERNAL_SAFETY_EXCLUDES) out.add(e.toLowerCase());
  if (adminExcludes)
    for (const raw of adminExcludes) {
      const clean = raw
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .trim();
      if (clean && !clean.includes("..")) out.add(clean.toLowerCase());
    }
  return out;
}

/**
 * True if the lower-cased vault-relative `rel` is excluded. Excludes match
 * ANY path segment (so "Private" excludes "Private/x.md" AND "a/Private/b.md"
 * AND the file "Private.md" only via its basename folder — segment matches
 * are folder-only; root operational files are matched by basename when the
 * note is at the vault root). Multi-segment excludes (e.g. "inbox/private")
 * are also matched as a path prefix, mirroring scanner/scan.ts's behavior.
 */
function isExcluded(rel: string, excludeSet: Set<string>): boolean {
  if (!rel.includes("/")) return ROOT_FILE_EXCLUDES.has(rel);
  const parts = rel.split("/");
  // Single-segment matches any path segment.
  for (const part of parts) if (excludeSet.has(part)) return true;
  // Multi-segment excludes match as a path prefix.
  let prefix = "";
  for (const part of parts) {
    prefix = prefix ? `${prefix}/${part}` : part;
    if (excludeSet.has(prefix)) return true;
  }
  return false;
}

/**
 * Derive a display title. Mirrors scanner/scan.ts's title derivation
 * (frontmatter `title` -> filename) so the catalog and the graph present the
 * same titles. The H1 is intentionally NOT used: the scanner treats H1 as
 * body content, not a title source, so the catalog does the same.
 */
function deriveTitle(id: string, content: string): string {
  const fmBlock = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmBlock) {
    const tMatch = fmBlock[1].match(/^title:\s*(.+?)\s*$/m);
    if (tMatch) {
      const t = tMatch[1].replace(/^['"`]|['"`]$/g, "").trim();
      if (t) return t;
    }
  }
  return id.split("/").pop()!.replace(/\.md$/i, "");
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Recursively walk `vaultRoot` and return every non-excluded .md file as a
 * CatalogEntry. Files that disappear between stat and read are skipped
 * (matches notes-index.ts's behavior). Symlinked directories whose realpath
 * escapes the vault are skipped, mirroring write.ts's writer confinement.
 */
export function buildVaultCatalog(deps: CatalogDeps): CatalogEntry[] {
  const base = resolve(deps.vaultRoot);
  if (!existsSync(base) || !statSync(base).isDirectory()) return [];
  const excludeSet = buildExcludeSet(deps.adminExcludes);
  const realBase = realpathSafe(base);
  const out: CatalogEntry[] = [];
  // Track visited directory realpaths to break symlink cycles (a -> b -> a)
  // and avoid double-indexing when two in-vault symlinks point at the same
  // real folder. Keyed on realpath so any path that lands on the same disk
  // directory is walked at most once.
  const visitedDirs = new Set<string>();
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = resolve(dir, name);
      const rel = relative(base, full).split(sep).join("/");
      if (isExcluded(rel.toLowerCase(), excludeSet)) continue;
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        // Resolve the directory's realpath (also covers symlinks). Skip when:
        //   - realpath is outside the vault (a symlink escaping the vault);
        //   - the realpath's vault-relative path is Admin/internal-excluded
        //     (an in-vault symlink alias of `.git/`, `Private/`, etc.);
        //   - we have already walked this real directory (cycle / alias).
        // Cheap: one realpath per directory.
        let real: string;
        try {
          real = realpathSync(full);
        } catch {
          continue;
        }
        if (real !== realBase && !real.startsWith(realBase + sep)) continue;
        const realRel = relative(realBase, real).split(sep).join("/");
        if (
          realRel &&
          (realRel === rel
            ? false
            : isExcluded(realRel.toLowerCase(), excludeSet))
        )
          continue;
        if (visitedDirs.has(real)) continue;
        visitedDirs.add(real);
        walk(full);
      } else if (st.isFile() && name.toLowerCase().endsWith(".md")) {
        // Resolve the file's realpath. Skip when:
        //   - realpath is outside the vault (a symlinked .md escaping);
        //   - the realpath's vault-relative path is Admin/internal-excluded
        //     (a symlink alias exposing an Admin-excluded file by another name).
        let real: string;
        try {
          real = realpathSync(full);
        } catch {
          continue;
        }
        if (real !== realBase && !real.startsWith(realBase + sep)) continue;
        const realRel = relative(realBase, real).split(sep).join("/");
        if (
          realRel &&
          (realRel === rel
            ? false
            : isExcluded(realRel.toLowerCase(), excludeSet))
        )
          continue;
        try {
          const content = readFileSync(full, "utf-8");
          out.push({
            id: rel,
            title: deriveTitle(rel, content),
            modifiedAt: st.mtime.toISOString(),
            baseHash: sha256Hex(content),
          });
        } catch {
          /* file vanished or unreadable: skip */
        }
      }
    }
  };
  visitedDirs.add(realBase);
  walk(base);
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

/** Resolve realpath with a try/catch so a missing/unreadable path returns the
 *  input as-is (the caller decides what to do). */
function realpathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Recursive listing of the configured Inbox (`destination`). Each entry is a
 * CatalogEntry scoped to the destination prefix. Confinement and excludes are
 * inherited from buildVaultCatalog, so an Admin-excluded Inbox subfolder
 * disappears from the listing (AE9), and a symlinked destination that escapes
 * the vault yields [] (the destination's realpath must be under the vault).
 */
export function listInbox(
  deps: CatalogDeps & { destination: string },
): CatalogEntry[] {
  const dest = deps.destination
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  if (!dest || dest.includes("..")) return [];
  const base = resolve(deps.vaultRoot);
  const full = resolve(base, dest);
  // Pure-path confinement: destination must resolve strictly under the vault.
  if (full !== base && !full.startsWith(base + sep)) return [];
  if (!existsSync(full) || !statSync(full).isDirectory()) return [];
  // Symlink escape: realpath must be under the vault.
  try {
    const realBase = realpathSafe(base);
    const real = realpathSync(full);
    if (real !== realBase && !real.startsWith(realBase + sep)) return [];
  } catch {
    return [];
  }
  const prefix = dest + "/";
  return buildVaultCatalog(deps)
    .filter((e) => e.id === dest || e.id.startsWith(prefix))
    .sort(
      (a, b) =>
        b.modifiedAt.localeCompare(a.modifiedAt) || a.id.localeCompare(b.id),
    );
}

/** True when `id` is present in the catalog. */
export function catalogHas(
  catalog: ReadonlyArray<CatalogEntry>,
  id: string,
): boolean {
  return catalog.some((e) => e.id === id);
}

/** Find a catalog entry by id (or undefined). */
export function findCatalogEntry(
  catalog: ReadonlyArray<CatalogEntry>,
  id: string,
): CatalogEntry | undefined {
  return catalog.find((e) => e.id === id);
}
