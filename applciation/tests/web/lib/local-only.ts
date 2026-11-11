import type { Page } from "@playwright/test"
import { loadEnvFiles } from "../../../scripts/lib/envFiles"
import { assertLocalTargets, parseHost } from "../../../lib/localOnly"

/**
 * Fail-closed safety for browser tests. Browser tests create and change data through the app under test, so these must hold before any step runs:
 *  1. The environment the TESTS see is the real process environment plus `.env.local` ONLY. A bare `.env` and `.env.seed` are never read (a `.env` may name hosted projects
 *     and may carry PW_BASE_URL, which once made a test attach to a shared dev server). Every database and Auth target must resolve to localhost; the typed override does not apply.
 *  2. The app under test is the server the Playwright config starts itself on a dedicated local port. Port 3000 (the usual dev server, which may still be attached to a hosted
 *     project) and any non-local host are refused.
 *  3. During the test the browser may not reach any non-local host (a hosted Supabase Auth call, for example, is blocked and reported as a failure).
 * Only host names are ever reported, never credentials.
 */
export function loadLocalBrowserEnv(dir = process.cwd()) {
  loadEnvFiles(dir, process.env, [".env.local"])
  assertLocalTargets(process.env, { strict: true, what: "run a browser test" })
}

export function requireLocalBrowserEnv(baseURL: string | undefined): { baseURL: string } {
  loadLocalBrowserEnv()
  if (!baseURL) throw new Error("Refusing to run a browser test: no base URL. The Playwright config starts its own local server; do not point tests at an existing one.")
  const h = parseHost(baseURL)
  if (!h || !["localhost", "127.0.0.1", "::1"].includes(h.host)) throw new Error(`Refusing to run a browser test: the base URL resolves to ${h?.host ?? "(unreadable)"}, not the local machine.`)
  if (h.port === "3000") throw new Error("Refusing to run a browser test against port 3000: that is the usual dev server and may be attached to a hosted project. Use the config's own server (default port 3115).")
  return { baseURL }
}

/** Aborts every request the page makes to a non-local host and remembers it. Call the returned function at the end of the test and expect an empty list. */
export async function blockNonLocal(page: Page): Promise<() => string[]> {
  const seen = new Set<string>()
  await page.context().route("**/*", (route) => {
    const u = route.request().url()
    if (/^(data|blob|about|chrome-extension):/i.test(u)) return route.continue()
    const h = parseHost(u)
    if (h && ["localhost", "127.0.0.1", "::1"].includes(h.host)) return route.continue()
    seen.add(h?.host ?? "(unreadable)")
    return route.abort("blockedbyclient")
  })
  return () => [...seen]
}
