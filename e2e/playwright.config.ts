import { defineConfig, devices } from "@playwright/test"

/**
 * Runs against the local stack: frontend :3000, API :4310 (AI_PROVIDER=mock, seeded demo
 * org). Sign-in is real WorkOS password auth for the seeded demo users; each role gets its
 * own storage state produced by the `setup` project.
 */
export default defineConfig({
  testDir: "./tests",
  // tests/qa/ holds PRISM verification evidence specs; they run through playwright.qa.config.ts only.
  testIgnore: ["**/helpers/**", "**/qa/**"],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.E2E_VIDEO ? "on" : "off",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // devices[] carries its own 1280x720 viewport; restate ours so the project does not shrink the window.
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, dependencies: ["setup"] },
  ],
})
