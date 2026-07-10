#!/usr/bin/env node
/**
 * Sinapso MCP server (R15/R17, KTD2): stdio transport for local clients
 * (Claude Code, the podcast agent). Tools come from the registry's `mcp`
 * surface and every call is proxied to the running Sinapso server over
 * loopback HTTP with a surface-scoped token — the routes' guards, gates,
 * and the sanctioned write path apply unchanged. No network listener is
 * opened here; stdout is JSON-RPC, all logging goes to stderr.
 *
 * Client config (Claude Code):
 *   claude mcp add sinapso -- npx tsx /path/to/sinapso/server/mcp.ts
 * or with a built dist: `node dist/mcp.js`. Point at a non-default port
 * with SINAPSO_URL or SINAPSO_PORT.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createMcpBridge,
  mcpEntries,
  zodShape,
} from "./integrations/mcp-bridge.js";

const base =
  process.env.SINAPSO_URL ??
  `http://127.0.0.1:${process.env.SINAPSO_PORT ?? "5175"}`;

async function main(): Promise<void> {
  const bridge = createMcpBridge({ base });
  let editEnabled = false;
  try {
    ({ editEnabled } = await bridge.probe());
  } catch (e) {
    console.error(
      `sinapso-mcp: cannot reach Sinapso at ${base} — start it first (npm run dev / npm start). ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: "sinapso-mcp-server",
    version: "1.0.0",
  });

  for (const entry of mcpEntries(editEnabled)) {
    server.registerTool(
      entry.name,
      {
        description: entry.description,
        inputSchema: zodShape(entry.params),
        annotations: {
          readOnlyHint: entry.route?.method === "GET",
          destructiveHint: entry.name === "edit_vault_note",
          openWorldHint:
            entry.name === "web_research" || entry.name === "fetch_url",
        },
      },
      async (args: Record<string, unknown>) => {
        const r = await bridge.call(entry, args ?? {});
        const text = JSON.stringify(r.body, null, 2);
        if (!r.ok) {
          const message =
            (r.body as { error?: string; message?: string })?.error ??
            (r.body as { message?: string })?.message ??
            `HTTP ${r.status}`;
          return {
            content: [
              { type: "text", text: `Error (HTTP ${r.status}): ${message}` },
            ],
            isError: true,
          };
        }
        return { content: [{ type: "text", text }] };
      },
    );
  }

  await server.connect(new StdioServerTransport());
  console.error(
    `sinapso-mcp: connected via stdio, proxying ${mcpEntries(editEnabled).length} tools to ${base} (edit ${editEnabled ? "enabled" : "disabled"})`,
  );
}

void main();
