// SMS and WhatsApp hold (Gate 4 review). No database, no network: global fetch is replaced by a counter, so a real call to a provider would be seen (and would be a failure).
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

type E = { status?: number; code?: string; message?: string }
let fails = 0
const t = (n: string, f: () => void | Promise<void>) => Promise.resolve().then(f).then(() => console.log("PASS", n), (e) => { fails++; console.log("FAIL", n, String((e as E)?.message ?? e).slice(0, 300)) })

let calls: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (u: unknown) => { calls.push(String(u)); throw new Error("a network call was made") }) as typeof fetch
const KEYS = { TWILIO_ACCOUNT_SID: "ACunittestsid", TWILIO_AUTH_TOKEN: "unit-test-token", TWILIO_SMS_FROM: "+15550000001", TWILIO_WHATSAPP_FROM: "+15550000002" }
const C = await import("../../lib/channels")

for (const ch of ["SMS", "WHATSAPP"] as const) {
  await t(`${ch}: with valid credentials in the environment a send is refused with CHANNEL_ON_HOLD (409) and no request is made`, async () => {
    Object.assign(process.env, KEYS); delete process.env.CHANNEL_DRY_RUN; calls = []
    await assert.rejects(C.sendText(ch, "+919876543210", "hello"), (e: E) => e.status === 409 && e.code === "CHANNEL_ON_HOLD" && /on hold/i.test(e.message ?? ""))
    assert.equal(calls.length, 0)
  })
  await t(`${ch}: dry-run mode does not bypass the hold either (nothing is reported as sent)`, async () => {
    process.env.CHANNEL_DRY_RUN = "true"; calls = []
    await assert.rejects(C.sendText(ch, "+919876543210", "hello"), (e: E) => e.code === "CHANNEL_ON_HOLD")
    assert.equal(calls.length, 0); delete process.env.CHANNEL_DRY_RUN
  })
  await t(`${ch}: the provider is reported as not available whatever the keys are`, () => {
    Object.assign(process.env, KEYS); assert.equal(C.providerConfigured(ch), false)
    process.env.CHANNEL_DRY_RUN = "true"; assert.equal(C.providerConfigured(ch), false); delete process.env.CHANNEL_DRY_RUN
  })
}
await t("no environment setting can lift the hold (several plausible names, true/false/1)", async () => {
  Object.assign(process.env, KEYS); calls = []
  for (const k of ["TEXT_CHANNELS_ON_HOLD", "CHANNELS_ENABLED", "SMS_ENABLED", "WHATSAPP_ENABLED", "ALLOW_SMS", "CHANNEL_HOLD", "NODE_ENV", "ALLOW_REMOTE_DB"]) for (const v of ["false", "0", "true", "1", "off"]) {
    process.env[k] = v
    await assert.rejects(C.sendText("SMS", "+919876543210", "x"), (e: E) => e.code === "CHANNEL_ON_HOLD")
    await assert.rejects(C.sendText("WHATSAPP", "+919876543210", "x"), (e: E) => e.code === "CHANNEL_ON_HOLD")
    delete process.env[k]
  }
  assert.equal(calls.length, 0)
})
await t("email and in-app are unaffected by the hold", () => {
  assert.equal(C.isOnHold("EMAIL"), false); assert.equal(C.isOnHold("IN_APP"), false); assert.equal(C.isOnHold("SMS"), true); assert.equal(C.isOnHold("WHATSAPP"), true)
  assert.equal(C.providerConfigured("EMAIL"), true); assert.equal(C.providerConfigured("IN_APP"), true)
})
await t("the refusal never contains a credential", async () => {
  Object.assign(process.env, KEYS)
  const e: E = await C.sendText("SMS", "+919876543210", "x").catch((x) => x)
  assert.ok(!JSON.stringify({ m: e.message, c: e.code }).includes(KEYS.TWILIO_AUTH_TOKEN) && !String(e.message).includes(KEYS.TWILIO_ACCOUNT_SID))
})

// Static trace of every send path: the Twilio endpoint appears in one file only, sendText has one caller, and the guard comes before dry-run, credentials and fetch.
const files = (d: string): string[] => readdirSync(d).flatMap((n) => (n === "node_modules" || n === ".next" || n === "generated" ? [] : statSync(join(d, n)).isDirectory() ? files(join(d, n)) : /\.(ts|tsx|mjs|mts)$/.test(n) ? [join(d, n)] : []))
const src = ["lib", "app", "scripts", "components", "hooks"].flatMap((d) => files(d))
const norm = (f: string) => f.replace(/\\/g, "/")
await t("trace: the provider endpoint is referenced only by lib/channels.ts", () => {
  const hits = src.filter((f) => /api\.twilio\.com|twilio\.com\/2010/i.test(readFileSync(f, "utf8"))).map(norm)
  assert.deepEqual(hits, ["lib/channels.ts"])
})
await t("trace: sendText is called from lib/dispatch.ts only, which checks the hold before claiming a send", () => {
  const callers = src.filter((f) => /\bsendText\s*\(/.test(readFileSync(f, "utf8").replace(/export async function sendText\s*\(/, ""))).map(norm)
  assert.deepEqual(callers, ["lib/dispatch.ts"])
  const d = readFileSync("lib/dispatch.ts", "utf8"); assert.ok(d.indexOf("isOnHold(channel)") > 0 && d.indexOf("isOnHold(channel)") < d.indexOf("sendText("))
})
await t("trace: no other module talks to an SMS or WhatsApp provider", () => {
  const bad = src.filter((f) => !/lib\/(channels|platformConfig|platformIntegrations)\.ts$/.test(norm(f)) && /(twilio|messagebird|vonage|msg91|gupshup|graph\.facebook\.com)/i.test(readFileSync(f, "utf8")) && /fetch\(|require\(|from "twilio"/.test(readFileSync(f, "utf8")))
  assert.deepEqual(bad.map(norm), [])
})
await t("trace: in sendText the hold is the first statement, before dry-run, credentials and fetch", () => {
  const c = readFileSync("lib/channels.ts", "utf8"); const body = c.slice(c.indexOf("export async function sendText"))
  assert.ok(body.indexOf("isOnHold(channel)") < body.indexOf("dryRun()") && body.indexOf("dryRun()") < body.indexOf("fetch("))
  assert.match(c, /export const TEXT_CHANNELS_ON_HOLD = true as boolean/)
  assert.ok(!/process\.env[^;\n]*TEXT_CHANNELS_ON_HOLD|TEXT_CHANNELS_ON_HOLD[^;\n]*process\.env/.test(c), "the constant must not read the environment")
})

globalThis.fetch = realFetch
console.log(fails ? `${fails} FAILED` : "ALL PASSED")
process.exit(fails ? 1 : 0)
