import type { WorkflowPresentationV1 } from "../../server/integrations/workflow-presentation";

export type PresentationName =
  | "vault-search"
  | "web-research"
  | "wiki-ingest"
  | "note-write"
  | "graph-refresh"
  | "qmd-maintenance"
  | "unknown";

export type ToolPresentationState =
  | "queued"
  | "running"
  | "decision-required"
  | "success"
  | "denied"
  | "error"
  | "cancelled";

export type BoundedSummaryV1 = {
  title?: string;
  text?: string;
  fields?: Array<{ label: string; value: string | number | boolean | null }>;
};

type PresentationRefBaseV1 = {
  kind: "vault-note" | "research-entry" | "external-source";
  id: string;
  label?: string;
  revision?: string;
};

export type PresentationRefV1 =
  | (PresentationRefBaseV1 & {
      kind: "vault-note" | "research-entry";
    })
  | (PresentationRefBaseV1 & {
      kind: "external-source";
    });

/** URL-bearing references are only admitted after a trusted resolver agrees. */
export type ServerDerivedPresentationRefV1 =
  | PresentationRefV1
  | (PresentationRefBaseV1 & { kind: "external-source"; url: string });

export type ChoiceDecisionV1 = {
  question: string;
  explanation: string;
  candidates: Array<{ id: string; label: string }>;
};

/** Data only. Browser code selects every surface and guarded handler. */
export interface ToolPresentationV1 {
  version: 1;
  id: string;
  name: PresentationName;
  state: ToolPresentationState;
  input?: BoundedSummaryV1;
  result?: BoundedSummaryV1;
  sources?: PresentationRefV1[];
  artifacts?: PresentationRefV1[];
  decision?: {
    kind:
      | "review"
      | "approve-write"
      | "consent"
      | "irreversible-confirm"
      | "choose";
    decisionId: string;
    expiresAt?: string;
    review?: {
      reviewId: string;
      sourceLabel: string;
      targetLabel: string;
      counts: { create: number; edit: number; move: number };
    };
    choice?: ChoiceDecisionV1;
  };
}

/** A code-owned server adapter may construct this final, resolver-bound variant. */
export interface ServerDerivedToolPresentationV1
  extends Omit<ToolPresentationV1, "sources" | "artifacts"> {
  sources?: ServerDerivedPresentationRefV1[];
  artifacts?: ServerDerivedPresentationRefV1[];
}

export interface PresentationContext {
  collection: "research" | "inbox";
  visibleId: string | null;
  pinnedId: string | null;
  editorDirty: boolean;
  railBottom: boolean;
  reviewOpenId?: string | null;
}

export type PresentationSurface =
  | "ops"
  | "terminal-card"
  | "inline"
  | "modal"
  | "none";

type WorkflowPlacement =
  | Exclude<PresentationSurface, "inline" | "modal">
  | "inline-review";

