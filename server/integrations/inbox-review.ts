import { createHash } from "node:crypto";

export type ReviewAction = "continue" | "link" | "merge" | "archive" | "ingest";
export type ReviewState = "pending" | "dismissed" | "approved";

export interface ReviewNote {
  path: string;
  title: string;
  hash: string;
  content: string;
}

export interface ReviewSemanticEdge {
  source: string;
  target: string;
  score: number;
}

export interface InboxReviewCard {
  id: string;
  note: Omit<ReviewNote, "content">;
  action: ReviewAction;
  reason: string;
  reasonKey: string;
  reasonArgs?: Record<string, string | number>;
  target?: Omit<ReviewNote, "content">;
  preview?: string;
  state: ReviewState;
  comment?: string;
  approvedAt?: string;
  resultPaths?: string[];
}

export interface ReviewOptions {
  semanticEdges?: ReviewSemanticEdge[] | null;
  enabledWikiCount?: number;
  limit?: number;
  sourcePaths?: ReadonlySet<string>;
}

const normalizeTitle = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const noteRef = (note: ReviewNote): Omit<ReviewNote, "content"> => ({
  path: note.path,
  title: note.title,
  hash: note.hash,
});

export function reviewCardId(
  note: ReviewNote,
  action: ReviewAction,
  target?: ReviewNote,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        note.path,
        note.hash,
        action,
        target?.path ?? null,
        target?.hash ?? null,
      ]),
    )
    .digest("hex");
}

function card(
  note: ReviewNote,
  action: ReviewAction,
  reason: string,
  reasonKey: string,
  target?: ReviewNote,
  reasonArgs?: Record<string, string | number>,
): InboxReviewCard {
  return {
    id: reviewCardId(note, action, target),
    note: noteRef(note),
    action,
    reason,
    reasonKey,
    reasonArgs,
    target: target ? noteRef(target) : undefined,
    preview:
      action === "merge" && target
        ? mergeMarkdown(target.content, note.content, note.title)
        : undefined,
    state: "pending",
  };
}

function unfinishedReason(
  content: string,
): { text: string; key: string } | null {
  if (/^\s*[-*+]\s+\[ \]\s+\S/im.test(content))
    return {
      text: "Contains an unchecked task.",
      key: "inbox.review.reason.unchecked",
    };
  if (/\b(?:TODO|FIXME)\b/i.test(content))
    return {
      text: "Contains an explicit TODO or FIXME marker.",
      key: "inbox.review.reason.todo",
    };
  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^#{1,6}\s+\S/.test(line))
      return {
        text: "Ends with a heading that has no body.",
        key: "inbox.review.reason.heading",
      };
    break;
  }
  return null;
}

function targetLinked(content: string, target: ReviewNote): boolean {
  const wanted = new Set([
    normalizeTitle(target.title),
    normalizeTitle(target.path.split("/").pop()?.replace(/\.md$/i, "") ?? ""),
  ]);
  const links = content.matchAll(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g,
  );
  for (const match of links)
    if (wanted.has(normalizeTitle(match[1]))) return true;
  return false;
}

