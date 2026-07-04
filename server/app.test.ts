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

describe("server: /api/note-lines slice + guard", () => {
  it("returns a line-range slice with range metadata", async () => {
    const res = await request(app).get(
      "/api/note-lines?id=real.md&from=1&count=1",
    );
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("# Real Note");
    expect(res.body.from).toBe(1);
    expect(res.body.to).toBe(1);
  });

  it("clamps an over-long count and reports total lines", async () => {
    const res = await request(app).get(
      "/api/note-lines?id=real.md&from=3&count=999",
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.text).toContain("A real markdown note");
  });

  it("rejects parent-directory traversal", async () => {
    const res = await request(app).get(
      "/api/note-lines?id=../../etc/passwd&from=1",
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-.md path", async () => {
    const res = await request(app).get("/api/note-lines?id=readme.txt");
    expect(res.status).toBe(400);
  });

  it("rejects a phantom: id with 404", async () => {
    const res = await request(app).get("/api/note-lines?id=phantom:x");
    expect(res.status).toBe(404);
  });
});

describe("server: /api/note-grep literal scan + guard", () => {
  it("finds every matching line with its 1-based line number", async () => {
    const res = await request(app).get("/api/note-grep?id=real.md&q=markdown");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.matches[0].line).toBe(3);
    expect(res.body.matches[0].text).toContain("markdown");
  });

  it("is case-sensitive by default, case-insensitive with ignore_case=1", async () => {
    const sensitive = await request(app).get(
      "/api/note-grep?id=real.md&q=Real",
    );
    expect(sensitive.body.count).toBe(1); // "# Real Note" only
    const insensitive = await request(app).get(
      "/api/note-grep?id=real.md&q=real&ignore_case=1",
    );
    expect(insensitive.body.count).toBe(2); // "Real" + "real"
  });

  it("returns count 0 for no match", async () => {
    const res = await request(app).get("/api/note-grep?id=real.md&q=zzzznope");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("rejects parent-directory traversal", async () => {
    const res = await request(app).get(
      "/api/note-grep?id=../../etc/passwd&q=root",
    );
    expect(res.status).toBe(400);
  });

  it("rejects a phantom: id with 404", async () => {
    const res = await request(app).get("/api/note-grep?id=phantom:x&q=a");
    expect(res.status).toBe(404);
  });
});
