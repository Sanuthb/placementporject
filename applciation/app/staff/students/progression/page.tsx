"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { useApi } from "@/lib/web/use-api"

type BatchRow = { id: string; name: string; isActive: boolean }
type Overview = { batch: { id: string; name: string }; unassigned: number; semesters: { id: string; number: number; name: string; status: string; academicYear: string | null; students: number }[] }
type Stu = { id: string; name: string; enrollmentNo: string }

const NOT_SET = "__none"

/** Move a whole group of a batch to its next semester. The batch stays the same; each student gets a history entry. */
export default function ProgressionPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)
  const batches = useApi<BatchRow[]>("/api/settings/batches")
  const [batchId, setBatchId] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [note, setNote] = React.useState("")
  const [left, setLeft] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  const overview = useApi<Overview>(batchId ? "/api/students/progression/overview" : null, { batchId })
  const group = useApi<{ items: Stu[]; nextCursor: string | null }>(batchId && from ? "/api/students" : null, { batchId, semesterId: from === NOT_SET ? undefined : from, limit: 100 })

  const o = overview.data
  const fromSem = o?.semesters.find((s) => s.id === from)
  const count = from === NOT_SET ? o?.unassigned ?? 0 : fromSem?.students ?? 0
  // "Not set" students are the ones with no semester yet, which the student list cannot filter for; show the count only.
  const showList = from && from !== NOT_SET
  const targets = (o?.semesters ?? []).filter((s) => from === NOT_SET || (fromSem && s.number > fromSem.number))

  function pickFrom(v: string) {
    setFrom(v); setLeft(new Set())
    const cur = o?.semesters.find((s) => s.id === v)
    setTo(cur ? o?.semesters.find((s) => s.number === cur.number + 1)?.id ?? "" : o?.semesters[0]?.id ?? "")
  }

  async function promote() {
    if (!batchId || !from || !to) return
    setBusy(true)
    try {
      const r = await api<{ promoted: number; to: string }>("/api/students/progression", { method: "POST", body: { batchId, fromSemesterId: from === NOT_SET ? null : from, toSemesterId: to, excludeIds: [...left], ...(note.trim() ? { note: note.trim() } : {}) } })
      toast.success(`${r.promoted} students moved to ${r.to}`)
      setFrom(""); setTo(""); setLeft(new Set()); setNote(""); overview.reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  if (!canEdit && state.status === "ready") return <p className="text-sm text-muted-foreground">Only administrators and placement officers can move students between semesters.</p>

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Semester progression</h1>
        <p className="text-sm text-muted-foreground">Move a group to its next semester. The batch and admission year never change, and every student keeps their earlier history. To repeat a semester, record an arrear, transfer or discontinue someone, open that student&apos;s Progression tab.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>1. Choose the batch</CardTitle></CardHeader>
        <CardContent>
          <OptionSelect className="w-full sm:w-80" value={batchId} onChange={(v) => { setBatchId(v); setFrom(""); setTo(""); setLeft(new Set()) }} options={(batches.data ?? []).filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))} placeholder="Choose a batch" />
        </CardContent>
      </Card>

      {batchId && (
        <Card>
          <CardHeader><CardTitle>2. Where are they now?</CardTitle><CardDescription>Pick the semester the group is in.</CardDescription></CardHeader>
          <CardContent>
            {!o ? <Skeleton className="h-24" /> : o.semesters.length === 0 ? (
              <p className="text-sm text-muted-foreground">This batch has no semesters. <Link href="/staff/settings#semesters" className="underline underline-offset-4">Add them in Settings</Link>.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {o.unassigned > 0 && <SemesterButton active={from === NOT_SET} onClick={() => pickFrom(NOT_SET)} title="No semester set" sub="Newly added students" count={o.unassigned} />}
                {o.semesters.map((s) => <SemesterButton key={s.id} active={from === s.id} disabled={s.students === 0} onClick={() => pickFrom(s.id)} title={s.name} sub={s.academicYear ?? "No academic year"} count={s.students} />)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {batchId && from && (
        <Card>
          <CardHeader><CardTitle>3. Move to</CardTitle><CardDescription>{count} students will move unless you leave some behind.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {targets.length === 0 ? <p className="text-sm text-muted-foreground">There is no later semester to move to. Add one in Settings first.</p> : (
              <Field><FieldLabel>Next semester</FieldLabel><OptionSelect className="w-full sm:w-80" value={to} onChange={setTo} options={targets.map((s) => ({ value: s.id, label: s.academicYear ? `${s.name} (${s.academicYear})` : s.name }))} placeholder="Choose a semester" /></Field>
            )}

            {showList && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Leave behind (for example, repeating this semester)</div>
                {!group.data ? <Skeleton className="h-20" /> : (
                  <ul className="max-h-64 overflow-y-auto rounded-xl border">
                    {group.data.items.map((st) => (
                      <li key={st.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                        <Checkbox checked={left.has(st.id)} onCheckedChange={(on) => setLeft((p) => { const n = new Set(p); if (on) n.add(st.id); else n.delete(st.id); return n })} aria-label={`Leave ${st.name} behind`} />
                        <span className="font-medium">{st.name}</span><span className="text-muted-foreground">{st.enrollmentNo}</span>
                        {left.has(st.id) && <Badge variant="secondary" className="ml-auto">Staying</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                {group.data?.nextCursor && <p className="text-xs text-muted-foreground">Showing the first 100 students. Anyone beyond that will move; to hold others back, record it on their own page afterwards.</p>}
              </div>
            )}

            <Field><FieldLabel htmlFor="note">Note (optional)</FieldLabel><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: end-of-semester promotion, results declared" /></Field>
            <div><Button disabled={busy || !to || count - left.size <= 0} onClick={promote}>{busy && <Spinner />}Move {Math.max(0, count - left.size)} students</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SemesterButton({ title, sub, count, active, disabled, onClick }: { title: string; sub: string; count: number; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active}
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}>
      <span className="min-w-0"><span className="block font-medium">{title}</span><span className="block truncate text-xs text-muted-foreground">{sub}</span></span>
      <Badge variant={active ? "default" : "secondary"}>{count}</Badge>
    </button>
  )
}
