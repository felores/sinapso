import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_CAP,
  canReserveActionable,
  collapseActionable,
  presentationSurface,
  reserveActionable,
  resolveActionable,
  visibleActionables,
  type ToolPresentationV1,
} from "./tool-presentation";

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
});
