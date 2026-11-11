"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ApiClientError, api } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { UsagePanel } from "./usage-panel"

type Purpose = "TEXT" | "VISION" | "INTERVIEW"
type Stored = { purpose: Purpose; provider: string; model: string; enabled: boolean; keyConfigured: boolean; keyLast4: string | null; keyVersion: number | null; keyUpdatedAt: string | null; updatedAt: string }
type Effective = { provider: string; model: string; enabled: boolean; disabledBy: "global" | "purpose" | null; configured: boolean; stale: boolean; source: { config: string; model: string; key: string }; keyLast4: string | null }
type PurposeView = { purpose: Purpose; supportedProvider: string; default: { provider: string; model: string }; stored: Stored | null; effective: Effective | null; problem: string | null; modelSuggestions: string[] }
type Overview = { global: { enabled: boolean; reason: string | null; updatedAt: string | null }; masterKey: { configured: boolean; active: number | null; versions: number[]; problem: string | null }; purposes: PurposeView[]; warnings: string[] }
type Test = { ok: boolean; reason: string; ms: number; model: string; modelListed: boolean | null; modelCount: number }

const LABEL: Record<Purpose, { title: string; blurb: string }> = {
  TEXT: { title: "Text", blurb: "Student 360 readings, job-description analysis, tutor, marking, resume and writing assistance." },
  VISION: { title: "Vision", blurb: "Reading uploaded marksheets and documents." },
  INTERVIEW: { title: "Interview", blurb: "Mock interviews and the discussion simulator." },
}
const REASON: Record<string, string> = { ok: "The key works", unauthorized: "The provider refused the key", rate_limited: "The provider is rate limiting", unavailable: "The provider did not answer", timeout: "The provider timed out", error: "The provider returned an error" }
const errText = (e: unknown) => (e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : "Something went wrong")

