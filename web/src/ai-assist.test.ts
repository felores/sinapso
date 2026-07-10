import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { buildAssistRequest, insertBelow, replaceSelection } from "./ai-assist";

const DOC =
  "# Title\n\nfirst paragraph line\nsecond line here\nthird line\n\nlast block\n";

function state(anchor: number, head: number): EditorState {
  return EditorState.create({ doc: DOC, selection: { anchor, head } });
}

const NOTE = { id: "folder/note.md", title: "Note" };

describe("buildAssistRequest", () => {
  it("captures selection, offsets, note identity, and surrounding lines", () => {
    const from = DOC.indexOf("second");
    const to = from + "second line here".length;
    const req = buildAssistRequest(state(from, to), "shorten this", NOTE)!;
    expect(req.selection).toBe("second line here");
    expect(req.selFrom).toBe(from);
    expect(req.selTo).toBe(to);
    expect(req.noteId).toBe("folder/note.md");
    expect(req.surrounding).toContain("first paragraph line");
    expect(req.surrounding).toContain("third line");
    expect(req.instruction).toBe("shorten this");
  });

  it("returns null for an empty selection or blank instruction", () => {
    expect(buildAssistRequest(state(3, 3), "do it", NOTE)).toBeNull();
    expect(buildAssistRequest(state(0, 5), "   ", NOTE)).toBeNull();
  });

  it("clamps surrounding context at document edges", () => {
    const req = buildAssistRequest(state(0, 7), "translate", NOTE)!;
    expect(req.surrounding.startsWith("# Title")).toBe(true);
  });
});

describe("replaceSelection", () => {
  it("replaces the range in one transaction with the cursor after the text", () => {
    const from = DOC.indexOf("second");
    const to = from + "second line here".length;
    const s = state(from, to);
    const req = buildAssistRequest(s, "rewrite", NOTE)!;
    const spec = replaceSelection(s, req, "a better line")!;
    const out = s.update(spec).state;
    expect(out.doc.toString()).toContain("a better line");
    expect(out.doc.toString()).not.toContain("second line here");
    expect(out.selection.main.empty).toBe(true);
  });

  it("refuses when the document changed under the request", () => {
    const from = DOC.indexOf("second");
    const to = from + "second line here".length;
    const s = state(from, to);
    const req = buildAssistRequest(s, "rewrite", NOTE)!;
    const changed = s.update({ changes: { from: 0, insert: "X" } }).state;
    expect(replaceSelection(changed, req, "text")).toBeNull();
  });
});

describe("insertBelow", () => {
  it("inserts a block after the selection's last line", () => {
    const from = DOC.indexOf("second");
    const to = from + "second".length;
    const s = state(from, to);
    const req = buildAssistRequest(s, "expand", NOTE)!;
    const out = s.update(insertBelow(s, req, "new block")).state;
    const lines = out.doc.toString().split("\n");
    expect(lines[lines.indexOf("second line here") + 2]).toBe("new block");
  });

  it("keeps the original selection text intact", () => {
    const from = DOC.indexOf("second");
    const to = from + "second line here".length;
    const s = state(from, to);
    const req = buildAssistRequest(s, "expand", NOTE)!;
    const out = s.update(insertBelow(s, req, "appendix")).state;
    expect(out.doc.toString()).toContain("second line here");
    expect(out.doc.toString()).toContain("appendix");
  });
});
