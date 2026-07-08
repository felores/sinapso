export type SelectionSource = "reader" | "research";

export interface BaseSelectionContext {
  source: SelectionSource;
  text: string;
  truncated?: boolean;
  originalWordCount?: number;
  originalCharCount?: number;
}

export interface ReaderSelectionContext extends BaseSelectionContext {
  source: "reader";
  noteId?: string;
  noteTitle?: string;
}

export interface ResearchSelectionContext extends BaseSelectionContext {
  source: "research";
  entryId?: string;
  mode?: string;
  title?: string;
  query?: string;
  url?: string;
}

export type SelectionContext = ReaderSelectionContext | ResearchSelectionContext;

export interface SelectionContextState {
  reader: ReaderSelectionContext | null;
  research: ResearchSelectionContext | null;
  lastSource: SelectionSource | null;
}

export type SelectionSnapshot = SelectionContextState;

export const MAX_CONTEXT_WORDS = 300;
export const MAX_CONTEXT_CHARS = 3000;

export const emptySelectionState = (): SelectionContextState => ({
  reader: null,
  research: null,
  lastSource: null,
});

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();
const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

export function selectionSlot(
  slot: Omit<ReaderSelectionContext, "text"> & { text: string },
): ReaderSelectionContext | null;
export function selectionSlot(
  slot: Omit<ResearchSelectionContext, "text"> & { text: string },
): ResearchSelectionContext | null;
export function selectionSlot(slot: SelectionContext): SelectionContext | null {
  const text = normalize(slot.text);
  return text ? ({ ...slot, text } as SelectionContext) : null;
}

export function updateSelectionSlot(
  state: SelectionContextState,
  slot: SelectionContext | null,
): SelectionContextState {
  if (!slot) return state;
  return { ...state, [slot.source]: slot, lastSource: slot.source };
}

export function clearSelectionSlot(
  state: SelectionContextState,
  source: SelectionSource,
): SelectionContextState {
  const next = { ...state, [source]: null };
  return {
    ...next,
    lastSource: next.lastSource === source ? next.reader ? "reader" : next.research ? "research" : null : next.lastSource,
  };
}

function capSlot(slot: SelectionContext, wordsLeft: number, charsLeft: number): SelectionContext | null {
  if (wordsLeft <= 0 || charsLeft <= 0) return null;
  const originalWordCount = wordsOf(slot.text).length;
  const originalCharCount = slot.text.length;
  let text = wordsOf(slot.text).slice(0, wordsLeft).join(" ");
  if (text.length > charsLeft) text = text.slice(0, charsLeft).trim();
  if (!text) return null;
  const truncated = text !== slot.text;
  return truncated
    ? { ...slot, text, truncated, originalWordCount, originalCharCount }
    : { ...slot, text };
}

export function buildSelectionSnapshot(
  state: SelectionContextState,
): SelectionSnapshot {
  const order: SelectionSource[] = state.lastSource === "research"
    ? ["research", "reader"]
    : ["reader", "research"];
  const out = emptySelectionState();
  let wordsLeft = MAX_CONTEXT_WORDS;
  let charsLeft = MAX_CONTEXT_CHARS;
  for (const source of order) {
    const slot = state[source];
    if (!slot) continue;
    const capped = capSlot(slot, wordsLeft, charsLeft);
    if (!capped) continue;
    out[source] = capped as never;
    out.lastSource = out.lastSource ?? source;
    wordsLeft -= wordsOf(capped.text).length;
    charsLeft -= capped.text.length;
  }
  return out;
}

export function hasSelectionContext(state: SelectionContextState): boolean {
  return !!(state.reader || state.research);
}

export function selectedText(snapshot: SelectionSnapshot): string {
  return [snapshot.reader?.text, snapshot.research?.text].filter(Boolean).join("\n\n");
}

export function sourceLabel(slot: SelectionContext): string {
  if (slot.source === "reader") return `Reader: ${slot.noteTitle || slot.noteId || "selection"}`;
  return `Research: ${slot.title || slot.query || slot.url || "selection"}`;
}

export function sourceChips(snapshot: SelectionSnapshot): string[] {
  return [snapshot.reader, snapshot.research].filter(Boolean).map((slot) => sourceLabel(slot as SelectionContext));
}

export function contextUseNotice(snapshot: SelectionSnapshot): string | null {
  const chips = sourceChips(snapshot).map((x) => x.replace(/:.*/, ""));
  return chips.length ? `Using selected context from ${chips.join(" and ")}.` : null;
}

export function contextTrimNotice(snapshot: SelectionSnapshot): string | null {
  return snapshot.reader?.truncated || snapshot.research?.truncated
    ? `Selected context was trimmed to ${MAX_CONTEXT_WORDS} words.`
    : null;
}

function contextualLines(query: string, snapshot: SelectionSnapshot): string[] {
  const lines = [];
  if (query.trim()) lines.push(`Query: ${normalize(query)}`);
  for (const slot of [snapshot.reader, snapshot.research]) {
    if (!slot) continue;
    lines.push(sourceLabel(slot));
    if (slot.source === "reader" && slot.noteId) lines.push(`Note: ${slot.noteId}`);
    if (slot.source === "research" && slot.mode) lines.push(`Mode: ${slot.mode}`);
    lines.push(slot.text);
  }
  return lines;
}

export function buildSemanticQuery(query: string, snapshot: SelectionSnapshot): string {
  return `vec:${contextualLines(query, snapshot).join("\n")}`.trim();
}

export function buildKeywordQuery(query: string, snapshot: SelectionSnapshot): string {
  return contextualLines(query, snapshot).join("\n").trim();
}

export function displayQuery(query: string, fallback: string): string {
  return normalize(query) || fallback;
}
