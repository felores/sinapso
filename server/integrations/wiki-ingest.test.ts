import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { updateConfig } from "./config";
import { TOKEN_HEADER } from "./security";
import { readChangeLog } from "./write";
import { getEntry, saveEntry } from "./research-history";

const ROOTS: string[] = [];
afterAll(() => {
  ROOTS.forEach((r) => {
    rmSync(r, { recursive: true, force: true });
  });
});

const MD_BIN = "/fake/bin/markitdown";

function wiki(rawDestination: string | null = "raw/") {
  return {
    id: "wiki",
    label: "Main Wiki",
    path: "wiki",
    enabled: true,
    contractFiles: ["AGENTS.md", "index.md"],
    rawDestination,
    discovered: true,
    confidence: "high" as const,
  };
}

function fixture(
  opts: {
    openrouterKey?: boolean;
    rawDestination?: string | null;
    llm?: string;
    prompt?: string;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "sinapso-wiki-ingest-"));
  ROOTS.push(root);
  const vault = join(root, "vault");
  const data = join(root, "data");
  mkdirSync(join(vault, "wiki"), { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(join(vault, "wiki", "AGENTS.md"), "# Contract\nUse links.\n");
  writeFileSync(join(vault, "wiki", "index.md"), "# Index\n");
  writeFileSync(join(vault, "wiki", "existing.md"), "# Existing\nold\n");
  const doc = join(root, "source.pdf");
  writeFileSync(doc, "pdf bytes");
  const graphPath = join(data, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify({
      meta: { vaultName: "t", vaultPath: vault, notes: 1, excludes: [] },
      nodes: [{ id: "wiki/existing.md", title: "Existing", in: 0, out: 0 }],
      links: [],
    }),
  );
  const configPath = join(data, "config.json");
  updateConfig(
    {
      openrouterKey: opts.openrouterKey === false ? null : "or-key",
      prompts: opts.prompt ? { wikiIngest: opts.prompt } : undefined,
      vaults: {
        [vault]: {
          path: vault,
          wikis: [
            wiki(
              opts.rawDestination === undefined ? "raw/" : opts.rawDestination,
            ),
          ],
        },
      },
    },
    configPath,
  );
  let chatBody: { messages?: Array<{ role: string; content: string }> } | null =
    null;
  const app = createApp(graphPath, undefined, {
    configPath,
    detectDeps: {
      home: "/h",
      env: { PATH: "/fake/bin" },
      fileExists: (p) => p === MD_BIN,
      run: async (cmd, args) => {
        if (cmd === MD_BIN && args[0] === "--version")
          return { ok: true, stdout: "markitdown 1.0", stderr: "" };
        return {
          ok: true,
          stdout: "# Source Title\n\nConverted body.",
          stderr: "",
        };
      },
    },
    openrouter: {
      fetch: (async (_url: string, init?: RequestInit) => {
        chatBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    opts.llm ??
                    JSON.stringify({
                      operations: [
                        {
                          type: "create",
                          path: "wiki/source-title.md",
                          content: "# Source Title\n\nSynthesized.",
                        },
                      ],
                    }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as never,
    },
  }).app;
  return { app, vault, data, doc, chatBody: () => chatBody };
}

async function token(app: ReturnType<typeof fixture>["app"]) {
  return (await request(app).get("/api/session")).body.token as string;
}

describe("wiki ingest proposals", () => {
  it("requires an OpenRouter key before converting or writing", async () => {
    const f = fixture({ openrouterKey: false });
    const before = readChangeLog(f.data).length;
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("OpenRouter");
    expect(readChangeLog(f.data)).toHaveLength(before);
  });

  it("rejects a RAW-only proposal without writing", async () => {
    const f = fixture({ llm: '{"operations":[]}' });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(422);
    expect(existsSync(join(f.vault, "raw"))).toBe(false);
  });

  it("requires a configured RAW destination before synthesis", async () => {
    const f = fixture({ rawDestination: null });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("RAW destination");
    expect(f.chatBody()).toBeNull();
  });

  it("previews custom ../research raw destinations under the vault", async () => {
    const f = fixture({
      rawDestination: "../research/",
      llm: '{"operations":[{"type":"create","path":"wiki/derived.md","content":"# Derived"}]}',
    });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc });
    expect(res.status).toBe(200);
    expect(res.body.operations[0].path).toMatch(
      /^research\/\d{4}-\d{2}-\d{2}_source-title\.md$/,
    );
  });

  it("drops generated contract and meta operations from the proposal", async () => {
    const f = fixture({
      llm: JSON.stringify({
        operations: [
          { type: "edit", path: "wiki/index.md", content: "# Index\nnew" },
          { type: "edit", path: "wiki/log.md", content: "log" },
          { type: "edit", path: "wiki/hot.md", content: "hot" },
          { type: "edit", path: "wiki/AGENTS.md", content: "contract" },
          {
            type: "create",
            path: "wiki/source-title.md",
            content: "# Source\n",
          },
        ],
      }),
    });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect(res.body.operations.map((op: { path: string }) => op.path)).toEqual([
      expect.stringMatching(/^raw\/\d{4}-\d{2}-\d{2}_source-title\.md$/),
      "wiki/source-title.md",
    ]);
  });

  it("includes contract files and the configured prompt in the OpenRouter call", async () => {
    const f = fixture({ prompt: "Custom wiki ingest prompt" });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(200);
    const prompt = f.chatBody()?.messages?.at(-1)?.content ?? "";
    const rawPath = res.body.operations[0].path as string;
    expect(prompt).toContain("Custom wiki ingest prompt");
    expect(prompt).toContain("wiki/AGENTS.md");
    expect(prompt).toContain("Use links.");
    expect(prompt).toContain(
      `Canonical RAW source path after approval: ${rawPath}`,
    );
    expect(prompt).toContain(
      "any known vault note, including notes outside this wiki",
    );
    expect(prompt).toContain("never use absolute paths, ../ traversal");
    expect(prompt).toContain(`must cite or link ${rawPath}`);
    expect(res.body.contracts.map((c: { path: string }) => c.path)).toEqual([
      "wiki/AGENTS.md",
      "wiki/index.md",
    ]);
  });

  it("applies approved creates through write.ts and journals them", async () => {
    const f = fixture({
      llm: JSON.stringify({
        operations: [
          { type: "create", path: "wiki/new-page.md", content: "# New\n" },
        ],
      }),
    });
    const t = await token(f.app);
    const proposed = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, t)
      .send({ source: f.doc, wikiId: "wiki" });
    const applied = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, t)
      .send({
        wikiId: "wiki",
        operations: [
          ...proposed.body.operations.slice(1),
          proposed.body.operations[0],
        ],
      });
    expect(applied.status).toBe(200);
    expect(applied.body.ids).toContain("wiki/new-page.md");
    expect(readFileSync(join(f.vault, "wiki", "new-page.md"), "utf-8")).toBe(
      "# New\n",
    );
    expect(readChangeLog(f.data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "create",
          path: "wiki/new-page.md",
          mode: "approval",
        }),
      ]),
    );
    expect(readChangeLog(f.data).at(-1)).toMatchObject({
      action: "create",
      path: expect.stringMatching(/^raw\//),
      mode: "approval",
    });
  });

  it("fails on an occupied exact RAW path before derived writes", async () => {
    const f = fixture({
      llm: '{"operations":[{"type":"create","path":"wiki/derived.md","content":"# Derived"}]}',
    });
    const t = await token(f.app);
    const proposed = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, t)
      .send({ source: f.doc, wikiId: "wiki" });
    const raw = proposed.body.operations[0] as { path: string };
    mkdirSync(join(f.vault, "raw"), { recursive: true });
    writeFileSync(join(f.vault, raw.path), "different source");

    const applied = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, t)
      .send({ wikiId: "wiki", operations: proposed.body.operations });

    expect(applied.status).toBe(409);
    expect(applied.body.error).toContain("stale create target");
    expect(existsSync(join(f.vault, "wiki", "derived.md"))).toBe(false);
  }, 10_000);

  it("runs synthesis on the thinker tier when configured (U2)", async () => {
    const f = fixture();
    updateConfig(
      { deepseekKey: "ds-k", thinkerProvider: "deepseek" },
      join(f.data, "config.json"),
    );
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(200);
    const body = f.chatBody() as unknown as {
      model?: string;
      thinking?: unknown;
    };
    expect(body?.model).toBe("deepseek-v4-pro"); // thinker resolution
    expect(body?.thinking).toEqual({ type: "enabled" });
  });

  it("falls back to the worker slot when no thinker is configured (AE2)", async () => {
    const f = fixture();
    updateConfig(
      { workerProvider: "openrouter", workerModel: "meta/fast" },
      join(f.data, "config.json"),
    );
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect((f.chatBody() as unknown as { model?: string })?.model).toBe(
      "meta/fast",
    );
  });

  it("rejecting a preview writes nothing", async () => {
    const f = fixture({
      llm: JSON.stringify({
        operations: [
          {
            type: "edit",
            path: "wiki/existing.md",
            content: "# Existing\nnew\n",
          },
        ],
      }),
    });
    const beforeLog = readChangeLog(f.data).length;
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect(readFileSync(join(f.vault, "wiki", "existing.md"), "utf-8")).toBe(
      "# Existing\nold\n",
    );
    expect(readChangeLog(f.data)).toHaveLength(beforeLog);
  });

  it("discards LLM ops outside the wiki tree and fails when none remain", async () => {
    const f = fixture({
      llm: '{"operations":[{"type":"create","path":"elsewhere/page.md","content":"x"}]}',
    });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("no wiki proposals");
  });

  it("keeps the valid op when the LLM also proposes an outside-wiki path", async () => {
    const f = fixture({
      llm: JSON.stringify({
        operations: [
          { type: "create", path: "elsewhere/bad.md", content: "bad" },
          {
            type: "create",
            path: "wiki/good.md",
            content: "# Good\n",
          },
        ],
      }),
    });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ source: f.doc, wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect(res.body.operations.map((op: { path: string }) => op.path)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^raw\//), "wiki/good.md"]),
    );
    expect(
      res.body.operations.some(
        (op: { path: string }) => op.path === "elsewhere/bad.md",
      ),
    ).toBe(false);
  });

  it("rejects a tampered apply path outside the wiki with a rich error", async () => {
    const f = fixture();
    const res = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, await token(f.app))
      .send({
        wikiId: "wiki",
        operations: [
          {
            type: "create",
            path: "raw/2026-01-01_x.md",
            content: "raw",
            raw: true,
          },
          { type: "create", path: "elsewhere/page.md", content: "x" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OUTSIDE_SELECTED_WIKI");
    expect(res.body.details).toMatchObject({
      rejectedPath: "elsewhere/page.md",
      operationType: "create",
      wikiPath: "wiki",
    });
    expect(typeof res.body.details.rawDestination).toBe("string");
    expect(res.body.details.rawDestination).not.toBe("");
    expect(existsSync(join(f.vault, "elsewhere", "page.md"))).toBe(false);
  });

  it("rejects tampered approval paths outside the vault", async () => {
    const f = fixture();
    const res = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, await token(f.app))
      .send({
        wikiId: "wiki",
        operations: [{ type: "create", path: "../escape.md", content: "x" }],
      });
    expect(res.status).toBe(400);
    expect(existsSync(join(f.vault, "..", "escape.md"))).toBe(false);
  });

  it("previews browser uploads with the same wiki target", async () => {
    const f = fixture();
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose-upload?name=clip.docx&wikiId=wiki")
      .set(TOKEN_HEADER, await token(f.app))
      .set("content-type", "application/octet-stream")
      .send("raw bytes");
    expect(res.status).toBe(200);
    expect(res.body.operations[0].path).toMatch(/raw\/.*source-title\.md$/);
  });

  it("accepts an already converted preview payload", async () => {
    const f = fixture();
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({
        wikiId: "wiki",
        converted: {
          source: "https://example.com/article",
          sourceLabel: "https://example.com/article",
          title: "Article Title",
          markdown: "Article body.",
          via: "markitdown",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Article Title");
    expect(res.body.operations[0]).toMatchObject({ raw: true });
  });

  it("converts persisted research into Inbox and only removes it after the write", async () => {
    const f = fixture();
    const entry = saveEntry(f.data, {
      mode: "web",
      query: "Useful research",
      answer: {
        content: "A useful answer.",
        citations: [{ title: "Source", url: "https://example.com/source" }],
      },
    });
    const res = await request(f.app)
      .post(`/api/research/history/${entry.id}/save-inbox`)
      .set(TOKEN_HEADER, await token(f.app));
    expect(res.status).toBe(200);
    expect(readFileSync(join(f.vault, res.body.id), "utf-8")).toContain(
      "https://example.com/source",
    );
    expect(getEntry(f.data, entry.id)).toBeNull();
  });

  it("rejects semantic history from Inbox curation", async () => {
    const f = fixture();
    const entry = saveEntry(f.data, {
      mode: "semantic",
      query: "x",
      results: [],
    });
    const res = await request(f.app)
      .post(`/api/research/history/${entry.id}/save-inbox`)
      .set(TOKEN_HEADER, await token(f.app));
    expect(res.status).toBe(400);
    expect(getEntry(f.data, entry.id)).not.toBeNull();
  });

  it("reports a missing research id separately from an unsupported mode", async () => {
    const f = fixture();
    const res = await request(f.app)
      .post("/api/research/history/missing-entry/save-inbox")
      .set(TOKEN_HEADER, await token(f.app));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("research not found");
  });

  it("builds a contract-aware proposal from persisted research", async () => {
    const f = fixture();
    const entry = saveEntry(f.data, {
      mode: "article",
      query: "Article",
      article: {
        url: "https://example.com/article",
        title: "Article",
        content: "Article body.",
        publishedDate: null,
        author: "Author",
      },
    });
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ researchId: entry.id, wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect(res.body.researchId).toBe(entry.id);
    expect(res.body.contracts).toHaveLength(2);
    expect(res.body.operations[0]).toMatchObject({
      raw: true,
      type: "create",
    });
  });

  it("preflights all operations and moves an Inbox note to RAW last", async () => {
    const f = fixture({
      llm: '{"operations":[{"type":"create","path":"wiki/derived.md","content":"# Derived"}]}',
    });
    mkdirSync(join(f.vault, "inbox"), { recursive: true });
    writeFileSync(join(f.vault, "inbox", "source.md"), "# Source\n");
    const t = await token(f.app);
    const proposed = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, t)
      .send({
        wikiId: "wiki",
        sourceNote: "inbox/source.md",
        converted: {
          source: "inbox/source.md",
          sourceLabel: "inbox/source.md",
          title: "Source",
          markdown: "# Source\n",
        },
      });
    expect(proposed.status).toBe(200);
    expect(proposed.body.operations[0]).toMatchObject({
      type: "move",
      raw: true,
      sourceNote: "inbox/source.md",
    });
    const failed = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, t)
      .send({
        wikiId: "wiki",
        sourceNote: "inbox/source.md",
        operations: [
          proposed.body.operations[0],
          { type: "edit", path: "wiki/missing.md", content: "x" },
        ],
      });
    expect(failed.status).toBe(409);
    expect(existsSync(join(f.vault, "inbox", "source.md"))).toBe(true);
    const applied = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, t)
      .send({
        wikiId: "wiki",
        sourceNote: "inbox/source.md",
        operations: proposed.body.operations,
      });
    expect(applied.status).toBe(200);
    expect(existsSync(join(f.vault, "inbox", "source.md"))).toBe(false);
    expect(existsSync(join(f.vault, proposed.body.operations[0].path))).toBe(
      true,
    );
    expect(
      readFileSync(join(f.vault, proposed.body.operations[0].path), "utf-8"),
    ).toBe("# Source\n");
    expect(
      readChangeLog(f.data).filter(
        (entry) => entry.newPath === proposed.body.operations[0].path,
      ),
    ).toHaveLength(1);
  });

  it("uses the actual Inbox note instead of spoofed converted content", async () => {
    const f = fixture();
    mkdirSync(join(f.vault, "inbox"), { recursive: true });
    writeFileSync(
      join(f.vault, "inbox", "source.md"),
      "# Actual Inbox Title\n\nActual Inbox body.\n",
    );
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({
        wikiId: "wiki",
        sourceNote: "inbox/source.md",
        converted: {
          source: "https://spoofed.example",
          sourceLabel: "spoofed",
          title: "Spoofed Title",
          markdown: "Spoofed content.",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      source: "inbox/source.md",
      title: "Actual Inbox Title",
    });
    const prompt = f.chatBody()?.messages?.at(-1)?.content ?? "";
    expect(prompt).toContain("Actual Inbox body.");
    expect(prompt).not.toContain("Spoofed content.");
  });

  it("leaves persisted research untouched when the proposal is RAW-only", async () => {
    const f = fixture({ llm: '{"operations":[]}' });
    const entry = saveEntry(f.data, {
      mode: "article",
      query: "Article",
      article: {
        url: "https://example.com/article",
        title: "Article",
        content: "Article body.",
        publishedDate: null,
        author: "Author",
      },
    });
    const before = readChangeLog(f.data);
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ researchId: entry.id, wikiId: "wiki" });
    expect(res.status).toBe(422);
    expect(getEntry(f.data, entry.id)).not.toBeNull();
    expect(readChangeLog(f.data)).toEqual(before);
  });

  it("saves research as a wiki RAW source via the single writer", async () => {
    const f = fixture();
    const entry = saveEntry(f.data, {
      mode: "article",
      query: "Article",
      article: {
        url: "https://example.com/article",
        title: "Article",
        content: "Article body.",
        publishedDate: null,
        author: "Author",
      },
    });
    const before = readChangeLog(f.data).length;
    const res = await request(f.app)
      .post(`/api/research/history/${entry.id}/save-raw-source`)
      .set(TOKEN_HEADER, await token(f.app))
      .send({ wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect(res.body.removedHistory).toBe(true);
    expect(res.body.id).toMatch(/^raw\//);
    expect(getEntry(f.data, entry.id)).toBeNull();
    const written = readFileSync(join(f.vault, res.body.id), "utf-8");
    expect(written).toContain("source: https://example.com/article");
    expect(written).toContain("Article body.");
    const log = readChangeLog(f.data);
    expect(log.length).toBe(before + 1);
    expect(log[0]).toMatchObject({ action: "create" });
    expect(log[0].path).toMatch(/^raw\//);
  });

  it("saves research as a RAW source under an external ../research destination", async () => {
    const f = fixture({ rawDestination: "../research/" });
    const entry = saveEntry(f.data, {
      mode: "web",
      query: "External raw",
      answer: {
        content: "Body.",
        citations: [{ title: "S", url: "https://example.com/s" }],
      },
    });
    const res = await request(f.app)
      .post(`/api/research/history/${entry.id}/save-raw-source`)
      .set(TOKEN_HEADER, await token(f.app))
      .send({ wikiId: "wiki" });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^research\//);
    expect(existsSync(join(f.vault, res.body.id))).toBe(true);
    expect(getEntry(f.data, entry.id)).toBeNull();
  });

  it("leaves research intact when the RAW source write fails", async () => {
    const f = fixture();
    const entry = saveEntry(f.data, {
      mode: "article",
      query: "Article",
      article: {
        url: "https://example.com/article",
        title: "Article",
        content: "Article body.",
        publishedDate: null,
        author: "Author",
      },
    });
    // Occupy the exact RAW path so the create fails with 409.
    const raw = buildRawTarget(f.vault, "wiki", "raw/", "Article");
    mkdirSync(raw.dir, { recursive: true });
    writeFileSync(raw.full, "different");
    const res = await request(f.app)
      .post(`/api/research/history/${entry.id}/save-raw-source`)
      .set(TOKEN_HEADER, await token(f.app))
      .send({ wikiId: "wiki" });
    expect(res.status).toBe(409);
    expect(getEntry(f.data, entry.id)).not.toBeNull();
  });

  it("generates only derived ops from an existing RAW source", async () => {
    const f = fixture({
      llm: '{"operations":[{"type":"create","path":"wiki/derived.md","content":"# Derived"}]}',
    });
    mkdirSync(join(f.vault, "raw"), { recursive: true });
    const rawPath = "raw/2026-01-01_existing.md";
    writeFileSync(join(f.vault, rawPath), "# Existing Source\n\nBody.\n");
    const res = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, await token(f.app))
      .send({ wikiId: "wiki", sourceNote: rawPath });
    expect(res.status).toBe(200);
    expect(res.body.operations.some((op: { raw: boolean }) => op.raw)).toBe(
      false,
    );
    expect(res.body.rawPath).toBe(rawPath);
    const prompt = f.chatBody()?.messages?.at(-1)?.content ?? "";
    expect(prompt).toContain(rawPath);
    expect(prompt).toContain("already exists");
    expect(prompt).toContain("Existing Source");
  });

  it("applies derived ops from an existing RAW source without moving it", async () => {
    const f = fixture({
      llm: '{"operations":[{"type":"create","path":"wiki/derived.md","content":"# Derived"}]}',
    });
    mkdirSync(join(f.vault, "raw"), { recursive: true });
    const rawPath = "raw/2026-01-01_existing.md";
    writeFileSync(join(f.vault, rawPath), "# Existing Source\n");
    const t = await token(f.app);
    const proposed = await request(f.app)
      .post("/api/wiki-ingest/propose")
      .set(TOKEN_HEADER, t)
      .send({ wikiId: "wiki", sourceNote: rawPath });
    expect(proposed.status).toBe(200);
    const applied = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, t)
      .send({
        wikiId: "wiki",
        sourceNote: rawPath,
        operations: proposed.body.operations,
      });
    expect(applied.status).toBe(200);
    expect(applied.body.ids).toContain("wiki/derived.md");
    // The RAW source is unchanged in place (not moved/duplicated).
    expect(readFileSync(join(f.vault, rawPath), "utf-8")).toBe(
      "# Existing Source\n",
    );
  });

  it("rejects an existing-RAW apply that smuggles in a RAW operation", async () => {
    const f = fixture();
    mkdirSync(join(f.vault, "raw"), { recursive: true });
    const rawPath = "raw/2026-01-01_existing.md";
    writeFileSync(join(f.vault, rawPath), "# Existing Source\n");
    const res = await request(f.app)
      .post("/api/wiki-ingest/apply")
      .set(TOKEN_HEADER, await token(f.app))
      .send({
        wikiId: "wiki",
        sourceNote: rawPath,
        operations: [
          {
            type: "create",
            path: "raw/2026-01-01_smuggled.md",
            content: "x",
            raw: true,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("RAW operation");
    expect(existsSync(join(f.vault, "raw", "2026-01-01_smuggled.md"))).toBe(
      false,
    );
  });
});

function buildRawTarget(
  vault: string,
  wikiPath: string,
  rawDestination: string,
  title: string,
): { dir: string; full: string } {
  const date = new Date().toISOString().slice(0, 10);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const full = join(vault, wikiPath, rawDestination, `${date}_${slug}.md`);
  return { dir: join(vault, wikiPath, rawDestination), full };
}
