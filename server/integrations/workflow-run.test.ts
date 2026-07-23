import { describe, expect, it } from "vitest";
import { isWorkflowRunV1, resolveWorkflowRun } from "./workflow-run";

const id = "123e4567-e89b-42d3-a456-426614174000";
const before = "2026-07-22T17:00:00.000Z";
const after = "2026-07-22T17:00:01.000Z";
const review = {
  kind: "review",
  id,
  expiresAt: "2026-07-22T17:01:01.000Z",
  review: {
    reviewId: id,
    sourceLabel: "Source",
    targetLabel: "Wiki",
    counts: { create: 1, edit: 0, move: 0 },
  },
};
const choice = {
  kind: "choose",
  id,
  expiresAt: "2026-07-22T17:01:01.000Z",
  choice: {
    question: "Choose a source",
    explanation: "Select the source to use.",
    candidates: [
      { id: "source-1", label: "First source" },
      { id: "source-2", label: "Second source" },
    ],
  },
};
const simpleDecision = (kind: "approve-write" | "consent") => ({
  kind,
  id,
  expiresAt: "2026-07-22T17:01:01.000Z",
});
const valid = (over: Record<string, unknown> = {}) => ({
  version: 1,
  runId: id,
  name: "vault-search",
  state: "succeeded",
  createdAt: before,
  updatedAt: after,
  completedAt: after,
  authorization: { effect: "read", mode: "none" },
  ...over,
});

