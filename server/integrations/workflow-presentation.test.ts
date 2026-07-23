import { describe, expect, it } from "vitest";
import {
  isResolvedWorkflowPresentationV1,
  resolveWorkflowRunPresentation,
} from "./workflow-presentation";
import type { WorkflowRunV1 } from "./workflow-run";

describe("external source presentation adapter", () => {
  const run = {
    version: 1,
    runId: "123e4567-e89b-42d3-a456-426614174000",
    name: "web-research",
    state: "succeeded",
    createdAt: "2026-07-22T17:00:00.000Z",
    updatedAt: "2026-07-22T17:00:01.000Z",
    completedAt: "2026-07-22T17:00:01.000Z",
    artifacts: [{ kind: "external-source", id: "source-1", label: "Primary" }],
    authorization: { effect: "spend", mode: "existing-guarded-route" },
  } satisfies WorkflowRunV1;

  it("attaches a canonical URL only from the code-owned source resolver", () => {
    const resolveExternalSource = (id: string) =>
      id === "source-1" ? "https://example.com/report" : undefined;
    const presentation = resolveWorkflowRunPresentation(run, {
      resolveExternalSource,
    });
    expect(presentation).toEqual({
      version: 1,
      id: run.runId,
      name: "web-research",
      state: "success",
      artifacts: [
        {
          kind: "external-source",
          id: "source-1",
          label: "Primary",
          url: "https://example.com/report",
        },
      ],
    });
    expect(
      isResolvedWorkflowPresentationV1(presentation!, resolveExternalSource),
    ).toBe(true);
    expect(
      isResolvedWorkflowPresentationV1(
        presentation!,
        () => "https://other.example/",
      ),
    ).toBe(false);
  });

  it("omits invalid resolved URLs and never gives non-external refs a URL", () => {
    expect(
      resolveWorkflowRunPresentation(
        { ...run, sources: [{ kind: "research-entry", id: "saved" }] },
        { resolveExternalSource: () => "http://example.com/" },
      ),
    ).toMatchObject({
      sources: [{ kind: "research-entry", id: "saved" }],
      artifacts: [
        { kind: "external-source", id: "source-1", label: "Primary" },
      ],
    });
  });

  it("accepts 2,048-byte URLs and omits 2,049-byte URLs before parsing", () => {
    const base = "https://example.com/";
    const url = (bytes: number) => base + "a".repeat(bytes - base.length);
    const accepted = url(2048);
    const rejected = url(2049);

    expect(new TextEncoder().encode(accepted)).toHaveLength(2048);
    expect(new TextEncoder().encode(rejected)).toHaveLength(2049);
    expect(
      resolveWorkflowRunPresentation(run, {
        resolveExternalSource: () => accepted,
      })?.artifacts,
    ).toEqual([{ ...run.artifacts![0], url: accepted }]);
    expect(
      resolveWorkflowRunPresentation(run, {
        resolveExternalSource: () => rejected,
      })?.artifacts,
    ).toEqual(run.artifacts);
  });

  it("fails closed for server-owned decisions", () => {
    const decisionRun = {
      ...run,
      name: "wiki-ingest",
      state: "waiting-for-decision",
      completedAt: undefined,
      authorization: {
        effect: "vault-write",
        mode: "server-decision",
        decision: {
          kind: "review",
          id: run.runId,
          expiresAt: "2026-07-22T17:01:01.000Z",
          review: {
            reviewId: run.runId,
            sourceLabel: "Source",
            targetLabel: "Wiki",
            counts: { create: 1, edit: 0, move: 0 },
          },
        },
      },
    } satisfies WorkflowRunV1;
    expect(resolveWorkflowRunPresentation(decisionRun)).toEqual({
      version: 1,
      id: run.runId,
      name: "unknown",
      state: "denied",
    });
  });

  it("degrades a structurally valid unsupported workflow without authority", () => {
    expect(
      resolveWorkflowRunPresentation({
        ...run,
        name: "future-workflow",
        state: "waiting-for-decision",
        completedAt: undefined,
        inputSummary: { title: "Future input", text: "Bounded input" },
        resultSummary: { title: "Future result", text: "Bounded result" },
        sources: [{ kind: "external-source", id: "source-1", label: "Source" }],
        artifacts: [{ kind: "research-entry", id: "saved", label: "Saved" }],
        authorization: {
          effect: "spend",
          mode: "existing-guarded-route",
          decision: {
            kind: "choose",
            id: run.runId,
            expiresAt: "2026-07-22T17:01:01.000Z",
            choice: {
              question: "Choose",
              explanation: "Bounded explanation",
              candidates: [
                { id: "one", label: "One" },
                { id: "two", label: "Two" },
              ],
            },
          },
        },
      }),
    ).toEqual({
      version: 1,
      id: run.runId,
      name: "unknown",
      state: "denied",
      input: { title: "Future input", text: "Bounded input" },
      result: { title: "Future result", text: "Bounded result" },
    });
    expect(
      resolveWorkflowRunPresentation({ ...run, name: "future\u0000workflow" }),
    ).toBeNull();
  });

  it("rejects producer URL provenance fields", () => {
    expect(
      resolveWorkflowRunPresentation({
        ...run,
        artifacts: [
          {
            kind: "external-source",
            id: "source-1",
            url: "https://example.com/report",
            urlSource: "server-validated",
          },
        ],
      } as unknown as WorkflowRunV1),
    ).toBeNull();
  });
});
