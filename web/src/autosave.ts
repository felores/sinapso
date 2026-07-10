/**
 * Autosave state machine for the live-preview editor (plan 018 U3).
 *
 * Pure orchestration: the caller injects `getContent` (editor read) and
 * `save` (hash + PUT). States mirror the plan's lifecycle diagram:
 * clean → dirty → saving → clean | conflict | error.
 *
 * Single-flight (KTD4): a flush trigger arriving while a save is in flight
 * sets one pending flag; at most one follow-up save runs after the in-flight
 * save resolves, against the promoted base — otherwise two overlapping PUTs
 * with the same pre-promotion base make the second 409 against our own save.
 */

export type AutosaveState = "clean" | "dirty" | "saving" | "conflict" | "error";

export type SaveOutcome = "saved" | "conflict";

export interface AutosaveOptions {
  baseContent: string;
  getContent(): string;
  /**
   * Persist `content`. `base` is the content the staleness hash must be
   * computed from; `null` means force-overwrite (no staleness check).
   * Resolves "conflict" on a 409; throws on any other failure.
   */
  save(content: string, base: string | null): Promise<SaveOutcome>;
  onState(state: AutosaveState): void;
  debounceMs?: number;
}

export interface Autosave {
  /** Editor change hook: tracks dirty and (re)schedules the debounce. */
  notifyChange(): void;
  /** Immediate save of pending changes (blur, note switch, close). */
  flush(): Promise<void>;
  /** Conflict resolution: save without the staleness check. */
  overwrite(): Promise<void>;
  /** New authoritative base (reload-from-disk, restore, note switch). */
  reset(baseContent: string): void;
  state(): AutosaveState;
  isDirty(): boolean;
  /** The content of the last known on-disk version. */
  base(): string;
  dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 1800;

export function createAutosave(opts: AutosaveOptions): Autosave {
  let base = opts.baseContent;
  let state: AutosaveState = "clean";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pending = false;
  let disposed = false;

  function setState(next: AutosaveState) {
    if (state === next || disposed) return;
    state = next;
    opts.onState(next);
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run(base);
    }, opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  async function run(againstBase: string | null): Promise<void> {
    if (disposed) return;
    clearTimer();
    if (inFlight) {
      pending = true;
      return;
    }
    const content = opts.getContent();
    if (content === base && state !== "conflict") {
      setState("clean");
      return;
    }
    inFlight = true;
    setState("saving");
    let outcome: SaveOutcome | "failed";
    try {
      outcome = await opts.save(content, againstBase);
    } catch {
      outcome = "failed";
    }
    inFlight = false;
    if (disposed) return;
    if (outcome === "saved") {
      base = content;
      setState(opts.getContent() === base ? "clean" : "dirty");
    } else if (outcome === "conflict") {
      pending = false; // a queued follow-up would just re-conflict
      setState("conflict");
      return;
    } else {
      setState("error"); // editor stays dirty; next flush retries
    }
    if (pending) {
      pending = false;
      void run(base);
    } else if (opts.getContent() !== base) {
      schedule();
    }
  }

  return {
    notifyChange() {
      if (disposed || state === "conflict") return;
      // Typing during an in-flight save: the post-save base check
      // reschedules the debounce; `pending` is reserved for explicit
      // flushes so continuous typing never chains saves back-to-back.
      if (inFlight) return;
      if (opts.getContent() === base) {
        clearTimer();
        if (state === "dirty" || state === "error") setState("clean");
        return;
      }
      if (state !== "saving") setState("dirty");
      schedule();
    },
    async flush() {
      if (state === "conflict") return; // user must pick reload/overwrite
      await run(base);
    },
    async overwrite() {
      await run(null);
    },
    reset(baseContent: string) {
      base = baseContent;
      pending = false;
      clearTimer();
      setState(opts.getContent() === base ? "clean" : "dirty");
      if (state === "dirty") schedule();
    },
    state: () => state,
    isDirty: () => opts.getContent() !== base,
    base: () => base,
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
