/**
 * Embedded terminal (F022): a PTY running the full opencode TUI in the
 * vault directory, surfaced in the research column's lower pane.
 *
 * TRUST NOTE: unlike the sandboxed bridge, this runs opencode with the
 * USER'S OWN config and permissions — direct vault writes under opencode's
 * own prompts, outside the Solaris journal/propose guarantees. It is the
 * user running opencode themselves, inside Solaris chrome.
 *
 * node-pty is a native optional dependency, loaded dynamically: when it is
 * missing or unbuildable the feature degrades to a clean 503. Its darwin
 * prebuilds ship spawn-helper without the exec bit (npm strips it); we
 * chmod it defensively before the first spawn.
 */

import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export interface PtyLike {
  onData(fn: (d: string) => void): void;
  onExit(fn: (e: { exitCode: number }) => void): void;
  write(d: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export type PtyFactory = (
  cmd: string,
  cwd: string,
  cols: number,
  rows: number,
) => Promise<PtyLike>;

/** Restore the exec bit npm strips from node-pty's darwin spawn-helper. */
function fixSpawnHelper(): void {
  let base: string | null = null;
  try {
    // Resolve the actual node-pty install (works in tsx/ESM); the CJS
    // bundle falls back to cwd below.
    base = dirname(
      createRequire(import.meta.url).resolve("node-pty/package.json"),
    );
  } catch {
    base = null;
  }
  const roots = [base, join(process.cwd(), "node_modules", "node-pty")].filter(
    (r): r is string => !!r,
  );
  for (const root of roots) {
    for (const arch of ["darwin-arm64", "darwin-x64"]) {
      const p = join(root, "prebuilds", arch, "spawn-helper");
      try {
        if (existsSync(p)) chmodSync(p, 0o755);
      } catch {
        // best effort; spawn will surface the real error
      }
    }
  }
}

const realPtyFactory: PtyFactory = async (cmd, cwd, cols, rows) => {
  fixSpawnHelper();
  const pty = await import("node-pty");
  return pty.spawn(cmd, [], {
    name: "xterm-256color",
    cwd,
    cols: Math.max(20, cols),
    rows: Math.max(5, rows),
    env: process.env as Record<string, string>,
  }) as unknown as PtyLike;
};

export interface TerminalDeps {
  ptyFactory: PtyFactory;
}

export function createTerminalManager(overrides: Partial<TerminalDeps> = {}) {
  const deps: TerminalDeps = { ptyFactory: realPtyFactory, ...overrides };

  let pty: PtyLike | null = null;
  let exited = true;
  const listeners = new Set<(d: string) => void>();
  // Replay buffer so a reconnecting SSE stream repaints the screen.
  let backlog = "";
  const BACKLOG_MAX = 200_000;

  return {
    running: () => !!pty && !exited,

    /** Start (or reuse) the terminal. Throws when node-pty is unavailable. */
    async start(
      cmd: string,
      cwd: string,
      cols: number,
      rows: number,
    ): Promise<void> {
      if (pty && !exited) return;
      const p = await deps.ptyFactory(cmd, cwd, cols, rows);
      pty = p;
      exited = false;
      backlog = "";
      p.onData((d) => {
        backlog = (backlog + d).slice(-BACKLOG_MAX);
        for (const fn of listeners) fn(d);
      });
      p.onExit(() => {
        exited = true;
        const note =
          "\r\n[opencode exited — start it again from Agent mode]\r\n";
        backlog += note;
        for (const fn of listeners) fn(note);
      });
    },

    write(d: string): void {
      if (pty && !exited) pty.write(d);
    },

    resize(cols: number, rows: number): void {
      if (pty && !exited) pty.resize(Math.max(20, cols), Math.max(5, rows));
    },

    subscribe(fn: (d: string) => void): () => void {
      if (backlog) fn(backlog); // repaint on (re)connect
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    kill(): void {
      const p = pty;
      pty = null;
      exited = true;
      backlog = "";
      try {
        p?.kill();
      } catch {
        // already gone
      }
    },
  };
}

export type TerminalManager = ReturnType<typeof createTerminalManager>;
