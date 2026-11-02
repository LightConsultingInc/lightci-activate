import { defineConfig, devices } from "@playwright/test"

/**
 * QA evidence runs (LightCI PRISM): one spec per requirement under tests/qa/, always recorded,
 * no dependency on the shared `setup` project. Needs the local stack up in mock mode.
 *   npx playwright test -c playwright.qa.config.ts
 */
export default defineConfig({
  testDir: "./tests/qa",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/qa",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    video: { mode: "on", size: { width: 1280, height: 720 } },
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: "qa-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } }],
})