export function buildInboxReview(
  notes: ReviewNote[],
  options: ReviewOptions = {},
): InboxReviewCard[] {
  const ordered = [...notes].sort((a, b) => a.path.localeCompare(b.path));
  const isSource = (note: ReviewNote) =>
    options.sourcePaths?.has(note.path) ?? true;
  const byPath = new Map(ordered.map((note) => [note.path, note]));
  const out: InboxReviewCard[] = [];
  const duplicateSources = new Set<string>();
  const mergeKeys = new Set<string>();

  for (const note of ordered) {
    if (!isSource(note)) continue;
    if (!note.content.trim()) {
      out.push(
        card(
          note,
          "archive",
          "The note is empty.",
          "inbox.review.reason.empty",
        ),
      );
      duplicateSources.add(note.path);
      continue;
    }
    const retained = ordered.find(
      (candidate) =>
        candidate.path !== note.path &&
        candidate.path < note.path &&
        candidate.content === note.content,
    );
    if (retained) {
      out.push(
        card(
          note,
          "archive",
          `Exact duplicate of ${retained.title}.`,
          "inbox.review.reason.duplicate",
          retained,
          { target: retained.title },
        ),
      );
      duplicateSources.add(note.path);
    }
  }

  for (const note of ordered) {
    if (!isSource(note)) continue;
    const reason = unfinishedReason(note.content);
    if (reason) out.push(card(note, "continue", reason.text, reason.key));
  }

  const titleGroups = new Map<string, ReviewNote[]>();
  for (const note of ordered) {
    const key = normalizeTitle(note.title);
    if (!key) continue;
    const group = titleGroups.get(key) ?? [];
    group.push(note);
    titleGroups.set(key, group);
  }
  for (const group of titleGroups.values()) {
    if (group.length < 2) continue;
    for (const note of group) {
      if (!isSource(note)) continue;
      const target = group.find((candidate) => candidate.path !== note.path);
      if (!target) continue;
      if (duplicateSources.has(note.path)) continue;
      out.push(
        card(
          note,
          "merge",
          `Normalized title matches ${target.title}.`,
          "inbox.review.reason.title",
          target,
          { target: target.title },
        ),
      );
      mergeKeys.add(`${note.path}\0${target.path}`);
    }
  }

  const semantic = options.semanticEdges ?? null;
  if (semantic) {
    const ranked = [...semantic].sort((a, b) => b.score - a.score);
    for (const edge of ranked) {
      const left = byPath.get(edge.source);
      const right = byPath.get(edge.target);
      if (!left || !right) continue;
      for (const [note, target] of [
        [left, right],
        [right, left],
      ] as const) {
        if (!isSource(note)) continue;
        const key = `${note.path}\0${target.path}`;
        if (
          edge.score >= 0.9 &&
          !duplicateSources.has(note.path) &&
          !mergeKeys.has(key)
        ) {
          out.push(
            card(
              note,
              "merge",
              `Cached semantic similarity is ${edge.score.toFixed(2)}.`,
              "inbox.review.reason.similarity",
              target,
              { score: edge.score.toFixed(2) },
            ),
          );
          mergeKeys.add(key);
        }
      }
    }

    for (const note of ordered) {
      if (!isSource(note)) continue;
      const candidates = ranked
        .map((edge) => {
          if (edge.source === note.path)
            return { edge, target: byPath.get(edge.target) };
          if (edge.target === note.path)
            return { edge, target: byPath.get(edge.source) };
          return null;
        })
        .filter(
          (value): value is { edge: ReviewSemanticEdge; target: ReviewNote } =>
            Boolean(value?.target),
        );
      const best = candidates.find(
        ({ target }) =>
          !targetLinked(note.content, target) &&
          !mergeKeys.has(`${note.path}\0${target.path}`),
      );
      if (best)
        out.push(
          card(
            note,
            "link",
            `Cached semantic neighbor: ${best.target.title}.`,
            "inbox.review.reason.neighbor",
            best.target,
            { target: best.target.title },
          ),
        );
    }
  }

  if ((options.enabledWikiCount ?? 0) > 0)
    for (const note of ordered)
      if (isSource(note))
        out.push(
          card(
            note,
            "ingest",
            "Choose an enabled wiki to propose ingestion.",
            "inbox.review.reason.ingest",
          ),
        );

  const unique = new Map(out.map((item) => [item.id, item]));
  return [...unique.values()].slice(0, options.limit ?? 50);
}

export function mergeMarkdown(
  target: string,
  source: string,
  sourceTitle: string,
): string {
  const eol = target.includes("\r\n") ? "\r\n" : "\n";
  const normalizeEol = (value: string) => value.replace(/\r?\n/g, eol);
  let body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, "");
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (
    first >= 0 &&
    normalizeTitle(lines[first].replace(/^#\s+/, "")) ===
      normalizeTitle(sourceTitle) &&
    /^#\s+/.test(lines[first])
  )
    lines.splice(first, 1);
  body = normalizeEol(lines.join("\n")).trim();
  const base = normalizeEol(target).trimEnd();
  const section = `## Merged from ${sourceTitle}${eol}${eol}${body}`.trimEnd();
  return `${base}${eol}${eol}${section}${eol}`;
}
