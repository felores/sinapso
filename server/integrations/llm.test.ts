import { describe, it, expect } from "vitest";
import { defaultConfig, type SolarisConfig } from "./config";
import {
  DEEPSEEK_ENDPOINT,
  resolveTier,
  tierCompletion,
  validateDeepseekKey,
} from "./llm";
import { DEFAULT_MODEL } from "./openrouter";

function cfg(patch: Partial<SolarisConfig>): SolarisConfig {
  return { ...defaultConfig(), ...patch };
}

describe("resolveTier", () => {
  it("resolves both slots on OpenRouter with per-slot models", () => {
    const c = cfg({
      openrouterKey: "or-k",
      workerProvider: "openrouter",
      workerModel: "meta/fast",
      thinkerProvider: "openrouter",
      thinkerModel: "meta/deep",
    });
    expect(resolveTier("worker", c)).toEqual({
      provider: "openrouter",
      model: "meta/fast",
      key: "or-k",
    });
    expect(resolveTier("thinker", c)).toEqual({
      provider: "openrouter",
      model: "meta/deep",
      key: "or-k",
    });
  });

  it("pins the fixed DeepSeek pair and ignores any stored model", () => {
    const c = cfg({
      deepseekKey: "ds-k",
      workerProvider: "deepseek",
      workerModel: "ignored/model",
      thinkerProvider: "deepseek",
      thinkerModel: "also/ignored",
    });
    const worker = resolveTier("worker", c)!;
    const thinker = resolveTier("thinker", c)!;
    expect(worker.model).toBe("deepseek-v4-flash");
    expect(thinker.model).toBe("deepseek-v4-pro");
    expect(worker.endpoint).toBe(DEEPSEEK_ENDPOINT);
    expect(thinker.endpoint).toBe(DEEPSEEK_ENDPOINT);
  });

  it("adds thinking options for the DeepSeek thinker only", () => {
    const c = cfg({
      deepseekKey: "ds-k",
      workerProvider: "deepseek",
      thinkerProvider: "deepseek",
    });
    expect(resolveTier("worker", c)!.extraBody).toBeUndefined();
    expect(resolveTier("thinker", c)!.extraBody).toEqual({
      thinking: { type: "enabled" },
    });
  });

  it("supports mixed providers across slots", () => {
    const c = cfg({
      openrouterKey: "or-k",
      deepseekKey: "ds-k",
      workerProvider: "openrouter",
      workerModel: "meta/fast",
      thinkerProvider: "deepseek",
    });
    expect(resolveTier("worker", c)!.provider).toBe("openrouter");
    const thinker = resolveTier("thinker", c)!;
    expect(thinker.provider).toBe("deepseek");
    expect(thinker.model).toBe("deepseek-v4-pro");
  });

  it("falls back to the worker slot when the thinker is unconfigured (R5)", () => {
    const c = cfg({
      deepseekKey: "ds-k",
      workerProvider: "deepseek",
    });
    const thinker = resolveTier("thinker", c)!;
    expect(thinker.model).toBe("deepseek-v4-flash"); // worker resolution, no thinking
    expect(thinker.extraBody).toBeUndefined();
  });

  it("treats a slot whose provider key is missing as unconfigured", () => {
    const c = cfg({
      openrouterKey: "or-k",
      workerProvider: "openrouter",
      workerModel: "meta/fast",
      thinkerProvider: "deepseek", // no deepseekKey stored
    });
    expect(resolveTier("thinker", c)!.model).toBe("meta/fast");
  });

  it("falls back to defaultModel then DEFAULT_MODEL when no slots are set", () => {
    const withDefault = cfg({
      openrouterKey: "or-k",
      defaultModel: "legacy/model",
    });
    expect(resolveTier("worker", withDefault)!.model).toBe("legacy/model");
    const bare = cfg({ openrouterKey: "or-k" });
    expect(resolveTier("thinker", bare)!.model).toBe(DEFAULT_MODEL);
  });

  it("returns null when nothing is configured (non-LLM fallbacks apply)", () => {
    expect(resolveTier("worker", cfg({}))).toBeNull();
    expect(resolveTier("thinker", cfg({}))).toBeNull();
  });
});

describe("tierCompletion", () => {
  it("sends the resolved endpoint, model, and thinking body fields", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const fetchFake = (async (u: string, init: RequestInit) => {
      url = u;
      body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      );
    }) as never;
    const c = cfg({
      deepseekKey: "ds-k",
      thinkerProvider: "deepseek",
    });
    const out = await tierCompletion(
      resolveTier("thinker", c)!,
      [{ role: "user", content: "hi" }],
      { fetch: fetchFake },
    );
    expect(out).toBe("ok");
    expect(url).toBe(`${DEEPSEEK_ENDPOINT}/chat/completions`);
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.thinking).toEqual({ type: "enabled" });
  });

  it("lets an injected test endpoint win over the provider endpoint", async () => {
    let url = "";
    const fetchFake = (async (u: string) => {
      url = u;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "" } }] }),
        { status: 200 },
      );
    }) as never;
    const c = cfg({ deepseekKey: "ds-k", workerProvider: "deepseek" });
    await tierCompletion(resolveTier("worker", c)!, [], {
      fetch: fetchFake,
      endpoint: "http://fake.test",
    });
    expect(url).toBe("http://fake.test/chat/completions");
  });
});

describe("validateDeepseekKey", () => {
  it("returns ok on 200 and not-ok on 401", async () => {
    const respond = (status: number) =>
      (async () => new Response("{}", { status })) as never;
    expect(await validateDeepseekKey("k", { fetch: respond(200) })).toEqual({
      ok: true,
    });
    expect(await validateDeepseekKey("k", { fetch: respond(401) })).toEqual({
      ok: false,
    });
  });

  it("throws on server errors (route reports unreachable)", async () => {
    const fetchFake = (async () => new Response("", { status: 500 })) as never;
    await expect(
      validateDeepseekKey("k", { fetch: fetchFake }),
    ).rejects.toThrow("HTTP 500");
  });
});
