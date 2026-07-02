/**
 * Document ingestion via markitdown (F023): convert a file (PDF, DOCX,
 * PPTX, XLSX, HTML, …) or a URL to Markdown and save it as a vault note
 * through the guarded write. Reading files OUTSIDE the vault is the whole
 * point (importing); writing stays confined to the guarded path. URL
 * ingestion fetches the user-provided URL — a user-initiated retrieval,
 * like a browser.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Runner } from "./detect.js";
import { guardedCreate, WriteError, type WriteDeps } from "./write.js";

const INGEST_TIMEOUT_MS = 180_000;

export interface IngestOptions {
  /** http(s) URL or file path (~ expands to the home dir). */
  source: string;
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
  const title = opts.title?.trim() || deriveTitle(source, isUrl);
  const content = [
    "---",
    `source: ${source.replace(/\n/g, " ")}`,
    `ingested: ${new Date().toISOString().slice(0, 10)}`,
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
  });
}
