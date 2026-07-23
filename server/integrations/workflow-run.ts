/**
 * Runtime-neutral workflow envelope. This module is intentionally pure: it
 * validates bounded data before any runtime, route, or renderer can consume it.
 */

export type WorkflowName =
  | "vault-search"
  | "web-research"
  | "wiki-ingest"
  | "note-write"
  | "graph-refresh"
  | "qmd-maintenance";

export type WorkflowRunState =
  | "queued"
  | "running"
  | "waiting-for-decision"
  | "succeeded"
  | "failed"
  | "cancelled";

export type BoundedSummaryV1 = {
  title?: string;
  text?: string;
  fields?: Array<{ label: string; value: string | number | boolean | null }>;
};

export type PresentationRefV1 = {
  kind: "vault-note" | "research-entry" | "external-source";
  id: string;
  label?: string;
  revision?: string;
};

export type ChoiceDecisionV1 = {
  question: string;
  explanation: string;
  candidates: Array<{ id: string; label: string }>;
};

export type ReviewMetadataV1 = {
  reviewId: string;
  sourceLabel: string;
  targetLabel: string;
  counts: { create: number; edit: number; move: number };
};

export type WorkflowRunV1 = {
  version: 1;
  runId: string;
  name: WorkflowName;
  state: WorkflowRunState;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  inputSummary?: BoundedSummaryV1;
  resultSummary?: BoundedSummaryV1;
  sources?: PresentationRefV1[];
  artifacts?: PresentationRefV1[];
  execution?: {
    provider?: { id: string; label: string };
    cost?: { currency: "USD"; micros: number; kind: "actual" | "estimated" };
  };
  retry?: { allowed: boolean; retryOfRunId?: string };
  cancel?: { supported: boolean; requested: boolean };
  authorization: {
    effect: "read" | "spend" | "vault-write";
    mode: "none" | "existing-guarded-route" | "server-decision";
    decision?: {
      kind: "review" | "approve-write" | "consent" | "choose";
      id: string;
      expiresAt: string;
      review?: ReviewMetadataV1;
      choice?: ChoiceDecisionV1;
    };
  };
};

/** A presentation adapter may safely degrade an otherwise bounded unknown name. */
export type WorkflowRunPresentationInputV1 = Omit<WorkflowRunV1, "name"> & {
  name: string;
};

export const TRUSTED_PROVIDER_IDS = new Set([
  "exa",
  "google",
  "openai",
  "xai",
  "openrouter",
  "deepseek",
]);

export interface WorkflowRunValidationOptions {
  /** Existing route/path confinement remains the authority for vault notes. */
  isConfinedVaultPath?: (id: string) => boolean;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RESEARCH_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F]");
const names = new Set<WorkflowName>([
  "vault-search",
  "web-research",
  "wiki-ingest",
  "note-write",
  "graph-refresh",
  "qmd-maintenance",
]);
const states = new Set<WorkflowRunState>([
  "queued",
  "running",
  "waiting-for-decision",
  "succeeded",
  "failed",
  "cancelled",
]);
const terminal = new Set<WorkflowRunState>([
  "succeeded",
  "failed",
  "cancelled",
]);

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function scalarText(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().normalize("NFC") &&
    Array.from(value).length >= min &&
    Array.from(value).length <= max &&
    !CONTROL.test(value)
  );
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLIS.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function known<T extends string>(value: unknown, values: Set<T>): value is T {
  return typeof value === "string" && values.has(value as T);
}

function summary(value: unknown): value is BoundedSummaryV1 {
  if (!object(value) || !exact(value, ["title", "text", "fields"]))
    return false;
  if (value.title !== undefined && !scalarText(value.title, 1, 120))
    return false;
  if (value.text !== undefined && !scalarText(value.text, 1, 600)) return false;
  if (value.fields === undefined) return true;
  if (!Array.isArray(value.fields) || value.fields.length > 12) return false;
  return value.fields.every((field) => {
    if (!object(field) || !exact(field, ["label", "value"])) return false;
    return (
      scalarText(field.label, 1, 80) &&
      (field.value === null ||
        (typeof field.value === "number" && Number.isFinite(field.value)) ||
        typeof field.value === "boolean" ||
        scalarText(field.value, 0, 300))
    );
  });
}

