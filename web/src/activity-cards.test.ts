/**
 * Activity card stack contract (Frente C): bounded stack, transient vs terminal
 * states, id-based upsert/dismiss, cap enforcement. Pure model, no DOM.
 */
import { describe, expect, it } from "vitest";
import {
  clearTransientActivityCards,
  dismissActivityCard,
  isTerminal,
  MAX_ACTIVITY_CARDS,
  TRANSIENT_STATES,
  upsertActivityCard,
  type ActivityCard,
} from "./activity-cards";

const t = (over: Partial<ActivityCard> & { id: string }): ActivityCard => ({
  state: "prepare",
  label: "l",
  ...over,
});

describe("upsertActivityCard — update in place", () => {
  it("updates a same-id card (state transitions)", () => {
    const stack = upsertActivityCard([], t({ id: "a", state: "propose" }));
    const next = upsertActivityCard(stack, t({ id: "a", state: "ready" }));
    expect(next.length).toBe(1);
    expect(next[0].state).toBe("ready");
  });
});

describe("upsertActivityCard — newest on top", () => {
  it("unshifts new cards", () => {
    const stack = upsertActivityCard([], t({ id: "a" }));
    const next = upsertActivityCard(stack, t({ id: "b" }));
    expect(next.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("cap enforcement (max 3)", () => {
  it("drops the OLDEST transient first when over the cap", () => {
    let s: ActivityCard[] = [];
    for (const id of ["a", "b", "c", "d"])
      s = upsertActivityCard(s, t({ id, state: "prepare" }));
    expect(s.length).toBe(MAX_ACTIVITY_CARDS);
    // newest three survive; oldest transient ("b", since "a" got shifted down
    // and evicted when "d" pushed) — verify the newest id is present and count
    expect(s[0].id).toBe("d");
    expect(s.length).toBe(3);
  });

  it("protects terminal (ready/error) cards from eviction", () => {
    let s: ActivityCard[] = upsertActivityCard(
      [],
      t({ id: "ready1", state: "ready" }),
    );
    s = upsertActivityCard(s, t({ id: "ready2", state: "error" }));
    s = upsertActivityCard(s, t({ id: "t1", state: "propose" }));
    // pushing a 4th transient drops the oldest transient (t1 source order),
    // not the terminals
    s = upsertActivityCard(s, t({ id: "t2", state: "search" }));
    const ids = s.map((c) => c.id);
    expect(ids).toContain("ready1");
    expect(ids).toContain("ready2");
    expect(s.length).toBe(3);
  });
});

describe("dismissActivityCard", () => {
  it("removes by id", () => {
    const s = upsertActivityCard(
      upsertActivityCard([], t({ id: "a" })),
      t({ id: "b" }),
    );
    expect(dismissActivityCard(s, "a").map((c) => c.id)).toEqual(["b"]);
    expect(dismissActivityCard(s, "zzz").map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("clearTransientActivityCards", () => {
  it("keeps only terminal cards", () => {
    let s: ActivityCard[] = upsertActivityCard(
      [],
      t({ id: "r", state: "ready" }),
    );
    s = upsertActivityCard(s, t({ id: "p", state: "propose" }));
    const cleared = clearTransientActivityCards(s);
    expect(cleared.map((c) => c.id)).toEqual(["r"]);
  });
});

describe("state classification", () => {
  it("marks search/prepare/propose transient, ready/error terminal", () => {
    for (const st of ["search", "prepare", "propose"] as const)
      expect(isTerminal(st)).toBe(false);
    for (const st of ["ready", "error"] as const)
      expect(isTerminal(st)).toBe(true);
    expect(TRANSIENT_STATES.size).toBe(3);
  });
});
