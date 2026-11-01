import { defineConfig } from "@playwright/test"

/**
 * Browser test of the web app. It uses the Google Chrome already installed on the machine, so nothing is downloaded.
 * Run: PW_ALLOW=1 npm run test:web   (see tests/web/placement-flow.spec.ts)
 */
export default defineConfig({
  testDir: "tests/web",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/web/report" }]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PW_BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
})
