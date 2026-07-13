import { afterEach, describe, expect, it } from "vitest";
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
import { scanVault } from "../../scanner/scan";
import { readChangeLog } from "./write";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sinapso-voice-promote-"));
  roots.push(root);
  const vault = join(root, "vault");
  const data = join(root, "data");
  mkdirSync(join(vault, "area/wiki"), { recursive: true });
  mkdirSync(join(vault, "area/research"), { recursive: true });
  mkdirSync(data);
  writeFileSync(
    join(vault, "area/wiki/AGENTS.md"),
    "# Contract\n\nPeople notes live under people/ and must cite sources.",
  );
  const graph = join(data, "graph.json");
  scanVault({ vault, out: graph });
  const server = createApp(graph, undefined, { configPath: join(root, "config.json") });
  return { root, vault, data, server };
}

async function token(app: ReturnType<typeof createApp>["app"]) {
  return (await request(app).get("/api/session")).body.token as string;
}

describe("voice working document promotion", () => {
  it("saves a working document as a structured wiki note and removes history", async () => {
    const f = fixture();
    const t = await token(f.server.app);
    const created = await request(f.server.app)
      .post("/api/document")
      .set("x-sinapso-token", t)
      .send({
        title: "Ada Lovelace",
        content: "# Ada Lovelace\n\nSource: web research.\n\n[[Mathematics]]",
      })
      .expect(200);

    const res = await request(f.server.app)
      .post(`/api/document/${created.body.id}/promote`)
      .set("x-sinapso-token", t)
      .send({
        kind: "wiki_note",
        wikiId: "area/wiki",
        path: "area/wiki/people/ada-lovelace.md",
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("area/wiki/people/ada-lovelace.md");
    expect(readFileSync(join(f.vault, res.body.id), "utf-8")).toContain(
      "[[Mathematics]]",
    );
    const history = await request(f.server.app).get("/api/research/history");
    expect(
      history.body.entries.some((e: { id: string }) => e.id === created.body.id),
    ).toBe(false);
    expect(readChangeLog(f.data).at(-1)).toMatchObject({
      actor: "agent",
      action: "create",
      path: "area/wiki/people/ada-lovelace.md",
    });
  });

  it("saves a working document as a raw copy in the wiki raw destination", async () => {
    const f = fixture();
    const t = await token(f.server.app);
    const created = await request(f.server.app)
      .post("/api/document")
      .set("x-sinapso-token", t)
      .send({ title: "Raw Interview", content: "raw transcript" })
      .expect(200);

    const res = await request(f.server.app)
      .post(`/api/document/${created.body.id}/promote`)
      .set("x-sinapso-token", t)
      .send({ kind: "raw_copy", wikiId: "area/wiki" });

    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^area\/research\/\d{4}-\d{2}-\d{2}_raw-interview\.md$/);
    expect(existsSync(join(f.vault, res.body.id))).toBe(true);
    const saved = readFileSync(join(f.vault, res.body.id), "utf-8");
    expect(saved).toContain("via: voice");
    expect(saved).toContain("raw transcript");
  });
});
