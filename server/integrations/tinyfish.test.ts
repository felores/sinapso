import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { updateConfig } from "./config";
import { TOKEN_HEADER } from "./security";
import { createTinyfishAdapter, TinyfishError } from "./tinyfish";

const key = "tinyfish-key";

describe("Tinyfish adapter", () => {
  it("sends the Search contract and maps ranked results", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                position: 2,
                title: "Second",
                url: "https://two",
                snippet: "two",
                date: "2026-01-02",
              },
              {
                position: 1,
                title: "First",
                url: "https://one",
                snippet: "one",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const result = await createTinyfishAdapter({
      fetch: fetch as typeof globalThis.fetch,
    }).search(key, "test query", { language: "es" });
    const [url, init] = (
      fetch.mock.calls as unknown as Array<[string, RequestInit]>
    )[0];
    expect(String(url)).toBe(
      "https://api.search.tinyfish.ai/?query=test+query&language=es",
    );
    expect(init.headers).toEqual({ "X-API-Key": key });
    expect(result).toMatchObject({
      answer: null,
      results: [
        { title: "First", score: 1 },
        { title: "Second", publishedDate: "2026-01-02" },
      ],
    });
  });

  it("sends the Fetch contract and maps its first successful result", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                final_url: "https://final",
                title: "Article",
                text: "# Body",
                published_date: "2026-01-01",
                author: "Ada",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const result = await createTinyfishAdapter({
      fetch: fetch as typeof globalThis.fetch,
    }).fetch(key, "https://input");
    const [url, init] = (
      fetch.mock.calls as unknown as Array<[string, RequestInit]>
    )[0];
    expect(url).toBe("https://api.fetch.tinyfish.ai/");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "X-API-Key": key },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      urls: ["https://input"],
      format: "markdown",
    });
    expect(result).toEqual({
      url: "https://final",
      title: "Article",
      content: "# Body",
      publishedDate: "2026-01-01",
      author: "Ada",
    });
  });

  it("rejects malformed responses and URL-level fetch failures safely", async () => {
    const malformed = createTinyfishAdapter({
      fetch: (async () => new Response("{}")) as typeof globalThis.fetch,
    });
    await expect(malformed.search(key, "q")).rejects.toMatchObject({
      code: "tinyfish-malformed-response",
    });
    const failed = createTinyfishAdapter({
      fetch: (async () =>
        new Response(
          JSON.stringify({
            errors: [{ url: "https://input", error: "private" }],
          }),
        )) as typeof globalThis.fetch,
    });
    await expect(failed.fetch(key, "https://input")).rejects.toMatchObject({
      code: "tinyfish-fetch-failed",
    });
  });

  it.each([
    [401, "tinyfish-unauthorized"],
    [402, "tinyfish-payment-required"],
    [429, "tinyfish-rate-limited"],
    [503, "tinyfish-unavailable"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const adapter = createTinyfishAdapter({
      fetch: (async () =>
        new Response("", { status })) as typeof globalThis.fetch,
    });
    await expect(adapter.search(key, "q")).rejects.toMatchObject({
      code,
      status: status >= 500 ? 502 : status,
    } satisfies Partial<TinyfishError>);
  });
});

describe("Tinyfish research selection", () => {
  it("uses the Exa key for ordinary fallback search, not the selected deep-provider key", async () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-exa-ordinary-"));
    const graph = join(vault, "graph.json");
    const config = join(vault, "config.json");
    writeFileSync(
      graph,
      JSON.stringify({
        meta: { vaultName: "test", vaultPath: vault, notes: 0, excludes: [] },
        nodes: [],
        links: [],
      }),
    );
    updateConfig(
      {
        consents: { web: true },
        exaKey: "exa-key",
        webResearchProvider: "google",
        voice: { keys: { gemini: "google-key" } },
      },
      config,
    );
    const keys: string[] = [];
    let hostedCalls = 0;
    const { app } = createApp(graph, undefined, {
      configPath: config,
      exa: {
        makeClient: (key) => ({
          search: async () => {
            keys.push(key);
            return { results: [] };
          },
        }),
      },
      webResearch: {
        fetch: (async () => {
          hostedCalls++;
          return new Response("{}");
        }) as typeof fetch,
      },
    });
    const token = (await request(app).get("/api/session")).body.token;
    const res = await request(app)
      .post("/api/research")
      .set(TOKEN_HEADER, token)
      .send({ query: "ordinary" });
    expect(res.status).toBe(200);
    expect(keys).toEqual(["exa-key"]);
    expect(hostedCalls).toBe(0);
    rmSync(vault, { recursive: true, force: true });
  });

  it("uses Tinyfish for ordinary research and surfaces its failure without Exa fallback", async () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-tinyfish-route-"));
    const graph = join(vault, "graph.json");
    const config = join(vault, "config.json");
    writeFileSync(
      graph,
      JSON.stringify({
        meta: { vaultName: "test", vaultPath: vault, notes: 0, excludes: [] },
        nodes: [],
        links: [],
      }),
    );
    updateConfig(
      { consents: { web: true }, tinyfishKey: key, exaKey: "exa-key" },
      config,
    );
    let tinyfishCalls = 0;
    let exaCalls = 0;
    const { app } = createApp(graph, undefined, {
      configPath: config,
      tinyfish: {
        fetch: (async () => {
          tinyfishCalls++;
          return tinyfishCalls === 1
            ? new Response(
                JSON.stringify({
                  results: [
                    {
                      position: 1,
                      title: "Result",
                      url: "https://result",
                      snippet: "text",
                    },
                  ],
                }),
              )
            : new Response("", { status: 429 });
        }) as typeof fetch,
      },
      exa: {
        makeClient: () => ({
          search: async () => {
            exaCalls++;
            return { results: [] };
          },
        }),
      },
    });
    const token = (await request(app).get("/api/session")).body.token;
    const first = await request(app)
      .post("/api/research")
      .set(TOKEN_HEADER, token)
      .send({ query: "ordinary" });
    expect(first.status).toBe(200);
    expect(first.body.results[0].title).toBe("Result");
    const failed = await request(app)
      .post("/api/research")
      .set(TOKEN_HEADER, token)
      .send({ query: "again" });
    expect(failed.status).toBe(429);
    expect(failed.body.error).toBe("tinyfish-rate-limited");
    expect(tinyfishCalls).toBe(2);
    expect(exaCalls).toBe(0);
    rmSync(vault, { recursive: true, force: true });
  });
});
