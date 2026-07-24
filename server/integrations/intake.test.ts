import { describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { updateConfig } from "./config";
import { TOKEN_HEADER } from "./security";
import { classifyIntakeUrl } from "./intake";

describe("URL intake classifier", () => {
  const none = {
    consent: false,
    tinyfish: false,
    exa: false,
    markitdown: false,
  };

  it("rejects non-HTTP URLs", () => {
    expect(classifyIntakeUrl("file:///tmp/a.pdf", none)).toEqual({
      error: "invalid-url",
    });
  });

  it("uses markitdown only for known document URLs", () => {
    expect(
      classifyIntakeUrl("https://example.com/report.PDF", {
        ...none,
        tinyfish: true,
        consent: true,
        markitdown: true,
      }),
    ).toEqual({ method: "markitdown-url" });
    expect(
      classifyIntakeUrl("https://example.com/report.pdf", {
        ...none,
        tinyfish: true,
        consent: true,
      }),
    ).toEqual({ error: "no-intake-capability" });
  });

  it("uses configured article capabilities in deterministic order", () => {
    expect(
      classifyIntakeUrl("https://example.com/article", {
        consent: true,
        tinyfish: true,
        exa: true,
        markitdown: true,
      }),
    ).toEqual({ method: "tinyfish-fetch" });
    expect(
      classifyIntakeUrl("https://example.com/article", {
        consent: true,
        tinyfish: false,
        exa: true,
        markitdown: true,
      }),
    ).toEqual({ method: "exa-article" });
    expect(
      classifyIntakeUrl("https://example.com/article", {
        consent: false,
        tinyfish: true,
        exa: true,
        markitdown: true,
      }),
    ).toEqual({ error: "web-consent-required" });
  });

  it("reports consent and missing capability without selecting a provider", () => {
    expect(
      classifyIntakeUrl("https://example.com/article", {
        ...none,
        tinyfish: true,
      }),
    ).toEqual({ error: "web-consent-required" });
    expect(classifyIntakeUrl("https://example.com/article", none)).toEqual({
      error: "no-intake-capability",
    });
  });
});

describe("POST /api/intake", () => {
  it("uses Tinyfish once and saves only to the configured Inbox", async () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-intake-"));
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
        tinyfishKey: "secret",
        writeDestination: "capture",
      },
      config,
    );
    let calls = 0;
    const { app } = createApp(graph, undefined, {
      configPath: config,
      detectDeps: {
        fileExists: () => false,
        run: async () => ({ ok: false, stdout: "", stderr: "" }),
        home: "/h",
        env: {},
      },
      tinyfish: {
        fetch: (async () => {
          calls++;
          return new Response(
            JSON.stringify({
              results: [
                {
                  final_url: "https://example.com/final",
                  title: "Fetched",
                  text: "Fetched text",
                },
              ],
            }),
          );
        }) as typeof fetch,
      },
    });
    const token = (await request(app).get("/api/session")).body.token;
    const res = await request(app)
      .post("/api/intake")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.com/article" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, method: "tinyfish-fetch" });
    expect(res.body.id).toMatch(/^capture\//);
    expect(calls).toBe(1);
    expect(readFileSync(join(vault, res.body.id), "utf8")).toContain(
      "Fetched text",
    );
    rmSync(vault, { recursive: true, force: true });
  });

  it("does not call external providers without consent", async () => {
    const vault = mkdtempSync(join(tmpdir(), "sinapso-intake-consent-"));
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
    updateConfig({ tinyfishKey: "secret" }, config);
    let calls = 0;
    const { app } = createApp(graph, undefined, {
      configPath: config,
      detectDeps: {
        fileExists: () => false,
        run: async () => ({ ok: false, stdout: "", stderr: "" }),
        home: "/h",
        env: {},
      },
      tinyfish: {
        fetch: (async () => {
          calls++;
          return new Response("{}");
        }) as typeof fetch,
      },
    });
    const token = (await request(app).get("/api/session")).body.token;
    const res = await request(app)
      .post("/api/intake")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.com/article" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("web-consent-required");
    expect(calls).toBe(0);
    rmSync(vault, { recursive: true, force: true });
  });
});
