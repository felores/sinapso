/**
 * search_vault backend helpers (consolidated agent discovery).
 *
 * Pure normalization, path-mode filtering, and ranking/fusion for the unified
 * `/api/search-vault` route. The route orchestrates the four modes
 * (auto/semantic/exact/path) over the existing qmd semantic layer, the
 * MiniSearch keyword index, and the graph; this module owns the input
 * parsing, the vault-confined path/title matching, the Reciprocal Rank
 * Fusion that blends semantic + keyword in `auto` mode (native scores from
 * different engines are NOT comparable), and the bounded, deduped, ranked
 * result shape every mode returns. No file reads, no regex, no reads
 * outside the vault (path mode only touches graph node ids).
 */

export type VaultSearchMode = "auto" | "semantic" | "exact" | "path";

export const VAULT_SEARCH_MODES: readonly VaultSearchMode[] = [
  "auto",
  "semantic",
  "exact",
  "path",
];

/** How a result's `score` was produced. Raw engine scores are only meaningful
 *  within the same scoreKind; never compare them across kinds or modes. */
export type ScoreKind = "rrf" | "semantic" | "keyword" | "exact" | "path";

/** One normalized hit. `line`/`terms` are present only for exact matches.
 *  `rank` is the stable 1-based recommended order for the agent. */
export interface VaultSearchResult {
  path: string;
  title: string;
  snippet: string;
  line?: number;
  terms?: string[];
  /** 1-based stable rank; the recommended reading order for agents. */
  rank?: number;
  /** Ranking score. Engine-native for pure modes (semantic/keyword); RRF for
   *  `auto`. NOT comparable across scoreKind/engines — use `rank` for that. */
  score?: number;
  /** How `score` was produced. */
  scoreKind?: ScoreKind;
  /** Engines that returned this doc (present for `auto`/RRF results). */
  sources?: string[];
}

/** Minimal graph node shape the path mode needs. Phantom notes are skipped. */
export interface VaultSearchGraphNode {
  id: string;
  title: string;
  phantom?: boolean;
}

export interface VaultSearchResponse {
  mode: VaultSearchMode;
  /** Which backend produced the results; "hybrid" = RRF over semantic+keyword
   *  (both contributed). `auto` degrades to "semantic"/"keyword" when only one
   *  engine returned anything. */
  source: "hybrid" | "semantic" | "keyword" | "exact" | "path";
  results: VaultSearchResult[];
}

/** Cap on merged variants so one call stays bounded. */
export const MAX_VARIANTS = 4;

/**
 * Parse the multi-query input. Accepts newline- or pipe-separated variants
 * (one phrasing per line); a single `q` is one variant. Trim, drop empties,
 * dedupe preserving order, cap at MAX_VARIANTS.
 */
export function parseQueries(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw).split(/[\n|]/)) {
    const q = part.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push(q);
    if (out.length >= MAX_VARIANTS) break;
  }
  return out;
}

/** Normalize a folder scope: strip leading/trailing slashes. Empty -> "". */
export function normalizeScope(path: unknown): string {
  if (typeof path !== "string") return "";
  return path.trim().replace(/^\/+|\/+$/g, "");
}

/** Coerce the mode param; unknown/missing -> "auto". */
export function parseMode(raw: unknown): VaultSearchMode {
  return typeof raw === "string" &&
    (VAULT_SEARCH_MODES as readonly string[]).includes(raw)
    ? (raw as VaultSearchMode)
    : "auto";
}

/** Clamp a positive integer with a default + ceiling. */
export function clampLimit(raw: unknown, def: number, max: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}

/** True when a vault-relative id lives under `scope` ("" = whole vault). */
export function inScope(id: string, scope: string): boolean {
  return !scope || id === scope || id.startsWith(scope + "/");
}

/**
 * Path mode: substring match (case-insensitive) of every query against each
 * non-phantom node's id (path), basename, and title. Pure string work over
 * graph node ids, so it is vault-confined by construction. Results are deduped
 * by path, capped at `limit`.
 */
