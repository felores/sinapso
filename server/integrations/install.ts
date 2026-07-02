/**
 * Addons installer (U12, KTD8): the "core + addons" flavor. Checks existing
 * installs FIRST and never reinstalls or touches their config (R16/AE7).
 * OpenCode installs via its official one-liner; qmd via Bun only when Bun
 * exists — otherwise the result carries guided instructions instead of
 * failing. Exa is a hosted API: nothing to install, configured by key.
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

export const OPENCODE_INSTALL_CMD =
  "curl -fsSL https://opencode.ai/install | bash";
export const QMD_INSTALL_SPEC = "https://github.com/tobi/qmd";

export interface InstallResult {
  tool: "qmd" | "opencode";
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

async function findBun(d: DetectDeps): Promise<string | null> {
  // Bun is not one of our detected tools; probe its known home + PATH.
  const known = join(d.home, ".bun", "bin", "bun");
  if (d.fileExists(known)) return known;
  for (const dir of (d.env.PATH ?? "").split(":")) {
    if (dir && d.fileExists(join(dir, "bun"))) return join(dir, "bun");
  }
  return null;
}

export async function installAddons(
  overrides: Partial<DetectDeps>,
  tools: Array<"qmd" | "opencode"> = ["qmd", "opencode"],
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
    if (tool === "opencode") {
      const r = await run(
        "/bin/sh",
        ["-c", OPENCODE_INSTALL_CMD],
        INSTALL_TIMEOUT_MS,
      );
      results.push(
        r.ok
          ? {
              tool,
              status: "installed",
              detail: "installed via opencode.ai/install",
            }
          : {
              tool,
              status: "failed",
              detail: (r.stderr || "install script failed").slice(0, 500),
            },
      );
      continue;
    }
    // qmd requires Bun; without it, guide instead of failing (KTD8).
    const bun = await findBun(deps);
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
