import { defineConfig, devices } from "@playwright/test"
export default defineConfig({
  testDir: "./tests",
  testMatch: /tmp-mcp-app\.spec\.ts/,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { viewport: { width: 900, height: 900 }, trace: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 900, height: 900 } } }],
})
