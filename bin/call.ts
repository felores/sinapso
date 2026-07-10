/**
 * `sinapso call <tool> [json]` (R16): the generic CLI invoker over the
 * registry's `cli` surface. Thin by design — it resolves the tool, forwards
 * to the bound route through the same loopback bridge MCP uses (surface-
 * scoped token included), and returns the route's JSON. No per-tool flags.
 */

import { createMcpBridge } from "../server/integrations/mcp-bridge.js";
import { entryFor, toolsForSurface } from "../server/integrations/registry.js";

export interface CallOutcome {
  exitCode: number;
  /** JSON payload (stdout) on success or failure-with-response. */
  output?: string;
  /** Human message (stderr) when the call could not be made. */
  error?: string;
}

export async function callTool(
  name: string | undefined,
  jsonArgs: string | undefined,
  opts: { base: string; fetchFn?: typeof fetch },
): Promise<CallOutcome> {
  const cliTools = () =>
    toolsForSurface("cli")
      .map((e) => e.name)
      .join(", ");
  if (!name) {
    return {
      exitCode: 1,
      error: `usage: sinapso call <tool> ['{"arg":"value"}']\navailable tools: ${cliTools()}`,
    };
  }
  const entry = entryFor(name);
  if (!entry) {
    return {
      exitCode: 1,
      error: `unknown tool '${name}'. Available: ${cliTools()}`,
    };
  }
  if (!entry.surfaces.includes("cli")) {
    return {
      exitCode: 1,
      error: `tool '${name}' is not available on the cli surface (surfaces: ${entry.surfaces.join(", ")})`,
    };
  }
  let args: Record<string, unknown> = {};
  if (jsonArgs) {
    try {
      args = JSON.parse(jsonArgs) as Record<string, unknown>;
    } catch {
      return {
        exitCode: 1,
        error: `arguments must be a JSON object: ${jsonArgs}`,
      };
    }
  }
  const bridge = createMcpBridge({ base: opts.base, fetchFn: opts.fetchFn });
  try {
    const r = await bridge.call(entry, args);
    return { exitCode: r.ok ? 0 : 1, output: JSON.stringify(r.body, null, 2) };
  } catch (e) {
    return {
      exitCode: 1,
      error: `could not reach Sinapso at ${opts.base} — start it first (npx sinapso "<vault>" or npm run dev). ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
