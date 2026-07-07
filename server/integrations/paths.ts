/**
 * Vault-note path guard (U1).
 *
 * One seam for every vault-note path check. The six inline guards in
 * server/app.ts (/api/related, /api/note-questions, /api/note, /api/note-lines,
 * /api/note-grep, notePathOrFail) and the writer's confine() in
 * server/integrations/write.ts all route through confineNoteId. Routes that
 * error keep their exact status codes via noteFileOrFail; routes that fall
 * back instead of erroring (e.g. /api/note-questions -> templates) call
 * confineNoteId and branch on null.
 *
 * Read-route behavior: NO symlink realpath check — the inline guards
 * deliberately resolved the path as-given. write.ts keeps its realpath
 * check (the writer's contract) by adding it on top of confineNoteId.
 */

import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";

// WriteError lives here so both paths.ts (this file) and write.ts can use it
// without a circular import: write.ts re-exports WriteError below the import
// line, and all existing import sites (`import { WriteError } from "./write"`)
// keep working through that re-export.
export class WriteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Pure: resolve `id` under `vaultRoot` and return the absolute path, or `null`
 * when the id is empty, `phantom:`-prefixed, escapes `resolve(vaultRoot) + sep`,
 * or does not end in `.md` (case-insensitive). No filesystem access.
 */
export function confineNoteId(vaultRoot: string, id: string): string | null {
  if (!id || id.startsWith("phantom:")) return null;
  const base = resolve(vaultRoot);
  const full = resolve(base, id);
  if (!full.startsWith(base + sep) || !full.toLowerCase().endsWith(".md"))
    return null;
  return full;
}

/**
 * Like confineNoteId, but additionally checks `existsSync` and throws
 * `WriteError` with the 400/404 split the read-route handlers use today:
 *   - empty / `phantom:` / missing file -> 404 "note not found"
 *   - escape / non-.md extension         -> 400 "invalid note id"
 */
export function noteFileOrFail(vaultRoot: string, id: string): string {
  const full = confineNoteId(vaultRoot, id);
  if (!full) {
    if (!id || id.startsWith("phantom:"))
      throw new WriteError(404, "note not found");
    throw new WriteError(400, "invalid note id");
  }
  if (!existsSync(full)) throw new WriteError(404, "note not found");
  return full;
}
