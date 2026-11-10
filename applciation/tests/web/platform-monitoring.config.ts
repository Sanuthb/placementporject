import { defineConfig } from "@playwright/test"
/** Browser check of the platform monitoring page against the LOCAL isolated stack (Chrome installed on the machine).
 *  PW_BASE_URL=http://localhost:3113 npx playwright test -c tests/web/platform-monitoring.config.ts */
export default defineConfig({ testDir: ".", testMatch: /platform-monitoring\.spec\.ts/, timeout: 120_000, expect: { timeout: 15_000 }, workers: 1, reporter: [["list"]], use: { channel: "chrome", baseURL: process.env.PW_BASE_URL ?? "http://localhost:3113", viewport: { width: 1360, height: 1000 }, screenshot: "only-on-failure" } })
