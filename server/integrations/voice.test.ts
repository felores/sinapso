import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  accumulateTranscription,
  buildVoiceSystemPrompt,
  closeFlushEvents,
  flushTranscriptionOnTurnComplete,
  geminiCloseError,
  makeTracedToolRun,
  parseRealtimeTranscriptEvent,
  realtimeSessionConfig,
  realtimeVoiceTools,
  resamplePcm16Base64,
  voiceNameForProvider,
} from "./voice";
import { defaultConfig } from "./config";
import { createVoiceTraceStore } from "./voice-trace";
import type { VoiceArgs, VoiceResult } from "./voice-tools";

describe("voice system prompt", () => {
  it("injects Admin wiki routes and contract paths", () => {
    const cfg = defaultConfig();
    cfg.prompts.voiceAssistant = "Custom voice rule.";
    const prompt = buildVoiceSystemPrompt(cfg, [
      {
        id: "agencia/wiki",
        label: "agencia/wiki",
        path: "agencia/wiki",
        enabled: true,
        rawDestination: "../research/",
        contractFiles: ["AGENTS.md", "index.md"],
      },
    ]);

    expect(prompt).toContain("Custom voice rule.");
    expect(prompt).toContain("id=agencia/wiki");
    expect(prompt).toContain("raw=../research/");
    expect(prompt).toContain("agencia/wiki/AGENTS.md");
    expect(prompt).toContain("propose_wiki_ingest reads the selected contract");
    expect(prompt).toContain("selectedContext.current");
    expect(prompt).toContain("Archive destination from Admin: archive");
    expect(prompt).toContain("archive_vault_note");
    expect(prompt).toContain("any known note anywhere in the vault");
    expect(prompt).toContain("never use absolute paths, ../ traversal");
  });

  it("declares the Discover -> Verify -> Act protocol", () => {
    const prompt = buildVoiceSystemPrompt(defaultConfig(), []);
    expect(prompt).toContain("DISCOVERY PROTOCOL");
    expect(prompt).toContain("Discover");
    expect(prompt).toContain("Verify");
    expect(prompt).toContain("Act");
    expect(prompt).toContain("browse_folder (top-down)");
    expect(prompt).toContain("read_note on the path you found");
    expect(prompt).toContain("NEVER invent one");
    expect(prompt).toContain(
      "Folder-map answers may rely on browse_folder alone",
    );
    expect(prompt).toContain('display.decision "blocked-pinned"');
    expect(prompt).toContain("ready in the background");
  });

  it("declares retrieval discipline rules for empty results", () => {
    const prompt = buildVoiceSystemPrompt(defaultConfig(), []);
    expect(prompt).toContain("RETRIEVAL DISCIPLINE");
    expect(prompt).toContain("mode 'path'");
    expect(prompt).toContain("mode 'exact'");
    expect(prompt).toContain("browse_folder on that path");
    expect(prompt).toContain(
      "NEVER repeat the same (queries, mode, path) call unchanged",
    );
    expect(prompt).toContain("I couldn't find that in your vault");
  });

  it("requires pre-proposal discovery in the wiki save rules", () => {
    const prompt = buildVoiceSystemPrompt(defaultConfig(), []);
    expect(prompt).toContain(
      "Before propose_wiki_ingest, call search_vault for notes related",
    );
    expect(prompt).toContain("read_note to verify any snippet");
    expect(prompt).toContain("read_wiki_contract on the target wiki");
    expect(prompt).toContain("The backend guards");
    expect(prompt).toContain("OUTSIDE_SELECTED_WIKI rejection");
  });
});

