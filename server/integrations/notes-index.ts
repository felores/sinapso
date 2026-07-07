/**
 * Search + grep module (U6, R3d).
 *
 * Two seams lifted out of server/app.ts:
 *   - buildSearchIndex(nodes, vaultRoot) -> handle with .search(query)
 *     holding the MiniSearch index and the in-memory `contents` map
 *     used for snippet extraction. The handle's .invalidate() is what
 *     the reload() path calls to drop both — preserving the exact
 *     rebuild-on-rescan timing the route has today.
 *   - grepNote(content, query, contextLines, options?) -> today's match
 *     shape: 1-based line numbers, the original line text, and a small
 *     context window. Literal substring scan (no regex, so no ReDoS);
 *     regex metacharacters in the query are treated as text.
 *
 * Behavior is byte-identical to the inline /api/search and /api/note-grep
 * bodies: the index skips phantom nodes, the build is lazy on the first
 * non-empty search, and an empty query returns [] without ever building.
 * The regression test server/integrations/notes-index.test.ts compares
 * the refactored route's output against a captured baseline.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import MiniSearch from "minisearch";

/** Single hit shape returned by /api/search today. */
export interface SearchHit {
  id: string;
  title: string;
  score: number;
  snippet: string;
}

/** Minimal node shape the index needs. Phantom notes are skipped. */
export interface SearchIndexNode {
  id: string;
  title: string;
  phantom?: boolean;
}

/**
 * Opaque handle over the in-memory search index. Routes call
 * `search(q)` to query and `invalidate()` from the reload() path to
 * force a fresh build on the next call. The build itself is lazy
 * (first non-empty search) so cold boot stays fast.
 */
export interface SearchIndex {
  search(query: string): SearchHit[];
  invalidate(): void;
}

const SEARCH_HIT_LIMIT = 20;
// MiniSearch snippet window: 50 chars of pre-roll, 70 chars of post-roll,
// whitespace squashed, leading/trailing "…" inserted when the slice is
// bounded away from the file edges. Same numbers the route inlined today.
const SNIPPET_PREROLL = 50;
const SNIPPET_POSTROLL = 70;

/**
 * Build the search handle. Reads each non-phantom node's file content
 * lazily on the first search (the index is held in memory; the build
 * takes ~1-2s for ~2k notes). Files that move between scan and search
 * are skipped, not raised — the same try/catch the inline code had.
 */
export function buildSearchIndex(
  nodes: SearchIndexNode[],
  vaultRoot: string,
): SearchIndex {
  let ms: MiniSearch | null = null;
  let contents = new Map<string, string>();

  const build = (): MiniSearch => {
    const m = new MiniSearch({
      fields: ["title", "content"],
      storeFields: ["title"],
      searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15 },
    });
    contents = new Map();
    const docs: Array<{ id: string; title: string; content: string }> = [];
    for (const n of nodes) {
      if (n.phantom) continue;
      try {
        const text = readFileSync(resolve(vaultRoot, n.id), "utf-8");
        contents.set(n.id, text);
        docs.push({ id: n.id, title: n.title, content: text });
      } catch {
        // file moved/deleted since scan; skip it (matches inline behavior)
      }
    }
    m.addAll(docs);
    return m;
  };

  const snippet = (id: string, terms: string[]): string => {
    const text = contents.get(id) ?? "";
    const lower = text.toLowerCase();
    for (const t of terms) {
      const at = lower.indexOf(t.toLowerCase());
      if (at >= 0) {
        const start = Math.max(0, at - SNIPPET_PREROLL);
        const end = Math.min(text.length, at + t.length + SNIPPET_POSTROLL);
        return (
          (start > 0 ? "…" : "") +
          text.slice(start, end).replace(/\s+/g, " ").trim() +
          (end < text.length ? "…" : "")
        );
      }
    }
    return "";
  };

  return {
    search(query: string): SearchHit[] {
      if (!query.trim()) return [];
      if (!ms) ms = build();
      return ms
        .search(query)
        .slice(0, SEARCH_HIT_LIMIT)
        .map((h) => ({
          id: h.id as string,
          title: h.title as string,
          score: h.score,
          snippet: snippet(h.id as string, h.terms),
        }));
    },
    invalidate(): void {
      ms = null;
      contents = new Map();
    },
  };
}

/** Single match shape returned by /api/note-grep today. */
export interface GrepMatch {
  line: number;
  text: string;
  snippet: string;
}

export interface GrepOptions {
  ignoreCase?: boolean;
  limit?: number;
}

/**
 * Literal substring scan over `content`, returning one entry per
 * matching line (1-based) with `contextLines` lines of context on each
 * side in the snippet. No regex — `query` is treated as text, so
 * metacharacters like `.`, `*`, `(`, `)`, `^`, `$` match literally.
 * Matches are returned in source order, capped at `options.limit`
 * (defaults to 30 to mirror the route's default).
 */
export function grepNote(
  content: string,
  query: string,
  contextLines: number = 2,
  options: GrepOptions = {},
): GrepMatch[] {
  const ignoreCase = options.ignoreCase ?? false;
  const limit = options.limit ?? 30;
  if (!query) return [];
  const lines = content.split("\n");
  const needle = ignoreCase ? query.toLowerCase() : query;
  const matches: GrepMatch[] = [];
  for (let i = 0; i < lines.length && matches.length < limit; i++) {
    const hay = ignoreCase ? lines[i].toLowerCase() : lines[i];
    if (!hay.includes(needle)) continue;
    const from = Math.max(i - contextLines, 0);
    matches.push({
      line: i + 1,
      text: lines[i],
      snippet: lines.slice(from, i + contextLines + 1).join("\n"),
    });
  }
  return matches;
}
