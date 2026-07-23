// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderTerminalCards } from "./tool-renderers";
import {
  adaptWorkflowPresentation,
  presentationSurface,
  type ActionableEntry,
  type ServerDerivedToolPresentationV1,
  type ToolPresentationV1,
} from "./tool-presentation";
import { createTrustedExternalSourceRegistry } from "./trusted-external-sources";
import { resolveWorkflowRunPresentation } from "../../server/integrations/workflow-presentation";
import type { WorkflowRunV1 } from "../../server/integrations/workflow-run";

const labels = {
  open: "Open",
  review: "Review",
  retry: "Retry",
  dismiss: "Dismiss",
  aggregate: "Actions ready",
  other: "Other...",
  otherPlaceholder: "Type an answer",
  create: "create",
  edit: "edit",
  move: "move",
};

function entry(presentation: ToolPresentationV1): ActionableEntry<unknown> {
  return {
    id: presentation.id,
    presentation,
    status: "ready",
    createdAt: 1,
    collapsed: false,
  };
}

describe("terminal renderers", () => {
  it("renders a validated server run through the browser presentation contract", () => {
    const run = {
      version: 1,
      runId: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "succeeded",
      createdAt: "2026-07-22T17:00:00.000Z",
      updatedAt: "2026-07-22T17:00:01.000Z",
      completedAt: "2026-07-22T17:00:01.000Z",
      resultSummary: { title: "Research ready", text: "Bounded result" },
      authorization: { effect: "spend", mode: "existing-guarded-route" },
    } satisfies WorkflowRunV1;
    const presentation = adaptWorkflowPresentation(
      resolveWorkflowRunPresentation(run)!,
      () => undefined,
    );
    const host = document.createElement("div");

    expect(presentation).not.toBeNull();
    expect(presentationSurface(presentation!)).toBe("terminal-card");
    renderTerminalCards(
      host,
      new Map([[presentation!.id, entry(presentation!)]]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
    );

    expect(host.textContent).toContain("Research ready");
    expect(host.textContent).toContain("Bounded result");
  });

  it("keeps the server decision fallback out of the terminal renderer", () => {
    const run = {
      version: 1,
      runId: "123e4567-e89b-42d3-a456-426614174000",
      name: "wiki-ingest",
      state: "waiting-for-decision",
      createdAt: "2026-07-22T17:00:00.000Z",
      updatedAt: "2026-07-22T17:00:01.000Z",
      authorization: {
        effect: "vault-write",
        mode: "server-decision",
        decision: {
          kind: "review",
          id: "123e4567-e89b-42d3-a456-426614174001",
          expiresAt: "2026-07-22T17:01:01.000Z",
          review: {
            reviewId: "123e4567-e89b-42d3-a456-426614174002",
            sourceLabel: "Source",
            targetLabel: "Wiki",
            counts: { create: 1, edit: 0, move: 0 },
          },
        },
      },
    } satisfies WorkflowRunV1;
    const presentation = adaptWorkflowPresentation(
      resolveWorkflowRunPresentation(run)!,
      () => undefined,
    );
    const host = document.createElement("div");

    expect(presentation).toMatchObject({ name: "unknown", state: "denied" });
    expect(presentationSurface(presentation!)).toBe("none");
    renderTerminalCards(
      host,
      new Map([[presentation!.id, entry(presentation!)]]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
    );

    expect(host.childElementCount).toBe(0);
  });

  it("uses text nodes for terminal content", () => {
    const host = document.createElement("div");
    const presentation: ServerDerivedToolPresentationV1 = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "success",
      result: { title: "<img src=x>", text: "<script>bad()</script>" },
    };
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      {
        open: vi.fn(),
        dismiss: vi.fn(),
      },
    );
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<script>bad()</script>");
  });

  it("renders a matching registry and presentation URL as a safe HTTPS link", () => {
    const host = document.createElement("div");
    const registry = createTrustedExternalSourceRegistry(() => "citation");
    const source = registry.register("https://example.com/report")!;
    const presentation: ServerDerivedToolPresentationV1 = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "success",
      sources: [
        {
          kind: "external-source",
          ...source,
          url: "https://example.com/report",
        },
      ],
      artifacts: [
        { kind: "research-entry", id: "saved-result", label: "Saved" },
      ],
    };
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
      registry.resolve,
    );

    const link = host.querySelector<HTMLAnchorElement>("a");
    expect(link).not.toBeNull();
    expect(link).toHaveProperty("href", "https://example.com/report");
    expect(link).toHaveProperty("target", "_blank");
    expect(link).toHaveProperty("rel", "noopener noreferrer");
    expect(link?.textContent).toBe("example.com");
    expect(host.querySelectorAll("a")).toHaveLength(1);
    expect(host.querySelector("span")?.textContent).toContain("Saved");
  });

  it("does not render a spoofed presentation URL when the registry differs", () => {
    const host = document.createElement("div");
    const registry = createTrustedExternalSourceRegistry(() => "citation");
    registry.register("https://example.com/report");
    const presentation: ServerDerivedToolPresentationV1 = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "success",
      sources: [
        {
          kind: "external-source",
          id: "citation",
          label: "Spoofed",
          url: "https://attacker.invalid/report",
        },
      ],
    };
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
      registry.resolve,
    );
    expect(host.querySelector("a")).toBeNull();
  });

  it.each([
    {
      kind: "external-source",
      id: "citation",
      label: "HTTP",
      url: "http://example.com/",
    },
    {
      kind: "external-source",
      id: "citation",
      label: "Credentials",
      url: "https://user@example.com/",
    },
    {
      kind: "external-source",
      id: "citation",
      label: "Fragment",
      url: "https://example.com/#fragment",
    },
    {
      kind: "research-entry",
      id: "entry",
      label: "Not external",
      url: "https://example.com/",
    },
    { kind: "external-source", id: "https://example.com/", label: "URL id" },
    { kind: "research-entry", id: "entry", label: "https://example.com/" },
  ])("does not render an anchor for unsafe or unproven references", (ref) => {
    const host = document.createElement("div");
    const presentation = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "success",
      sources: [ref],
    } as unknown as ToolPresentationV1;
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
    );
    expect(host.querySelector("a")).toBeNull();
  });

  it("does not let a producer URL, marker, label, or id create a link", () => {
    const host = document.createElement("div");
    const registry = createTrustedExternalSourceRegistry(() => "trusted-id");
    registry.register("https://example.com/report");
    const presentation = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "success",
      sources: [
        {
          kind: "external-source",
          id: "producer-id",
          label: "https://attacker.invalid",
          url: "https://attacker.invalid",
          urlSource: "server-validated",
        },
      ],
    } as unknown as ToolPresentationV1;
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
      registry.resolve,
    );
    expect(host.querySelector("a")).toBeNull();
  });

  it("renders bounded wiki review target and operation counts", () => {
    const host = document.createElement("div");
    const presentation: ToolPresentationV1 = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "wiki-ingest",
      state: "decision-required",
      decision: {
        kind: "review",
        decisionId: "123e4567-e89b-42d3-a456-426614174001",
        review: {
          reviewId: "123e4567-e89b-42d3-a456-426614174002",
          sourceLabel: "Source note",
          targetLabel: "Target wiki",
          counts: { create: 2, edit: 1, move: 0 },
        },
      },
    };
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      {
        open: vi.fn(),
        dismiss: vi.fn(),
      },
    );
    expect(host.textContent).toContain(
      "Source note → Target wiki · 2 create, 1 edit, 0 move",
    );
  });

  it("does not render malformed presentation data", () => {
    const host = document.createElement("div");
    renderTerminalCards(
      host,
      new Map([
        [
          "bad",
          {
            ...entry({
              version: 1,
              id: "bad",
              name: "unknown",
              state: "success",
            } as ToolPresentationV1),
            id: "bad",
          },
        ],
      ]),
      labels,
      { open: vi.fn(), dismiss: vi.fn() },
    );
    expect(host.childElementCount).toBe(0);
  });

  it("keeps numeric shortcuts scoped to a focused choice card and text input", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const choose = vi.fn();
    const presentation: ToolPresentationV1 = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "decision-required",
      decision: {
        kind: "choose",
        decisionId: "123e4567-e89b-42d3-a456-426614174001",
        choice: {
          question: "Which source?",
          explanation: "They disagree on date.",
          candidates: [
            { id: "one", label: "One" },
            { id: "two", label: "Two" },
          ],
        },
      },
    };
    renderTerminalCards(
      host,
      new Map([[presentation.id, entry(presentation)]]),
      labels,
      {
        open: vi.fn(),
        dismiss: vi.fn(),
        chooseWebResearch: choose,
      },
    );
    const card = host.querySelector<HTMLElement>(".terminal-card")!;
    card.focus();
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", bubbles: true }),
    );
    expect(choose).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174001",
      "one",
    );
    host.querySelectorAll<HTMLButtonElement>(".terminal-choice-row")[2].click();
    const input = host.querySelector<HTMLInputElement>("input")!;
    input.value = "custom";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(choose).toHaveBeenLastCalledWith(
      "123e4567-e89b-42d3-a456-426614174001",
      "custom",
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "2", bubbles: true }),
    );
    expect(choose).not.toHaveBeenLastCalledWith(
      "123e4567-e89b-42d3-a456-426614174001",
      "two",
    );
    host.remove();
  });

  it("collapses a dismissed choice card while retaining its reachable aggregate action", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const open = vi.fn();
    const presentation: ToolPresentationV1 = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "web-research",
      state: "decision-required",
      decision: {
        kind: "choose",
        decisionId: "123e4567-e89b-42d3-a456-426614174001",
        choice: {
          question: "Which source?",
          explanation: "They disagree on date.",
          candidates: [
            { id: "one", label: "One" },
            { id: "two", label: "Two" },
          ],
        },
      },
    };
    let entries = new Map([[presentation.id, entry(presentation)]]);
    const render = () =>
      renderTerminalCards(host, entries, labels, {
        open,
        dismiss: (id) => {
          const dismissed = entries.get(id)!;
          entries = new Map(entries).set(id, { ...dismissed, collapsed: true });
          render();
        },
        chooseWebResearch: vi.fn(),
      });

    render();
    host.querySelector<HTMLButtonElement>(".terminal-card-dismiss")!.click();

    expect(entries.get(presentation.id)?.collapsed).toBe(true);
    expect(host.querySelector(".terminal-choice-row")).toBeNull();
    const aggregateAction = host.querySelector<HTMLButtonElement>(
      ".terminal-card-list button",
    )!;
    expect(aggregateAction.textContent).toBe("Which source?");
    aggregateAction.click();
    expect(open).toHaveBeenCalledWith(presentation.id, aggregateAction);
    host.remove();
  });
});