const knownNames = new Set<PresentationName>([
  "vault-search",
  "web-research",
  "wiki-ingest",
  "note-write",
  "graph-refresh",
  "qmd-maintenance",
  "unknown",
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RESEARCH_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F]");
const presentationStates = new Set<ToolPresentationState>([
  "queued",
  "running",
  "decision-required",
  "success",
  "denied",
  "error",
  "cancelled",
]);

const standardWorkflowPlacement: Record<
  ToolPresentationState,
  WorkflowPlacement
> = {
  queued: "ops",
  running: "ops",
  "decision-required": "terminal-card",
  success: "none",
  denied: "none",
  error: "terminal-card",
  cancelled: "none",
};

// Code owns every placement. Producer data only supplies bounded card content.
const workflowPlacement: Record<
  PresentationName,
  Record<ToolPresentationState, WorkflowPlacement>
> = {
  "vault-search": standardWorkflowPlacement,
  "web-research": {
    ...standardWorkflowPlacement,
    success: "terminal-card",
  },
  "wiki-ingest": {
    ...standardWorkflowPlacement,
    "decision-required": "inline-review",
    success: "terminal-card",
  },
  "note-write": standardWorkflowPlacement,
  "graph-refresh": standardWorkflowPlacement,
  "qmd-maintenance": standardWorkflowPlacement,
  unknown: {
    queued: "none",
    running: "none",
    "decision-required": "none",
    success: "none",
    denied: "none",
    error: "none",
    cancelled: "none",
  },
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function text(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().normalize("NFC") &&
    Array.from(value).length >= min &&
    Array.from(value).length <= max &&
    !CONTROL.test(value)
  );
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLIS.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function summary(value: unknown): value is BoundedSummaryV1 {
  if (!object(value) || !exact(value, ["title", "text", "fields"]))
    return false;
  if (value.title !== undefined && !text(value.title, 1, 120)) return false;
  if (value.text !== undefined && !text(value.text, 1, 600)) return false;
  if (value.fields === undefined) return true;
  return (
    Array.isArray(value.fields) &&
    value.fields.length <= 12 &&
    value.fields.every(
      (field) =>
        object(field) &&
        exact(field, ["label", "value"]) &&
        text(field.label, 1, 80) &&
        (field.value === null ||
          (typeof field.value === "number" && Number.isFinite(field.value)) ||
          typeof field.value === "boolean" ||
          text(field.value, 0, 300)),
    )
  );
}

function reference(
  value: unknown,
  resolveExternalSource?: (id: string) => string | undefined,
): value is ServerDerivedPresentationRefV1 {
  if (!object(value)) return false;
  const hasUrl = value.url !== undefined;
  if (
    !exact(
      value,
      value.kind === "external-source" && hasUrl
        ? ["kind", "id", "label", "revision", "url"]
        : ["kind", "id", "label", "revision"],
    )
  )
    return false;
  if (
    value.kind !== "vault-note" &&
    value.kind !== "research-entry" &&
    value.kind !== "external-source"
  )
    return false;
  if (typeof value.id !== "string") return false;
  if (value.kind === "vault-note") {
    if (
      new TextEncoder().encode(value.id).length > 512 ||
      value.id !== value.id.normalize("NFC") ||
      value.id.startsWith("/") ||
      value.id.includes("\\") ||
      !value.id.endsWith(".md") ||
      CONTROL.test(value.id) ||
      value.id.split("/").some((part) => !part || part === "." || part === "..")
    )
      return false;
  } else if (value.kind === "research-entry") {
    if (!RESEARCH_ID.test(value.id)) return false;
  } else if (!OPAQUE_ID.test(value.id)) return false;
  if (hasUrl) {
    if (
      !resolveExternalSource ||
      typeof value.url !== "string" ||
      new TextEncoder().encode(value.url).length > 2048
    )
      return false;
    try {
      const url = new URL(value.url);
      if (
        value.kind !== "external-source" ||
        url.href !== value.url ||
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.hash ||
        url.port
      )
        return false;
      if (resolveExternalSource(value.id) !== value.url) return false;
    } catch {
      return false;
    }
  }
  if (value.label !== undefined && !text(value.label, 1, 80)) return false;
  if (
    value.revision !== undefined &&
    (typeof value.revision !== "string" ||
      !(SHA256.test(value.revision) || UUID.test(value.revision)))
  )
    return false;
  return true;
}

function review(value: unknown): boolean {
  if (
    !object(value) ||
    !exact(value, ["reviewId", "sourceLabel", "targetLabel", "counts"])
  )
    return false;
  if (
    typeof value.reviewId !== "string" ||
    !UUID.test(value.reviewId) ||
    !text(value.sourceLabel, 1, 80) ||
    !text(value.targetLabel, 1, 80) ||
    !object(value.counts) ||
    !exact(value.counts, ["create", "edit", "move"])
  )
    return false;
  const counts = [value.counts.create, value.counts.edit, value.counts.move];
  if (
    !counts.every(
      (count) =>
        typeof count === "number" &&
        Number.isSafeInteger(count) &&
        count >= 0 &&
        count <= 999,
    )
  )
    return false;
  return (
    (counts as number[]).reduce((total, count) => total + count, 0) > 0 &&
    (counts as number[]).reduce((total, count) => total + count, 0) <= 999
  );
}

function choice(value: unknown): boolean {
  if (
    !object(value) ||
    !exact(value, ["question", "explanation", "candidates"])
  )
    return false;
  return (
    text(value.question, 1, 120) &&
    text(value.explanation, 1, 600) &&
    Array.isArray(value.candidates) &&
    value.candidates.length >= 2 &&
    value.candidates.length <= 6 &&
    value.candidates.every(
      (candidate) =>
        object(candidate) &&
        exact(candidate, ["id", "label"]) &&
        typeof candidate.id === "string" &&
        OPAQUE_ID.test(candidate.id) &&
        text(candidate.label, 1, 120),
    ) &&
    new Set(value.candidates.map((candidate) => candidate.id)).size ===
      value.candidates.length
  );
}

/** Browser-side boundary: reject unknown or unsafe presentation data before DOM use. */
function presentation(
  value: unknown,
  resolveExternalSource?: (id: string) => string | undefined,
): value is ServerDerivedToolPresentationV1 {
  if (
    !object(value) ||
    !exact(value, [
      "version",
      "id",
      "name",
      "state",
      "input",
      "result",
      "sources",
      "artifacts",
      "decision",
    ])
  )
    return false;
  if (
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.name !== "string" ||
    !knownNames.has(value.name as PresentationName) ||
    typeof value.state !== "string" ||
    !presentationStates.has(value.state as ToolPresentationState)
  )
    return false;
  if (
    (value.input !== undefined && !summary(value.input)) ||
    (value.result !== undefined && !summary(value.result))
  )
    return false;
  if (
    (value.sources !== undefined &&
      (!Array.isArray(value.sources) ||
        value.sources.length > 12 ||
        !value.sources.every((ref) =>
          reference(ref, resolveExternalSource),
        ))) ||
    (value.artifacts !== undefined &&
      (!Array.isArray(value.artifacts) ||
        value.artifacts.length > 12 ||
        !value.artifacts.every((ref) => reference(ref, resolveExternalSource))))
  )
    return false;
  if (value.state !== "decision-required") return value.decision === undefined;
  if (
    !object(value.decision) ||
    !exact(value.decision, [
      "kind",
      "decisionId",
      "expiresAt",
      "review",
      "choice",
    ]) ||
    typeof value.decision.decisionId !== "string" ||
    !UUID.test(value.decision.decisionId)
  )
    return false;
  if (
    value.decision.expiresAt !== undefined &&
    !timestamp(value.decision.expiresAt)
  )
    return false;
  if (value.decision.kind === "review")
    return review(value.decision.review) && value.decision.choice === undefined;
  if (value.decision.kind === "choose")
    return choice(value.decision.choice) && value.decision.review === undefined;
  return (
    (value.decision.kind === "approve-write" ||
      value.decision.kind === "consent" ||
      value.decision.kind === "irreversible-confirm") &&
    value.decision.review === undefined &&
    value.decision.choice === undefined
  );
}

/** Generic/browser boundary: producer data has no URL authority. */
export function isToolPresentationV1(
  value: unknown,
): value is ToolPresentationV1 {
  return presentation(value);
}

/** Final URL-bearing presentation requires a resolver controlled by application code. */
export function isServerDerivedToolPresentationV1(
  value: unknown,
  resolveExternalSource: (id: string) => string | undefined,
): value is ServerDerivedToolPresentationV1 {
  return presentation(value, resolveExternalSource);
}

/** Adapts the server's bounded workflow output without importing server runtime. */
export function adaptWorkflowPresentation(
  presentation: WorkflowPresentationV1,
  resolveExternalSource: (id: string) => string | undefined,
): ServerDerivedToolPresentationV1 | null {
  return isServerDerivedToolPresentationV1(presentation, resolveExternalSource)
    ? presentation
    : null;
}

/** Closed policy: input data never chooses a renderer, route, or placement. */
export function presentationSurface(
  presentation: ToolPresentationV1 | ServerDerivedToolPresentationV1,
  context?: PresentationContext,
): PresentationSurface {
  const placement = workflowPlacement[presentation.name][presentation.state];
  return placement === "inline-review"
    ? context?.reviewOpenId === presentation.id
      ? "inline"
      : "terminal-card"
    : placement;
}

export const ACTIONABLE_CAP = 7;

export interface ActionableEntry<T> {
  id: string;
  presentation: ToolPresentationV1 | ServerDerivedToolPresentationV1;
  status: "reserved" | "ready";
  surface?: "terminal-card" | "inline";
  createdAt: number;
  collapsed: boolean;
  value?: T;
}

export function canReserveActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
): boolean {
  return entries.size < ACTIONABLE_CAP;
}

export function reserveActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  presentation: ToolPresentationV1,
  createdAt: number,
): Map<string, ActionableEntry<T>> {
  if (!canReserveActionable(entries) || entries.has(presentation.id))
    return new Map(entries);
  const next = new Map(entries);
  next.set(presentation.id, {
    id: presentation.id,
    presentation,
    status: "reserved",
    surface: "terminal-card",
    createdAt,
    collapsed: false,
  });
  return next;
}

