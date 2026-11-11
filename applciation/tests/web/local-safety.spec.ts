import { expect, test } from "@playwright/test"
import { blockNonLocal, requireLocalBrowserEnv } from "./lib/local-only"

/**
 * Proves the browser-test safety net itself, with nothing signed in and nothing written (Phase 4.4.2 pre-step):
 *  - the app under test is the config's own local server (never :3000);
 *  - the browser really cannot reach a non-local host: a request to a hosted-looking Supabase address and to a look-alike host is aborted and reported;
 *  - requests to the local machine still work.
 * The "remote" hosts are fake `.invalid` names, so even a failing blocker could not reach anything real.
 */
test("local safety: the app under test is local and the browser cannot leave this machine", async ({ page, baseURL }) => {
  const { baseURL: base } = requireLocalBrowserEnv(baseURL)
  expect(new URL(base).port).toBe("3115")
  const blocked = await blockNonLocal(page)
  await page.goto("/login")
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
  expect(new URL(page.url()).hostname).toBe("localhost")
  const results = await page.evaluate(async () => {
    const probe = async (u: string) => { try { await fetch(u, { mode: "no-cors" }); return "reached" } catch { return "blocked" } }
    return { supabase: await probe("https://proj-guard-test.supabase.invalid/auth/v1/token"), lookalike: await probe("http://localhost.guard-test.invalid/x"), local: await probe("/api/health/live") }
  })
  expect(results.supabase).toBe("blocked")
  expect(results.lookalike).toBe("blocked")
  expect(results.local).toBe("reached")
  expect(blocked().sort()).toEqual(["localhost.guard-test.invalid", "proj-guard-test.supabase.invalid"])
})
