import { describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { updateConfig } from "./config";
import { TOKEN_HEADER } from "./security";

function setup(
  markitdown = true,
  web: {
    tinyfish?: boolean;
    tinyfishStatus?: number;
    exa?: boolean;
    exaContent?: string;
  } = {},
) {
  const vault = mkdtempSync(join(tmpdir(), "sinapso-resource-"));
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
      tinyfishKey: web.tinyfish === false ? null : "tinyfish",
      exaKey: web.exa ? "exa" : null,
    },
    config,
  );
  let tinyfishCalls = 0;
  const app = createApp(graph, undefined, {
    configPath: config,
    detectDeps: {
      home: "/h",
      env: { PATH: "/fake/bin" },
      fileExists: (path) => markitdown && path === "/fake/bin/markitdown",
      run: async (cmd) =>
        cmd === "/fake/bin/markitdown"
          ? { ok: true, stdout: "# Converted\n\nDocument body", stderr: "" }
          : { ok: false, stdout: "", stderr: "" },
    },
    downloader: {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async () => ({
        status: 200,
        headers: { "content-type": "application/pdf" },
        body: new TextEncoder().encode("%PDF-1.7"),
      }),
    },
    tinyfish: {
      fetch: (async () => {
        tinyfishCalls++;
        return new Response(JSON.stringify({ results: [] }), {
          status: web.tinyfishStatus ?? 200,
        });
      }) as typeof fetch,
    },
    exa: {
      retryDelays: [],
      makeClient: () => ({
        async search() {
          return { results: [] };
        },
        async getContents(urls) {
          return {
            results: [
              {
                url: urls[0],
                title: "Exa article",
                text: web.exaContent ?? "",
              },
            ],
          };
        },
      }),
    },
  }).app;
  return { app, vault, tinyfishCalls: () => tinyfishCalls };
}

describe("POST /api/resource", () => {
  it("converts supported documents into article-only research without web providers", async () => {
    const ctx = setup();
    const token = (await request(ctx.app).get("/api/session")).body.token;
    const res = await request(ctx.app)
      .post("/api/resource")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.test/report.pdf", title: "Report" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      action: "research",
      handler: "markitdown",
      article: {
        url: "https://example.test/report.pdf",
        title: "Report",
        content: expect.stringContaining("Document body"),
      },
    });
    expect(res.body.historyId).toBeTruthy();
    expect(ctx.tinyfishCalls()).toBe(0);
    rmSync(ctx.vault, { recursive: true, force: true });
  });

  it("returns an external action when MarkItDown is unavailable", async () => {
    const ctx = setup(false);
    const token = (await request(ctx.app).get("/api/session")).body.token;
    const res = await request(ctx.app)
      .post("/api/resource")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.test/report.pdf" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: "external",
      reason: "markitdown-unavailable",
    });
    expect(ctx.tinyfishCalls()).toBe(0);
    rmSync(ctx.vault, { recursive: true, force: true });
  });

  it("keeps document URLs out of the legacy article provider route", async () => {
    const ctx = setup();
    const token = (await request(ctx.app).get("/api/session")).body.token;
    const res = await request(ctx.app)
      .post("/api/article")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.test/report.pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("document-resource");
    expect(ctx.tinyfishCalls()).toBe(0);
    rmSync(ctx.vault, { recursive: true, force: true });
  });

  it("falls back from Tinyfish to Exa for ordinary pages", async () => {
    const ctx = setup(true, {
      tinyfishStatus: 500,
      exa: true,
      exaContent: "Exa fallback body",
    });
    const token = (await request(ctx.app).get("/api/session")).body.token;
    const res = await request(ctx.app)
      .post("/api/resource")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.test/article" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      action: "research",
      handler: "exa",
      article: { content: "Exa fallback body" },
    });
    expect(ctx.tinyfishCalls()).toBe(1);
    rmSync(ctx.vault, { recursive: true, force: true });
  });

  it("returns external instead of opening empty Exa research", async () => {
    const ctx = setup(true, { tinyfish: false, exa: true, exaContent: "" });
    const token = (await request(ctx.app).get("/api/session")).body.token;
    const res = await request(ctx.app)
      .post("/api/resource")
      .set(TOKEN_HEADER, token)
      .send({ url: "https://example.test/article" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: "external",
      reason: "resource-fetch-failed",
    });
    expect(ctx.tinyfishCalls()).toBe(0);
    rmSync(ctx.vault, { recursive: true, force: true });
  });
});
