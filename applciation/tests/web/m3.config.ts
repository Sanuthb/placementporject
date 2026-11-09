import { defineConfig } from "@playwright/test"
/** Browser checks for M3 against the LOCAL isolated stack (tests/e2e/stack). Uses the Google Chrome installed on the machine.
 *  PW_BASE_URL=http://localhost:3111 npx playwright test -c tests/web/m3.config.ts */
export default defineConfig({ testDir: ".", testMatch: /m3-academics\.spec\.ts/, timeout: 180_000, expect: { timeout: 15_000 }, workers: 1, reporter: [["list"]], use: { channel: "chrome", baseURL: process.env.PW_BASE_URL ?? "http://localhost:3111", viewport: { width: 1280, height: 900 } } })