describe("voice provider helpers", () => {
  it("keeps official voices and falls back per provider", () => {
    expect(voiceNameForProvider("gemini", "Puck")).toBe("Puck");
    expect(voiceNameForProvider("gemini", "bogus")).toBe("Aoede");
    expect(voiceNameForProvider("openai", "cedar")).toBe("cedar");
    expect(voiceNameForProvider("openai", "bogus")).toBe("marin");
    expect(voiceNameForProvider("xai", "rex")).toBe("rex");
    expect(voiceNameForProvider("xai", "bogus")).toBe("eve");
  });

  it("maps Gemini tool declarations to realtime function tools", () => {
    const currentView = realtimeVoiceTools().find(
      (tool) => tool.name === "current_view",
    );
    expect(currentView?.type).toBe("function");
    expect(currentView?.parameters).toMatchObject({ type: "object" });
  });

  it("uses provider-specific realtime session shapes", () => {
    expect(
      realtimeSessionConfig("openai", "gpt-realtime-2.1", "marin", "s"),
    ).toMatchObject({
      audio: {
        input: { turn_detection: { type: "server_vad" } },
        output: { voice: "marin" },
      },
    });
    expect(
      realtimeSessionConfig("xai", "grok-voice-latest", "eve", "s"),
    ).toMatchObject({
      voice: "eve",
      turn_detection: { type: "server_vad" },
    });
  });

  it("resamples browser PCM16 chunks for realtime providers", () => {
    const input = Buffer.alloc(4);
    input.writeInt16LE(-1000, 0);
    input.writeInt16LE(1000, 2);
    const out = Buffer.from(
      resamplePcm16Base64(input.toString("base64"), 16000, 24000),
      "base64",
    );
    expect(out.length).toBe(6);
  });

  it("surfaces abnormal Gemini close reasons", () => {
    expect(
      geminiCloseError({ code: 1007, reason: "invalid tool schema" }),
    ).toBe("invalid tool schema");
    expect(geminiCloseError({ code: 1011, reason: "" })).toBe(
      "Gemini session closed (code 1011)",
    );
    expect(geminiCloseError({ code: 1000, reason: "" })).toBeNull();
  });
});

