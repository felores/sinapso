import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_CAP,
  canReserveActionable,
  collapseActionable,
  isToolPresentationV1,
  presentationSurface,
  removeActionable,
  reserveActionable,
  resolveActionable,
  restoreInlineActionables,
  setActionableInline,
  visibleActionables,
  type ToolPresentationV1,
} from "./tool-presentation";

const id = "123e4567-e89b-42d3-a456-426614174000";

const presentation = (
  id: string,
  state: ToolPresentationV1["state"] = "success",
) =>
  ({
    version: 1,
    id,
    name: "web-research",
    state,
    result: { title: "Ready", text: id },
  }) satisfies ToolPresentationV1;

describe("selection presentation policy", () => {
  it("keeps progress in ops and terminal web research in cards", () => {
    expect(presentationSurface(presentation("a", "running"))).toBe("ops");
    expect(presentationSurface(presentation("a"))).toBe("terminal-card");
    expect(presentationSurface({ ...presentation("a"), name: "unknown" })).toBe(
      "none",
    );
  });

  it("uses the code-owned workflow and state matrix", () => {
    expect(
      presentationSurface({ ...presentation("a"), name: "vault-search" }),
    ).toBe("none");
    expect(
      presentationSurface({ ...presentation("a"), name: "wiki-ingest" }),
    ).toBe("terminal-card");
    const review = {
      ...presentation("a", "decision-required"),
      name: "wiki-ingest" as const,
    };
    expect(presentationSurface(review)).toBe("terminal-card");
    expect(
      presentationSurface(review, {
        collection: "research",
        visibleId: null,
        pinnedId: null,
        editorDirty: false,
        railBottom: false,
        reviewOpenId: "a",
      }),
    ).toBe("inline");
  });

  it("cannot change placement by spoofing a decision kind", () => {
    const decision = (
      kind: NonNullable<ToolPresentationV1["decision"]>["kind"],
    ) =>
      ({
        ...presentation("a", "decision-required"),
        decision: {
          kind,
          decisionId: id,
        },
      }) as ToolPresentationV1;

    for (const kind of [
      "review",
      "approve-write",
      "consent",
      "irreversible-confirm",
      "choose",
    ] as const)
      expect(presentationSurface(decision(kind))).toBe("terminal-card");

    const wikiContext = {
      collection: "research" as const,
      visibleId: null,
      pinnedId: null,
      editorDirty: false,
      railBottom: false,
      reviewOpenId: "a",
    };
    for (const kind of [
      "review",
      "approve-write",
      "consent",
      "irreversible-confirm",
      "choose",
    ] as const)
      expect(
        presentationSurface(
          { ...decision(kind), name: "wiki-ingest" },
          wikiContext,
        ),
      ).toBe("inline");
  });
});

