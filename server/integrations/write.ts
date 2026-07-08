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
): { id: string } {
  requireVault(deps.vaultRoot);
  const rel =
    opts.path ??
    join(
      opts.destination ?? "inbox",
      (opts.prefix ?? "") + safeName(opts.title ?? "") + ".md",
    );
  let full = confine(deps.vaultRoot, rel);
  // Never overwrite on create: filename collisions get a numeric suffix.
  if (existsSync(full)) {
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

export interface EditOptions {
  id: string;
  content: string;
  actor: ChangeLogEntry["actor"];
  mode?: ChangeLogEntry["mode"];
}

export function guardedEdit(
  deps: WriteDeps,
  opts: EditOptions,
): { id: string } {
  requireVault(deps.vaultRoot);
  const full = confine(deps.vaultRoot, opts.id);
  if (!existsSync(full)) throw new WriteError(404, "note not found");
  writeFileSync(full, opts.content);
  const id = relative(resolve(deps.vaultRoot), full);
  appendChangeLog(deps.dataDir, {
    at: new Date().toISOString(),
    actor: opts.actor,
    mode: opts.mode,
    action: "edit",
    path: id,
  });
  return { id };
}

export interface MoveOptions {
  id: string;
  /** Vault-relative destination folder, e.g. "archive". */
  destination: string;
  actor: ChangeLogEntry["actor"];
}

export function guardedMove(
  deps: WriteDeps,
  opts: MoveOptions,
): { id: string } {
  requireVault(deps.vaultRoot);
  const full = confine(deps.vaultRoot, opts.id);
  if (!existsSync(full)) throw new WriteError(404, "note not found");

  let destFull = confine(deps.vaultRoot, join(opts.destination, basename(full)));
  if (destFull !== full && existsSync(destFull)) {
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
  /** Wikilink target (a note basename); brackets are stripped if present. */
  target: string;
  actor: ChangeLogEntry["actor"];
}

/**
 * Append a `[[target]]` wikilink to an existing note (F034 orphan linker).
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
  const wikilink = `[[${target}]]`;
  if (current.includes(wikilink)) return { id, added: false };
  const gap = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  writeFileSync(full, `${current}${gap}\n${wikilink}\n`);
  appendChangeLog(deps.dataDir, {
    at: new Date().toISOString(),
    actor: opts.actor,
    action: "edit",
    path: id,
  });
  return { id, added: true };
}
