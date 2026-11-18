import { defineConfig, devices } from "@playwright/test";

import { BASE_URL, DEMO_SESSION, PORT } from "./e2e/support/env";

const browser = { ...devices["Desktop Chrome"], ...(process.env.PW_CHROMIUM && { launchOptions: { executablePath: process.env.PW_CHROMIUM } }) };

/** UI tests run against a production build (`next start`) on a fresh, seeded on-disk PGlite database. */
export default defineConfig({
  testDir: "e2e",
  outputDir: ".data/e2e-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: ".data/e2e-report" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  // PW_CHROMIUM points at a preinstalled Chromium when the bundled one is not installed (e.g. cloud sandboxes).
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, use: browser },
    { name: "chromium", use: { ...browser, storageState: DEMO_SESSION }, dependencies: ["setup"] },
  ],
  webServer: {
    command: "pnpm e2e:serve",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: "pglite:./.data/e2e",
      BETTER_AUTH_URL: BASE_URL,
      // Test-only: signs sessions on a throwaway local database.
      BETTER_AUTH_SECRET: "agint-e2e-only-secret-not-for-real-deployments",
      PORT: String(PORT),
    },
  },
});
