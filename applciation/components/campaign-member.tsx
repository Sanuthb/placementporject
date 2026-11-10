"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { KIND_LABEL, PLAN_KINDS } from "@/lib/campaign"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Item = { id: string; day: number; dueAt: string; kind: string; title: string; detail: string | null; skill: string | null; optional: boolean; status: string; autoDone: boolean; source: string }
type Member = {
  id: string; status: string; student: { id: string; name: string; enrollmentNo: string; email: string; department: { name: string } }; group: { name: string } | null; addedManually: boolean
  gapReport: { score: number; explanation: string[]; skills: { matched: string[]; partial: string[]; missing: string[] }; mandatory: { status: string; met: number; total: number } } | null
  invitedAt: string | null; respondedAt: string | null; declineReason: string | null; startedAt: string | null; help: { note: string | null; at: string; response: string | null; respondedAt: string | null } | null; markedReady: boolean
  progress: { total: number; done: number; percent: number; overdue: number; expectedPercent: number; behind: boolean; ready: boolean }; items: Item[]; events: { action: string; at: string; by: string }[]
}
const ST: Record<string, "default" | "secondary" | "destructive" | "outline"> = { DONE: "default", PENDING: "outline", SKIPPED: "secondary" }

/** One candidate in a campaign: how they matched, their plan (editable), support request, readiness and history. */
export function CampaignMember({ campaignId, memberId, canManage, days, onClose, onChanged }: { campaignId: string; memberId: string; canManage: boolean; days: number; onClose: () => void; onChanged: () => void }) {
  const base = `/api/campaigns/${campaignId}/members/${memberId}`
  const { data: m, reload } = useApi<Member>(base)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [reply, setReply] = React.useState("")
  const [add, setAdd] = React.useState({ title: "", day: "1", kind: "PRACTICE", skill: "" })
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload(); onChanged() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const set = (iid: string, body: object, ok?: string) => run(iid, () => api(`${base}/plan/${iid}`, { method: "PATCH", body }), ok)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{m ? m.student.name : "Loading"}</SheetTitle></SheetHeader>
        {!m ? <Skeleton className="m-4 h-64" /> : (
          <div className="flex flex-col gap-4 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">{m.student.department.name} · {m.student.enrollmentNo}{m.group ? ` · ${m.group.name}` : ""}</span><Badge variant="outline">{titleCase(m.status)}</Badge>{m.addedManually && <Badge variant="secondary">Added by hand</Badge>}{m.progress.behind && <Badge variant="destructive">Behind</Badge>}{(m.markedReady || m.progress.ready) && <Badge>Ready</Badge>}</div>
            {m.declineReason && <Alert><AlertTitle>Declined</AlertTitle><AlertDescription>{m.declineReason}</AlertDescription></Alert>}
            <div className="flex items-center gap-2"><Progress value={m.progress.percent} /><span className="w-40 text-xs text-muted-foreground">{m.progress.done} of {m.progress.total} done{m.progress.overdue ? `, ${m.progress.overdue} late` : ""}</span></div>

            {m.help && (
              <Alert variant={m.help.respondedAt ? "default" : "destructive"}><AlertTitle>{m.help.respondedAt ? "Support request answered" : "Asked for support"}</AlertTitle>
                <AlertDescription className="flex flex-col gap-2"><span>&ldquo;{m.help.note}&rdquo; ({fmtDateTime(m.help.at)})</span>{m.help.response && <span>Answer: {m.help.response}</span>}
                  <div className="flex gap-2"><Input aria-label="Your answer" placeholder={m.help.respondedAt ? "Add another answer" : "Your answer"} value={reply} onChange={(e) => setReply(e.target.value)} /><Button size="sm" disabled={busy === "help" || reply.trim().length < 3} onClick={() => run("help", async () => { await api(`${base}/help`, { method: "POST", body: { response: reply } }); setReply("") }, "Answer sent")}>Answer</Button></div></AlertDescription></Alert>
            )}

            {m.gapReport && (
              <div className="flex flex-col gap-1"><h3 className="font-medium">Skill gap report when invited: {m.gapReport.score}%</h3>
                <div className="flex flex-wrap gap-1">{m.gapReport.skills.matched.map((s) => <Badge key={s}>{s}</Badge>)}{m.gapReport.skills.partial.map((s) => <Badge key={s} variant="secondary">{s} (partly)</Badge>)}{m.gapReport.skills.missing.map((s) => <Badge key={s} variant="destructive">{s} (missing)</Badge>)}</div>
                <ul className="list-disc pl-5 text-muted-foreground">{m.gapReport.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between"><h3 className="font-medium">Plan</h3>
                {canManage && (m.status === "INVITED" || m.status === "ACCEPTED" || m.status === "SELECTED") && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("regen", () => api(`${base}/plan/regenerate`, { method: "POST" }), "Plan made again from how they match now")}>{busy === "regen" && <Spinner />}Make the plan again</Button>}</div>
              {m.items.map((it) => (
                <div key={it.id} className="flex flex-col gap-1 rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Day {it.day}</Badge><Badge variant="secondary">{KIND_LABEL[it.kind as keyof typeof KIND_LABEL] ?? it.kind}</Badge><span className="font-medium">{it.title}</span>{it.optional && <Badge variant="outline">Optional</Badge>}<Badge variant={ST[it.status]}>{titleCase(it.status)}{it.autoDone ? " (automatic)" : ""}</Badge>{it.source === "STAFF" && <span className="text-xs text-muted-foreground">edited by staff</span>}</div>
                  {it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">due {fmtDate(it.dueAt)}
                    {it.status !== "DONE" && <Button size="sm" variant="ghost" onClick={() => set(it.id, { status: "DONE" }, "Marked done")}>Mark done</Button>}
                    {it.status === "PENDING" && <Button size="sm" variant="ghost" onClick={() => set(it.id, { status: "SKIPPED" })}>Skip</Button>}
                    {it.status !== "PENDING" && <Button size="sm" variant="ghost" onClick={() => set(it.id, { status: "PENDING" })}>Reopen</Button>}
                    {it.day < days && <Button size="sm" variant="ghost" onClick={() => set(it.id, { day: it.day + 1 })}>Move a day later</Button>}
                    {it.day > 1 && <Button size="sm" variant="ghost" onClick={() => set(it.id, { day: it.day - 1 })}>Move a day earlier</Button>}
                    <Button size="sm" variant="ghost" onClick={() => run(it.id, () => api(`${base}/plan/${it.id}`, { method: "DELETE" }), "Removed")}>Remove</Button></div>
                </div>
              ))}
              {m.items.length === 0 && <p className="text-muted-foreground">No plan yet. It is made when the student is invited.</p>}
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run("add", async () => { await api(`${base}/plan`, { method: "POST", body: { title: add.title, kind: add.kind, day: Number(add.day), skill: add.skill || undefined } }); setAdd({ ...add, title: "" }) }, "Item added") }}>
                <Input aria-label="New plan item" className="min-w-48 flex-1" placeholder="Add an item to the plan" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
                <OptionSelect className="w-40" value={add.kind} onChange={(v) => setAdd({ ...add, kind: v })} options={PLAN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} placeholder="Kind" />
                <Input aria-label="Day" className="w-20" type="number" min={1} max={days} value={add.day} onChange={(e) => setAdd({ ...add, day: e.target.value })} />
                <Button type="submit" size="sm" variant="outline" disabled={busy === "add" || add.title.trim().length < 3}>Add</Button></form>
            </div>

            <div className="flex flex-wrap gap-2">{(m.status === "ACCEPTED") && <Button variant="outline" disabled={!!busy} onClick={() => run("ready", () => api(`${base}/ready`, { method: "POST", body: { ready: !m.markedReady } }), m.markedReady ? "Mark removed" : "Marked ready for the final interview")}>{m.markedReady ? "Take off the ready mark" : "Mark ready for the final interview"}</Button>}</div>
            <div><h3 className="mb-1 font-medium">History</h3>{m.events.map((e, i) => <div key={i} className="text-xs text-muted-foreground">{fmtDateTime(e.at)} · {e.action.replaceAll("_", " ").replaceAll(".", ": ")} ({titleCase(e.by)})</div>)}</div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
