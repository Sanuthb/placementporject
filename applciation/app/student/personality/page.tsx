"use client"

import * as React from "react"
import { toast } from "sonner"

import { DataView } from "@/components/section-review"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Instrument = { completed: boolean; consentAt: string | null; sharedWithStaff: boolean; canRetake: boolean; retakeAt: string | null; scale: { labels: string[] }; personality: { id: string; text: string }[]; aptitude: { id: string; area: string; text: string; options: string[] }[] }

const DRAFT = "personality-draft"
const RETAKE_DAYS = 180

export default function PersonalityPage() {
  const inst = useApi<Instrument>("/api/student/psychometrics/instrument")
  const result = useApi<{ completedAt: string; scores: unknown }>(inst.data?.completed ? "/api/student/psychometrics/result" : null)
  const [draft] = React.useState(() => { try { return JSON.parse(localStorage.getItem(DRAFT) ?? "null") as { p: Record<string, number>; a: Record<string, number> } | null } catch { return null } })
  const [p, setP] = React.useState<Record<string, number>>(draft?.p ?? {})
  const [a, setA] = React.useState<Record<string, number>>(draft?.a ?? {})
  const [busy, setBusy] = React.useState(false)
  const [retaking, setRetaking] = React.useState(false)
  const [del, setDel] = React.useState(false)
  React.useEffect(() => { localStorage.setItem(DRAFT, JSON.stringify({ p, a })) }, [p, a])
  if (!inst.data) return <Skeleton className="h-64" />
  const i = inst.data
  async function consent(v: boolean) {
    setBusy(true)
    try { await api("/api/student/psychometrics/consent", { method: "POST", body: { consent: v } }); inst.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function share(v: boolean) {
    try { await api("/api/student/psychometrics/sharing", { method: "POST", body: { share: v } }); inst.reload() } catch (e) { toastError(e) }
  }
  async function remove() {
    try { await api("/api/student/psychometrics/result", { method: "DELETE" }); toast.success("Your results were deleted"); setDel(false); setRetaking(false); inst.reload() } catch (e) { toastError(e) }
  }
  if (!i.consentAt) return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Before you start</CardTitle><CardDescription>Please read how this assessment works.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p><strong>Why we ask:</strong> it helps you see your strengths, work style and suggested role areas, and helps the placement office plan guidance for the batch as a whole.</p>
        <p><strong>How results are used:</strong> only for guidance and group-level analysis. They are never used to decide whether you are eligible for a drive, to block you, or to reject you.</p>
        <p><strong>Who sees them:</strong> you. The placement office sees group averages only. If you choose to share your individual result, a placement admin can open it after giving a reason, and each time is logged where you can see it.</p>
        <p><strong>Your control:</strong> you can withdraw consent, share or stop sharing, retake after {RETAKE_DAYS} days, or delete your results at any time.</p>
        <Button className="self-start" disabled={busy} onClick={() => consent(true)}>{busy && <Spinner />}I understand and agree</Button>
      </CardContent>
    </Card>
  )
  if (i.completed && !retaking) return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Your results</CardTitle><CardDescription>Only you can see these unless you share them. They are for your own guidance and are never used to block or reject you.</CardDescription></CardHeader>
        <CardContent>{result.data ? <DataView value={result.data.scores} /> : <Skeleton className="h-32" />}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your choices</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="flex items-center gap-3"><Switch id="share" checked={i.sharedWithStaff} onCheckedChange={share} /><Label htmlFor="share">Let a placement admin open my individual result (they must give a reason, and it is logged)</Label></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!i.canRetake} onClick={() => { setP({}); setA({}); setRetaking(true) }}>Retake</Button>
            <Button variant="outline" onClick={() => setDel(true)}>Delete my results</Button>
            <Button variant="outline" disabled={busy} onClick={() => consent(false)}>Withdraw consent</Button>
          </div>
          {!i.canRetake && i.retakeAt && <span className="text-muted-foreground">You can retake from {fmtDate(i.retakeAt)}.</span>}
        </CardContent>
      </Card>
      <AlertDialog open={del} onOpenChange={setDel}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete your results?</AlertDialogTitle><AlertDialogDescription>Your answers and scores are removed for good. You can take the assessment again later.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep them</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
  const complete = i.personality.every((q) => p[q.id]) && i.aptitude.every((q) => a[q.id] !== undefined)
  async function submit() {
    setBusy(true)
    try { await api("/api/student/psychometrics/attempt", { method: "POST", body: { personality: p, aptitude: a } }); toast.success("Thank you. Your results are ready."); localStorage.removeItem(DRAFT); setRetaking(false); inst.reload(); result.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Alert><AlertTitle>Personality and aptitude assessment</AlertTitle><AlertDescription>Answer honestly. There are no right or wrong answers for the first part. Your results are private to you and never affect your eligibility.</AlertDescription></Alert>
      <h2 className="text-sm font-medium">Part 1: How much do you agree?</h2>
      {i.personality.map((q) => (
        <Card key={q.id} size="sm"><CardContent className="flex flex-col gap-2 text-sm">{q.text}
          <RadioGroup className="flex flex-wrap gap-4" value={p[q.id] ? String(p[q.id]) : ""} onValueChange={(v) => setP((s) => ({ ...s, [q.id]: Number(v) }))}>
            {i.scale.labels.map((l, k) => <div key={l} className="flex items-center gap-2"><RadioGroupItem id={`${q.id}-${k}`} value={String(k + 1)} /><Label htmlFor={`${q.id}-${k}`}>{l}</Label></div>)}
          </RadioGroup></CardContent></Card>
      ))}
      <h2 className="text-sm font-medium">Part 2: Aptitude</h2>
      {i.aptitude.map((q) => (
        <Card key={q.id} size="sm"><CardContent className="flex flex-col gap-2 text-sm">{q.text}
          <RadioGroup value={a[q.id] !== undefined ? String(a[q.id]) : ""} onValueChange={(v) => setA((s) => ({ ...s, [q.id]: Number(v) }))}>
            {q.options.map((o, k) => <div key={k} className="flex items-center gap-2"><RadioGroupItem id={`${q.id}-${k}`} value={String(k)} /><Label htmlFor={`${q.id}-${k}`}>{o}</Label></div>)}
          </RadioGroup></CardContent></Card>
      ))}
      <div><span className="mr-2 text-sm text-muted-foreground">Your answers are saved on this device, so you can leave and come back.</span><Button disabled={busy || !complete} onClick={submit}>{busy && <Spinner />}Submit</Button>{!complete && <span className="ml-2 text-sm text-muted-foreground">Answer every question to submit.</span>}</div>
    </div>
  )
}
