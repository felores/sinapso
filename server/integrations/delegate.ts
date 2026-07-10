/**
 * Thinker delegation job model (R11-R14, KTD6): a session-scoped async job
 * that gathers source context (vault notes / research entries) through the
 * existing loopback readers, runs one thinker-tier chat completion, and
 * writes the result into the session's working document via the same
 * document upsert `write_document` uses — no second write path.
 *
 * One job per session at a time; states queued → running → succeeded |
 * failed; a timeout marks the job failed and a late result is discarded.
 * The voice relay subscribes in-process for the spoken heads-up (KTD5);
 * routes in app.ts expose token-guarded start/status for tests and parity.
 */

import type { ResolvedTier } from "./llm.js";
import { tierCompletion } from "./llm.js";
import type { ChatMessage, OpenRouterOptions } from "./openrouter.js";

export type DelegateState = "queued" | "running" | "succeeded" | "failed";

export interface DelegateJob {
  id: string;
  sessionId: string;
  state: DelegateState;
  task: string;
  documentId: string;
  title: string;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface DelegateStartParams {
  sessionId: string;
  task: string;
  /** Vault-relative note paths to read as sources (path-confined route). */
  notes?: string[];
  /** Research-history entry ids to include as sources. */
  researchIds?: string[];
  /** Working document to write into; a new one is minted when absent. */
  documentId?: string;
  title?: string;
  /** Thinker resolution from resolveTier() (worker fallback per R5). */
  llm: ResolvedTier;
  /** Loopback base for the reader + document routes. */
  base: string;
  /** Session token for the guarded document upsert. */
  token: string;
}

export interface DelegateManagerOptions {
  fetchFn?: typeof fetch;
  /** Injected fetch/endpoint for the LLM call (tests). */
  llmOpts?: OpenRouterOptions;
  timeoutMs?: number;
  now?: () => number;
}

export interface DelegateManager {
  start(
    params: DelegateStartParams,
  ): { job: DelegateJob } | { error: string; status: number };
  status(sessionId: string): DelegateJob | null;
  /** Fires when a job of this session reaches succeeded/failed. */
  subscribe(sessionId: string, cb: (job: DelegateJob) => void): () => void;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_SOURCE_CHARS = 12_000;

const SYNTHESIS_PROMPT =
  "You are the reasoning assistant behind a voice agent for a personal knowledge vault. " +
  "Produce ONE complete, well-structured markdown document that fulfils the task from the " +
  "provided sources: headings, short paragraphs, bullet lists where useful, [[Note Title]] " +
  "wikilinks when referencing the provided vault notes, and inline source links for web " +
  "material. Return only the document body in markdown, no preamble.";

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "doc"
  );
}

export function createDelegateManager(
  opts: DelegateManagerOptions = {},
): DelegateManager {
  const fetchFn: typeof fetch =
    opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const jobs = new Map<string, DelegateJob>(); // sessionId → latest job
  const listeners = new Map<string, Set<(job: DelegateJob) => void>>();

  function finish(
    job: DelegateJob,
    state: "succeeded" | "failed",
    error?: string,
  ) {
    if (job.state === "succeeded" || job.state === "failed") return; // timeout already won
    job.state = state;
    job.error = error ?? null;
    job.finishedAt = now();
    for (const cb of listeners.get(job.sessionId) ?? []) {
      try {
        cb(job);
      } catch {
        /* a broken subscriber must not poison the job state */
      }
    }
  }

  async function gatherSources(p: DelegateStartParams): Promise<string[]> {
    const sources: string[] = [];
    for (const note of (p.notes ?? []).slice(0, 8)) {
      const u = new URL(`${p.base}/api/note`);
      u.searchParams.set("id", note);
      const r = await fetchFn(u);
      if (!r.ok) {
        sources.push(`Note ${note}: (not readable)`);
        continue;
      }
      const d = (await r.json()) as { markdown?: string };
      sources.push(
        `Vault note ${note}:\n${(d.markdown ?? "").slice(0, MAX_SOURCE_CHARS)}`,
      );
    }
    if (p.researchIds?.length) {
      const r = await fetchFn(`${p.base}/api/research/history`);
      const d = (await r.json().catch(() => ({}))) as {
        entries?: Array<{
          id: string;
          query?: string;
          answer?: { content?: string } | null;
          article?: { title?: string; url?: string; content?: string };
          document?: { title?: string; content?: string };
        }>;
      };
      for (const id of p.researchIds.slice(0, 8)) {
        const e = (d.entries ?? []).find((x) => x.id === id);
        if (!e) continue;
        const body =
          e.answer?.content ?? e.article?.content ?? e.document?.content ?? "";
        sources.push(
          `Research "${e.query ?? e.article?.title ?? id}"${e.article?.url ? ` (${e.article.url})` : ""}:\n${body.slice(0, MAX_SOURCE_CHARS)}`,
        );
      }
    }
    return sources;
  }

  async function run(job: DelegateJob, p: DelegateStartParams): Promise<void> {
    job.state = "running";
    const timer = setTimeout(
      () => finish(job, "failed", "the reasoner timed out"),
      timeoutMs,
    );
    try {
      const sources = await gatherSources(p);
      const messages: ChatMessage[] = [
        { role: "system", content: SYNTHESIS_PROMPT },
        {
          role: "user",
          content: [`Task: ${p.task}`, ...sources].join("\n\n---\n\n"),
        },
      ];
      const markdown = await tierCompletion(p.llm, messages, opts.llmOpts);
      if (!markdown.trim()) throw new Error("the reasoner returned nothing");
      if (job.state !== "running") return; // timed out while thinking
      const r = await fetchFn(`${p.base}/api/document`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sinapso-token": p.token,
        },
        body: JSON.stringify({
          id: job.documentId,
          title: job.title,
          content: markdown,
        }),
      });
      if (!r.ok) throw new Error("could not write the working document");
      finish(job, "succeeded");
    } catch (e) {
      finish(job, "failed", e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    start(params) {
      const sessionId = params.sessionId.trim();
      const task = params.task.trim();
      if (!sessionId) return { error: "sessionId required", status: 400 };
      if (!task) return { error: "task required", status: 400 };
      const existing = jobs.get(sessionId);
      if (
        existing &&
        (existing.state === "queued" || existing.state === "running")
      )
        return {
          error: "a delegation is already running for this session",
          status: 409,
        };
      const title = params.title?.trim() || "Thinker document";
      const job: DelegateJob = {
        id: `job-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        state: "queued",
        task,
        documentId:
          params.documentId?.trim() ||
          `doc-${now().toString(36)}-${slug(title)}`,
        title,
        error: null,
        startedAt: now(),
        finishedAt: null,
      };
      jobs.set(sessionId, job);
      void run(job, params);
      return { job };
    },
    status(sessionId) {
      return jobs.get(sessionId) ?? null;
    },
    subscribe(sessionId, cb) {
      const set = listeners.get(sessionId) ?? new Set();
      set.add(cb);
      listeners.set(sessionId, set);
      return () => {
        set.delete(cb);
      };
    },
  };
}
