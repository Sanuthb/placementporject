"use client"

import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import type { Result } from "@/lib/instruments/types"
import type { StudentInstrument } from "@/lib/instruments/index"

type Def = StudentInstrument & { consentAt: string | null; attempts: number; canTake: boolean; blockedReason: string | null }
type Results = { test: { key: string; title: string; caution: string; scales: { key: string; label: string }[] }; attempts: { attemptNumber: number; at: string; isCurrent: boolean; result: Result }[] }
type Forced = { most?: string; least?: string }
type Answers = Record<string, unknown>
const PAGE: Record<string, number> = { likert: 6, forced: 3, situational: 2, writing: 1 }
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

function ResultView({ r, test }: { r: Results; test: Results["test"] }) {
  const current = r.attempts.find((a) => a.isCurrent) ?? r.attempts.at(-1)
  if (!current) return null
  const prev = r.attempts.length > 1 ? r.attempts[r.attempts.length - 2] : null
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>{test.title}: your result</CardTitle><CardDescription>Taken {fmtDate(current.at)}{r.attempts.length > 1 ? ` (attempt ${current.attemptNumber})` : ""}. {current.result.headline}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Object.entries(current.result.scales).map(([k, s]) => {
            const label = test.scales.find((x) => x.key === k)?.label ?? "Overall"
            const was = prev?.result.scales[k]?.score
            return (
              <div key={k} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{label}</span><span>{s.score}%{was != null && was !== s.score && <span className="ml-2 text-xs text-muted-foreground">(was {was}%)</span>}</span></div>
                <Progress value={s.score} aria-label={label} />
                <span className="text-xs text-muted-foreground">{s.meaning}</span>
                {current.result.comments?.[k] && <span className="text-xs">Comment: {current.result.comments[k]}</span>}
              </div>
            )
          })}
        </CardContent>
      </Card>
      <Alert><AlertTitle>Please remember</AlertTitle><AlertDescription>{test.caution}</AlertDescription></Alert>
    </div>
  )
}

