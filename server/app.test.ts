import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Throwaway vault with one real note. The graph.json points /api/note's
// vaultRoot here so the path-traversal guard can be exercised end-to-end.
const VAULT = mkdtempSync(join(tmpdir(), "solaris-test-"));
const NOTE_BODY = "# Real Note\n\nA real markdown note inside the vault.\n";
writeFileSync(join(VAULT, "real.md"), NOTE_BODY);

const graphPath = join(VAULT, "graph.json");
writeFileSync(
  graphPath,
  JSON.stringify({
    meta: { vaultName: "test", vaultPath: VAULT, notes: 1, excludes: [] },
    nodes: [{ id: "real.md", title: "Real Note", phantom: false }],
    links: [],
  }),
);

const { app } = createApp(graphPath);

afterAll(() => rmSync(VAULT, { recursive: true, force: true }));

describe("server: /api/note path-traversal guard", () => {
  it("returns markdown for a valid in-vault note", async () => {
    const res = await request(app).get("/api/note?id=real.md");
    expect(res.status).toBe(200);
    expect(res.body.markdown).toBe(NOTE_BODY);
  });

  it("rejects parent-directory traversal (../../etc/passwd)", async () => {
    const res = await request(app).get("/api/note?id=../../etc/passwd");
    expect(res.status).toBe(400);
  });

  it("rejects URL-encoded traversal", async () => {
    const res = await request(app).get("/api/note?id=..%2F..%2Fetc%2Fpasswd");
    expect(res.status).toBe(400);
  });

  it("rejects a non-.md path", async () => {
    const res = await request(app).get("/api/note?id=readme.txt");
    expect(res.status).toBe(400);
  });

  it("rejects a phantom: id with 404 (not 400)", async () => {
    const res = await request(app).get("/api/note?id=phantom:something");
    expect(res.status).toBe(404);
  });
});