describe("accumulateTranscription (Gemini)", () => {
  it("accumulates chunks and emits only when finished", () => {
    let buf = "";
    let finished: string | null = null;
    ({ buffer: buf, finished } = accumulateTranscription(buf, {
      text: "hello ",
    }));
    expect(buf).toBe("hello ");
    expect(finished).toBeNull();
    ({ buffer: buf, finished } = accumulateTranscription(buf, {
      text: "world",
    }));
    expect(buf).toBe("hello world");
    expect(finished).toBeNull();
    ({ buffer: buf, finished } = accumulateTranscription(buf, {
      text: "!",
      finished: true,
    }));
    expect(buf).toBe("");
    expect(finished).toBe("hello world!");
    // Buffer resets after a finished chunk so the next turn starts clean.
    ({ buffer: buf, finished } = accumulateTranscription(buf, {
      text: "next",
    }));
    expect(buf).toBe("next");
    expect(finished).toBeNull();
  });

  it("ignores empty/absent chunks", () => {
    const out = accumulateTranscription("keep", undefined);
    expect(out.buffer).toBe("keep");
    expect(out.finished).toBeNull();
  });

  it("flushes even a single finished chunk", () => {
    const out = accumulateTranscription("", { text: "solo", finished: true });
    expect(out.buffer).toBe("");
    expect(out.finished).toBe("solo");
  });

  // The live probe against `gemini-3.1-flash-live-preview` sent the input
  // transcript as one chunk and never emitted `finished`. The trace must
  // still record exactly one user transcript when turnComplete fires.
  it("flushes a single input chunk on turnComplete (no finished observed)", () => {
    let inputBuf = "";
    let userFlushed: string[] = [];
    // One input chunk arrives, no `finished`.
    const acc = accumulateTranscription(inputBuf, { text: "hello user" });
    inputBuf = acc.buffer;
    expect(acc.finished).toBeNull();
    expect(inputBuf).toBe("hello user");
    // turnComplete flushes the buffer exactly once.
    const fin = flushTranscriptionOnTurnComplete(inputBuf);
    if (fin.text) userFlushed.push(fin.text);
    inputBuf = fin.buffer;
    expect(userFlushed).toEqual(["hello user"]);
    expect(inputBuf).toBe("");
    // A second turnComplete with empty buffer is a clean no-op (no dupe).
    const fin2 = flushTranscriptionOnTurnComplete(inputBuf);
    if (fin2.text) userFlushed.push(fin2.text);
    expect(userFlushed).toEqual(["hello user"]);
  });

  // Same probe: output transcript streamed as multiple chunks, no `finished`.
  it("flushes many output chunks as one transcript on turnComplete", () => {
    let outputBuf = "";
    let assistantFlushed: string[] = [];
    for (const piece of ["hello ", "world", "!", " it is ", "me"]) {
      const acc = accumulateTranscription(outputBuf, { text: piece });
      outputBuf = acc.buffer;
      expect(acc.finished).toBeNull();
    }
    expect(outputBuf).toBe("hello world! it is me");
    const fin = flushTranscriptionOnTurnComplete(outputBuf);
    if (fin.text) assistantFlushed.push(fin.text);
    outputBuf = fin.buffer;
    expect(assistantFlushed).toEqual(["hello world! it is me"]);
    expect(outputBuf).toBe("");
  });

  // A model that DOES emit `finished` must not double-flush when
  // turnComplete arrives next: `finished` already cleared the buffer.
  it("does not duplicate when finished fires before turnComplete", () => {
    let buf = "";
    let emitted: string[] = [];
    const acc1 = accumulateTranscription(buf, { text: "hi" });
    buf = acc1.buffer;
    const acc2 = accumulateTranscription(buf, {
      text: " there",
      finished: true,
    });
    buf = acc2.buffer;
    if (acc2.finished) emitted.push(acc2.finished);
    // turnComplete right after: buffer already empty, flush is a no-op.
    const fin = flushTranscriptionOnTurnComplete(buf);
    if (fin.text) emitted.push(fin.text);
    buf = fin.buffer;
    expect(emitted).toEqual(["hi there"]);
  });

  // Separate `{finished:true}` event with no text must still flush whatever
  // was buffered (regression: the original guard dropped these events).
  it("flushes buffered text on a bare {finished:true} with no text", () => {
    let buf = "";
    let emitted: string[] = [];
    const a = accumulateTranscription(buf, { text: "buffered only" });
    buf = a.buffer;
    const b = accumulateTranscription(buf, { finished: true });
    buf = b.buffer;
    if (b.finished) emitted.push(b.finished);
    expect(emitted).toEqual(["buffered only"]);
    expect(buf).toBe("");
  });

  // A bare `{finished:true}` with an empty buffer is a clean no-op (no
  // empty-string transcript ever recorded).
  it("ignores bare {finished:true} when the buffer is empty", () => {
    const out = accumulateTranscription("", { finished: true });
    expect(out.buffer).toBe("");
    expect(out.finished).toBeNull();
  });
});

