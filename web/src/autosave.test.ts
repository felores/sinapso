import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutosave,
  type AutosaveState,
  type SaveOutcome,
} from "./autosave";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness(initial = "base\n") {
  let content = initial;
  const states: AutosaveState[] = [];
  const saves: { content: string; base: string | null }[] = [];
  let nextOutcome: SaveOutcome | Error = "saved";
  let gate: ReturnType<typeof deferred<void>> | null = null;
  const auto = createAutosave({
    baseContent: initial,
    getContent: () => content,
    save: async (c, b) => {
      saves.push({ content: c, base: b });
      if (gate) await gate.promise;
      if (nextOutcome instanceof Error) throw nextOutcome;
      return nextOutcome;
    },
    onState: (s) => states.push(s),
    debounceMs: 1000,
  });
  return {
    auto,
    states,
    saves,
    type(text: string) {
      content += text;
      auto.notifyChange();
    },
    set(text: string) {
      content = text;
      auto.notifyChange();
    },
    content: () => content,
    outcome(o: SaveOutcome | Error) {
      nextOutcome = o;
    },
    hold() {
      gate = deferred<void>();
      return () => {
        const g = gate!;
        gate = null;
        g.resolve();
      };
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle() {
  // Let queued microtasks (save promise chains) run.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("createAutosave", () => {
  it("debounces a burst of changes into one save", async () => {
    const h = harness();
    h.type("a");
    h.type("b");
    h.type("c");
    expect(h.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.saves).toHaveLength(1);
    expect(h.saves[0].content).toBe("base\nabc");
    expect(h.saves[0].base).toBe("base\n");
    expect(h.auto.state()).toBe("clean");
  });

  it("suppresses saves when content returns to base", async () => {
    const h = harness();
    h.type("x");
    h.set("base\n"); // undo back to base
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.saves).toHaveLength(0);
    expect(h.auto.state()).toBe("clean");
  });

  it("promotes the base on success: sequential saves carry the new base", async () => {
    const h = harness();
    h.type("1");
    await vi.advanceTimersByTimeAsync(1000);
    h.type("2");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.saves).toHaveLength(2);
    expect(h.saves[1].base).toBe("base\n1"); // promoted, no self-conflict
  });

  it("single-flight: a flush during an in-flight save queues exactly one follow-up", async () => {
    const h = harness();
    h.type("1");
    const release = h.hold();
    await vi.advanceTimersByTimeAsync(1000); // save 1 starts, held
    h.type("2");
    void h.auto.flush(); // blur while saving
    void h.auto.flush(); // and note-switch right after
    expect(h.saves).toHaveLength(1);
    release();
    await settle();
    await settle();
    expect(h.saves).toHaveLength(2); // burst collapsed to one follow-up
    expect(h.saves[1].content).toBe("base\n12");
    expect(h.saves[1].base).toBe("base\n1");
    expect(h.auto.state()).toBe("clean");
  });

  it("conflict: enters conflict state, stops autosaving, overwrite forces through", async () => {
    const h = harness();
    h.outcome("conflict");
    h.type("local");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.auto.state()).toBe("conflict");
    h.type("more"); // typing during the banner must not re-save
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saves).toHaveLength(1);
    h.outcome("saved");
    await h.auto.overwrite();
    expect(h.saves).toHaveLength(2);
    expect(h.saves[1].base).toBeNull(); // forced: no staleness check
    expect(h.auto.state()).toBe("clean");
  });

  it("conflict reload: reset with disk content returns to clean", async () => {
    const h = harness();
    h.outcome("conflict");
    h.type("local");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.auto.state()).toBe("conflict");
    h.set("disk version\n");
    h.auto.reset("disk version\n");
    expect(h.auto.state()).toBe("clean");
    expect(h.auto.isDirty()).toBe(false);
  });

  it("error: non-conflict failure lands in error state and retries on next flush", async () => {
    const h = harness();
    h.outcome(new Error("network down"));
    h.type("z");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.auto.state()).toBe("error");
    expect(h.auto.isDirty()).toBe(true); // nothing lost
    h.outcome("saved");
    await h.auto.flush();
    expect(h.auto.state()).toBe("clean");
    expect(h.saves).toHaveLength(2);
  });

  it("typing during a save re-schedules after it lands", async () => {
    const h = harness();
    h.type("1");
    const release = h.hold();
    await vi.advanceTimersByTimeAsync(1000); // save starts, held
    h.type("2"); // typed mid-save (no explicit flush)
    release();
    await settle();
    await settle();
    expect(h.auto.state()).toBe("dirty");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.saves).toHaveLength(2);
    expect(h.saves[1].content).toBe("base\n12");
    expect(h.auto.state()).toBe("clean");
  });

  it("dispose cancels timers and ignores late changes", async () => {
    const h = harness();
    h.type("1");
    h.auto.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saves).toHaveLength(0);
    h.type("2");
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saves).toHaveLength(0);
  });
});
