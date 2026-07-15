import { existsSync, readFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import {
  effectivePrompts,
  type SinapsoConfig,
  type WikiConfig,
} from "./config.js";
import type { ConvertedDocument } from "./ingest.js";
import type { ChatMessage } from "./openrouter.js";
import {
  guardedCreate,
  guardedEdit,
  guardedMove,
  WriteError,
  type WriteDeps,
} from "./write.js";

const CONTRACT_LIMIT = 12_000;
const SOURCE_LIMIT = 50_000;

export interface WikiIngestOperation {
  type: "create" | "edit" | "move";
  path: string;
  content?: string;
  title?: string;
  raw?: boolean;
  sourceNote?: string;
}

export interface WikiIngestProposal {
  wiki: Pick<WikiConfig, "id" | "label" | "path">;
  source: string;
  title: string;
  contracts: Array<{ path: string; content: string }>;
  operations: WikiIngestOperation[];
  researchId?: string;
  sourceNote?: string;
}

export type WikiIngestChat = (messages: ChatMessage[]) => Promise<string>;

export function resolveWikiTarget(
  vaultRoot: string,
  cfg: Pick<SinapsoConfig, "vaults">,
  target: { wikiId?: unknown } = {},
): WikiConfig {
  const enabled = (cfg.vaults[vaultRoot]?.wikis ?? []).filter((w) => w.enabled);
  const wikiId = typeof target.wikiId === "string" ? target.wikiId.trim() : "";
  if (wikiId) {
    const wiki = enabled.find((w) => w.id === wikiId || w.path === wikiId);
    if (!wiki) throw new WriteError(400, "invalid wiki target");
    return wiki;
  }
  if (enabled.length === 1) return enabled[0];
  if (enabled.length > 1)
    throw new WriteError(400, "choose a wiki target or capture-only");
  throw new WriteError(400, "no enabled wiki target");
}

export async function buildWikiIngestProposal(
  deps: { vaultRoot: string; now?: () => Date },
  cfg: Pick<SinapsoConfig, "prompts">,
  wiki: WikiConfig,
  converted: ConvertedDocument,
  chat: WikiIngestChat,
  opts: { researchId?: string; sourceNote?: string } = {},
): Promise<WikiIngestProposal> {
  const contracts = readWikiContracts(deps.vaultRoot, wiki);
  if (!wiki.rawDestination?.trim())
    throw new WriteError(400, "selected wiki requires a RAW destination");
  const raw = opts.sourceNote
    ? buildRawMoveOperation(
        deps.vaultRoot,
        wiki,
        opts.sourceNote,
        converted.markdown,
      )
    : buildRawOperation(
        deps.vaultRoot,
        wiki,
        converted,
        deps.now?.() ?? new Date(),
      );
  const reply = await chat([
    {
      role: "system",
      content:
        'Return only JSON: {"operations":[{"type":"create|edit","path":"wiki/path.md","content":"markdown"}]}',
    },
    {
      role: "user",
      content: proposalPrompt(cfg, wiki, contracts, converted, raw),
    },
  ]);
  const operations = validateWikiOperations(deps.vaultRoot, wiki, [
    raw,
    ...parseOperations(reply).filter((op) => isContentProposal(wiki, op)),
  ]);
  if (
    !operations.some(
      (op) => !op.raw && (op.type === "create" || op.type === "edit"),
    )
  )
    throw new WriteError(422, "no wiki proposals returned");
  return {
    wiki: { id: wiki.id, label: wiki.label, path: wiki.path },
    source: converted.sourceLabel,
    title: converted.title,
    contracts,
    operations,
    researchId: opts.researchId,
    sourceNote: opts.sourceNote,
  };
}

function isContentProposal(wiki: WikiConfig, op: WikiIngestOperation): boolean {
  const path = op.path.replace(/\\/g, "/").toLowerCase();
  const name = path.split("/").pop() ?? "";
  if (["index.md", "log.md", "hot.md"].includes(name)) return false;
  const contractPaths = new Set(
    wiki.contractFiles.map((file) =>
      `${wiki.path}/${file}`.replace(/\/+/g, "/").toLowerCase(),
    ),
  );
  return !contractPaths.has(path);
}

export function applyWikiIngestOperations(
  writeDeps: WriteDeps,
  vaultRoot: string,
  wiki: WikiConfig,
  operations: unknown,
  opts: { actor?: "user" | "agent"; sourceNote?: string } = {},
): string[] {
  const valid = validateWikiOperations(vaultRoot, wiki, operations);
  const raw = valid.filter((op) => op.raw);
  if (raw.length !== 1)
    throw new WriteError(400, "exactly one RAW operation required");
  for (const op of valid)
    if (op.type === "move" && op.sourceNote !== opts.sourceNote)
      throw new WriteError(400, "invalid source note move");
  return [...raw, ...valid.filter((op) => !op.raw)].map((op) => {
    const result =
      op.type === "move"
        ? guardedMove(writeDeps, {
            id: op.sourceNote!,
            target: op.path,
            exact: true,
            expectedContent: op.content,
            actor: opts.actor ?? "user",
          })
        : op.type === "edit"
          ? guardedEdit(writeDeps, {
              id: op.path,
              content: op.content!,
              actor: opts.actor ?? "user",
              mode: "approval",
            })
          : guardedCreate(writeDeps, {
              path: op.path,
              title: op.title,
              content: op.content!,
              exact: op.raw === true,
              actor: opts.actor ?? "user",
              mode: "approval",
            });
    return result.id;
  });
}

export function validateWikiOperations(
  vaultRoot: string,
  wiki: WikiConfig,
  operations: unknown,
): WikiIngestOperation[] {
  if (!Array.isArray(operations))
    throw new WriteError(400, "operations required");
  const base = resolve(vaultRoot);
  const wikiBase = resolve(base, wiki.path);
  const rawBase = wiki.rawDestination?.trim()
    ? resolve(wikiBase, wiki.rawDestination)
    : null;
  if (!rawBase)
    throw new WriteError(400, "selected wiki requires a RAW destination");
  return operations.map((op) => {
    const o = op as Record<string, unknown>;
    const type =
      o.type === "move"
        ? "move"
        : o.type === "edit" || o.action === "edit"
          ? "edit"
          : "create";
    const rawPath = typeof o.path === "string" ? o.path : o.id;
    if (
      typeof rawPath !== "string" ||
      (type !== "move" && typeof o.content !== "string") ||
      (type === "move" &&
        (o.raw !== true ||
          typeof o.sourceNote !== "string" ||
          typeof o.content !== "string"))
    )
      throw new WriteError(400, "proposal path and content required");
    const full = resolve(base, rawPath);
    if (
      full === base ||
      !full.startsWith(base + sep) ||
      !full.toLowerCase().endsWith(".md")
    ) {
      throw new WriteError(400, "invalid proposal path");
    }
    const inWiki = full.startsWith(wikiBase + sep);
    const inRaw = rawBase ? full.startsWith(rawBase + sep) : false;
    if (o.raw === true ? !inRaw : !inWiki || inRaw)
      throw new WriteError(400, "proposal path outside selected wiki");
    return {
      type,
      path: relative(base, full).split(sep).join("/"),
      content: typeof o.content === "string" ? o.content : undefined,
      title: typeof o.title === "string" ? o.title : undefined,
      raw: o.raw === true,
      sourceNote: typeof o.sourceNote === "string" ? o.sourceNote : undefined,
    };
  });
}

export function readWikiContracts(
  vaultRoot: string,
  wiki: WikiConfig,
): Array<{ path: string; content: string }> {
  const wikiBase = resolve(vaultRoot, wiki.path);
  const out: Array<{ path: string; content: string }> = [];
  for (const file of wiki.contractFiles) {
    const full = resolve(wikiBase, file);
    if (!full.startsWith(wikiBase + sep) || !existsSync(full)) continue;
    out.push({
      path: `${wiki.path}/${file}`.replace(/\/+/g, "/"),
      content: readFileSync(full, "utf-8").slice(0, CONTRACT_LIMIT),
    });
  }
  return out;
}

function proposalPrompt(
  cfg: Pick<SinapsoConfig, "prompts">,
  wiki: WikiConfig,
  contracts: Array<{ path: string; content: string }>,
  converted: ConvertedDocument,
  raw: WikiIngestOperation,
): string {
  const contractText = contracts.length
    ? contracts.map((c) => `## ${c.path}\n${c.content}`).join("\n\n")
    : "No contract files found.";
  return [
    effectivePrompts(cfg).wikiIngest,
    `Selected wiki: ${wiki.label} (${wiki.path})`,
    `All derived create/edit paths must stay under ${wiki.path}/.`,
    `Canonical RAW source path after approval: ${raw.path}. This is the only canonical source location; do not present the original Inbox or source location as canonical.`,
    `Every derived create/edit note must cite or link ${raw.path} according to the wiki contract.`,
    "Contract files:",
    contractText,
    "Source markdown:",
    `# ${converted.title}\n\n${converted.markdown.slice(0, SOURCE_LIMIT)}`,
  ].join("\n\n");
}

function parseOperations(text: string): WikiIngestOperation[] {
  const json = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new WriteError(422, "invalid JSON proposal returned");
  }
  const rows: unknown[] = [];
  if (Array.isArray(parsed)) rows.push(...parsed);
  else if (typeof parsed === "object" && parsed !== null) {
    const p = parsed as Record<string, unknown>;
    if (Array.isArray(p.operations)) rows.push(...p.operations);
    for (const key of ["create", "creates"])
      if (Array.isArray(p[key]))
        rows.push(...p[key].map((x) => ({ ...(x as object), type: "create" })));
    for (const key of ["edit", "edits"])
      if (Array.isArray(p[key]))
        rows.push(...p[key].map((x) => ({ ...(x as object), type: "edit" })));
  }
  return rows
    .map((row) => row as Record<string, unknown>)
    .filter(
      (row) => typeof row.path === "string" && typeof row.content === "string",
    )
    .map((row) => ({
      type: row.type === "edit" || row.action === "edit" ? "edit" : "create",
      path: row.path as string,
      content: row.content as string,
      title: typeof row.title === "string" ? row.title : undefined,
    }));
}