describe("makeTracedToolRun (relay tool wrapper)", () => {
  let DATA: string;
  beforeEach(() => {
    DATA = mkdtempSync(join(tmpdir(), "sinapso-voice-wrap-"));
  });

  it("records tool_call + tool_result in order with status ok", async () => {
    const trace = createVoiceTraceStore(DATA);
    const inner = async (
      _name: string,
      args: VoiceArgs,
    ): Promise<VoiceResult> => ({ ok: true, echo: args.q });
    const run = makeTracedToolRun({
      run: inner,
      trace,
      sessionId: "voice-wrap",
    });
    const out = await run("search_vault", { q: "hello" }, "call-7");
    expect(out.echo).toBe("hello");
    const events = trace.readEvents("voice-wrap") ?? [];
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(events[0].callId).toBe("call-7");
    expect(events[0].name).toBe("search_vault");
    expect((events[0].args as Record<string, unknown>).q).toBe("hello");
    expect(events[1].status).toBe("ok");
    expect(typeof events[1].durationMs).toBe("number");
  });

  it("marks the result status as error when the tool returns {error}", async () => {
    const trace = createVoiceTraceStore(DATA);
    const inner = async (): Promise<VoiceResult> => ({ error: "nope" });
    const run = makeTracedToolRun({
      run: inner,
      trace,
      sessionId: "voice-err",
    });
    const out = await run("x", {}, "c-1");
    expect(out.error).toBe("nope");
    const events = trace.readEvents("voice-err") ?? [];
    expect(events[1].status).toBe("error");
    expect((events[1].result as Record<string, unknown>).error).toBe("nope");
  });

  it("records a failure result and re-throws when the inner run throws", async () => {
    const trace = createVoiceTraceStore(DATA);
    const inner = async (): Promise<VoiceResult> => {
      throw new Error("boom");
    };
    const run = makeTracedToolRun({
      run: inner,
      trace,
      sessionId: "voice-throw",
    });
    await expect(run("x", {}, "c-1")).rejects.toThrow("boom");
    const events = trace.readEvents("voice-throw") ?? [];
    expect(events[1].status).toBe("error");
    expect((events[1].result as Record<string, unknown>).error).toBe("boom");
  });

  it("redacts secret-bearing keys in args and results", async () => {
    const trace = createVoiceTraceStore(DATA);
    const inner = async (
      _name: string,
      args: VoiceArgs,
    ): Promise<VoiceResult> => ({ token: "leak", args });
    const run = makeTracedToolRun({
      run: inner,
      trace,
      sessionId: "voice-redact",
    });
    await run("x", { apiKey: "secret" }, "c-1");
    const events = trace.readEvents("voice-redact") ?? [];
    expect((events[0].args as Record<string, unknown>).apiKey).toBe(
      "[redacted]",
    );
    expect((events[1].result as Record<string, unknown>).token).toBe(
      "[redacted]",
    );
  });

  it("is a no-op when no trace is configured", async () => {
    const inner = async (): Promise<VoiceResult> => ({ ok: true });
    const run = makeTracedToolRun({
      run: inner,
      sessionId: "voice-notrace",
    });
    const out = await run("x", {});
    expect(out.ok).toBe(true);
  });
});

describe("realtime session transcription config", () => {
  it("configures input transcription for OpenAI with gpt-4o-mini-transcribe", () => {
    const cfg = realtimeSessionConfig(
      "openai",
      "gpt-realtime-2.1",
      "marin",
      "s",
    );
    expect((cfg.audio as Record<string, unknown>).input).toMatchObject({
      transcription: { model: "gpt-4o-mini-transcribe" },
    });
  });

  it("does not send unverified transcription config to xAI", () => {
    const cfg = realtimeSessionConfig("xai", "grok-voice-latest", "eve", "s");
    // xAI session is flat (no audio wrapper); no transcription field at all.
    expect(cfg.transcription).toBeUndefined();
    expect(cfg.audio).toBeUndefined();
  });
});

describe("realtime transcript events", () => {
  it("parses the official completed user transcript shape", () => {
    expect(
      parseRealtimeTranscriptEvent({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item-1",
        transcript: "User said this.",
      }),
    ).toEqual({
      kind: "user",
      text: "User said this.",
      correlationId: "item-1",
    });
  });

  it("parses the official assistant transcript shape", () => {
    expect(
      parseRealtimeTranscriptEvent({
        type: "response.output_audio_transcript.done",
        response_id: "response-1",
        transcript: "Assistant said this.",
      }),
    ).toEqual({
      kind: "assistant",
      text: "Assistant said this.",
      correlationId: "response-1",
    });
  });

  it("rejects the old wrong field and unrelated events", () => {
    expect(
      parseRealtimeTranscriptEvent({
        type: "conversation.item.input_audio_transcription.completed",
        transcription: "wrong field",
      }),
    ).toBeNull();
    expect(parseRealtimeTranscriptEvent({ type: "response.done" })).toBeNull();
  });
});

describe("transcript close flushing", () => {
  it("marks remaining user and assistant text incomplete", () => {
    expect(closeFlushEvents("partial user", "partial assistant")).toEqual([
      {
        type: "user_transcript",
        text: "partial user",
        incomplete: true,
      },
      {
        type: "assistant_transcript",
        text: "partial assistant",
        incomplete: true,
      },
    ]);
  });

  it("does nothing after normal turn flushing cleared both buffers", () => {
    expect(closeFlushEvents("", "")).toEqual([]);
  });
});