function reference(
  value: unknown,
  options: WorkflowRunValidationOptions,
): value is PresentationRefV1 {
  if (!object(value) || !exact(value, ["kind", "id", "label", "revision"]))
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
      utf8Bytes(value.id) > 512 ||
      value.id !== value.id.normalize("NFC") ||
      value.id.startsWith("/") ||
      value.id.includes("\\") ||
      !value.id.endsWith(".md") ||
      CONTROL.test(value.id) ||
      value.id
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      options.isConfinedVaultPath?.(value.id) !== true
    )
      return false;
  } else if (value.kind === "research-entry") {
    if (!RESEARCH_ID.test(value.id)) return false;
  } else if (!OPAQUE_ID.test(value.id)) return false;
  if (value.label !== undefined && !scalarText(value.label, 1, 80))
    return false;
  if (
    value.revision !== undefined &&
    (typeof value.revision !== "string" ||
      !(SHA256.test(value.revision) || UUID.test(value.revision)))
  )
    return false;
  return true;
}

function references(
  value: unknown,
  options: WorkflowRunValidationOptions,
): value is PresentationRefV1[] {
  return (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every((entry) => reference(entry, options))
  );
}

function review(value: unknown): value is ReviewMetadataV1 {
  if (
    !object(value) ||
    !exact(value, ["reviewId", "sourceLabel", "targetLabel", "counts"])
  )
    return false;
  if (
    !uuid(value.reviewId) ||
    !scalarText(value.sourceLabel, 1, 80) ||
    !scalarText(value.targetLabel, 1, 80) ||
    !object(value.counts) ||
    !exact(value.counts, ["create", "edit", "move"])
  )
    return false;
  const counts: unknown[] = [
    value.counts.create,
    value.counts.edit,
    value.counts.move,
  ];
  let total = 0;
  for (const count of counts) {
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 999
    )
      return false;
    total += count;
  }
  return total > 0 && total <= 999;
}

function choice(value: unknown): value is ChoiceDecisionV1 {
  if (
    !object(value) ||
    !exact(value, ["question", "explanation", "candidates"])
  )
    return false;
  if (
    !scalarText(value.question, 1, 120) ||
    !scalarText(value.explanation, 1, 600) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length < 2 ||
    value.candidates.length > 6
  )
    return false;
  return value.candidates.every(
    (candidate) =>
      object(candidate) &&
      exact(candidate, ["id", "label"]) &&
      typeof candidate.id === "string" &&
      OPAQUE_ID.test(candidate.id) &&
      scalarText(candidate.label, 1, 120),
  );
}

function decision(
  value: unknown,
  updatedAt: string,
): value is NonNullable<WorkflowRunV1["authorization"]["decision"]> {
  if (
    !object(value) ||
    !exact(value, ["kind", "id", "expiresAt", "review", "choice"])
  )
    return false;
  if (
    (value.kind !== "review" &&
      value.kind !== "approve-write" &&
      value.kind !== "consent" &&
      value.kind !== "choose") ||
    !uuid(value.id) ||
    !timestamp(value.expiresAt)
  )
    return false;
  const expiry = new Date(value.expiresAt).valueOf();
  const updated = new Date(updatedAt).valueOf();
  if (expiry <= updated || expiry - updated > 86_400_000) return false;
  if (value.kind === "review")
    return review(value.review) && value.choice === undefined;
  if (value.kind === "choose")
    return choice(value.choice) && value.review === undefined;
  return value.review === undefined && value.choice === undefined;
}

