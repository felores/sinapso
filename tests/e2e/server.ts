import { join } from "node:path";
import { createApp } from "../../server/app.js";
import { E2E_GRAPH, E2E_TMP } from "./global-setup.js";

const { app } = createApp(E2E_GRAPH, undefined, {
  configPath: join(E2E_TMP, "config.json"),
  detectDeps: {
    run: async () => ({ ok: false, stdout: "", stderr: "" }),
    fileExists: () => false,
    home: E2E_TMP,
    env: { PATH: "", SHELL: "/bin/sh" },
  },
});

app.listen(Number(process.env.SINAPSO_PORT ?? 6175), "127.0.0.1");
