/**
 * AI selection assist (plan 018 U7): pure helpers for the toolbar's bot
 * input. Builds the positional request envelope and the apply transforms;
 * all vault persistence still flows through the editor buffer + autosave.
 */
import type { EditorState, TransactionSpec } from "@codemirror/state";

export interface AssistRequest {
  instruction: string;
  selection: string;
  surrounding: string;
  noteId: string;
  noteTitle: string;
  selFrom: number;
  selTo: number;
}

const CONTEXT_LINES = 3;

/** Snapshot the selection plus N surrounding lines for the model. */
export function buildAssistRequest(
  state: EditorState,
  instruction: string,
  note: { id: string; title: string },
): AssistRequest | null {
  const r = state.selection.main;
  if (r.empty || !instruction.trim()) return null;
  const doc = state.doc;
  const firstLine = doc.lineAt(r.from).number;
  const lastLine = doc.lineAt(r.to).number;
  const from = doc.line(Math.max(1, firstLine - CONTEXT_LINES)).from;
  const to = doc.line(Math.min(doc.lines, lastLine + CONTEXT_LINES)).to;
  return {
    instruction: instruction.trim(),
    selection: doc.sliceString(r.from, r.to),
    surrounding: doc.sliceString(from, to),
    noteId: note.id,
    noteTitle: note.title,
    selFrom: r.from,
    selTo: r.to,
  };
}

/**
 * Replace the originally selected range with the assistant text — only if
 * the range still holds the text the model was shown (the doc may have
 * changed while the request was in flight). One transaction, one undo step.
 */
export function replaceSelection(
  state: EditorState,
  req: AssistRequest,
  text: string,
): TransactionSpec | null {
  if (
    req.selTo > state.doc.length ||
    state.doc.sliceString(req.selFrom, req.selTo) !== req.selection
  )
    return null;
  return {
    changes: { from: req.selFrom, to: req.selTo, insert: text },
    selection: { anchor: req.selFrom + text.length },
  };
}

/** Insert the assistant text as a block after the selection's last line. */
export function insertBelow(
  state: EditorState,
  req: AssistRequest,
  text: string,
): TransactionSpec {
  const anchor = Math.min(req.selTo, state.doc.length);
  const line = state.doc.lineAt(anchor);
  const insert = `\n\n${text.trim()}`;
  return {
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  };
}