const tuples = new Set([
  "vault-search|queued|read|none|-",
  "vault-search|running|read|none|-",
  "vault-search|succeeded|read|none|-",
  "vault-search|failed|read|none|-",
  "vault-search|cancelled|read|none|-",
  "web-research|queued|spend|existing-guarded-route|-",
  "web-research|running|spend|existing-guarded-route|-",
  "web-research|succeeded|spend|existing-guarded-route|-",
  "web-research|failed|spend|existing-guarded-route|-",
  "web-research|cancelled|spend|existing-guarded-route|-",
  "web-research|waiting-for-decision|spend|existing-guarded-route|consent",
  "web-research|waiting-for-decision|spend|existing-guarded-route|choose",
  "wiki-ingest|queued|vault-write|existing-guarded-route|-",
  "wiki-ingest|running|vault-write|existing-guarded-route|-",
  "wiki-ingest|succeeded|vault-write|existing-guarded-route|-",
  "wiki-ingest|failed|vault-write|existing-guarded-route|-",
  "wiki-ingest|cancelled|vault-write|existing-guarded-route|-",
  "wiki-ingest|waiting-for-decision|vault-write|server-decision|review",
  "note-write|queued|vault-write|existing-guarded-route|-",
  "note-write|running|vault-write|existing-guarded-route|-",
  "note-write|succeeded|vault-write|existing-guarded-route|-",
  "note-write|failed|vault-write|existing-guarded-route|-",
  "note-write|cancelled|vault-write|existing-guarded-route|-",
  "note-write|waiting-for-decision|vault-write|server-decision|approve-write",
  "graph-refresh|queued|read|existing-guarded-route|-",
  "graph-refresh|running|read|existing-guarded-route|-",
  "graph-refresh|succeeded|read|existing-guarded-route|-",
  "graph-refresh|failed|read|existing-guarded-route|-",
  "graph-refresh|cancelled|read|existing-guarded-route|-",
  "qmd-maintenance|queued|read|existing-guarded-route|-",
  "qmd-maintenance|running|read|existing-guarded-route|-",
  "qmd-maintenance|succeeded|read|existing-guarded-route|-",
  "qmd-maintenance|failed|read|existing-guarded-route|-",
  "qmd-maintenance|cancelled|read|existing-guarded-route|-",
]);

