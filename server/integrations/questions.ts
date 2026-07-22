/**
 * Note-questions module (U5, R3c).
 *
 * LLM prompt assembly and JSON-array response parsing for the
 * /api/note-questions endpoint. The route keeps the guard (no key /
 * invalid id -> templates) and the response shape `{ questions,
 * source }`; everything between the guard and the response moves into
 * this module, with the chat function injected so the orchestration can
 * be unit-tested without a live OpenRouter call (same DI style as
 * `wiki-ingest.ts`).
 *
 * `parseQuestionsReply` mirrors the route's previous `indexOf("[")` /
 * `lastIndexOf("]")` extraction plus the non-string filter and 5-item
 * cap. Any failure (no array delimiter, parse error, non-array result,
 * empty list after filtering) returns `null` and the orchestrator falls
 * back to the template path.
 */

import type { ChatMessage } from "./openrouter.js";
import type { UiLocale } from "./locale.js";

const SYSTEM_PROMPTS: Record<UiLocale, string> = {
  en: "You generate concise web-research questions. Reply with ONLY a JSON array of strings. Write the questions in English.",
  es: "Generas preguntas concisas de investigación web. Responde SOLO con un arreglo JSON de cadenas. Escribe las preguntas en español.",
};

const MAX_QUESTIONS = 5;

export interface NoteForPrompt {
  title: string;
}

/**
 * Pure: assemble the user prompt for the LLM. The phantom-hint line is
 * omitted when `phantomTitles` is empty (the original code emitted an
 * empty string and `filter(Boolean)`'d it at the join step — equivalent
 * output).
 */
export function buildNoteQuestionsPrompt(
  note: NoteForPrompt | undefined,
  excerpt: string,
  phantomTitles: string[],
  locale: UiLocale = "en",
): string {
  if (locale === "es") {
    const phantomLine = phantomTitles.length
      ? `La nota menciona estos temas que aún no tienen nota propia: ${phantomTitles.join(", ")}.`
      : "";
    return [
      "Genera de 3 a 5 preguntas de investigación web que cierren las brechas de conocimiento sobre esta nota de mi bóveda.",
      "Enfócate en lo que falta, no está resuelto o merece más investigación, no en resumir lo que la nota ya cubre.",
      phantomLine,
      `Título de la nota: ${note?.title ?? ""}`,
      `Contenido de la nota (extracto):\n${excerpt}`,
      'Responde SOLO con un arreglo JSON de preguntas, por ejemplo ["pregunta uno?", "pregunta dos?"]. Sin otro texto.',
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  const phantomLine = phantomTitles.length
    ? `The note references these topics that have no note of their own yet: ${phantomTitles.join(", ")}.`
    : "";
  return [
    "Generate 3-5 web-research questions that would close the knowledge gaps around this note from my knowledge vault.",
    "Focus on what is missing, unresolved, or worth investigating further — not on summarizing what the note already covers.",
    phantomLine,
    `Note title: ${note?.title ?? ""}`,
    `Note content (excerpt):\n${excerpt}`,
    "Write the questions in the same language as the note content.",
    'Reply with ONLY a JSON array of question strings, e.g. ["question one?", "question two?"]. No other text.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Extract the JSON array of question strings from an LLM reply. Handles
 * a bare array, an array wrapped in prose or code fences (first `[` to
 * last `]`), and anything else. Non-string elements and empty strings
 * are dropped, the result is capped at `MAX_QUESTIONS`. Returns `null`
 * on any failure so the route can fall back to the template path.
 */
export function parseQuestionsReply(text: string): string[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const questions = parsed
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .slice(0, MAX_QUESTIONS);
  if (!questions.length) return null;
  return questions;
}

export interface NoteQuestionsDeps {
  chat: (messages: ChatMessage[]) => Promise<string>;
  note: NoteForPrompt | undefined;
  excerpt: string;
  phantomTitles: string[];
  locale?: UiLocale;
  systemPrompt?: string;
  templates: () => string[];
  warn?: (msg: string, err: unknown) => void;
}

export interface NoteQuestionsResult {
  questions: string[];
  source: "llm" | "templates";
}

/**
 * Orchestrate the LLM call: build the prompt, send it, parse the
 * reply. On LLM throw, parse failure, or empty result, fall back to
 * `deps.templates()` and return `{ source: "templates" }`. The route
 * can pass the result straight to `res.json`.
 */
export async function noteQuestionsViaLLM(
  deps: NoteQuestionsDeps,
): Promise<NoteQuestionsResult> {
  const prompt = buildNoteQuestionsPrompt(
    deps.note,
    deps.excerpt,
    deps.phantomTitles,
    deps.locale,
  );
  try {
    const text = await deps.chat([
      {
        role: "system",
        content: deps.systemPrompt ?? SYSTEM_PROMPTS[deps.locale ?? "en"],
      },
      { role: "user", content: prompt },
    ]);
    const questions = parseQuestionsReply(text);
    if (!questions) {
      deps.warn?.("llm questions fell back to templates: parse failed", null);
      return { questions: deps.templates(), source: "templates" };
    }
    return { questions, source: "llm" };
  } catch (e) {
    deps.warn?.(
      "llm questions fell back to templates:",
      e instanceof Error ? e.message : e,
    );
    return { questions: deps.templates(), source: "templates" };
  }
}
