/**
 * Voice session trace store (DEVELOPMENT TROUBLESHOOTING ONLY).
 *
 * Gated behind an explicit opt-in (`SINAPSO_VOICE_TRACE=1` env or the
 * `voiceTraceEnabled` injection on `createApp`). Enabled for `npm run dev`,
 * DISABLED by default for `npm start` and the Electron desktop shell. This
 * is NOT an end-user feature: when disabled, no trace files are written and
 * the trace HTTP routes return 404.
 *
 * One append-only JSONL file per voice session under `<dataDir>/voice-traces/`
 * (runtime, gitignored via data/). No raw audio is ever stored; only
 * normalized events (provider/model/voice, transcripts, tool calls/results,
 * delegation lifecycle, browser action/status/context). Each event carries a
 * 1-based `seq` and an ISO `ts` so a session can be reconstructed in order
 * without a database.
 *
 * Path confinement: session ids are validated against `[a-z0-9-]+` and the
 * resolved file path must stay under the trace dir + sep (mirrors the
 * research-history pattern). Corrupt JSONL lines are skipped on read so a
 * partial write never breaks session reconstruction.
 *
 * Secret redaction runs recursively on every recorded event before it is
 * serialized: keys named like `token`, `authorization`, `apiKey`, `secret`,
 * `password`, or standalone `key` are replaced with `"[redacted]"`. Tool
 * args/results are otherwise preserved so the trace stays useful for debugging.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const DIR_NAME = "voice-traces";
/** Server-minted session ids only ever use these chars (matches voice relay). */
const ID_RE = /^[a-z0-9-]+$/;
const REDACTED = "[redacted]";
const REDACT_TOKENS = [
  "token",
  "authorization",
  "apikey",
  "secret",
  "password",
  "key",
];

function shouldRedact(key: string): boolean {
  // ponytail: substring match after normalizing separators; the only
  // false positives in this domain are field names like "keyword", which
  // do not appear in voice trace payloads. Tighten to word-boundary regex
  // if a real false positive shows up.
  const k = key.toLowerCase().replace(/[-_]/g, "");
  return REDACT_TOKENS.some((t) => k.includes(t));
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedact(k) ? REDACTED : redact(v);
    }
    return out;
  }
  return value;
}

export interface VoiceTraceEvent {
  seq: number;
  ts: string;
  sessionId: string;
  type: string;
  [key: string]: unknown;
}

export interface VoiceTraceSession {
  sessionId: string;
  startedAt: string;
  events: number;
  bytes: number;
}

export interface VoiceTraceStore {
  /** Append the `session_started` event (and create the file). Returns the
   *  normalized event, or null if the session id is invalid. */
  start(
    sessionId: string,
    init?: Record<string, unknown>,
  ): VoiceTraceEvent | null;
  /** Append any event. Returns the normalized event with seq/ts filled in,
   *  or null for a bad id. */
  append(
    sessionId: string,
    event: Record<string, unknown>,
  ): VoiceTraceEvent | null;
  /** All sessions, newest first (empty if the trace dir does not exist). */
  listSessions(): VoiceTraceSession[];
  /** Events in seq order, or null if the id is invalid / file is missing. */
  readEvents(sessionId: string): VoiceTraceEvent[] | null;
  /** Remove every session file. Returns how many were deleted. */
  clearAll(): number;
}

function sessionDir(dataDir: string): string {
  return join(dataDir, DIR_NAME);
}

function sessionFile(dataDir: string, sessionId: string): string | null {
  if (!ID_RE.test(sessionId)) return null;
  const d = resolve(sessionDir(dataDir));
  const full = resolve(d, `${sessionId}.jsonl`);
  if (!full.startsWith(d + sep)) return null; // belt-and-braces
  return full;
}

function readFileMeta(f: string): {
  events: number;
  startedAt: string;
} | null {
  try {
    const text = readFileSync(f, "utf-8");
    let events = 0;
    let startedAt = "";
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as VoiceTraceEvent;
        if (typeof e?.seq === "number") {
          events++;
          if (!startedAt && typeof e.ts === "string") startedAt = e.ts;
        }
      } catch {
        // corrupt line: skip, do not break reading
      }
    }
    return { events, startedAt };
  } catch {
    return null;
  }
}

export function createVoiceTraceStore(dataDir: string): VoiceTraceStore {
  const dir = sessionDir(dataDir);
  // ponytail: in-memory seq cache avoids re-reading the file on every append
  // (O(1) on the hot path; cold start reads once per session to recover).
  const lastSeq = new Map<string, number>();

  function appendInternal(
    sessionId: string,
    event: Record<string, unknown>,
  ): VoiceTraceEvent | null {
    const f = sessionFile(dataDir, sessionId);
    if (!f) return null;
    mkdirSync(dirname(f), { recursive: true });
    let seq = lastSeq.get(sessionId);
    if (seq === undefined) {
      const meta = existsSync(f) ? readFileMeta(f) : null;
      seq = meta ? meta.events : 0;
    }
    seq += 1;
    lastSeq.set(sessionId, seq);
    const full = {
      seq,
      ts: new Date().toISOString(),
      sessionId,
      ...(redact(event) as Record<string, unknown>),
    } as VoiceTraceEvent;
    appendFileSync(f, JSON.stringify(full) + "\n", "utf-8");
    return full;
  }

  return {
    start(sessionId, init = {}) {
      return appendInternal(sessionId, { type: "session_started", ...init });
    },
    append(sessionId, event) {
      return appendInternal(sessionId, event);
    },
    listSessions() {
      if (!existsSync(dir)) return [];
      const out: VoiceTraceSession[] = [];
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        const id = name.slice(0, -".jsonl".length);
        if (!ID_RE.test(id)) continue;
        const full = join(dir, name);
        const meta = readFileMeta(full);
        if (!meta) continue;
        let bytes = 0;
        try {
          bytes = statSync(full).size;
        } catch {
          /* ignore */
        }
        out.push({
          sessionId: id,
          startedAt: meta.startedAt,
          events: meta.events,
          bytes,
        });
      }
      // Sort newest first by startedAt (seq 1 ts); ties fall back to id so
      // the order is deterministic for tests with rapid same-ms starts.
      return out.sort((a, b) => {
        if (a.startedAt !== b.startedAt)
          return a.startedAt < b.startedAt ? 1 : -1;
        return a.sessionId < b.sessionId ? 1 : -1;
      });
    },
    readEvents(sessionId) {
      const f = sessionFile(dataDir, sessionId);
      if (!f || !existsSync(f)) return null;
      const out: VoiceTraceEvent[] = [];
      for (const line of readFileSync(f, "utf-8").split("\n")) {
        if (!line) continue;
        try {
          const e = JSON.parse(line) as VoiceTraceEvent;
          if (
            typeof e?.seq === "number" &&
            typeof e?.sessionId === "string" &&
            typeof e?.type === "string"
          )
            out.push(e);
        } catch {
          // corrupt line: skip
        }
      }
      return out;
    },
    clearAll() {
      lastSeq.clear();
      if (!existsSync(dir)) return 0;
      const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
      for (const f of files) rmSync(join(dir, f));
      return files.length;
    },
  };
}