/** Returns false for unknown fields, tuples, or producer-controlled authority. */
function isWorkflowRun(
  value: unknown,
  options: WorkflowRunValidationOptions,
  allowUnknownName: boolean,
): boolean {
  if (
    !object(value) ||
    !exact(value, [
      "version",
      "runId",
      "name",
      "state",
      "createdAt",
      "updatedAt",
      "completedAt",
      "inputSummary",
      "resultSummary",
      "sources",
      "artifacts",
      "execution",
      "retry",
      "cancel",
      "authorization",
    ])
  )
    return false;
  if (
    value.version !== 1 ||
    !uuid(value.runId) ||
    !scalarText(value.name, 1, 80) ||
    (!allowUnknownName && !known(value.name, names)) ||
    !known(value.state, states) ||
    !timestamp(value.createdAt) ||
    !timestamp(value.updatedAt) ||
    new Date(value.updatedAt).valueOf() < new Date(value.createdAt).valueOf()
  )
    return false;
  if (
    terminal.has(value.state)
      ? value.completedAt !== value.updatedAt
      : value.completedAt !== undefined
  )
    return false;
  if (
    (value.inputSummary !== undefined && !summary(value.inputSummary)) ||
    (value.resultSummary !== undefined && !summary(value.resultSummary)) ||
    (value.sources !== undefined && !references(value.sources, options)) ||
    (value.artifacts !== undefined && !references(value.artifacts, options))
  )
    return false;
  if (
    !object(value.authorization) ||
    !exact(value.authorization, ["effect", "mode", "decision"]) ||
    (value.authorization.effect !== "read" &&
      value.authorization.effect !== "spend" &&
      value.authorization.effect !== "vault-write") ||
    (value.authorization.mode !== "none" &&
      value.authorization.mode !== "existing-guarded-route" &&
      value.authorization.mode !== "server-decision")
  )
    return false;
  const decisionKind =
    value.authorization.decision && object(value.authorization.decision)
      ? value.authorization.decision.kind
      : "-";
  if (value.state === "waiting-for-decision") {
    if (!decision(value.authorization.decision, value.updatedAt)) return false;
  } else if (value.authorization.decision !== undefined) return false;
  if (
    known(value.name, names) &&
    !tuples.has(
      `${value.name}|${value.state}|${value.authorization.effect}|${value.authorization.mode}|${decisionKind}`,
    )
  )
    return false;
  if (value.execution !== undefined) {
    if (
      !object(value.execution) ||
      !exact(value.execution, ["provider", "cost"])
    )
      return false;
    if (
      value.execution.provider !== undefined &&
      (!object(value.execution.provider) ||
        !exact(value.execution.provider, ["id", "label"]) ||
        typeof value.execution.provider.id !== "string" ||
        !TRUSTED_PROVIDER_IDS.has(value.execution.provider.id) ||
        !scalarText(value.execution.provider.label, 1, 80))
    )
      return false;
    if (
      value.execution.cost !== undefined &&
      (!object(value.execution.cost) ||
        !exact(value.execution.cost, ["currency", "micros", "kind"]) ||
        value.execution.cost.currency !== "USD" ||
        !Number.isSafeInteger(value.execution.cost.micros) ||
        (value.execution.cost.micros as number) < 0 ||
        (value.execution.cost.kind !== "actual" &&
          value.execution.cost.kind !== "estimated"))
    )
      return false;
  }
  if (
    value.retry !== undefined &&
    (!object(value.retry) ||
      !exact(value.retry, ["allowed", "retryOfRunId"]) ||
      typeof value.retry.allowed !== "boolean" ||
      (value.retry.retryOfRunId !== undefined &&
        (!value.retry.allowed ||
          !uuid(value.retry.retryOfRunId) ||
          value.retry.retryOfRunId === value.runId)))
  )
    return false;
  if (
    value.cancel !== undefined &&
    (!object(value.cancel) ||
      !exact(value.cancel, ["supported", "requested"]) ||
      typeof value.cancel.supported !== "boolean" ||
      typeof value.cancel.requested !== "boolean" ||
      (value.cancel.requested && !value.cancel.supported))
  )
    return false;
  return value.state !== "cancelled" || value.cancel?.supported === true;
}

/** Strict runtime contract: names and authorization tuples are both closed. */
export function isWorkflowRunV1(
  value: unknown,
  options: WorkflowRunValidationOptions = {},
): value is WorkflowRunV1 {
  return isWorkflowRun(value, options, false);
}

/** Presentation-only boundary: unknown names may be degraded, never executed. */
export function isWorkflowRunPresentationInputV1(
  value: unknown,
  options: WorkflowRunValidationOptions = {},
): value is WorkflowRunPresentationInputV1 {
  return isWorkflowRun(value, options, true);
}

/** Server workflow data stays data-only; browser-held code owns external navigation. */
export function resolveWorkflowRun(
  value: unknown,
  options?: WorkflowRunValidationOptions,
): WorkflowRunV1 | null {
  if (!isWorkflowRunV1(value, options)) return null;
  return JSON.parse(JSON.stringify(value)) as WorkflowRunV1;
}

/** Clones structurally valid input for the non-actionable presentation adapter. */
export function resolveWorkflowRunPresentationInput(
  value: unknown,
  options?: WorkflowRunValidationOptions,
): WorkflowRunPresentationInputV1 | null {
  if (!isWorkflowRunPresentationInputV1(value, options)) return null;
  return JSON.parse(JSON.stringify(value)) as WorkflowRunPresentationInputV1;
}
