import {
  type BoundedSummaryV1,
  type ChoiceDecisionV1,
  type PresentationRefV1,
  type ReviewMetadataV1,
  resolveWorkflowRunPresentationInput,
  type WorkflowRunPresentationInputV1,
  type WorkflowRunValidationOptions,
} from "./workflow-run.js";

export type WorkflowPresentationRefV1 =
  | PresentationRefV1
  | (PresentationRefV1 & { kind: "external-source"; url?: string });

/** Data-only browser contract. Server-only workflow details never cross this boundary. */
export type WorkflowPresentationV1 = {
  version: 1;
  id: string;
  name:
    | "vault-search"
    | "web-research"
    | "wiki-ingest"
    | "note-write"
    | "graph-refresh"
    | "qmd-maintenance"
    | "unknown";
  state:
    | "queued"
    | "running"
    | "decision-required"
    | "success"
    | "denied"
    | "error"
    | "cancelled";
  input?: BoundedSummaryV1;
  result?: BoundedSummaryV1;
  sources?: WorkflowPresentationRefV1[];
  artifacts?: WorkflowPresentationRefV1[];
  decision?: {
    kind: "review" | "approve-write" | "consent" | "choose";
    decisionId: string;
    expiresAt?: string;
    review?: ReviewMetadataV1;
    choice?: ChoiceDecisionV1;
  };
};

const stateMap = {
  queued: "queued",
  running: "running",
  "waiting-for-decision": "decision-required",
  succeeded: "success",
  failed: "error",
  cancelled: "cancelled",
} as const;

export interface WorkflowPresentationOptions
  extends WorkflowRunValidationOptions {
  /** Resolves opaque external IDs from code-owned, validated source data. */
  resolveExternalSource?: (id: string) => string | undefined;
}

/** Verifies final URLs against the same code-owned resolver that produced them. */
export function isResolvedWorkflowPresentationV1(
  presentation: WorkflowPresentationV1,
  resolveExternalSource: (id: string) => string | undefined,
): boolean {
  return [
    ...(presentation.sources ?? []),
    ...(presentation.artifacts ?? []),
  ].every(
    (ref) =>
      !("url" in ref) ||
      (ref.kind === "external-source" &&
        canonicalHttpsUrl(ref.url) === ref.url &&
        resolveExternalSource(ref.id) === ref.url),
  );
}

function canonicalHttpsUrl(value: string | undefined): string | undefined {
  if (!value || new TextEncoder().encode(value).length > 2048) return;
  try {
    const url = new URL(value);
    if (
      url.href === value &&
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.port
    )
      return url.href;
  } catch {
    // Omit invalid resolver output rather than grant presentation authority.
  }
}

function presentReferences(
  references: PresentationRefV1[] | undefined,
  resolveExternalSource?: (id: string) => string | undefined,
): WorkflowPresentationRefV1[] | undefined {
  return references?.map((ref) => {
    if (ref.kind !== "external-source") return ref;
    const url = canonicalHttpsUrl(resolveExternalSource?.(ref.id));
    return url ? { ...ref, url } : ref;
  });
}

function presentationFromResolvedRun(
  run: WorkflowRunPresentationInputV1,
  resolveExternalSource?: (id: string) => string | undefined,
): WorkflowPresentationV1 {
  if (run.authorization.mode === "server-decision")
    return { version: 1, id: run.runId, name: "unknown", state: "denied" };
  if (!knownWorkflowName(run.name))
    return {
      version: 1,
      id: run.runId,
      name: "unknown",
      // A pending unknown decision must not become an actionable browser state.
      state:
        run.state === "waiting-for-decision" ? "denied" : stateMap[run.state],
      ...(run.inputSummary ? { input: run.inputSummary } : {}),
      ...(run.resultSummary ? { result: run.resultSummary } : {}),
    };
  const decision = run.authorization.decision;
  return {
    version: 1,
    id: run.runId,
    name: run.name,
    state: stateMap[run.state],
    ...(run.inputSummary ? { input: run.inputSummary } : {}),
    ...(run.resultSummary ? { result: run.resultSummary } : {}),
    ...(run.sources
      ? { sources: presentReferences(run.sources, resolveExternalSource) }
      : {}),
    ...(run.artifacts
      ? { artifacts: presentReferences(run.artifacts, resolveExternalSource) }
      : {}),
    ...(decision
      ? {
          decision: {
            kind: decision.kind,
            decisionId: decision.id,
            expiresAt: decision.expiresAt,
            ...(decision.review ? { review: decision.review } : {}),
            ...(decision.choice ? { choice: decision.choice } : {}),
          },
        }
      : {}),
  };
}

function knownWorkflowName(
  name: WorkflowRunPresentationInputV1["name"],
): name is Exclude<WorkflowPresentationV1["name"], "unknown"> {
  return (
    name === "vault-search" ||
    name === "web-research" ||
    name === "wiki-ingest" ||
    name === "note-write" ||
    name === "graph-refresh" ||
    name === "qmd-maintenance"
  );
}

/** Server presentation boundary: producer runs carry ids only; code resolves URLs. */
export function resolveWorkflowRunPresentation(
  run: unknown,
  options?: WorkflowPresentationOptions,
): WorkflowPresentationV1 | null {
  const resolved = resolveWorkflowRunPresentationInput(run, options);
  if (!resolved) return null;
  const presentation = presentationFromResolvedRun(
    resolved,
    options?.resolveExternalSource,
  );
  return !options?.resolveExternalSource ||
    isResolvedWorkflowPresentationV1(
      presentation,
      options.resolveExternalSource,
    )
    ? presentation
    : null;
}
