import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createVoiceTraceStore,
  redact,
  type VoiceTraceStore,
} from "./voice-trace";

let DATA: string;
let store: VoiceTraceStore;

beforeEach(() => {
  DATA = mkdtempSync(join(tmpdir(), "sinapso-voice-trace-"));
  store = createVoiceTraceStore(DATA);
});

describe("voice-trace redact", () => {
  it("redacts recursive secret-bearing keys", () => {
    const out = redact({
      ok: 1,
      token: "abc",
      authorization: "Bearer x",
      apiKey: "k",
      api_key: "k2",
      secret: "s",
      password: "p",
      key: "k3",
      nested: { userToken: "y", safe: "keep" },
      list: [{ TOKEN: "z" }, { keep: 1 }],
    }) as Record<string, unknown>;
    expect(out.ok).toBe(1);
    expect(out.token).toBe("[redacted]");
    expect(out.authorization).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.api_key).toBe("[redacted]");
    expect(out.secret).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
    expect(out.key).toBe("[redacted]");
    const nested = out.nested as Record<string, unknown>;
    expect(nested.userToken).toBe("[redacted]");
    expect(nested.safe).toBe("keep");
    const list = out.list as Array<Record<string, unknown>>;
    expect(list[0]?.TOKEN).toBe("[redacted]");
    expect(list[1]?.keep).toBe(1);
  });

  it("preserves ordinary tool args/results untouched", () => {
    const out = redact({
      type: "tool_call",
      name: "search_vault",
      args: { queries: "hello\nworld", mode: "auto" },
      result: { results: [{ path: "a.md", title: "A" }] },
    }) as Record<string, unknown>;
    expect(out.type).toBe("tool_call");
    expect((out.args as Record<string, unknown>).queries).toBe("hello\nworld");
  });
});

describe("voice-trace store", () => {
  it("starts a session and assigns seq + ts in order", () => {
    const sid = "voice-abc-1";
    const e0 = store.start(sid, { provider: "gemini", model: "m", voice: "v" });
    expect(e0?.seq).toBe(1);
    expect(e0?.type).toBe("session_started");
    expect(e0?.sessionId).toBe(sid);
    expect(e0?.provider).toBe("gemini");
    expect(typeof e0?.ts).toBe("string");

    const e1 = store.append(sid, { type: "tool_call", name: "search_vault" });
    const e2 = store.append(sid, { type: "tool_result", name: "search_vault" });
    expect(e1?.seq).toBe(2);
    expect(e2?.seq).toBe(3);
    expect(e1 && e2 && e1.ts <= e2.ts).toBe(true);
  });

  it("lists sessions newest first", () => {
    store.start("voice-a", { provider: "gemini" });
    store.append("voice-a", { type: "tool_call" });
    // tiny delay so the ts differs (ms resolution)
    const after = Date.now();
    while (Date.now() === after) {
      /* spin until ms ticks */
    }
    store.start("voice-b", { provider: "openai" });
    const list = store.listSessions();
    expect(list.map((s) => s.sessionId)).toEqual(["voice-b", "voice-a"]);
    expect(list[0]?.events).toBe(1);
    expect(list[1]?.events).toBe(2);
    expect(typeof list[0]?.bytes).toBe("number");
  });

  it("reads events back in order, skipping corrupt lines", () => {
    const sid = "voice-corrupt";
    store.start(sid);
    store.append(sid, { type: "tool_call", name: "x" });
    store.append(sid, { type: "tool_result", name: "x" });
    // Append a malformed line directly to the file.
    const f = join(DATA, "voice-traces", `${sid}.jsonl`);
    writeFileSync(f, "{not json\n", { flag: "a" });
    store.append(sid, { type: "tool_call", name: "y" });
    const events = store.readEvents(sid);
    expect(events?.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(events?.[3]?.name).toBe("y");
  });

  it("returns null for bad ids and path traversal", () => {
    expect(store.start("..%2fetc", {})).toBeNull();
    expect(store.start("UPPER", {})).toBeNull();
    expect(store.append("ok-id", { type: "x" })).not.toBeNull();
    expect(store.append("../etc/passwd", { type: "x" })).toBeNull();
    expect(store.readEvents("../etc/passwd")).toBeNull();
    expect(store.readEvents("missing-id")).toBeNull();
  });

  it("clears all session files", () => {
    store.start("voice-1");
    store.start("voice-2");
    expect(store.clearAll()).toBe(2);
    expect(store.listSessions()).toEqual([]);
    // seq cache resets so a reused id starts fresh
    store.start("voice-1");
    expect(store.readEvents("voice-1")?.[0]?.seq).toBe(1);
  });

  it("creates the voice-traces dir lazily", () => {
    // listSessions on a missing dir is empty, not throw
    expect(createVoiceTraceStore(DATA).listSessions()).toEqual([]);
  });

  it("redacts secret-bearing keys on the way to disk", () => {
    const sid = "voice-secrets";
    store.start(sid, {
      provider: "gemini",
      apiKey: "should-not-leak",
      systemPrompt: "prompt with no secret",
    });
    store.append(sid, {
      type: "tool_result",
      name: "x",
      result: { token: "abc", nested: { key: "k" } },
    });
    const events = store.readEvents(sid);
    expect(events?.[0]?.apiKey).toBe("[redacted]");
    expect(events?.[0]?.systemPrompt).toBe("prompt with no secret");
    const result = events?.[1]?.result as Record<string, unknown>;
    const nested = result?.nested as Record<string, unknown>;
    expect(result?.token).toBe("[redacted]");
    expect(nested?.key).toBe("[redacted]");
  });

  it("ignores non-jsonl files in the trace dir", () => {
    mkdirSync(join(DATA, "voice-traces"), { recursive: true });
    writeFileSync(join(DATA, "voice-traces", "README.md"), "hi");
    // uppercase + space → rejected by ID_RE; not surfaced as a session.
    writeFileSync(
      join(DATA, "voice-traces", "Bad Id.jsonl"),
      '{"seq":1,"ts":"x","sessionId":"Bad Id","type":"x"}\n',
    );
    expect(store.listSessions()).toEqual([]);
  });
});
