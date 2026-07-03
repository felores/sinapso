/**
 * Reader (content-panel) history: an app-local, ordered log of the notes
 * opened in the reader, so the panel can page back through them like the
 * research history does. Lives in data/reader-history.jsonl (runtime,
 * gitignored), NEVER in the vault. Newest-first, deduped on consecutive
 * reopen, capped.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const CAP = 500;

export interface ReaderOpen {
  id: string;
  ts: string;
}

function file(dataDir: string): string {
  return join(dataDir, "reader-history.jsonl");
}

function read(dataDir: string): ReaderOpen[] {
  const f = file(dataDir);
  if (!existsSync(f)) return [];
  const out: ReaderOpen[] = [];
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as ReaderOpen;
      if (typeof e?.id === "string") out.push(e);
    } catch {
      // skip a corrupt line
    }
  }
  return out;
}

/** Record a reader open at the top (newest first); skip a consecutive repeat. */
export function logReaderOpen(dataDir: string, id: string): void {
  if (!id) return;
  const entries = read(dataDir);
  if (entries[0]?.id === id) return; // reopening the same note back-to-back
  entries.unshift({ id, ts: new Date().toISOString() });
  const f = file(dataDir);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(
    f,
    entries
      .slice(0, CAP)
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n",
  );
}

/** Opened notes, newest first. */
export function listReaderOpens(dataDir: string): ReaderOpen[] {
  return read(dataDir);
}

export function clearReaderHistory(dataDir: string): void {
  const f = file(dataDir);
  if (existsSync(f)) rmSync(f);
}
