import { defineConfig } from "@playwright/test"
/** Browser check of the platform institution detail / edit / usage screen against the LOCAL isolated stack. Uses the Google Chrome installed on the machine.
 *  PW_BASE_URL=http://localhost:3119 npx playwright test -c tests/web/platform-institution.config.ts */
export default defineConfig({ testDir: ".", testMatch: /platform-institution\.spec\.ts/, timeout: 90_000, expect: { timeout: 20_000 }, workers: 1, reporter: [["list"]], use: { channel: "chrome", baseURL: process.env.PW_BASE_URL ?? "http://localhost:3119", viewport: { width: 1280, height: 1000 }, screenshot: "only-on-failure" } })