export function pathMatch(
  nodes: ReadonlyArray<VaultSearchGraphNode>,
  queries: string[],
  scope: string,
  limit: number,
): VaultSearchResult[] {
  if (!queries.length) return [];
  const needles = queries.map((q) => q.toLowerCase());
  const out: VaultSearchResult[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (n.phantom) continue;
    if (!inScope(n.id, scope)) continue;
    const hay = [
      n.id.toLowerCase(),
      (n.id.split("/").pop() ?? n.id).toLowerCase(),
      n.title.toLowerCase(),
    ];
    if (!needles.some((needle) => hay.some((h) => h.includes(needle))))
      continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({ path: n.id, title: n.title, snippet: "" });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Merge heterogeneous hits (semantic nodes, keyword hits, exact matches) into
 * one deduped, capped list. Dedup keeps the first occurrence per path; for
 * exact results (which carry a line) dedup is per `path:line`. `limit` caps.
 * Preserves any per-doc fields (score, line, terms) from the first-seen hit.
 */
export function mergeResults(
  batches: ReadonlyArray<VaultSearchResult[]>,
  limit: number,
): VaultSearchResult[] {
  const out: VaultSearchResult[] = [];
  const seenPath = new Set<string>();
  const seenPathLine = new Set<string>();
  for (const batch of batches) {
    for (const r of batch) {
      const key = typeof r.line === "number" ? `${r.path}:${r.line}` : r.path;
      const bucket = typeof r.line === "number" ? seenPathLine : seenPath;
      if (bucket.has(key)) continue;
      bucket.add(key);
      out.push(r);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** RRF smoothing constant (the standard 60 from Cormack et al. 2009). */
export const RRF_K = 60;

/** One ranked input list plus the engine label that produced it. */
export interface RankedSource {
  source: string;
  results: VaultSearchResult[];
}

/**
 * Reciprocal Rank Fusion: merge multiple ranked lists into one WITHOUT
 * comparing native scores (qmd vsearch cosine and MiniSearch BM25-like scores
 * live on different scales and are not comparable). Each input list MUST
 * already be in relevance order from its engine. For each doc,
 *   score = sum over lists of 1 / (k + rank_in_list)   (rank is 1-based).
 * Docs found by more than one engine score higher, so consensus is rewarded.
 * Dedup key is `path`, or `path:line` for exact-style hits that carry a line.
 * Output is sorted by RRF score desc with a stable first-seen tiebreak, each
 * result tagged with `scoreKind: "rrf"`, the contributing `sources`, a final
 * 1-based `rank`, and capped at `limit`.
 */
export function reciprocalRankFusion(
  sources: ReadonlyArray<RankedSource>,
  limit: number,
  k: number = RRF_K,
): VaultSearchResult[] {
  interface Acc {
    doc: VaultSearchResult;
    score: number;
    sources: string[];
    order: number; // first-seen index, for a stable tiebreak
  }
  const acc = new Map<string, Acc>();
  let order = 0;
  for (const { source, results } of sources) {
    for (let i = 0; i < results.length; i++) {
      const doc = results[i];
      const key =
        typeof doc.line === "number" ? `${doc.path}:${doc.line}` : doc.path;
      let entry = acc.get(key);
      if (!entry) {
        entry = { doc, score: 0, sources: [], order: order++ };
        acc.set(key, entry);
      }
      entry.score += 1 / (k + (i + 1));
      if (!entry.sources.includes(source)) entry.sources.push(source);
    }
  }
  const fused = Array.from(acc.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });
  return fused.slice(0, limit).map((e, idx) => ({
    ...e.doc,
    rank: idx + 1,
    score: e.score,
    scoreKind: "rrf" as const,
    sources: e.sources,
  }));
}

/**
 * Tag a single engine's ranked list with a sequential 1-based `rank` and the
 * given `scoreKind`. Preserves the engine's native `score` when present
 * (semantic/keyword). `exact`/`path` emit no `score` — the rank is the only
 * meaningful order for those modes. Caps at `limit`.
 */
export function tagRanked(
  results: ReadonlyArray<VaultSearchResult>,
  scoreKind: ScoreKind,
  limit: number,
): VaultSearchResult[] {
  return results.slice(0, limit).map((r, i) => ({
    ...r,
    rank: i + 1,
    scoreKind,
  }));
}

/**
 * Build the `auto` response from already-ranked per-engine lists. Pure: no
 * I/O, no engine calls. Runs RRF over the non-empty sources. `source` is
 * "hybrid" when both engines contributed, otherwise the single contributing
 * engine name, or "keyword" when neither did (semantic layer unavailable).
 * In `auto`, `score` is always an RRF score (even single-source) so the
 * scoreKind is consistent within the mode.
 */
export function buildAutoResponse(
  semanticRanked: ReadonlyArray<VaultSearchResult>,
  keywordRanked: ReadonlyArray<VaultSearchResult>,
  limit: number,
): VaultSearchResponse {
  const sources: RankedSource[] = [];
  if (semanticRanked.length)
    sources.push({
      source: "semantic",
      results: semanticRanked as VaultSearchResult[],
    });
  if (keywordRanked.length)
    sources.push({
      source: "keyword",
      results: keywordRanked as VaultSearchResult[],
    });
  if (!sources.length) return { mode: "auto", source: "keyword", results: [] };
  const fused = reciprocalRankFusion(sources, limit);
  const source =
    sources.length > 1
      ? ("hybrid" as const)
      : (sources[0].source as VaultSearchResponse["source"]);
  return { mode: "auto", source, results: fused };
}
