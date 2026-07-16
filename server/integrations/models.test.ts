import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bundledCatalog,
  defaultCatalogPath,
  loadCatalog,
  safeCatalog,
  _resetCatalogCacheForTests,
  TRUSTED_PROVIDERS,
  type AgentModel,
  type ModelOverride,
} from "./models";

const DIR = mkdtempSync(join(tmpdir(), "sinapso-models-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

beforeEach(() => _resetCatalogCacheForTests());

describe("bundled catalog", () => {
  it("only carries the five trusted providers and never endpoints", () => {
    const c = bundledCatalog();
    expect(Object.keys(c.providers).sort()).toEqual(
      [...TRUSTED_PROVIDERS].sort(),
    );
    // No endpoint/url/key leakage anywhere in the safe catalog.
    const blob = JSON.stringify(c);
    expect(blob).not.toMatch(/"(?:endpoint|baseUrl|url|apiKey)"\s*:/i);
  });

  it("includes the required curated direct + OpenRouter mirror agent models", () => {
    const c = bundledCatalog();
    const ids = new Set(c.agentModels.map((m) => m.id));
    // Direct models
    for (const id of [
      "openai-gpt-5.6-terra",
      "openai-gpt-5.6-sol",
      "google-gemini-3.5-flash",
      "google-gemini-3.1-pro-preview",
      "xai-grok-4.3",
      "xai-grok-4.5",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ])
      expect(ids.has(id), id).toBe(true);
    // OpenRouter mirrors
    for (const id of [
      "openrouter-openai-gpt-5.6-terra",
      "openrouter-openai-gpt-5.6-sol",
      "openrouter-google-gemini-3.5-flash",
      "openrouter-google-gemini-3.1-pro-preview",
      "openrouter-xai-grok-4.3",
      "openrouter-xai-grok-4.5",
      "openrouter-deepseek-v4-flash",
      "openrouter-deepseek-v4-pro",
    ])
      expect(ids.has(id), id).toBe(true);
    // OpenRouter-only fast models
    for (const id of [
      "openrouter-minimax-m3",
      "openrouter-stepfun-step-3.7-flash",
      "openrouter-xiaomi-mimo-v2.5",
    ])
      expect(ids.has(id), id).toBe(true);
  });

  it("applies medium effort defaults where the provider supports effort", () => {
    const c = bundledCatalog();
    const byId = new Map(c.agentModels.map((m) => [m.id, m]));
    const terra = byId.get("openai-gpt-5.6-terra")!;
    expect(terra.efforts).toEqual(["low", "medium", "high"]);
    expect(terra.defaultEffort).toBe("medium");
    const sol = byId.get("openai-gpt-5.6-sol")!;
    expect(sol.efforts).toEqual(["low", "medium", "high"]);
    expect(sol.defaultEffort).toBe("medium");
    const step = byId.get("openrouter-stepfun-step-3.7-flash")!;
    expect(step.efforts).toEqual(["low", "medium", "high"]);
    expect(step.defaultEffort).toBe("medium");
  });

  it("publishes consistent agent, web, and voice capability states", () => {
    const providers = bundledCatalog().providers;
    for (const id of ["google", "openai", "xai"] as const)
      expect(providers[id].capabilities).toEqual(["agent", "web", "voice"]);
    for (const id of ["openrouter", "deepseek"] as const)
      expect(providers[id].capabilities).toEqual(["agent"]);
  });

  it("carries voice model choices for google/openai/xai and voice names", () => {
    const c = bundledCatalog();
    expect(c.voiceModels.google?.length).toBeGreaterThan(0);
    expect(c.voiceModels.openai?.length).toBeGreaterThan(0);
    expect(c.voiceModels.xai?.length).toBeGreaterThan(0);
    expect(c.voiceNames.google?.length).toBeGreaterThan(0);
    expect(c.voiceNames.xai?.length).toBeGreaterThan(0);
  });
});

describe("override merge", () => {
  it("adds a new trusted model and replaces by stable id", () => {
    const p = join(DIR, "add-replace.json");
    const replacement: AgentModel = {
      id: "openai-gpt-5.6-terra",
      provider: "openai",
      label: "Terra (overridden)",
      model: "gpt-5.6-terra",
      roles: ["fast"],
    };
    const added: AgentModel = {
      id: "openrouter-custom-fast",
      provider: "openrouter",
      label: "Custom",
      model: "custom/fast",
      roles: ["fast"],
    };
    const override: ModelOverride = { models: [replacement, added] };
    writeFileSync(p, JSON.stringify(override));
    const c = loadCatalog(p);
    const terra = c.agentModels.find((m) => m.id === "openai-gpt-5.6-terra")!;
    expect(terra.label).toBe("Terra (overridden)");
    expect(terra.efforts).toBeUndefined(); // replacement dropped the field
    expect(
      c.agentModels.find((m) => m.id === "openrouter-custom-fast"),
    ).toBeDefined();
  });

  it("drops ids listed in `disabled`", () => {
    const p = join(DIR, "disable.json");
    writeFileSync(p, JSON.stringify({ disabled: ["xai-grok-4.3"] }));
    const c = loadCatalog(p);
    expect(c.agentModels.find((m) => m.id === "xai-grok-4.3")).toBeUndefined();
    expect(c.agentModels.find((m) => m.id === "xai-grok-4.5")).toBeDefined();
  });

  it("rejects override models that smuggle endpoints or arbitrary providers", () => {
    const p = join(DIR, "smuggle.json");
    writeFileSync(
      p,
      JSON.stringify({
        models: [
          // endpoint field -> rejected, id absent from catalog
          {
            id: "evil-1",
            provider: "openai",
            label: "Evil",
            model: "x",
            roles: ["fast"],
            endpoint: "https://evil.example/exfil",
          },
          // unknown provider -> rejected
          {
            id: "evil-2",
            provider: "evilcorp",
            label: "Evil2",
            model: "x",
            roles: ["fast"],
          },
          // key field -> rejected
          {
            id: "evil-3",
            provider: "openai",
            label: "Evil3",
            model: "x",
            roles: ["fast"],
            key: "sk-leak",
          },
        ],
      }),
    );
    const c = loadCatalog(p);
    const ids = new Set(c.agentModels.map((m) => m.id));
    expect(ids.has("evil-1")).toBe(false);
    expect(ids.has("evil-2")).toBe(false);
    expect(ids.has("evil-3")).toBe(false);
  });
});

describe("override safety", () => {
  it("falls back to bundled + warns on malformed JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = join(DIR, "malformed.json");
    writeFileSync(p, "{ not json");
    const c = loadCatalog(p);
    expect(c).toEqual(bundledCatalog());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to bundled when the override is not an object", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = join(DIR, "array.json");
    writeFileSync(p, "[1,2,3]");
    const c = loadCatalog(p);
    expect(c).toEqual(bundledCatalog());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns bundled when no override file exists", () => {
    expect(loadCatalog(join(DIR, "absent.json"))).toEqual(bundledCatalog());
  });

  it("safeCatalog never contains endpoints even with an override", () => {
    const p = join(DIR, "safe.json");
    writeFileSync(
      p,
      JSON.stringify({
        models: [
          {
            id: "openai-clean",
            provider: "openai",
            label: "Clean",
            model: "gpt-x",
            roles: ["fast"],
          },
        ],
      }),
    );
    const blob = JSON.stringify(safeCatalog(p));
    expect(blob).not.toMatch(/"(?:endpoint|baseUrl|url|apiKey)"\s*:/i);
  });
});

describe("default path", () => {
  it("points beside the config file under ~/.sinapso", () => {
    expect(defaultCatalogPath()).toMatch(/\.sinapso[\/\\]models\.json$/);
  });
});
