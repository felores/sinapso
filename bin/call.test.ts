/**
 * `sinapso call` generic invoker (U9/R16): read tool prints the route's
 * JSON, voice-only tools error naming the surface restriction, and a dead
 * server exits nonzero with a clear message.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { callTool } from "./call";

const ROOT = mkdtempSync(join(tmpdir(), "sinapso-cli-call-"));
const VAULT = join(ROOT, "vault");
mkdirSync(join(VAULT, "notes"), { recursive: true });
writeFileSync(join(VAULT, "notes", "one.md"), "# One\n\nbody\n");
const graphPath = join(ROOT, "graph.json");
writeFileSync(
  graphPath,
  JSON.stringify({
    meta: { vaultName: "t", vaultPath: VAULT, notes: 1, excludes: [] },
    nodes: [{ id: "notes/one.md", title: "One", phantom: false }],
    links: [],
  }),
);

let server: Server;
let base: string;

beforeAll(async () => {
  const { app } = createApp(graphPath, undefined, {
    configPath: join(ROOT, "config.json"),
  });
  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
      resolve();
    });
  });
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(ROOT, { recursive: true, force: true });
});

describe("sinapso call", () => {
  it("prints the route's JSON for a read tool", async () => {
    const r = await callTool("browse_folder", '{"path":"notes"}', { base });
    expect(r.exitCode).toBe(0);
    const body = JSON.parse(r.output ?? "{}");
    expect(body.notes?.[0]?.id ?? body.notes).toBeDefined();
    expect(r.output).toContain("notes/one.md");
  });

  it("errors naming the surface restriction for a voice-only tool", async () => {
    const r = await callTool("delegate_to_thinker", '{"task":"t"}', { base });
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("cli surface");
    expect(r.error).toContain("voice");
  });

  it("rejects unknown tools and lists the available ones", async () => {
    const r = await callTool("nope", undefined, { base });
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("unknown tool");
    expect(r.error).toContain("search_notes");
  });

  it("rejects malformed JSON args", async () => {
    const r = await callTool("browse_folder", "{not json", { base });
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("JSON");
  });

  it("exits nonzero with a clear message when the server is down", async () => {
    const r = await callTool("browse_folder", undefined, {
      base: "http://127.0.0.1:1",
    });
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("could not reach Sinapso");
  });
});