export function resolveActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
  presentation: ToolPresentationV1 | ServerDerivedToolPresentationV1,
  value: T,
): Map<string, ActionableEntry<T>> {
  const entry = entries.get(id);
  if (!entry) return new Map(entries);
  const next = new Map(entries);
  next.set(id, { ...entry, presentation, status: "ready", value });
  return next;
}

export function collapseActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
): Map<string, ActionableEntry<T>> {
  const entry = entries.get(id);
  if (!entry) return new Map(entries);
  const next = new Map(entries);
  next.set(id, { ...entry, collapsed: true });
  return next;
}

/** An inline review remains unresolved and therefore continues to reserve capacity.
 * There is one inline host, so opening another review returns the prior one to its card. */
export function setActionableInline<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
  value?: T,
): Map<string, ActionableEntry<T>> {
  const entry = entries.get(id);
  if (!entry) return new Map(entries);
  const next = new Map(entries);
  for (const previous of next.values())
    if (previous.id !== id && previous.surface === "inline")
      next.set(previous.id, { ...previous, surface: "terminal-card" });
  next.set(id, {
    ...entry,
    ...(value === undefined ? {} : { value }),
    surface: "inline",
  });
  return next;
}

/** Closing the inline host returns unresolved reviews to their terminal CTA. */
export function restoreInlineActionables<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
): Map<string, ActionableEntry<T>> {
  const inline = [...entries.values()].filter(
    (entry) => entry.surface === "inline",
  );
  if (!inline.length) return new Map(entries);
  const next = new Map(entries);
  for (const entry of inline)
    next.set(entry.id, { ...entry, surface: "terminal-card" });
  return next;
}

export function removeActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
): Map<string, ActionableEntry<T>> {
  const next = new Map(entries);
  next.delete(id);
  return next;
}

/** At most three cards, with every collapsed/older action retained in aggregate. */
export function visibleActionables<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
): { individual: ActionableEntry<T>[]; aggregate: ActionableEntry<T>[] } {
  const ready = [...entries.values()]
    .filter((entry) => entry.status === "ready" && entry.surface !== "inline")
    .sort((a, b) => b.createdAt - a.createdAt);
  const uncollapsed = ready.filter((entry) => !entry.collapsed);
  if (ready.length <= 3 && uncollapsed.length === ready.length)
    return { individual: ready, aggregate: [] };
  const individual = uncollapsed.slice(0, 2);
  return {
    individual,
    aggregate: ready.filter((entry) => !individual.includes(entry)),
  };
}