function extractJson(text: string): string {
  const obj = text.indexOf("{");
  const arr = text.indexOf("[");
  const start = [obj, arr].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  if (start == null) throw new WriteError(422, "no JSON proposal returned");
  const endChar = text[start] === "[" ? "]" : "}";
  const end = text.lastIndexOf(endChar);
  if (end <= start) throw new WriteError(422, "no JSON proposal returned");
  return text.slice(start, end + 1);
}

export function buildRawOperation(
  vaultRoot: string,
  wiki: WikiConfig,
  converted: ConvertedDocument,
  now: Date,
): WikiIngestOperation {
  const rawDestination = wiki.rawDestination?.trim();
  if (!rawDestination)
    throw new WriteError(400, "selected wiki requires a RAW destination");
  const date = now.toISOString().slice(0, 10);
  const wikiBase = resolve(vaultRoot, wiki.path);
  const full = resolve(
    wikiBase,
    rawDestination,
    `${date}_${slug(converted.title)}.md`,
  );
  const base = resolve(vaultRoot);
  const path = relative(base, full).split(sep).join("/");
  return {
    type: "create",
    raw: true,
    path,
    title: converted.title,
    content: [
      "---",
      `source: ${converted.sourceLabel.replace(/\n/g, " ")}`,
      `ingested: ${date}`,
      `via: ${converted.via ?? "markitdown"}`,
      "---",
      "",
      converted.markdown,
      "",
    ].join("\n"),
  };
}

export function buildRawMoveOperation(
  vaultRoot: string,
  wiki: WikiConfig,
  sourceNote: string,
  content: string,
): WikiIngestOperation {
  const rawDestination = wiki.rawDestination?.trim();
  if (!rawDestination)
    throw new WriteError(400, "selected wiki requires a RAW destination");
  const base = resolve(vaultRoot);
  const full = resolve(base, wiki.path, rawDestination, basename(sourceNote));
  return {
    type: "move",
    raw: true,
    path: relative(base, full).split(sep).join("/"),
    sourceNote,
    content,
  };
}

function slug(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "source";
}
