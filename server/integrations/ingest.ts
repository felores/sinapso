/**
 * Document ingestion via markitdown (F023): convert a file (PDF, DOCX,
 * PPTX, XLSX, HTML, …) or a URL to Markdown and save it as a vault note
 * through the guarded write. Reading files OUTSIDE the vault is the whole
 * point (importing); writing stays confined to the guarded path. URL
 * ingestion fetches the user-provided URL — a user-initiated retrieval,
 * like a browser.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Runner } from "./detect.js";
import { guardedCreate, WriteError, type WriteDeps } from "./write.js";

const INGEST_TIMEOUT_MS = 180_000;

export interface IngestOptions {
  /** http(s) URL or file path (~ expands to the home dir). */
  source: string;
  /** Display value for the `source:` frontmatter (defaults to source). */
  sourceLabel?: string;
  title?: string;
  destination?: string;
}

function deriveTitle(source: string, isUrl: boolean): string {
  if (isUrl) {
    try {
      const u = new URL(source);
      const seg = u.pathname.split("/").filter(Boolean).pop();
      return seg
        ? decodeURIComponent(seg).replace(/\.[a-z0-9]+$/i, "")
        : u.hostname;
    } catch {
      return source.slice(0, 60);
    }
  }
  return basename(source).replace(/\.[a-z0-9]+$/i, "");
}

/**
 * The document's own title: the first Markdown H1 ("# Heading") in the
 * converted output. Preferred over the source filename so an ingested PDF is
 * named after its headline, not "scan-2026-final". Null when there's no H1.
 */
function extractTitle(markdown: string): string | null {
  for (const line of markdown.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*#*\s*$/); // ATX H1, optional closing #
    if (m) {
      const t = m[1].replace(/[*_`[\]]/g, "").trim(); // drop inline emphasis
      if (t) return t;
    }
  }
  return null;
}

export async function ingestDocument(
  run: Runner,
  markitdownBin: string,
  writeDeps: WriteDeps,
  opts: IngestOptions,
): Promise<{ id: string }> {
  const source = opts.source.trim();
  if (!source) throw new WriteError(400, "source required");
  const isUrl = /^https?:\/\//i.test(source);
  let target = source;
  if (!isUrl) {
    target = source.startsWith("~")
      ? join(homedir(), source.slice(1))
      : resolve(source);
    if (!existsSync(target))
      throw new WriteError(404, `file not found: ${target}`);
  }
  const r = await run(markitdownBin, [target], INGEST_TIMEOUT_MS);
  if (!r.ok)
    throw new WriteError(502, (r.stderr || "markitdown failed").slice(0, 500));
  const markdown = r.stdout.trim();
  if (!markdown) throw new WriteError(422, "markitdown produced no content");
  // The converted content's own H1 wins, so the note is named after the
  // document's headline; fall back to an explicit title, then the source name.
  const title =
    extractTitle(markdown) || opts.title?.trim() || deriveTitle(source, isUrl);
  const date = new Date().toISOString().slice(0, 10);
  const content = [
    "---",
    `source: ${(opts.sourceLabel ?? source).replace(/\n/g, " ")}`,
    `ingested: ${date}`,
    "via: markitdown",
    "---",
    "",
    markdown,
    "",
  ].join("\n");
  return guardedCreate(writeDeps, {
    title,
    content,
    destination: opts.destination,
    actor: "user",
    prefix: `${date}_`, // date-stamp ingested notes: 2026-07-03_<title>.md
  });
}

/**
 * Ingest an uploaded file's bytes (browser path — browsers can't expose real
 * filesystem paths). Writes to a temp file, converts via markitdown, then
 * removes the temp. The original filename is used for the title + source.
 */
export async function ingestBytes(
  run: Runner,
  markitdownBin: string,
  writeDeps: WriteDeps,
  opts: { name: string; bytes: Uint8Array },
): Promise<{ id: string }> {
  const dir = mkdtempSync(join(tmpdir(), "solaris-ingest-"));
  const safe =
    opts.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "upload";
  const tmp = join(dir, safe);
  writeFileSync(tmp, opts.bytes);
  try {
    return await ingestDocument(run, markitdownBin, writeDeps, {
      source: tmp,
      sourceLabel: opts.name,
      // Drop the extension so the note name is clean (safeName kebab-cases it);
      // matches how path/URL ingest derives its title.
      title: opts.name.replace(/\.[a-z0-9]+$/i, ""),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
