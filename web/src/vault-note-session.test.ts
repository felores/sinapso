import { describe, expect, it } from "vitest";
import {
  GenerationToken,
  decideTransfer,
  isTransferBlocked,
  type CurrentOwnership,
  type EditorOwner,
} from "./vault-note-session.js";

function own(
  path: string,
  owner: EditorOwner,
  state: CurrentOwnership["state"],
): CurrentOwnership {
  return { path, owner, state };
}

describe("decideTransfer", () => {
  it("mounts when the path is not currently owned", () => {
    expect(decideTransfer("research", null)).toEqual({ kind: "mount" });
    expect(decideTransfer("reader", null)).toEqual({ kind: "mount" });
  });

  it("reports already-owns when the target owner already holds the path", () => {
    expect(
      decideTransfer("research", own("inbox/a.md", "research", "clean")),
    ).toEqual({ kind: "already-owns" });
    expect(
      decideTransfer("reader", own("notes/a.md", "reader", "dirty")),
    ).toEqual({ kind: "already-owns" });
  });

  it("transfers immediately when the other owner is clean", () => {
    expect(
      decideTransfer("research", own("notes/a.md", "reader", "clean")),
    ).toEqual({ kind: "transfer-clean", from: "reader" });
    expect(
      decideTransfer("reader", own("inbox/a.md", "research", "clean")),
    ).toEqual({ kind: "transfer-clean", from: "research" });
  });

  it("awaits a saving editor before transferring", () => {
    expect(
      decideTransfer("research", own("notes/a.md", "reader", "saving")),
    ).toEqual({ kind: "transfer-await-saving", from: "reader" });
  });

  it("flushes a dirty editor before transferring", () => {
    expect(
      decideTransfer("research", own("notes/a.md", "reader", "dirty")),
    ).toEqual({ kind: "transfer-flush-dirty", from: "reader" });
  });

  it.each([
    ["conflict", "blocked-conflict"],
    ["error", "blocked-error"],
  ] as const)(
    "blocks transfer when the other owner is in %s (keep + focus, no discard)",
    (state, kind) => {
      const d = decideTransfer("research", own("notes/a.md", "reader", state));
      expect(d).toEqual({ kind, from: "reader" });
      expect(isTransferBlocked(d)).toBe(true);
    },
  );

  it("treats a different path's ownership as irrelevant (side-by-side)", () => {
    // A different path mounted elsewhere is the normal side-by-side case
    // (R12: one path → one editor; different paths coexist). The decide
    // helper only reasons about THE target path; the host treats the
    // "different path" case as `current === null` for the target path.
    expect(decideTransfer("research", null)).toEqual({ kind: "mount" });
  });
});

describe("GenerationToken", () => {
  it("is monotonic: each next() invalidates the previous", () => {
    const t = new GenerationToken();
    const a = t.next();
    const b = t.next();
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(t.isCurrent(a)).toBe(false);
    expect(t.isCurrent(b)).toBe(true);
  });

  it("protects against a stale async open stealing ownership", () => {
    const t = new GenerationToken();
    const slowOpen = t.next(); // captured at request time
    const newerOpen = t.next(); // user opens a different note meanwhile
    expect(t.isCurrent(slowOpen)).toBe(false); // slow fetch must bail
    expect(t.isCurrent(newerOpen)).toBe(true);
  });
});
