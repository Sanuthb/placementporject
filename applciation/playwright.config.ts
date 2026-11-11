import { defineConfig } from "@playwright/test"
import { loadLocalBrowserEnv } from "./tests/web/lib/local-only"

/**
 * Browser test of the web app, against the ISOLATED LOCAL STACK ONLY (Docker Postgres and Auth, see docs/LOCAL_ENV.md). It uses the Google Chrome already installed on the machine.
 *
 *   bash tests/e2e/stack/up.sh        (once; Docker Desktop must be running)
 *   npm run build                     (with .env.local in place, so the local Auth URL is what gets built into the app)
 *   PW_ALLOW=1 npm run test:web
 *
 * Fail-closed:
 *  - Only the real environment and `.env.local` are read. `.env` is never loaded here (it names hosted projects and sets PW_BASE_URL, which must not steer these tests).
 *  - The config refuses to load unless every database and Auth target resolves to localhost.
 *  - It ALWAYS starts its own server on port 3115 (the base URL is not configurable) and never attaches to one that is already running: a dev server on :3000 may still be
 *    pointed at a hosted project.
 */
loadLocalBrowserEnv()
const PORT = 3115
const baseURL = `http://localhost:${PORT}`
const env = Object.fromEntries(Object.entries({ ...process.env, REQUIRE_LOCAL_DB: "true", RATE_LIMIT_DISABLED: "true", APP_URL: baseURL, PORT: String(PORT) }).filter((e): e is [string, string] => typeof e[1] === "string"))

export default defineConfig({
  testDir: "tests/web",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/web/report" }]],
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: { command: `npx next start -p ${PORT}`, url: `${baseURL}/login`, reuseExistingServer: false, timeout: 120_000, env },
})
