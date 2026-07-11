/**
 * Sinapso server CLI: serves the built frontend plus the local-only API.
 *
 * Usage:
 *   npm start    (after npm run scan and npm run build)
 *   npx sinapso "<vault-path>"  (all-in-one: scan + serve + open browser)
 *
 * The server binds to 127.0.0.1 by default (localhost); vault data never leaves the machine.
 * Set SINAPSO_HOST to expose on a different interface in local networks.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

// Resolve graph.json path from environment or defaults
const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const GRAPH_PATH =
  process.env.SINAPSO_GRAPH ?? resolve(ROOT, "data", "graph.json");
const PORT = Number(process.env.SINAPSO_PORT ?? 5175);
const HOST = process.env.SINAPSO_HOST ?? "127.0.0.1";

function getNetworkHost(): string | undefined {
  const interfaces = networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return undefined;
}

// Verify graph.json exists before starting server
if (!existsSync(GRAPH_PATH)) {
  console.error(
    `No graph at ${GRAPH_PATH} \u2014 run:  npm run scan -- "<vault-path>"`,
  );
  process.exit(1);
}

// Create server (localhost by default, configurable by SINAPSO_HOST)
const { app, meta, attachVoice } = createApp(
  GRAPH_PATH,
  resolve(ROOT, "web", "dist"),
);
const server = app.listen(PORT, HOST, () => {
  const m = meta();
  console.log(
    `Sinapso: Local:  http://localhost:${PORT}  (vault: ${m.vaultName}, ${m.notes} notes)`,
  );
  if (HOST === "0.0.0.0") {
    const network = getNetworkHost();
    if (network) {
      console.log(
        `Sinapso: Network: http://${network}:${PORT}  (vault: ${m.vaultName}, ${m.notes} notes)`,
      );
    }
  }
});
attachVoice(server); // voice-mode WebSocket relay (opt-in, key-gated)
