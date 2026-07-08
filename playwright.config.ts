import { defineConfig, devices } from "@playwright/test";

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
      command: "npm run dev:server",
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
