import { describe, it, expect } from "vitest";
import { pickerState, DEEPSEEK_FIXED } from "./model-picker";

const CURATED = ["deepseek/deepseek-v4-pro", "z-ai/glm-5.2"];

describe("pickerState", () => {
  it("shows the fixed pair label for DeepSeek slots, ignoring saved models (AE1)", () => {
    const worker = pickerState("worker", "deepseek", "ignored/model", CURATED);
    expect(worker.fixedLabel).toBe("deepseek-v4-flash");
    expect(worker.modelSelectVisible).toBe(false);
    expect(worker.customVisible).toBe(false);
    const thinker = pickerState("thinker", "deepseek", null, CURATED);
    expect(thinker.fixedLabel).toBe(DEEPSEEK_FIXED.thinker);
  });

  it("selects a curated OpenRouter model directly", () => {
    const s = pickerState("thinker", "openrouter", "z-ai/glm-5.2", CURATED);
    expect(s).toMatchObject({
      providerValue: "openrouter",
      modelSelectValue: "z-ai/glm-5.2",
      modelSelectVisible: true,
      customVisible: false,
      fixedLabel: null,
    });
  });

  it("routes a non-curated model through the custom input", () => {
    const s = pickerState("worker", "openrouter", "meta/rare-model", CURATED);
    expect(s.modelSelectValue).toBe("__custom");
    expect(s.customVisible).toBe(true);
    expect(s.customValue).toBe("meta/rare-model");
  });

  it("shows the default option when the slot has no model", () => {
    const s = pickerState("worker", "openrouter", null, CURATED);
    expect(s.modelSelectValue).toBe("");
    expect(s.customVisible).toBe(false);
  });

  it("hides pickers entirely for an unset provider (legacy fallback)", () => {
    const s = pickerState("worker", null, "whatever", CURATED);
    expect(s.providerValue).toBe("");
    expect(s.modelSelectVisible).toBe(false);
    expect(s.fixedLabel).toBeNull();
  });
});