function GlobalCard({ data, reload }: { data: Overview; reload: () => void }) {
  const [reason, setReason] = React.useState(data.global.reason ?? "")
  const [confirm, setConfirm] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const off = !data.global.enabled
  async function apply(enabled: boolean) {
    setBusy(true)
    try { await api("/api/platform/ai/global", { method: "PUT", body: { enabled, reason: reason.trim() || null } }); toast.success(enabled ? "AI switched back on" : "All AI features switched off"); setConfirm(false); reload() }
    catch (e) { toast.error(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Card data-testid="ai-global">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Global AI switch</CardTitle><Badge variant={off ? "destructive" : "default"} data-testid="ai-global-status">{off ? "All AI is OFF" : "AI is on"}</Badge></div>
        <CardDescription>Switches every AI feature off at once. It overrides every setting below and the server environment. {data.global.updatedAt ? `Last changed ${fmtDateTime(data.global.updatedAt)}.` : "Never changed."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Reason (shown to administrators, optional)</span><Input aria-label="Reason for the global switch" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: provider incident" /></label>
        {!confirm ? (
          <div><Button variant={off ? "default" : "destructive"} onClick={() => (off ? void apply(true) : setConfirm(true))} disabled={busy}>{busy && <Spinner />}{off ? "Switch AI back on" : "Switch all AI off"}</Button></div>
        ) : (
          <Alert variant="destructive" role="alert"><AlertTitle>Switch off every AI feature?</AlertTitle><AlertDescription><p>Students and staff will see AI features as unavailable until it is switched back on.</p><div className="mt-2 flex gap-2"><Button variant="destructive" size="sm" onClick={() => void apply(false)} disabled={busy}>{busy && <Spinner />}Yes, switch off</Button><Button variant="outline" size="sm" onClick={() => setConfirm(false)}>Cancel</Button></div></AlertDescription></Alert>
        )}
      </CardContent>
    </Card>
  )
}

function PurposeCard({ v, mkOk, reload }: { v: PurposeView; mkOk: boolean; reload: () => void }) {
  const s = v.stored, e = v.effective
  const [model, setModel] = React.useState(s?.model ?? e?.model ?? v.default.model)
  const [enabled, setEnabled] = React.useState(s?.enabled ?? true)
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [test, setTest] = React.useState<Test | null>(null)
  const modelBad = !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(model.trim())
  const keyBad = key !== "" && !/^[\x21-\x7e]{8,512}$/.test(key)
  const dirty = (s ? model.trim() !== s.model || enabled !== s.enabled : true) || key !== ""
  const id = v.purpose

  async function save(body: Record<string, unknown>, ok: string) {
    setBusy("save"); setErr(null)
    try { await api(`/api/platform/ai/purposes/${id}`, { method: "PUT", body: { model: model.trim(), enabled, expectedUpdatedAt: s?.updatedAt, ...body } }); toast.success(ok); setKey(""); setTest(null); reload() }
    catch (x) { setErr(errText(x)) } finally { setBusy(null) }
  }
  async function reset() {
    setBusy("reset"); setErr(null)
    try { await api(`/api/platform/ai/purposes/${id}`, { method: "DELETE" }); toast.success(`${LABEL[id].title} returned to the server environment`); setKey(""); setTest(null); reload() }
    catch (x) { setErr(errText(x)) } finally { setBusy(null) }
  }
  async function runTest() {
    setBusy("test"); setErr(null); setTest(null)
    try { setTest(await api<Test>(`/api/platform/ai/purposes/${id}/test`, { method: "POST", body: key ? { apiKey: key } : {} })) }
    catch (x) { setErr(errText(x)) } finally { setBusy(null) }
  }

  const status = e ? (e.disabledBy === "global" ? "Off (global switch)" : !e.enabled ? "Off" : e.configured ? "Ready" : "No key") : "Unavailable"
  const variant = !e ? "destructive" : !e.enabled ? "secondary" : e.configured ? "default" : "outline"
  return (
    <Card data-testid={`ai-purpose-${id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{LABEL[id].title}</CardTitle><div className="flex gap-2"><Badge variant="outline">{v.supportedProvider === "GROQ" ? "Groq" : "Anthropic"}</Badge><Badge variant={variant} data-testid={`ai-status-${id}`}>{status}</Badge>{e?.stale && <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">Stale</Badge>}</div></div>
        <CardDescription>{LABEL[id].blurb}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {v.problem && <Alert variant="destructive"><AlertTitle>Cannot show the active configuration</AlertTitle><AlertDescription>{v.problem === "AI_KEY_UNREADABLE" ? "The stored key cannot be read. Replace it below." : "The configuration cannot be read right now."}</AlertDescription></Alert>}
        {e && <p className="text-xs text-muted-foreground" data-testid={`ai-active-${id}`}>Active now: <b className="text-foreground">{e.provider === "GROQ" ? "Groq" : "Anthropic"} · {e.model}</b> (settings from {e.source.config}, key from {e.source.key}{e.keyLast4 ? `, ending ${e.keyLast4}` : ""}).</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Model</span>
            <Input aria-label={`${id} model`} list={`models-${id}`} value={model} onChange={(x) => setModel(x.target.value)} aria-invalid={modelBad} />
            <datalist id={`models-${id}`}>{[...new Set([...v.modelSuggestions, v.default.model])].map((m) => <option key={m} value={m} />)}</datalist>
            {modelBad && <span className="text-xs text-destructive">Use letters, digits and . _ : / - only (up to 100 characters).</span>}</label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">API key {s?.keyConfigured ? `(stored: •••• ${s.keyLast4 ?? "••••"})` : "(none stored: the server environment's key is used)"}</span>
            <Input aria-label={`${id} API key`} type="password" autoComplete="new-password" spellCheck={false} placeholder={s?.keyConfigured ? "Leave empty to keep the stored key" : "Paste a key to store it"} value={key} onChange={(x) => setKey(x.target.value)} aria-invalid={keyBad} disabled={!mkOk} />
            {keyBad ? <span className="text-xs text-destructive">A key is 8 to 512 characters with no spaces.</span> : !mkOk ? <span className="text-xs text-muted-foreground">Keys cannot be stored until a master key is set up on the server.</span> : null}</label>
        </div>
        {s?.keyConfigured && <p className="text-xs text-muted-foreground">Key updated {s.keyUpdatedAt ? fmtDateTime(s.keyUpdatedAt) : "—"} · encrypted with master key version {s.keyVersion}. A stored key is never shown again.</p>}
        <label className="flex items-center gap-2"><Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`${id} enabled`} /><span>{enabled ? "Enabled" : "Switched off (no fallback to the environment)"}</span></label>
        {s && <p className="text-xs text-muted-foreground">Last changed {fmtDateTime(s.updatedAt)}.</p>}
        {err && <Alert variant="destructive" role="alert" data-testid={`ai-error-${id}`}><AlertTitle>Not saved</AlertTitle><AlertDescription>{err}</AlertDescription></Alert>}
        {test && <Alert role="status" data-testid={`ai-test-${id}`} variant={test.ok ? "default" : "destructive"}><AlertTitle>{REASON[test.reason] ?? test.reason}</AlertTitle><AlertDescription>{test.ok ? `${test.modelCount} models available to this key. ${test.modelListed ? `“${test.model}” is available.` : `“${test.model}” was not in the list.`}` : "The check lists models only; it makes no paid request."} ({test.ms} ms)</AlertDescription></Alert>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save(key ? { apiKey: key } : {}, key ? "Saved; the key was replaced" : "Saved")} disabled={!!busy || modelBad || keyBad || !dirty}>{busy === "save" && <Spinner />}Save {LABEL[id].title}</Button>
          <Button variant="outline" onClick={() => void runTest()} disabled={!!busy || keyBad}>{busy === "test" && <Spinner />}Test key</Button>
          {s?.keyConfigured && <Button variant="outline" onClick={() => void save({ apiKey: null }, "Stored key removed")} disabled={!!busy}>Remove stored key</Button>}
          {s && <Button variant="ghost" onClick={() => void reset()} disabled={!!busy}>Reset to environment</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

/** Platform AI administration: provider, model, key and on/off per purpose, and the global switch. Keys are write-only: they are encrypted on the server and never shown again. */
export default function AiAdminPage() {
  const { data, error, loading, reload } = useApi<Overview>("/api/platform/ai")
  if (error instanceof ApiClientError && [401, 403].includes(error.status)) return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert>
      <Button render={<Link href="/platform" />}>Go to platform sign-in</Button>
    </div>
  )
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">AI providers and models</h1><p className="text-sm text-muted-foreground">Choose the model and key for each kind of AI work, and switch AI off. Changes are recorded in the audit log.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" render={<Link href="/platform" />}>Institutions</Button><Button variant="outline" size="sm" render={<Link href="/platform/monitoring" />}>Monitoring</Button><Button variant="outline" size="sm" render={<Link href="/platform/audit" />}>Audit log</Button></div>
      </header>
      {!!error && !data && <Alert variant="destructive" role="alert" data-testid="ai-load-error"><AlertTitle>Could not load the AI settings</AlertTitle><AlertDescription>{errText(error)}</AlertDescription></Alert>}
      {!!error && !!data && <Alert role="alert"><AlertTitle>Showing the last loaded settings</AlertTitle><AlertDescription>The refresh failed: {errText(error)}</AlertDescription></Alert>}
      {loading && !data && <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>}
      {data && (
        <>
          {data.warnings.length > 0 && <Alert role="status" data-testid="ai-warnings"><AlertTitle>Needs attention</AlertTitle><AlertDescription><ul className="list-disc pl-4">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></AlertDescription></Alert>}
          <GlobalCard key={`${data.global.enabled}|${data.global.updatedAt}`} data={data} reload={reload} />
          <div className="grid gap-4 lg:grid-cols-2">{data.purposes.map((p) => <PurposeCard key={`${p.purpose}|${p.stored?.updatedAt ?? "none"}`} v={p} mkOk={data.masterKey.configured} reload={reload} />)}</div>
        </>
      )}
      <UsagePanel />
    </div>
  )
}
