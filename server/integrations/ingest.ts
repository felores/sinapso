/**
 * Document ingestion via markitdown (F023): convert a file (PDF, DOCX,
 * PPTX, XLSX, HTML, …) to Markdown and save it as a vault note
 * through the guarded write. Reading files OUTSIDE the vault is the whole
 * point (importing); writing stays confined to the guarded path. Remote URLs
 * must be downloaded through remote-document.ts before reaching MarkItDown.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import type { SinapsoConfig, WikiConfig } from "./config.js";
import type { Runner } from "./detect.js";
import { guardedCreate, WriteError, type WriteDeps } from "./write.js";

const INGEST_TIMEOUT_MS = 180_000;
const MARKITDOWN_ENV = {
  PATH: process.env.PATH ?? "",
  HOME: tmpdir(),
  TMPDIR: tmpdir(),
  LANG: "C.UTF-8",
  PYTHONNOUSERSITE: "1",
};

export interface IngestOptions {
  /** Local file path (~ expands to the home dir). */
  source: string;
  /** Display value for the `source:` frontmatter (defaults to source). */
  sourceLabel?: string;
  title?: string;
  destination?: string;
}

export interface ConvertedDocument {
  source: string;
  sourceLabel: string;
  title: string;
  markdown: string;
  via?: string;
}

export function resolveIngestDestination(
  vaultRoot: string,
  cfg: Pick<SinapsoConfig, "writeDestination" | "vaults">,
  target: { wikiId?: unknown; captureOnly?: unknown } = {},
): string {
  if (target.captureOnly === true) return cfg.writeDestination;

  const enabled = (cfg.vaults[vaultRoot]?.wikis ?? []).filter((w) => w.enabled);
  const wikiId = typeof target.wikiId === "string" ? target.wikiId.trim() : "";
  if (wikiId) {
    const wiki = enabled.find((w) => w.id === wikiId || w.path === wikiId);
    if (!wiki) throw new WriteError(400, "invalid wiki target");
    return wikiDestination(vaultRoot, wiki);
  }
  if (enabled.length === 1) return wikiDestination(vaultRoot, enabled[0]);
  if (enabled.length > 1)
    throw new WriteError(400, "choose a wiki target or capture-only");
  return cfg.writeDestination;
}

function wikiDestination(vaultRoot: string, wiki: WikiConfig): string {
  const base = resolve(vaultRoot);
  const full = resolve(base, wiki.path, wiki.rawDestination ?? "");
  if (full !== base && !full.startsWith(base + sep))
    throw new WriteError(400, "invalid wiki destination");
  return relative(base, full).split(sep).join("/") || ".";
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

/** Write a note from an already converted preview, sharing the frontmatter +
 * guarded-write path with ingestDocument. */
export async function ingestText(
  writeDeps: WriteDeps,
  opts: {
    source: string;
    title?: string;
    content: string;
    via: string;
    destination?: string;
  },
): Promise<{ id: string }> {
  const text = opts.content.trim();
  if (!text) throw new WriteError(422, "no content to ingest");
  const title =
    opts.title?.trim() || extractTitle(text) || deriveTitle(opts.source, true);
  const date = new Date().toISOString().slice(0, 10);
  const content = [
    "---",
    `source: ${opts.source.replace(/\n/g, " ")}`,
    `ingested: ${date}`,
    `via: ${opts.via}`,
    "---",
    "",
    text,
    "",
  ].join("\n");
  return guardedCreate(writeDeps, {
    title,
    content,
    destination: opts.destination,
    actor: "user",
    prefix: `${date}_`,
  });
}

export async function ingestDocument(
  run: Runner,
  markitdownBin: string,
  writeDeps: WriteDeps,
  opts: IngestOptions,
): Promise<{ id: string }> {
  const converted = await convertDocument(run, markitdownBin, opts);
  const date = new Date().toISOString().slice(0, 10);
  const content = [
    "---",
    `source: ${converted.sourceLabel.replace(/\n/g, " ")}`,
    `ingested: ${date}`,
    "via: markitdown",
    "---",
    "",
    converted.markdown,
    "",
  ].join("\n");
  return guardedCreate(writeDeps, {
    title: converted.title,
    content,
    destination: opts.destination,
    actor: "user",
    prefix: `${date}_`, // date-stamp ingested notes: 2026-07-03_<title>.md
  });
}

export async function convertDocument(
  run: Runner,
  markitdownBin: string,
  opts: IngestOptions,
): Promise<ConvertedDocument> {
  const source = opts.source.trim();
  if (!source) throw new WriteError(400, "source required");
  if (/^https?:\/\//i.test(source))
    throw new WriteError(
      400,
      "remote URLs must be downloaded before conversion",
    );
  const target = source.startsWith("~")
    ? join(homedir(), source.slice(1))
    : resolve(source);
  if (!existsSync(target))
    throw new WriteError(404, `file not found: ${target}`);
  const r = await run(
    markitdownBin,
    [target],
    INGEST_TIMEOUT_MS,
    MARKITDOWN_ENV,
  );
  if (!r.ok)
    throw new WriteError(502, (r.stderr || "markitdown failed").slice(0, 500));
  const markdown = r.stdout.trim();
  if (!markdown) throw new WriteError(422, "markitdown produced no content");
  // The converted content's own H1 wins, so the note is named after the
  // document's headline; fall back to an explicit title, then the source name.
  const title =
    extractTitle(markdown) || opts.title?.trim() || deriveTitle(source, false);
  return { source, sourceLabel: opts.sourceLabel ?? source, title, markdown };
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
  opts: { name: string; bytes: Uint8Array; destination?: string },
): Promise<{ id: string }> {
  const converted = await convertBytes(run, markitdownBin, opts);
  const date = new Date().toISOString().slice(0, 10);
  const content = [
    "---",
    `source: ${converted.sourceLabel.replace(/\n/g, " ")}`,
    `ingested: ${date}`,
    "via: markitdown",
    "---",
    "",
    converted.markdown,
    "",
  ].join("\n");
  return guardedCreate(writeDeps, {
    title: converted.title,
    content,
    destination: opts.destination,
    actor: "user",
    prefix: `${date}_`,
  });
}

export async function convertBytes(
  run: Runner,
  markitdownBin: string,
  opts: { name: string; bytes: Uint8Array },
): Promise<ConvertedDocument> {
  const dir = mkdtempSync(join(tmpdir(), "sinapso-ingest-"));
  const safe =
    opts.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "upload";
  const tmp = join(dir, safe);
  writeFileSync(tmp, opts.bytes);
  try {
    return await convertDocument(run, markitdownBin, {
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
