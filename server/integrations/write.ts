/**
 * Guarded note-write path (U7): the ONLY code that writes into the vault.
 * Used by save-as-note (Web mode) and by the agent proposal pipeline (U10);
 * OpenCode never touches the filesystem directly.
 *
 * Confinement mirrors /api/note: resolve under the vault root, .md only,
 * phantom: rejected — plus a realpath check on the nearest existing ancestor
 * so a symlinked directory inside the vault cannot route a write outside it.
 * Every applied write appends a change-log entry (R19) in the local data dir.
 */

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { confineNoteId, WriteError } from "./paths.js";

// Re-export WriteError from its new canonical home in paths.ts so every
// existing import site (`import { WriteError } from "./write"`) keeps working
// without churn.
export { WriteError } from "./paths.js";

export interface WriteDeps {
  vaultRoot: string;
  /** Local data dir (beside graph.json) where the change log lives. */
  dataDir: string;
}

export interface ChangeLogEntry {
  at: string;
  actor: "user" | "agent";
  mode?: "approval" | "full";
  action: "create" | "edit" | "archive";
  path: string;
  newPath?: string;
}

const CHANGELOG = "changes.jsonl";

export function appendChangeLog(dataDir: string, entry: ChangeLogEntry): void {
  mkdirSync(dataDir, { recursive: true });
  appendFileSync(join(dataDir, CHANGELOG), JSON.stringify(entry) + "\n");
}

export function readChangeLog(dataDir: string): ChangeLogEntry[] {
  const p = join(dataDir, CHANGELOG);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as ChangeLogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is ChangeLogEntry => e !== null);
}

/** Resolve a vault-relative md path under the confinement guard, or throw 400. */
function confine(vaultRoot: string, rel: string): string {
  // Shared invariant (resolve under root + startsWith + .md) lives in
  // paths.ts so the six read-route guards and the writer share one
  // implementation. The writer wraps the result in its own 400
  // "invalid note path" message (which is distinct from the read routes'
  // "invalid note id" / "note not found" pair — do NOT unify, R10).
  const full = confineNoteId(vaultRoot, rel);
  if (!full) throw new WriteError(400, "invalid note path");
  // Symlink escape: the nearest existing ancestor must realpath inside the
  // vault (the vault root itself may legitimately be a symlink, e.g. /tmp).
  const base = resolve(vaultRoot);
  let dir = dirname(full);
  while (!existsSync(dir)) dir = dirname(dir);
  const real = realpathSync(dir);
  const realBase = realpathSync(base);
  if (real !== realBase && !real.startsWith(realBase + sep))
    throw new WriteError(400, "invalid note path");
  return full;
}

function requireVault(vaultRoot: string): void {
  if (!vaultRoot || !existsSync(vaultRoot))
    throw new WriteError(503, "vault root is missing or not reachable");
}

/**
 * Turn a note title into a vault-standard filename stem: lowercase kebab-case,
 * accents transliterated, only [a-z0-9-], never spaces (FeloVault AGENTS.md:
 * "Nombres de archivo: kebab-case, NUNCA espacios"). Long titles are capped
 * like the vault's own notes.
 */
