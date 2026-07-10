/**
 * MCP bridge (R15/R17, KTD2): maps the registry's `mcp`-scoped entries to
 * MCP tools and proxies each call to its bound HTTP route over loopback.
 * No new execution layer: `localOnly`, the token guard, consent/key gates,
 * and the sanctioned write path all apply because the call goes through the
 * same routes the browser uses.
 *
 * The surface-scoped token is fetched lazily from GET /api/session?surface=mcp
 * and re-fetched once on 403, so a Sinapso restart (which rotates tokens)
 * recovers transparently. The server-side guard — not this bridge — rejects
 * the MCP token on routes outside the registry's mcp surface.
 */

import { z } from "zod";
import {
  toolsForSurface,
  type RegistryEntry,
  type RouteBinding,
} from "./registry.js";

export interface McpBridgeOptions {
  /** Loopback base of the running Sinapso server. */
  base: string;
  fetchFn?: typeof fetch;
  /** Register the in-place edit tool (config opt-in, AE6). */
  editEnabled?: boolean;
}

export interface BridgeResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Registry entries this bridge should expose as MCP tools. */
export function mcpEntries(editEnabled: boolean): RegistryEntry[] {
  return toolsForSurface("mcp").filter((e) => !e.mcpEditOptIn || editEnabled);
}

/** Our provider-neutral JSON-schema subset → a Zod raw shape for the SDK. */
export function zodShape(
  params: Record<string, unknown>,
): Record<string, z.ZodTypeAny> {
  const properties = (params.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = new Set(
    Array.isArray(params.required) ? (params.required as string[]) : [],
  );
  const toZod = (p: Record<string, unknown>): z.ZodTypeAny => {
    let t: z.ZodTypeAny;
    switch (p.type) {
      case "string":
        t = z.string();
        break;
      case "integer":
        t = z.number().int();
        break;
      case "number":
        t = z.number();
        break;
      case "boolean":
        t = z.boolean();
        break;
      case "array":
        t = z.array(
          toZod((p.items as Record<string, unknown>) ?? { type: "string" }),
        );
        break;
      default:
        t = z.unknown();
    }
    return typeof p.description === "string" ? t.describe(p.description) : t;
  };
  return Object.fromEntries(
    Object.entries(properties).map(([name, prop]) => [
      name,
      required.has(name) ? toZod(prop) : toZod(prop).optional(),
    ]),
  );
}

/** Fill {param} path segments from args; return the url and consumed names. */
function fillPath(
  route: RouteBinding,
  args: Record<string, unknown>,
): { path: string; consumed: Set<string> } {
  const consumed = new Set<string>();
  const path = route.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    consumed.add(name);
    return encodeURIComponent(String(args[name] ?? ""));
  });
  return { path, consumed };
}

export function createMcpBridge(opts: McpBridgeOptions) {
  const fetchFn: typeof fetch =
    opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  let token: string | null = null;

  async function fetchToken(): Promise<string> {
    const r = await fetchFn(`${opts.base}/api/session?surface=mcp`);
    if (!r.ok) throw new Error(`token fetch failed (HTTP ${r.status})`);
    const d = (await r.json()) as { token?: string };
    if (!d.token) throw new Error("token fetch returned no token");
    token = d.token;
    return token;
  }

  async function callOnce(
    entry: RegistryEntry,
    args: Record<string, unknown>,
    tok: string,
  ): Promise<Response> {
    const route = entry.route;
    if (!route) throw new Error(`tool ${entry.name} has no route binding`);
    const { path, consumed } = fillPath(route, args);
    if (route.method === "GET") {
      const u = new URL(`${opts.base}${path}`);
      for (const [arg, param] of Object.entries(route.query ?? {})) {
        const v = args[arg];
        if (v === undefined || v === null || consumed.has(arg)) continue;
        u.searchParams.set(param, String(v));
      }
      return fetchFn(u, {
        headers: route.tokenRequired ? { "x-sinapso-token": tok } : undefined,
      });
    }
    const body: Record<string, unknown> = {};
    const map = route.body ?? {};
    const fields = Object.keys(map).length
      ? Object.entries(map)
      : Object.keys(args).map((k) => [k, k] as [string, string]);
    for (const [arg, field] of fields) {
      const v = args[arg];
      if (v === undefined || consumed.has(arg)) continue;
      body[field] = v;
    }
    return fetchFn(`${opts.base}${path}`, {
      method: route.method,
      headers: {
        "content-type": "application/json",
        ...(route.tokenRequired ? { "x-sinapso-token": tok } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  return {
    /** Proxy one tool call; re-fetches the token once on 403 (rotation). */
    async call(
      entry: RegistryEntry,
      args: Record<string, unknown>,
    ): Promise<BridgeResult> {
      let tok = token ?? (await fetchToken());
      let r = await callOnce(entry, args, tok);
      if (r.status === 403) {
        tok = await fetchToken();
        r = await callOnce(entry, args, tok);
      }
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, body };
    },
    /** Startup probe: server reachable + current edit opt-in state. */
    async probe(): Promise<{ editEnabled: boolean }> {
      const r = await fetchFn(`${opts.base}/api/integrations`);
      if (!r.ok) throw new Error(`Sinapso responded HTTP ${r.status}`);
      const d = (await r.json()) as { mcp?: { editEnabled?: boolean } };
      return { editEnabled: d.mcp?.editEnabled === true };
    },
  };
}

export type McpBridge = ReturnType<typeof createMcpBridge>;
