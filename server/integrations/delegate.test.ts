import { describe, it, expect, vi } from "vitest";
import { createDelegateManager } from "./delegate";
import type { ResolvedTier } from "./llm";

const LLM: ResolvedTier = {
  provider: "openrouter",
  model: "test/thinker",
  key: "k",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Recorded {
  url: string;
  init?: RequestInit;
}

function loopbackFake() {
  const calls: Recorded[] = [];
  const fn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/api/note?"))
      return jsonResponse({ markdown: "# Source\nnote body" });
    if (url.includes("/api/research/history"))
      return jsonResponse({
        entries: [
          { id: "r1", query: "prior research", answer: { content: "found X" } },
        ],
      });
    if (url.includes("/api/document")) return jsonResponse({ ok: true });
    return jsonResponse({});
  }) as typeof fetch;
  return { fn, calls };
}

function llmFake(
  respond: () => Promise<Response> | Response = () =>
    jsonResponse({ choices: [{ message: { content: "# Synthesis\ndone" } }] }),
) {
  const bodies: string[] = [];
  const fn = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return respond();
  }) as typeof fetch;
  return { fn, bodies };
}

const START = {
  sessionId: "sess-1",
  task: "connect these notes",
  notes: ["a/one.md"],
  researchIds: ["r1"],
  llm: LLM,
  base: "http://127.0.0.1:9",
  token: "tok",
};

describe("delegate manager", () => {
  it("happy path: gathers sources, writes the working document, succeeds", async () => {
    const loop = loopbackFake();
    const llm = llmFake();
    const mgr = createDelegateManager({
      fetchFn: loop.fn,
      llmOpts: { fetch: llm.fn },
    });
    const done = vi.fn();
    mgr.subscribe("sess-1", done);
    const r = mgr.start({ ...START, title: "Connections" });
    if ("error" in r) throw new Error(r.error);
    expect(["queued", "running"]).toContain(r.job.state);
    expect(r.job.documentId).toMatch(/^doc-/);
    await vi.waitFor(() =>
      expect(mgr.status("sess-1")?.state).toBe("succeeded"),
    );
    // sources reached the thinker prompt
    expect(llm.bodies[0]).toContain("note body");
    expect(llm.bodies[0]).toContain("found X");
    expect(llm.bodies[0]).toContain("test/thinker");
    // result written through the document upsert with the session token
    const write = loop.calls.find((c) => c.url.endsWith("/api/document"));
    expect(write).toBeDefined();
    const headers = write!.init?.headers as Record<string, string>;
    expect(headers["x-solaris-token"]).toBe("tok");
    expect(JSON.parse(String(write!.init?.body)).content).toContain(
      "Synthesis",
    );
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].state).toBe("succeeded");
  });

  it("provider error marks the job failed with a message, session stays usable", async () => {
    const loop = loopbackFake();
    const llm = llmFake(() => jsonResponse({ error: "boom" }, 500));
    const mgr = createDelegateManager({
      fetchFn: loop.fn,
      llmOpts: { fetch: llm.fn },
    });
    const done = vi.fn();
    mgr.subscribe("sess-1", done);
    const r = mgr.start(START);
    if ("error" in r) throw new Error(r.error);
    await vi.waitFor(() => expect(mgr.status("sess-1")?.state).toBe("failed"));
    expect(mgr.status("sess-1")?.error).toBeTruthy();
    expect(done).toHaveBeenCalledTimes(1);
    // a new job can start after the failure (R14)
    const again = mgr.start(START);
    expect("job" in again).toBe(true);
  });

  it("timeout marks the job failed and discards the late result", async () => {
    const loop = loopbackFake();
    // Widened type: TS narrows the null initializer to `never` at the later
    // call site because the assignment happens inside a callback.
    let release = null as null | (() => void);
    const llm = llmFake(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              jsonResponse({ choices: [{ message: { content: "late" } }] }),
            );
        }),
    );
    const mgr = createDelegateManager({
      fetchFn: loop.fn,
      llmOpts: { fetch: llm.fn },
      timeoutMs: 20,
    });
    const r = mgr.start(START);
    if ("error" in r) throw new Error(r.error);
    await vi.waitFor(() => expect(mgr.status("sess-1")?.state).toBe("failed"));
    expect(mgr.status("sess-1")?.error).toContain("timed out");
    release?.();
    await new Promise((r2) => setTimeout(r2, 10));
    // late completion neither flips the state nor writes the document
    expect(mgr.status("sess-1")?.state).toBe("failed");
    expect(loop.calls.some((c) => c.url.endsWith("/api/document"))).toBe(false);
  });

  it("rejects a second start while one job runs (409, R14)", async () => {
    const loop = loopbackFake();
    const llm = llmFake(() => new Promise<Response>(() => {}));
    const mgr = createDelegateManager({
      fetchFn: loop.fn,
      llmOpts: { fetch: llm.fn },
    });
    const first = mgr.start(START);
    expect("job" in first).toBe(true);
    const second = mgr.start(START);
    expect(second).toEqual({
      error: "a delegation is already running for this session",
      status: 409,
    });
    // other sessions are unaffected
    const other = mgr.start({ ...START, sessionId: "sess-2" });
    expect("job" in other).toBe(true);
  });

  it("validates sessionId and task", () => {
    const mgr = createDelegateManager({ fetchFn: loopbackFake().fn });
    expect(mgr.start({ ...START, sessionId: " " })).toMatchObject({
      status: 400,
    });
    expect(mgr.start({ ...START, task: "" })).toMatchObject({ status: 400 });
  });
});
