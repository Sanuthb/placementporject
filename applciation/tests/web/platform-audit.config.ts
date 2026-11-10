import { defineConfig } from "@playwright/test"
/** Browser check of the platform audit-log viewer against the LOCAL isolated stack. Uses the Google Chrome installed on the machine.
 *  PW_BASE_URL=http://localhost:3113 npx playwright test -c tests/web/platform-audit.config.ts */
export default defineConfig({ testDir: ".", testMatch: /platform-audit\.spec\.ts/, timeout: 60_000, expect: { timeout: 15_000 }, workers: 1, reporter: [["list"]], use: { channel: "chrome", baseURL: process.env.PW_BASE_URL ?? "http://localhost:3113", viewport: { width: 1280, height: 900 }, screenshot: "only-on-failure" } })
