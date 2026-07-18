import { describe, expect, it } from "vitest";
import {
  buildVoiceSystemPrompt,
  geminiCloseError,
  realtimeSessionConfig,
  realtimeVoiceTools,
  resamplePcm16Base64,
  voiceNameForProvider,
} from "./voice";
import { defaultConfig } from "./config";

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