export default function InstrumentPage() {
  const { key } = useParams<{ key: string }>()
  const taking = useSearchParams().get("take") === "1"
  const def = useApi<Def>(`/api/student/instruments/${key}`)
  const res = useApi<Results>(`/api/student/instruments/${key}/result`)
  const draftKey = `career-test-${key}`
  const [answers, setAnswers] = React.useState<Answers>(() => { try { return JSON.parse(localStorage.getItem(draftKey) ?? "{}") as Answers } catch { return {} } })
  const [page, setPage] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)
  React.useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(answers)) } catch { /* private mode: draft is not kept */ } }, [answers, draftKey])
  if (!def.data || !res.data) return <Skeleton className="h-64" />
  const d = def.data
  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }))

  if ((!taking || done || !d.canTake) && res.data.attempts.length) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <ResultView r={res.data} test={res.data.test} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/student/tests" />}>Back to career tests</Button>
          {d.canTake && !done && <Button render={<Link href={`/student/tests/${key}?take=1`} />}>Take again</Button>}
          {!d.canTake && d.blockedReason && <span className="self-center text-xs text-muted-foreground">{d.blockedReason}</span>}
        </div>
      </div>
    )
  }
  if (!d.canTake) return <Alert className="max-w-2xl"><AlertTitle>Not available</AlertTitle><AlertDescription>{d.blockedReason ?? "You cannot take this test right now."}</AlertDescription></Alert>
  if (d.private && !d.consentAt) return <Alert className="max-w-2xl"><AlertTitle>Consent needed</AlertTitle><AlertDescription>This is a private test. <Link className="underline" href="/student/tests">Give your consent on the Career tests page</Link> first.</AlertDescription></Alert>

  const kind = d.items[0].kind, size = PAGE[kind] ?? 5
  const pages = Math.ceil(d.items.length / size)
  const slice = d.items.slice(page * size, page * size + size)
  const answered = (i: (typeof d.items)[number]) => {
    const v = answers[i.id]
    if (i.kind === "forced") { const f = v as Forced | undefined; return !!f?.most && !!f?.least && f.most !== f.least }
    if (i.kind === "writing") { const w = wordCount(String(v ?? "")); return w >= i.minWords && w <= i.maxWords }
    return v !== undefined && v !== ""
  }
  const allDone = d.items.every(answered), pageDone = slice.every(answered)

  async function submit() {
    setBusy(true)
    try {
      await api(`/api/student/instruments/${key}/attempt`, { method: "POST", body: { answers } })
      toast.success("Thank you. Your result is ready.")
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      setAnswers({}); setDone(true); res.reload(); def.reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Alert><AlertTitle>{d.title}</AlertTitle><AlertDescription>{d.instructions}</AlertDescription></Alert>
      <div className="flex flex-col gap-1"><Progress value={Math.round((d.items.filter(answered).length / d.items.length) * 100)} aria-label="Progress" /><span className="text-xs text-muted-foreground">{d.items.filter(answered).length} of {d.items.length} answered · page {page + 1} of {pages}. Your answers are saved on this device, so you can leave and come back.</span></div>

      {slice.map((it) => (
        <Card key={it.id} size="sm">
          <CardContent className="flex flex-col gap-3 text-sm">
            {it.kind === "likert" && (<>
              <span>{it.text}</span>
              <RadioGroup className="flex flex-wrap gap-4" value={answers[it.id] ? String(answers[it.id]) : ""} onValueChange={(v) => set(it.id, Number(v))}>
                {d.likertLabels.map((l, k) => <div key={l} className="flex items-center gap-2"><RadioGroupItem id={`${it.id}-${k}`} value={String(k + 1)} /><Label htmlFor={`${it.id}-${k}`}>{l}</Label></div>)}
              </RadioGroup>
            </>)}
            {it.kind === "situational" && (<>
              <span className="font-medium">{it.text}</span>
              <RadioGroup value={String(answers[it.id] ?? "")} onValueChange={(v) => set(it.id, v)}>
                {it.options.map((o) => <div key={o.id} className="flex items-start gap-2"><RadioGroupItem id={o.id} value={o.id} /><Label htmlFor={o.id} className="font-normal">{o.text}</Label></div>)}
              </RadioGroup>
            </>)}
            {it.kind === "forced" && (<>
              <span className="text-muted-foreground">{it.prompt}</span>
              <div className="flex flex-col gap-2">
                {it.options.map((o) => {
                  const f = (answers[it.id] ?? {}) as Forced
                  return (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
                      <span className="min-w-0 flex-1">{o.text}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant={f.most === o.id ? "default" : "outline"} aria-pressed={f.most === o.id} onClick={() => set(it.id, { ...f, most: o.id, least: f.least === o.id ? undefined : f.least })}>Most like me</Button>
                        <Button size="sm" variant={f.least === o.id ? "destructive" : "outline"} aria-pressed={f.least === o.id} onClick={() => set(it.id, { ...f, least: o.id, most: f.most === o.id ? undefined : f.most })}>Least like me</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>)}
            {it.kind === "writing" && (<>
              <span className="font-medium">{it.prompt}</span>
              <Textarea rows={10} aria-label="Your answer" value={String(answers[it.id] ?? "")} onChange={(e) => set(it.id, e.target.value)} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{wordCount(String(answers[it.id] ?? ""))} words (write {it.minWords} to {it.maxWords})</span>
                <span>Marked on: {it.criteria.map((c) => c.label).join(", ")}</span>
              </div>
            </>)}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {page > 0 && <Button variant="outline" onClick={() => setPage(page - 1)}>Back</Button>}
        {page < pages - 1 && <Button disabled={!pageDone} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }) }}>Next</Button>}
        {page === pages - 1 && <Button disabled={busy || !allDone} onClick={submit}>{busy && <Spinner />}{kind === "writing" ? "Submit for marking" : "See my result"}</Button>}
        {!pageDone && <span className="text-xs text-muted-foreground">Answer every question on this page to continue.</span>}
      </div>
      {d.items.length > 0 && <Badge variant="outline" className="self-start">Takes about {d.minutes} minutes</Badge>}
    </div>
  )
}