describe("WorkflowRunV1", () => {
  it.each([
    ["vault-search", "queued", "read", "none"],
    ["vault-search", "running", "read", "none"],
    ["vault-search", "succeeded", "read", "none"],
    ["vault-search", "failed", "read", "none"],
    ["vault-search", "cancelled", "read", "none"],
    ["web-research", "queued", "spend", "existing-guarded-route"],
    ["web-research", "running", "spend", "existing-guarded-route"],
    ["web-research", "succeeded", "spend", "existing-guarded-route"],
    ["web-research", "failed", "spend", "existing-guarded-route"],
    ["web-research", "cancelled", "spend", "existing-guarded-route"],
    [
      "web-research",
      "waiting-for-decision",
      "spend",
      "existing-guarded-route",
      simpleDecision("consent"),
    ],
    [
      "web-research",
      "waiting-for-decision",
      "spend",
      "existing-guarded-route",
      choice,
    ],
    ["wiki-ingest", "queued", "vault-write", "existing-guarded-route"],
    ["wiki-ingest", "running", "vault-write", "existing-guarded-route"],
    ["wiki-ingest", "succeeded", "vault-write", "existing-guarded-route"],
    ["wiki-ingest", "failed", "vault-write", "existing-guarded-route"],
    ["wiki-ingest", "cancelled", "vault-write", "existing-guarded-route"],
    [
      "wiki-ingest",
      "waiting-for-decision",
      "vault-write",
      "server-decision",
      review,
    ],
    ["note-write", "queued", "vault-write", "existing-guarded-route"],
    ["note-write", "running", "vault-write", "existing-guarded-route"],
    ["note-write", "succeeded", "vault-write", "existing-guarded-route"],
    ["note-write", "failed", "vault-write", "existing-guarded-route"],
    ["note-write", "cancelled", "vault-write", "existing-guarded-route"],
    [
      "note-write",
      "waiting-for-decision",
      "vault-write",
      "server-decision",
      simpleDecision("approve-write"),
    ],
    ["graph-refresh", "queued", "read", "existing-guarded-route"],
    ["graph-refresh", "running", "read", "existing-guarded-route"],
    ["graph-refresh", "succeeded", "read", "existing-guarded-route"],
    ["graph-refresh", "failed", "read", "existing-guarded-route"],
    ["graph-refresh", "cancelled", "read", "existing-guarded-route"],
    ["qmd-maintenance", "queued", "read", "existing-guarded-route"],
    ["qmd-maintenance", "running", "read", "existing-guarded-route"],
    ["qmd-maintenance", "succeeded", "read", "existing-guarded-route"],
    ["qmd-maintenance", "failed", "read", "existing-guarded-route"],
    ["qmd-maintenance", "cancelled", "read", "existing-guarded-route"],
  ] as Array<[string, string, string, string, unknown?]>)(
    "accepts planned tuple %s | %s | %s | %s",
    (name, state, effect, mode, decision) => {
      expect(
        isWorkflowRunV1(
          valid({
            name,
            state,
            completedAt: ["succeeded", "failed", "cancelled"].includes(state)
              ? after
              : undefined,
            cancel:
              state === "cancelled"
                ? { supported: true, requested: false }
                : undefined,
            authorization: { effect, mode, decision },
          }),
        ),
      ).toBe(true);
    },
  );

  it.each([
    [
      "wrong effect",
      valid({ authorization: { effect: "spend", mode: "none" } }),
    ],
    [
      "wrong mode",
      valid({
        name: "wiki-ingest",
        authorization: { effect: "vault-write", mode: "none" },
      }),
    ],
    [
      "wrong decision",
      valid({
        name: "wiki-ingest",
        state: "waiting-for-decision",
        completedAt: undefined,
        authorization: {
          effect: "vault-write",
          mode: "server-decision",
          decision: simpleDecision("approve-write"),
        },
      }),
    ],
    [
      "wrong state",
      valid({
        state: "waiting-for-decision",
        completedAt: undefined,
        authorization: {
          effect: "read",
          mode: "none",
          decision: simpleDecision("consent"),
        },
      }),
    ],
    ["unlisted workflow", valid({ name: "unknown-workflow" })],
    [
      "missing decision",
      valid({
        name: "note-write",
        state: "waiting-for-decision",
        completedAt: undefined,
        authorization: { effect: "vault-write", mode: "server-decision" },
      }),
    ],
    [
      "extra decision",
      valid({
        authorization: {
          effect: "read",
          mode: "none",
          decision: simpleDecision("consent"),
        },
      }),
    ],
  ])("rejects %s tuple", (_, run) => {
    expect(isWorkflowRunV1(run)).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(isWorkflowRunV1({ ...valid(), extra: true })).toBe(false);
  });

  it("enforces canonical identifiers and terminal timestamps", () => {
    expect(isWorkflowRunV1(valid({ runId: id.toUpperCase() }))).toBe(false);
    expect(isWorkflowRunV1(valid({ updatedAt: "2026-07-22T17:00:01Z" }))).toBe(
      false,
    );
    expect(isWorkflowRunV1(valid({ completedAt: before }))).toBe(false);
    expect(
      isWorkflowRunV1(valid({ state: "running", completedAt: after })),
    ).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite summary field value %s",
    (value) => {
      expect(
        isWorkflowRunV1(
          valid({
            resultSummary: { fields: [{ label: "Count", value }] },
          }),
        ),
      ).toBe(false);
    },
  );

  it("rejects a producer URL even when a trusted resolver exists", () => {
    const research = valid({
      artifacts: [
        {
          kind: "external-source",
          id: "source-1",
          url: "https://example.com/article",
        },
      ],
    });
    expect(isWorkflowRunV1(research)).toBe(false);
    expect(resolveWorkflowRun(research)).toBeNull();
  });

  it("preserves opaque external ids without resolving URLs", () => {
    const research = valid({
      artifacts: [
        { kind: "external-source", id: "source-1", label: "Primary" },
      ],
    });
    expect(resolveWorkflowRun(research)?.artifacts).toEqual([
      { kind: "external-source", id: "source-1", label: "Primary" },
    ]);
  });

  it("accepts confined vault paths without granting them URL authority", () => {
    expect(
      isWorkflowRunV1(
        valid({ sources: [{ kind: "vault-note", id: "notes/a.md" }] }),
      ),
    ).toBe(false);
    expect(
      isWorkflowRunV1(
        valid({ sources: [{ kind: "vault-note", id: "notes/a.md" }] }),
        { isConfinedVaultPath: () => true },
      ),
    ).toBe(true);
    expect(
      isWorkflowRunV1(
        valid({
          sources: [{ kind: "research-entry", id: "entry", revision: 42 }],
        }),
      ),
    ).toBe(false);
  });

  it("requires the exact decision matrix and bounded review metadata", () => {
    expect(
      isWorkflowRunV1(
        valid({
          name: "wiki-ingest",
          state: "waiting-for-decision",
          completedAt: undefined,
          authorization: {
            effect: "vault-write",
            mode: "server-decision",
            decision: review,
          },
        }),
      ),
    ).toBe(true);
    expect(
      isWorkflowRunV1(
        valid({
          name: "wiki-ingest",
          state: "waiting-for-decision",
          completedAt: undefined,
          authorization: {
            effect: "vault-write",
            mode: "server-decision",
            decision: {
              ...review,
              review: {
                ...review.review,
                counts: { create: 0, edit: 0, move: 0 },
              },
            },
          },
        }),
      ),
    ).toBe(false);
    expect(
      isWorkflowRunV1(
        valid({
          name: "wiki-ingest",
          state: "waiting-for-decision",
          completedAt: undefined,
          authorization: {
            effect: "vault-write",
            mode: "existing-guarded-route",
            decision: review,
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects untrusted provider, invalid retry, and unsupported cancellation", () => {
    expect(
      isWorkflowRunV1(
        valid({
          execution: { provider: { id: "attacker", label: "Attacker" } },
        }),
      ),
    ).toBe(false);
    expect(
      isWorkflowRunV1(valid({ retry: { allowed: true, retryOfRunId: id } })),
    ).toBe(false);
    expect(
      isWorkflowRunV1(
        valid({
          state: "cancelled",
          cancel: { supported: false, requested: false },
        }),
      ),
    ).toBe(false);
  });

  it("resolves by rejecting invalid input and clones valid declared data", () => {
    expect(resolveWorkflowRun({ ...valid(), endpoint: "secret" })).toBeNull();
    const run = resolveWorkflowRun(valid());
    expect(run).toEqual(valid());
    expect(run).not.toBe(valid());
  });
});
