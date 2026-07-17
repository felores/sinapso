import { describe, it, expect } from "vitest";
import {
  nextIngestMenuOpen,
  ingestMenuHidden,
  type IngestMenuEvent,
} from "./research-menu";

describe("nextIngestMenuOpen", () => {
  it("toggles open/closed only on the trigger event", () => {
    expect(nextIngestMenuOpen(false, "toggle")).toBe(true);
    expect(nextIngestMenuOpen(true, "toggle")).toBe(false);
  });

  it.each(["select", "escape", "outside"] as IngestMenuEvent[])(
    "closes on %s regardless of current state",
    (ev) => {
      expect(nextIngestMenuOpen(true, ev)).toBe(false);
      expect(nextIngestMenuOpen(false, ev)).toBe(false);
    },
  );
});

describe("ingestMenuHidden", () => {
  it("hides only when zero wikis are enabled", () => {
    expect(ingestMenuHidden(0)).toBe(true);
    expect(ingestMenuHidden(1)).toBe(false);
    expect(ingestMenuHidden(3)).toBe(false);
  });
});
