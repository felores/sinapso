/**
 * F030 — qmd-vectors read-only sqlite-vec reader.
 *
 * Fixtures are tiny sqlite-vec indexes built at test time (no committed blob),
 * matching qmd's real schema (vectors_vec vec0, documents, content_vectors,
 * store_collections). Proves: KNN returns expected neighbors; dimension is read
 * from the schema (a 1024-dim fixture is NOT treated as 768); docs outside the
 * vault root are skipped; and a malformed / absent index disables the layer
 * without throwing.
 */
import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openQmdVectors } from "./qmd-vectors.js";

const tmp = mkdtempSync(join(tmpdir(), "solaris-qv-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface FixtureDoc {
  collection: string;
  path: string;
  hash: string;
  vector: number[];
}

/** Build a qmd-shaped sqlite-vec index at dbPath. */
function buildFixture(
  dbPath: string,
  dim: number,
  collections: Record<string, string>,
  docs: FixtureDoc[],
): void {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.exec(`
    CREATE TABLE documents(
      id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT, path TEXT,
      title TEXT, hash TEXT, created_at TEXT DEFAULT '', modified_at TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE content_vectors(
      hash TEXT, seq INTEGER, pos INTEGER, model TEXT,
      embedded_at TEXT DEFAULT '', total_chunks INTEGER DEFAULT 1,
      PRIMARY KEY(hash, seq));
    CREATE TABLE store_collections(name TEXT PRIMARY KEY, path TEXT);
  `);
  db.exec(
    `CREATE VIRTUAL TABLE vectors_vec USING vec0(hash_seq TEXT PRIMARY KEY, embedding float[${dim}] distance_metric=cosine);`,
  );
  const insCol = db.prepare(
    "INSERT OR IGNORE INTO store_collections(name, path) VALUES (?, ?)",
  );
  for (const [name, path] of Object.entries(collections))
    insCol.run(name, path);
  const insDoc = db.prepare(
    "INSERT INTO documents(collection, path, title, hash, active) VALUES (?, ?, ?, ?, 1)",
  );
  const insCv = db.prepare(
    "INSERT INTO content_vectors(hash, seq, pos, model) VALUES (?, 0, 0, 'test')",
  );
  const insVec = db.prepare(
    "INSERT INTO vectors_vec(hash_seq, embedding) VALUES (?, ?)",
  );
  for (const d of docs) {
    insDoc.run(d.collection, d.path, d.path, d.hash);
    insCv.run(d.hash);
    insVec.run(`${d.hash}_0`, JSON.stringify(d.vector));
  }
  db.close();
}

describe("qmd-vectors (F030)", () => {
  it("reads dim from schema, maps ids to the vault, and KNN returns the expected neighbors", () => {
    const dbPath = join(tmp, "knn.sqlite");
    const dim = 8;
    const e = (i: number) => {
      const v = new Array(dim).fill(0);
      v[i] = 1;
      return v;
    };
    buildFixture(
      dbPath,
      dim,
      {
        notes: join(tmp, "notas"),
        code: "/somewhere/outside/the-vault", // outside vaultRoot -> skipped
      },
      [
        { collection: "notes", path: "a.md", hash: "aaaa", vector: e(0) },
        // near a: mostly axis 0 with a little axis 1
        {
          collection: "notes",
          path: "b.md",
          hash: "bbbb",
          vector: [0.95, 0.31, 0, 0, 0, 0, 0, 0],
        },
        { collection: "notes", path: "c.md", hash: "cccc", vector: e(7) },
        // out-of-vault doc: must not appear as a graph node
        { collection: "code", path: "x.md", hash: "dddd", vector: e(0) },
      ],
    );

    const qv = openQmdVectors({ vaultRoot: tmp, dbPath });
    expect(qv.available).toBe(true);
    if (!qv.available) return;

    expect(qv.dim).toBe(8);

    const all = qv.allDocVectors();
    expect([...all.keys()].sort()).toEqual([
      "notas/a.md",
      "notas/b.md",
      "notas/c.md",
    ]);
    // the out-of-vault collection doc is skipped entirely
    expect([...all.keys()].some((k) => k.includes("x.md"))).toBe(false);

    const va = qv.docVector("notas/a.md");
    expect(va).not.toBeNull();
    expect(va!.length).toBe(8);

    const hits = qv.knn(va!, 2);
    expect(hits.map((h) => h.id)).toEqual(["notas/a.md", "notas/b.md"]);
    expect(hits[0].score).toBeGreaterThan(0.99); // self, cosine ~1
    // c (orthogonal) is not among the top-2
    expect(hits.some((h) => h.id === "notas/c.md")).toBe(false);
    qv.close();
  });

  it("reads a 1024-dim index as 1024 (dimension is not hardcoded to 768)", () => {
    const dbPath = join(tmp, "wide.sqlite");
    const vec = new Array(1024).fill(0);
    vec[3] = 1;
    buildFixture(dbPath, 1024, { notes: join(tmp, "notas") }, [
      { collection: "notes", path: "w.md", hash: "eeee", vector: vec },
    ]);
    const qv = openQmdVectors({ vaultRoot: tmp, dbPath });
    expect(qv.available).toBe(true);
    if (!qv.available) return;
    expect(qv.dim).toBe(1024);
    expect(qv.docVector("notas/w.md")!.length).toBe(1024);
    qv.close();
  });

  it("disables the layer (no throw) when the index is absent", () => {
    const qv = openQmdVectors({
      vaultRoot: tmp,
      dbPath: join(tmp, "does-not-exist.sqlite"),
    });
    expect(qv.available).toBe(false);
    if (qv.available) return;
    expect(qv.reason).toMatch(/not found/i);
  });

  it("disables the layer (no throw) when the schema is malformed", () => {
    const dbPath = join(tmp, "malformed.sqlite");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE documents(id INTEGER PRIMARY KEY);"); // no vectors_vec
    db.close();
    const qv = openQmdVectors({ vaultRoot: tmp, dbPath });
    expect(qv.available).toBe(false);
    if (qv.available) return;
    expect(qv.reason).toMatch(/missing table|unexpected schema/i);
  });
});
