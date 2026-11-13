import { defineConfig } from "@playwright/test"
/** Browser check of the platform governance screens (access, staff roles, system configuration, integrations, policy) against the LOCAL isolated stack. Uses the Google Chrome installed on the machine.
 *  PW_BASE_URL=http://localhost:3122 npx playwright test -c tests/web/platform-governance.config.ts   (against a production build) */
export default defineConfig({ testDir: ".", testMatch: /platform-governance\.spec\.ts/, timeout: 120_000, expect: { timeout: 20_000 }, workers: 1, reporter: [["list"]], use: { channel: "chrome", baseURL: process.env.PW_BASE_URL ?? "http://localhost:3122", viewport: { width: 1280, height: 1000 }, screenshot: "only-on-failure" } })
