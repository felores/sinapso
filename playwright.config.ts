import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:6173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Hermetic vault: build the throwaway vault + graph first, then serve
      // it — never the developer's real data/graph.json. (Playwright starts
      // webServer before globalSetup, so setup rides the command chain.)
      command: "npx tsx tests/e2e/global-setup.ts && npm run dev:server",
      env: { SINAPSO_GRAPH: resolve(ROOT, "tests/e2e/.tmp/graph.json") },
      url: "http://127.0.0.1:5175/api/graph",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev:web -- --host 127.0.0.1 --port 6173 --strictPort",
      url: "http://127.0.0.1:6173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
