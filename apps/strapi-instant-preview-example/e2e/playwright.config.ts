import { defineConfig, devices } from "@playwright/test";

import { AUTH_FILE, STRAPI_URL, WEB_DIR, WEB_URL, serverEnv } from "./env";

// Use this Node binary to bypass mise's PATH shim.
// The shim reapplies .env.yaml and would replace e2e ports with dev ports.
const NODE = JSON.stringify(process.execPath);

// Isolate the suite with separate server ports and a freshly seeded database.
// Use the built admin to catch Strapi upgrades that break plugin assumptions.
export default defineConfig({
  testDir: ".",
  // `strapi develop` restarts on file changes outside `.tmp`.
  outputDir: "../.tmp/test-results",
  // The tests share one database, and some of them save documents.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: STRAPI_URL,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/u },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
  ],
  webServer: [
    {
      // Build the admin first with `strapi build`. Turbo handles this before `test:e2e`.
      // The admin-seed plugin creates the admin user and API token during seeding.
      command: `rm -f .tmp/e2e/data.db* && ${NODE} scripts/seed.js && ${NODE} node_modules/@strapi/strapi/bin/strapi.js start`,
      cwd: "..",
      url: `${STRAPI_URL}/admin`,
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Bypass Astro's lock so this server can coexist with the developer's server.
      command: `${NODE} node_modules/astro/bin/astro.mjs dev --ignore-lock`,
      cwd: WEB_DIR,
      url: WEB_URL,
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
