import { defineConfig, devices } from "@playwright/test";
import { E2E_GRAPH } from "./tests/e2e/global-setup";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:6173",
    screenshot: "only-on-failure",
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
      command:
        "npx tsx tests/e2e/global-setup.ts && npx tsx tests/e2e/server.ts",
      env: {
        SINAPSO_GRAPH: E2E_GRAPH,
        SINAPSO_PORT: "6175",
      },
      url: "http://127.0.0.1:6175/api/graph",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev:web -- --host 127.0.0.1 --port 6173 --strictPort",
      env: { SINAPSO_API_URL: "http://127.0.0.1:6175" },
      url: "http://127.0.0.1:6173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
