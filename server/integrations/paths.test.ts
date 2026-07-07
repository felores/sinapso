import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confineNoteId, noteFileOrFail, WriteError } from "./paths";

// Throwaway vault with a few real notes covering the cases the seam sees:
// nested path, uppercase extension, non-md file, and a missing-note path.
const VAULT = mkdtempSync(join(tmpdir(), "solaris-paths-"));
writeFileSync(join(VAULT, "a.md"), "# A\n");
writeFileSync(join(VAULT, "UPPER.MD"), "# UPPER\n");
writeFileSync(join(VAULT, "note.txt"), "not a note\n");
mkdirSync(join(VAULT, "sub"));
writeFileSync(join(VAULT, "sub", "deep.md"), "# Deep\n");

afterAll(() => rmSync(VAULT, { recursive: true, force: true }));

describe("confineNoteId (pure confinement primitive)", () => {
  it("resolves a vault-relative path under the root", () => {
    expect(confineNoteId(VAULT, "a.md")).toBe(join(VAULT, "a.md"));
  });

  it("resolves a nested path inside a subfolder", () => {
    expect(confineNoteId(VAULT, "sub/deep.md")).toBe(
      join(VAULT, "sub", "deep.md"),
    );
  });

  it("accepts .MD (case-insensitive extension)", () => {
    expect(confineNoteId(VAULT, "UPPER.MD")).toBe(join(VAULT, "UPPER.MD"));
  });

  it("rejects an empty id", () => {
    expect(confineNoteId(VAULT, "")).toBeNull();
  });

  it("rejects a phantom: id", () => {
    expect(confineNoteId(VAULT, "phantom:ghost.md")).toBeNull();
  });

  it("rejects parent-directory traversal", () => {
    expect(confineNoteId(VAULT, "../outside.md")).toBeNull();
  });

  it("rejects deep traversal", () => {
    expect(confineNoteId(VAULT, "../../etc/passwd.md")).toBeNull();
  });

  it("rejects an absolute path (escapes the vault)", () => {
    expect(confineNoteId(VAULT, "/etc/passwd.md")).toBeNull();
  });

  it("rejects a path that resolves to vaultRoot itself (no trailing sep)", () => {
    // `..` from the vault root resolves to the parent of VAULT — escapes.
    expect(confineNoteId(VAULT, "..")).toBeNull();
    // `.` from the vault root resolves to VAULT itself — does not satisfy
    // `startsWith(VAULT + sep)`, so it is also rejected.
    expect(confineNoteId(VAULT, ".")).toBeNull();
  });

  it("rejects traversal that looks prefix-valid (foo/../../escape.md)", () => {
    // resolve normalizes the .. segments and the result escapes the vault.
    expect(confineNoteId(VAULT, "foo/../../escape.md")).toBeNull();
  });

  it("rejects a non-md extension", () => {
    expect(confineNoteId(VAULT, "note.txt")).toBeNull();
  });

  it("rejects a path with no extension", () => {
    expect(confineNoteId(VAULT, "note")).toBeNull();
  });
});

describe("noteFileOrFail (error-throwing wrapper)", () => {
  it("returns the full path for a present note", () => {
    expect(noteFileOrFail(VAULT, "a.md")).toBe(join(VAULT, "a.md"));
  });

  it("returns the full path for a nested present note", () => {
    expect(noteFileOrFail(VAULT, "sub/deep.md")).toBe(
      join(VAULT, "sub", "deep.md"),
    );
  });

  it("throws WriteError 404 for a missing file", () => {
    expect(() => noteFileOrFail(VAULT, "nope.md")).toThrowError(
      expect.objectContaining({ status: 404, message: "note not found" }),
    );
  });

  it("throws WriteError 404 for an empty id", () => {
    expect(() => noteFileOrFail(VAULT, "")).toThrowError(
      expect.objectContaining({ status: 404, message: "note not found" }),
    );
  });

  it("throws WriteError 404 for a phantom: id", () => {
    expect(() => noteFileOrFail(VAULT, "phantom:foo")).toThrowError(
      expect.objectContaining({ status: 404, message: "note not found" }),
    );
  });

  it("throws WriteError 400 for an escaping id", () => {
    expect(() => noteFileOrFail(VAULT, "../escape.md")).toThrowError(
      expect.objectContaining({ status: 400, message: "invalid note id" }),
    );
  });

  it("throws WriteError 400 for a non-md path", () => {
    expect(() => noteFileOrFail(VAULT, "note.txt")).toThrowError(
      expect.objectContaining({ status: 400, message: "invalid note id" }),
    );
  });
});
