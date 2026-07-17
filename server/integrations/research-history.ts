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
import type { ConvertedDocument } from "./ingest.js";

/** Keep the newest N entries; older ones are pruned on write. */
const CAP = 200;
/** Server-generated ids only ever use these chars — enforced on delete. */
const ID_RE = /^[a-z0-9-]+$/;

export interface ResearchHistoryEntry {
  id: string;
  ts: string; // ISO
  mode: "web" | "semantic" | "keyword" | "article" | "document";
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
    revision?: string;
  };
}

function compactMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

function stripLeadingTitle(content: string, title: string): string {
  const t = title.trim().toLowerCase();
  if (!t) return content;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (
    i < lines.length &&
    lines[i]
      .replace(/^#{1,6}\s+/, "")
      .trim()
      .toLowerCase() === t
  ) {
    return lines
      .slice(i + 1)
      .join("\n")
      .replace(/^\n+/, "");
  }
  return content;
}

function link(title: string, url: string): string {
  return `[${(title || url).replace(/[\[\]\n]/g, " ").trim()}](${url})`;
}

function webResultsMarkdown(results: unknown[]): string[] {
  return results.flatMap((row) => {
    const r = row as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    const snippet = typeof r.snippet === "string" ? r.snippet.trim() : "";
    const publishedDate =
      typeof r.publishedDate === "string" ? r.publishedDate.slice(0, 10) : "";
    if (!title && !url && !snippet) return [];
    return [
      `### ${url ? link(title || url, url) : title || "Untitled result"}`,
      ...(publishedDate ? [`Published: ${publishedDate}`] : []),
      "",
      snippet,
      "",
    ];
  });
}

/** Turn persisted curatable research into the common ingestion envelope. */
export function convertedFromResearchEntry(
  entry: ResearchHistoryEntry,
): ConvertedDocument | null {
  if (entry.mode === "document" && entry.document) {
    return {
      source: `sinapso:research:${entry.id}`,
      sourceLabel: `Sinapso working document: ${entry.document.title}`,
      title: entry.document.title,
      markdown: compactMarkdown(entry.document.content),
      via: "sinapso-working-document",
    };
  }
  if (entry.mode === "article" && entry.article) {
    const article = entry.article;
    return {
      source: article.url,
      sourceLabel: article.author
        ? `${article.url} (by ${article.author})`
        : article.url,
      title: article.title || entry.query,
      markdown: compactMarkdown(
        [
          `# ${article.title || entry.query}`,
          "",
          `Source: [${article.url}](${article.url})`,
          ...(article.author ? [`Author: ${article.author}`] : []),
          ...(article.publishedDate
            ? [`Published: ${article.publishedDate}`]
            : []),
          "",
          stripLeadingTitle(article.content, article.title || entry.query),
          "",
        ].join("\n"),
      ),
      via: "sinapso-web-article",
    };
  }
  if (entry.mode === "web" && entry.answer?.content) {
    const citations = entry.answer.citations.map(
      (citation, i) => `${i + 1}. ${link(citation.title, citation.url)}`,
    );
    return {
      source: `sinapso:research:${entry.id}`,
      sourceLabel: `Sinapso web research: ${entry.query}`,
      title: entry.query,
      markdown: compactMarkdown(
        [
          `# ${entry.query}`,
          "",
          "## Synthesis",
          "",
          entry.answer.content,
          ...(citations.length ? ["", "## Sources", "", ...citations] : []),
          ...(entry.results?.length
            ? [
                "",
                "## Result excerpts",
                "",
                ...webResultsMarkdown(entry.results),
              ]
            : []),
          "",
        ].join("\n"),
      ),
      via: "sinapso-web-research",
    };
  }
  return null;
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

/** Read one validated entry without scanning and parsing the entire history. */
export function getEntry(
  dataDir: string,
  id: string,
): ResearchHistoryEntry | null {
  if (!ID_RE.test(id)) return null;
  const d = resolve(dir(dataDir));
  const full = resolve(d, `${id}.json`);
  if (!full.startsWith(d + sep) || !existsSync(full)) return null;
  try {
    const entry = JSON.parse(
      readFileSync(full, "utf-8"),
    ) as ResearchHistoryEntry;
    return entry.id === id ? entry : null;
  } catch {
    return null;
  }
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