function safeName(title: string): string {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accent marks (e-acute -> e, n-tilde -> n)
    .toLowerCase()
    .replace(/['’‘"]/g, "") // drop apostrophes so contractions don't split
    .replace(/[^a-z0-9]+/g, "-") // any non-alphanumeric run -> one hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 80) // cap length like the vault's notes
    .replace(/-+$/g, ""); // re-trim if the cap left a dangling hyphen
  if (!cleaned) throw new WriteError(400, "empty note title");
  return cleaned;
}

export interface CreateOptions {
  content: string;
  /** Explicit vault-relative path (wins over title+destination). */
  path?: string;
  /** Refuse a collision at the explicit path instead of suffixing it. */
  exact?: boolean;
  /** Title used as filename when no explicit path is given. */
  title?: string;
  /** Verbatim filename prefix (e.g. "2026-07-03_") kept out of the kebab slug. */
  prefix?: string;
  /** Vault-relative destination folder for title-based creates. */
  destination?: string;
  actor: ChangeLogEntry["actor"];
  mode?: ChangeLogEntry["mode"];
}

export function guardedCreate(
  deps: WriteDeps,
  opts: CreateOptions,
): { id: string; unchanged?: boolean } {
  requireVault(deps.vaultRoot);
  const rel =
    opts.path ??
    join(
      opts.destination ?? "inbox",
      (opts.prefix ?? "") + safeName(opts.title ?? "") + ".md",
    );
  let full = confine(deps.vaultRoot, rel);
  // Exact creates are idempotent for the same content; all other creates keep
  // the existing suffix behavior.
  if (existsSync(full)) {
    if (opts.exact) {
      const id = relative(resolve(deps.vaultRoot), full);
      if (readFileSync(full, "utf-8") === opts.content)
        return { id, unchanged: true };
      throw new WriteError(409, "exact note path already exists");
    }
    const stem = full.slice(0, -3);
    let n = 2;
    while (existsSync(`${stem}-${n}.md`)) n++;
    full = confine(
      deps.vaultRoot,
      relative(resolve(deps.vaultRoot), `${stem}-${n}.md`),
    );
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, opts.content);
  const id = relative(resolve(deps.vaultRoot), full);
  appendChangeLog(deps.dataDir, {
    at: new Date().toISOString(),
    actor: opts.actor,
    mode: opts.mode,
    action: "create",
    path: id,
  });
  return { id };
}

/**
 * The pinned staleness-guard hash contract (plan 018 KTD5): SHA-256 hex over
 * the note's UTF-8 bytes. The autosave client computes the same digest via
 * WebCrypto; any drift between the two sides makes every save 409.
 */
export function noteHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Crash-safe replace (KTD5b): write a temp file in the same directory and
 * rename over the target, so a reader (Obsidian's watcher, git) never sees a
 * truncated note. Symlink-aware: the rename lands on the note's realpath so a
 * symlinked note keeps being a symlink (writeFileSync used to follow it; a
 * plain rename onto the link path would silently replace the link).
 */
function atomicWrite(full: string, content: string): void {
  const target = realpathSync(full);
  const tmp = join(
    dirname(target),
    `.${basename(target)}.sinapso-tmp-${process.pid}-${Date.now()}`,
  );
  writeFileSync(tmp, content);
  try {
    renameSync(tmp, target);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw e;
  }
}

export interface EditOptions {
  id: string;
  content: string;
  /** When set, the edit applies only if the disk content still hashes to
   * this value (compare-and-swap); mismatch throws 409. Omitted = current
   * unconditional behavior for legacy callers. */
  baseHash?: string;
  actor: ChangeLogEntry["actor"];
  mode?: ChangeLogEntry["mode"];
}

export function guardedEdit(
  deps: WriteDeps,
  opts: EditOptions,
): { id: string; unchanged?: boolean; previousContent?: string } {
  requireVault(deps.vaultRoot);
  const full = confine(deps.vaultRoot, opts.id);
  if (!existsSync(full)) throw new WriteError(404, "note not found");
  const id = relative(resolve(deps.vaultRoot), full);
  const current = readFileSync(full, "utf-8");
  if (opts.baseHash !== undefined && noteHash(current) !== opts.baseHash)
    throw new WriteError(409, "note changed on disk");
  // Equal-content saves skip both the write and the journal: the journal is
  // audit-only, and a no-op write would bump mtime under other clients.
  if (current === opts.content) return { id, unchanged: true };
  atomicWrite(full, opts.content);
  appendChangeLog(deps.dataDir, {
    at: new Date().toISOString(),
    actor: opts.actor,
    mode: opts.mode,
    action: "edit",
    path: id,
  });
  return { id, previousContent: current };
}

export interface MoveOptions {
  id: string;
  /** Vault-relative destination folder, e.g. "archive". */
  destination?: string;
  /** Exact vault-relative target path. */
  target?: string;
  /** Refuse a collision at target instead of suffixing it. */
  exact?: boolean;
  /** Allow an already-completed exact move only when target matches this. */
  expectedContent?: string;
  /** Refuse the move when the current source bytes changed. */
  baseHash?: string;
  actor: ChangeLogEntry["actor"];
}

export function guardedMove(
  deps: WriteDeps,
  opts: MoveOptions,
): { id: string; unchanged?: boolean } {
  requireVault(deps.vaultRoot);
  const full = confine(deps.vaultRoot, opts.id);
  if (!opts.target && !opts.destination)
    throw new WriteError(400, "move destination required");
  let destFull = confine(
    deps.vaultRoot,
    opts.target ?? join(opts.destination!, basename(full)),
  );
  if (!existsSync(full)) {
    if (
      opts.exact &&
      opts.expectedContent !== undefined &&
      existsSync(destFull) &&
      readFileSync(destFull, "utf-8") === opts.expectedContent
    ) {
      return {
        id: relative(resolve(deps.vaultRoot), destFull),
        unchanged: true,
      };
    }
    throw new WriteError(404, "note not found");
  }
  if (
    opts.baseHash !== undefined &&
    noteHash(readFileSync(full, "utf-8")) !== opts.baseHash
  )
    throw new WriteError(409, "note changed on disk");
  if (destFull !== full && existsSync(destFull)) {
    if (opts.exact) throw new WriteError(409, "exact note path already exists");
    const stem = destFull.slice(0, -3);
    let n = 2;
    while (existsSync(`${stem}-${n}.md`)) n++;
    destFull = confine(
      deps.vaultRoot,
      relative(resolve(deps.vaultRoot), `${stem}-${n}.md`),
    );
  }
  mkdirSync(dirname(destFull), { recursive: true });
  if (destFull !== full) {
    try {
      renameSync(full, destFull);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
      copyFileSync(full, destFull);
      unlinkSync(full);
    }
  }
  const newId = relative(resolve(deps.vaultRoot), destFull);
  appendChangeLog(deps.dataDir, {
    at: new Date().toISOString(),
    actor: opts.actor,
    action: "archive",
    path: opts.id,
    newPath: newId,
  });
  return { id: newId };
}

export interface AppendLinkOptions {
  /** Vault-relative id of the note to append the link to. */
  id: string;
  /** Wikilink target; brackets are stripped if present. */
  target: string;
  /** Refuse the append when the current source bytes changed. */
  baseHash?: string;
  actor: ChangeLogEntry["actor"];
}

/**
 * Add a `[[target]]` wikilink to an existing note's Connections section.
 * Same confinement + journal as guardedEdit — this is NOT a second write path,
 * just an append helper inside the single sanctioned writer. Idempotent: a note
 * that already links to the target is left unchanged.
 */
export function guardedAppendLink(
  deps: WriteDeps,
  opts: AppendLinkOptions,
): { id: string; added: boolean } {
  requireVault(deps.vaultRoot);
  const full = confine(deps.vaultRoot, opts.id);
  if (!existsSync(full)) throw new WriteError(404, "note not found");
  const target = opts.target.replace(/[[\]]/g, "").trim();
  if (!target) throw new WriteError(400, "empty link target");
  const id = relative(resolve(deps.vaultRoot), full);
  const current = readFileSync(full, "utf-8");
  if (opts.baseHash !== undefined && noteHash(current) !== opts.baseHash)
    throw new WriteError(409, "note changed on disk");
  const wikilink = `[[${target}]]`;
  if (current.includes(wikilink)) return { id, added: false };
  const connection = /^#{1,6}\s+connections\s*$/im.exec(current);
  let content: string;
  if (connection) {
    const level = connection[0].match(/^#+/)![0].length;
    const after = connection.index + connection[0].length;
    const next = new RegExp(`^#{1,${level}}\\s+`, "gm");
    next.lastIndex = after;
    const end = next.exec(current)?.index ?? current.length;
    const before = current.slice(0, end).replace(/\s*$/, "");
    content = `${before}\n\n${wikilink}\n${current.slice(end)}`;
  } else {
    const gap = current.length === 0 || current.endsWith("\n") ? "" : "\n";
    content = `${current}${gap}\n## Connections\n\n${wikilink}\n`;
  }
  guardedEdit(deps, {
    id,
    content,
    baseHash: opts.baseHash,
    actor: opts.actor,
  });
  return { id, added: true };
}
