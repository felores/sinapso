import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  logReaderOpen,
  listReaderOpens,
  clearReaderHistory,
} from "./reader-history";

let DATA: string;
beforeEach(() => {
  DATA = mkdtempSync(join(tmpdir(), "solaris-rdh-"));
});

describe("reader history", () => {
  it("logs opens newest-first", () => {
    logReaderOpen(DATA, "a.md");
    logReaderOpen(DATA, "b.md");
    expect(listReaderOpens(DATA).map((e) => e.id)).toEqual(["b.md", "a.md"]);
  });

  it("skips a consecutive repeat (re-render / history nav)", () => {
    logReaderOpen(DATA, "a.md");
    logReaderOpen(DATA, "a.md");
    logReaderOpen(DATA, "b.md");
    expect(listReaderOpens(DATA).map((e) => e.id)).toEqual(["b.md", "a.md"]);
  });

  it("records a non-consecutive reopen as a new entry (selection order)", () => {
    logReaderOpen(DATA, "a.md");
    logReaderOpen(DATA, "b.md");
    logReaderOpen(DATA, "a.md");
    expect(listReaderOpens(DATA).map((e) => e.id)).toEqual([
      "a.md",
      "b.md",
      "a.md",
    ]);
  });

  it("clears the whole history", () => {
    logReaderOpen(DATA, "a.md");
    logReaderOpen(DATA, "b.md");
    clearReaderHistory(DATA);
    expect(listReaderOpens(DATA)).toEqual([]);
  });
});
