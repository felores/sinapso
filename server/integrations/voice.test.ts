import { describe, expect, it } from "vitest";
import { buildVoiceSystemPrompt } from "./voice";
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
    expect(prompt).toContain("read that wiki's contract files");
  });
});