describe("ToolPresentationV1 browser validation", () => {
  const valid = (over: Record<string, unknown> = {}) => ({
    version: 1,
    id,
    name: "web-research",
    state: "success",
    result: { title: "Ready", text: "Bounded" },
    ...over,
  });

  it("rejects unknown fields, malformed ids, and oversized summaries", () => {
    expect(isToolPresentationV1(valid())).toBe(true);
    expect(isToolPresentationV1({ ...valid(), action: "/api/notes" })).toBe(
      false,
    );
    expect(isToolPresentationV1(valid({ id: "not-a-uuid" }))).toBe(false);
    expect(
      isToolPresentationV1(valid({ result: { title: "x".repeat(121) } })),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({ result: { fields: [{ label: "count", value: Infinity }] } }),
      ),
    ).toBe(false);
  });

  it("rejects every producer-supplied external presentation URL", () => {
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [
            {
              kind: "external-source",
              id: "source",
              url: "https://example.com/",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [
            {
              kind: "external-source",
              id: "source",
              label: "Source",
              url: "https://example.com/",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [
            {
              kind: "external-source",
              id: "source",
              url: "https://user@example.com/",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [
            {
              kind: "external-source",
              id: "source",
              label: "spoofed",
              urlSource: "server-validated",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({ sources: [{ kind: "vault-note", id: "../escape.md" }] }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({ sources: [{ kind: "research-entry", id: "UPPER" }] }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [
            {
              kind: "external-source",
              id: "source",
              url: "https://example.com:444/",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [
            {
              kind: "external-source",
              id: "source",
              url: "https://example.com/#fragment",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: Array.from({ length: 13 }, (_, index) => ({
            kind: "research-entry",
            id: `entry-${index}`,
          })),
        }),
      ),
    ).toBe(false);
  });

  it("rejects URL fields before considering their length", () => {
    const base = "https://example.com/";
    const url = (bytes: number) => base + "a".repeat(bytes - base.length);
    const accepted = url(2048);
    const rejected = url(2049);

    expect(new TextEncoder().encode(accepted)).toHaveLength(2048);
    expect(new TextEncoder().encode(rejected)).toHaveLength(2049);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [{ kind: "external-source", id: "source", url: accepted }],
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          artifacts: [{ kind: "external-source", id: "source", url: rejected }],
        }),
      ),
    ).toBe(false);
  });

  it("requires bounded, explained choices and a closed decision shape", () => {
    const choice = {
      kind: "choose",
      decisionId: "123e4567-e89b-42d3-a456-426614174001",
      choice: {
        question: "Which source?",
        explanation: "The dates differ.",
        candidates: [
          { id: "one", label: "One" },
          { id: "two", label: "Two" },
        ],
      },
    };
    expect(
      isToolPresentationV1(
        valid({ state: "decision-required", decision: choice }),
      ),
    ).toBe(true);
    expect(
      isToolPresentationV1(
        valid({
          state: "decision-required",
          decision: {
            ...choice,
            choice: {
              ...choice.choice,
              candidates: [{ id: "one", label: "One" }],
            },
          },
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          state: "decision-required",
          decision: { ...choice, explanation: "ignored" },
        }),
      ),
    ).toBe(false);
    expect(
      isToolPresentationV1(valid({ state: "success", decision: choice })),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          state: "decision-required",
          decision: {
            ...choice,
            choice: {
              ...choice.choice,
              candidates: [
                { id: "one", label: "One" },
                { id: "one", label: "Duplicate" },
              ],
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects non-string UUID lookalikes before mapping or rendering", () => {
    expect(
      isToolPresentationV1(
        valid({
          state: "decision-required",
          decision: {
            kind: "review",
            decisionId: { toString: () => id },
            review: {
              reviewId: id,
              sourceLabel: "Source",
              targetLabel: "Target",
              counts: { create: 1, edit: 0, move: 0 },
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it("enforces review count and timestamp bounds", () => {
    const decision = {
      kind: "review",
      decisionId: "123e4567-e89b-42d3-a456-426614174001",
      expiresAt: "2026-07-22T17:01:01.000Z",
      review: {
        reviewId: "123e4567-e89b-42d3-a456-426614174002",
        sourceLabel: "Source",
        targetLabel: "Target",
        counts: { create: 999, edit: 1, move: 0 },
      },
    };
    expect(
      isToolPresentationV1(valid({ state: "decision-required", decision })),
    ).toBe(false);
    expect(
      isToolPresentationV1(
        valid({
          state: "decision-required",
          decision: { ...decision, expiresAt: "2026-07-22T17:01:01Z" },
        }),
      ),
    ).toBe(false);
  });
});

describe("actionable selection research map", () => {
  it("reserves seven actions without overwriting and blocks the eighth", () => {
    let entries = new Map();
    for (let index = 0; index < ACTIONABLE_CAP; index++)
      entries = reserveActionable(entries, presentation(String(index)), index);
    expect(entries.size).toBe(ACTIONABLE_CAP);
    expect(canReserveActionable(entries)).toBe(false);
    expect(reserveActionable(entries, presentation("extra"), 8).size).toBe(
      ACTIONABLE_CAP,
    );
  });

  it("collapses rather than drops dismissed results and keeps them reachable", () => {
    let entries = reserveActionable(new Map(), presentation("first"), 1);
    entries = resolveActionable(entries, "first", presentation("first"), {
      result: 1,
    });
    entries = reserveActionable(entries, presentation("second"), 2);
    entries = resolveActionable(entries, "second", presentation("second"), {
      result: 2,
    });
    entries = collapseActionable(entries, "first");
    const view = visibleActionables(entries);
    expect(view.individual.map((entry) => entry.id)).toEqual(["second"]);
    expect(view.aggregate.map((entry) => entry.id)).toEqual(["first"]);
    expect(entries.get("first")?.collapsed).toBe(true);
  });

  it("keeps an open inline review reserved until reject or apply removes it", () => {
    let entries = new Map();
    for (let index = 0; index < ACTIONABLE_CAP; index++)
      entries = resolveActionable(
        reserveActionable(entries, presentation(String(index)), index),
        String(index),
        presentation(String(index)),
        { index },
      );
    entries = setActionableInline(entries, "0");

    expect(canReserveActionable(entries)).toBe(false);
    expect(
      visibleActionables(entries).individual.map((entry) => entry.id),
    ).not.toContain("0");
    for (const outcome of ["reject", "apply"])
      expect(
        canReserveActionable(removeActionable(entries, "0")),
        outcome,
      ).toBe(true);
  });

  it("returns a prior inline review to its terminal card before opening another", () => {
    let entries = reserveActionable(new Map(), presentation("first"), 1);
    entries = resolveActionable(entries, "first", presentation("first"), {
      review: "first",
    });
    entries = resolveActionable(
      reserveActionable(entries, presentation("second"), 2),
      "second",
      presentation("second"),
      { review: "second" },
    );
    entries = setActionableInline(entries, "first");
    entries = setActionableInline(entries, "second");

    expect(entries.size).toBe(2);
    expect(entries.get("first")?.surface).toBe("terminal-card");
    expect(entries.get("second")?.surface).toBe("inline");
    expect(
      visibleActionables(entries).individual.map((entry) => entry.id),
    ).toEqual(["first"]);
  });

  it("restores an unresolved inline review to its terminal CTA", () => {
    let entries = resolveActionable(
      reserveActionable(new Map(), presentation("review"), 1),
      "review",
      presentation("review"),
      { review: true },
    );
    entries = setActionableInline(entries, "review");
    entries = restoreInlineActionables(entries);

    expect(entries).toHaveLength(1);
    expect(entries.get("review")?.surface).toBe("terminal-card");
    expect(
      visibleActionables(entries).individual.map((entry) => entry.id),
    ).toEqual(["review"]);
  });
});
