/**
 * Research history: an app-local log of web/semantic research results so the
 * user can page back through past queries and curate the good ones into the
 * vault. Lives in `<dataDir>/research/` (runtime, gitignored) — NEVER in the
 * vault and NEVER in the graph, so it stays out of the single vault-write path
 * (write.ts). One JSON file per entry: trivial append, delete, and clear.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";

/** Keep the newest N entries; older ones are pruned on write. */
const CAP = 200;
/** Server-generated ids only ever use these chars — enforced on delete. */
const ID_RE = /^[a-z0-9-]+$/;

export interface ResearchHistoryEntry {
  id: string;
  ts: string; // ISO
  mode: "web" | "semantic" | "article" | "document";
  query: string;
  /** Web deep answer + citations (null for semantic or no-answer). */
  answer?: {
    content: string;
    citations: Array<{ url: string; title: string }>;
  } | null;
  /** Web ResearchResult[] or semantic NodeResult[] — re-rendered by the client. */
  results?: unknown[];
  /** Full-text article fetched from a web result (mode "article"). */
  article?: {
    url: string;
    title: string;
    content: string;
    publishedDate: string | null;
    author: string | null;
  };
  /** Agent-authored working document (mode "document"), edited across turns. */
  document?: {
    title: string;
    content: string;
  };
}

function dir(dataDir: string): string {
  return join(dataDir, "research");
}

/** kebab slug of the query, for a human-readable filename tail. */
function slug(query: string): string {
  return (
    query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "query"
  );
}

/** Append an entry (id + ts generated here), prune to CAP, return it. */
export function saveEntry(
  dataDir: string,
  entry: Omit<ResearchHistoryEntry, "id" | "ts">,
): ResearchHistoryEntry {
  const d = dir(dataDir);
  mkdirSync(d, { recursive: true });
  const ts = new Date().toISOString();
  const id = `${Date.now().toString(36)}-${slug(entry.query)}`;
  const full: ResearchHistoryEntry = { id, ts, ...entry };
  writeFileSync(join(d, `${id}.json`), JSON.stringify(full), "utf-8");
  prune(d);
  return full;
}

/** Create or overwrite an entry with a caller-supplied id (the agent's working
 *  document, upserted in place across turns). Refreshes ts each write. */
export function upsertEntry(
  dataDir: string,
  entry: Omit<ResearchHistoryEntry, "ts">,
): ResearchHistoryEntry {
  if (!ID_RE.test(entry.id)) throw new Error("bad entry id");
  const d = dir(dataDir);
  mkdirSync(d, { recursive: true });
  const full: ResearchHistoryEntry = { ...entry, ts: new Date().toISOString() };
  writeFileSync(join(d, `${entry.id}.json`), JSON.stringify(full), "utf-8");
  return full;
}

/** All entries, newest first. Ids sort chronologically (base36 ts prefix). */
export function listEntries(dataDir: string): ResearchHistoryEntry[] {
  const d = dir(dataDir);
  if (!existsSync(d)) return [];
  const out: ResearchHistoryEntry[] = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(d, f), "utf-8")));
    } catch {
      // skip a corrupt entry rather than fail the whole list
    }
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

/** Delete one entry. Returns false for a bad id or a missing file. */
export function deleteEntry(dataDir: string, id: string): boolean {
  if (!ID_RE.test(id)) return false; // path-traversal guard
  const d = resolve(dir(dataDir));
  const full = resolve(d, `${id}.json`);
  if (!full.startsWith(d + sep) || !existsSync(full)) return false;
  rmSync(full);
  return true;
}

/** Remove all history. Returns how many entries were deleted. */
export function clearEntries(dataDir: string): number {
  const d = dir(dataDir);
  if (!existsSync(d)) return 0;
  const files = readdirSync(d).filter((f) => f.endsWith(".json"));
  for (const f of files) rmSync(join(d, f));
  return files.length;
}

function prune(d: string): void {
  const files = readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .sort(); // base36-ts prefix sorts oldest-first
  for (const f of files.slice(0, Math.max(0, files.length - CAP)))
    rmSync(join(d, f));
}
