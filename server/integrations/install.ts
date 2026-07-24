/**
 * Addons installer (U12, KTD8): the "core + addons" flavor. Checks existing
 * installs FIRST and never reinstalls or touches their config (R16/AE7).
 * qmd installs via Bun only when Bun exists — otherwise the result carries
 * guided instructions instead of failing. Exa is a hosted API: nothing to
 * install, configured by key.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  detectTool,
  realRunner,
  type DetectDeps,
  type ToolName,
} from "./detect.js";

const INSTALL_TIMEOUT_MS = 600_000;

export const QMD_INSTALL_SPEC = "https://github.com/tobi/qmd";

export const MARKITDOWN_SPEC = "markitdown[all]==0.1.5";

export type InstallableTool = "qmd" | "markitdown";

export interface InstallResult {
  tool: InstallableTool;
  status: "already-installed" | "installed" | "instructions" | "failed";
  detail: string;
}

function fullDeps(deps: Partial<DetectDeps>): DetectDeps {
  return {
    run: realRunner,
    fileExists: existsSync,
    home: homedir(),
    env: process.env,
    ...deps,
  };
}

function findHelper(
  d: DetectDeps,
  name: string,
  knownDirs: string[],
): string | null {
  // Helper runtimes (bun, uv, pip3) are not detected tools; probe known
  // homes + PATH.
  for (const dir of knownDirs) {
    if (d.fileExists(join(dir, name))) return join(dir, name);
  }
  for (const dir of (d.env.PATH ?? "").split(":")) {
    if (dir && d.fileExists(join(dir, name))) return join(dir, name);
  }
  return null;
}

const findBun = (d: DetectDeps) =>
  findHelper(d, "bun", [join(d.home, ".bun", "bin")]);
const findUv = (d: DetectDeps) =>
  findHelper(d, "uv", [
    join(d.home, ".local", "bin"),
    join(d.home, ".cargo", "bin"),
  ]);
const findPip = (d: DetectDeps) => findHelper(d, "pip3", []);

export async function installAddons(
  overrides: Partial<DetectDeps>,
  tools: InstallableTool[] = ["qmd", "markitdown"],
): Promise<InstallResult[]> {
  const deps = fullDeps(overrides);
  const run = deps.run;
  const results: InstallResult[] = [];

  for (const tool of tools) {
    const existing = await detectTool(tool as ToolName, deps);
    if (existing.installed) {
      // AE7: existing setup respected — no reinstall, no config changes.
      results.push({
        tool,
        status: "already-installed",
        detail: `${existing.path}${existing.version ? ` (${existing.version})` : ""}`,
      });
      continue;
    }
    if (tool === "markitdown") {
      // uv preferred, pip3 --user fallback, guided instructions otherwise.
      const uv = findUv(deps);
      const pip = uv ? null : findPip(deps);
      if (!uv && !pip) {
        results.push({
          tool,
          status: "instructions",
          detail:
            "markitdown needs Python tooling. Install uv first (see docs.astral.sh/uv), " +
            `then run: uv tool install "${MARKITDOWN_SPEC}"`,
        });
        continue;
      }
      const r = uv
        ? await run(
            uv,
            ["tool", "install", MARKITDOWN_SPEC],
            INSTALL_TIMEOUT_MS,
          )
        : await run(
            pip!,
            ["install", "--user", MARKITDOWN_SPEC],
            INSTALL_TIMEOUT_MS,
          );
      results.push(
        r.ok
          ? {
              tool,
              status: "installed",
              detail: uv ? "installed via uv" : "installed via pip3 --user",
            }
          : {
              tool,
              status: "failed",
              detail: (r.stderr || "install failed").slice(0, 500),
            },
      );
      continue;
    }
    // qmd requires Bun; without it, guide instead of failing (KTD8).
    const bun = findBun(deps);
    if (!bun) {
      results.push({
        tool,
        status: "instructions",
        detail:
          "qmd needs Bun. Install Bun first (curl -fsSL https://bun.sh/install | bash), " +
          `then run: bun install -g ${QMD_INSTALL_SPEC}`,
      });
      continue;
    }
    const r = await run(
      bun,
      ["install", "-g", QMD_INSTALL_SPEC],
      INSTALL_TIMEOUT_MS,
    );
    results.push(
      r.ok
        ? { tool, status: "installed", detail: "installed via bun" }
        : {
            tool,
            status: "failed",
            detail: (r.stderr || "bun install failed").slice(0, 500),
          },
    );
  }
  return results;
}
