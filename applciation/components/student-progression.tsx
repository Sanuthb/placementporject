"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Kind = "PROMOTED" | "REPEATED" | "ARREAR" | "TRANSFERRED" | "DISCONTINUED"
type Me = { id: string; batchId: string; currentSemesterId: string | null; isActive: boolean }
type Sem = { id: string; number: number; name: string }
type Hist = { id: string; kind: string; note: string | null; createdAt: string; semester: string | null; batch: string | null; academicYear: string | null; by: string | null }
type BatchRow = { id: string; name: string; isActive: boolean; program: { name: string } | null }

const LABEL: Record<Kind, string> = { PROMOTED: "Move to a semester", REPEATED: "Repeat a semester", ARREAR: "Record an arrear", TRANSFERRED: "Transfer to another batch", DISCONTINUED: "Discontinue" }
const HELP: Record<Kind, string> = {
  PROMOTED: "Moves the student forward in the same batch. Earlier semesters stay in the history.",
  REPEATED: "Puts the student back in a semester they are repeating. The batch does not change.",
  ARREAR: "Adds a note to the history. The student stays where they are.",
  TRANSFERRED: "Moves the student to a different batch. Only an administrator can do this, and a reason is required.",
  DISCONTINUED: "Deactivates the student and blocks their login. The record and history are kept.",
}
const kindVariant = (k: string) => (k === "DISCONTINUED" ? "destructive" : k === "ENROLLED" || k === "PROMOTED" ? "default" : "secondary")

/** A student's semester history, with the actions that add to it. History is never rewritten. */
export function ProgressionPanel({ studentId, canEdit, isAdmin }: { studentId: string; canEdit: boolean; isAdmin: boolean }) {
  const me = useApi<Me>(`/api/students/${studentId}`)
  const hist = useApi<Hist[]>(`/api/students/${studentId}/progression`)
  const sems = useApi<Sem[]>(me.data ? "/api/settings/semesters" : null, { batchId: me.data?.batchId })
  const [kind, setKind] = React.useState<Kind | null>(null)

  const current = sems.data?.find((s) => s.id === me.data?.currentSemesterId)
  const done = () => { setKind(null); hist.reload(); me.reload() }

  if (!me.data || !hist.data) return <Skeleton className="h-40 rounded-xl" />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="text-muted-foreground">Current semester</div>
          <div className="text-lg font-semibold">{current?.name ?? "Not set"}{!me.data.isActive && <Badge variant="destructive" className="ml-2">Deactivated</Badge>}</div>
        </div>
        {canEdit && me.data.isActive && (
          <div className="flex flex-wrap gap-2">
            {(["PROMOTED", "REPEATED", "ARREAR"] as Kind[]).map((k) => <Button key={k} variant="outline" size="sm" onClick={() => setKind(k)}>{LABEL[k]}</Button>)}
            {isAdmin && <Button variant="outline" size="sm" onClick={() => setKind("TRANSFERRED")}>{LABEL.TRANSFERRED}</Button>}
            <Button variant="outline" size="sm" onClick={() => setKind("DISCONTINUED")}>{LABEL.DISCONTINUED}</Button>
          </div>
        )}
      </div>

      {hist.data.length === 0 ? <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No history yet.</p> : (
        <ol className="flex flex-col gap-0 border-l pl-4">
          {hist.data.map((h) => (
            <li key={h.id} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={kindVariant(h.kind)}>{titleCase(h.kind)}</Badge>
                <span className="font-medium">{h.semester ?? "No semester"}</span>
                {h.batch && <span className="text-muted-foreground">{h.batch}</span>}
                {h.academicYear && <span className="text-muted-foreground">· {h.academicYear}</span>}
              </div>
              {h.note && <p className="mt-0.5 text-sm text-muted-foreground">{h.note}</p>}
              <p className="text-xs text-muted-foreground">{fmtDateTime(h.createdAt)}{h.by ? ` · ${h.by}` : ""}</p>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={!!kind} onOpenChange={(o) => { if (!o) setKind(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{kind && LABEL[kind]}</DialogTitle><DialogDescription>{kind && HELP[kind]}</DialogDescription></DialogHeader>
          {kind && <MoveForm key={kind} kind={kind} studentId={studentId} me={me.data} sems={sems.data ?? []} onDone={done} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MoveForm({ kind, studentId, me, sems, onDone }: { kind: Kind; studentId: string; me: Me; sems: Sem[]; onDone: () => void }) {
  const cur = sems.find((s) => s.id === me.currentSemesterId)
  const next = sems.find((s) => s.number === (cur?.number ?? 0) + 1)
  const [semesterId, setSemesterId] = React.useState(kind === "REPEATED" ? me.currentSemesterId ?? "" : next?.id ?? "")
  const [batchId, setBatchId] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const batches = useApi<BatchRow[]>(kind === "TRANSFERRED" ? "/api/settings/batches" : null)
  const targetSems = useApi<Sem[]>(kind === "TRANSFERRED" && batchId ? "/api/settings/semesters" : null, { batchId })
  const semOptions = (kind === "TRANSFERRED" ? targetSems.data ?? [] : sems).filter((s) => kind !== "PROMOTED" || s.id !== me.currentSemesterId).map((s) => ({ value: s.id, label: s.name }))
  const noteRequired = kind !== "PROMOTED" && kind !== "REPEATED"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if ((kind === "PROMOTED" || kind === "REPEATED") && !semesterId) return toast.error("Choose the semester")
    if (kind === "TRANSFERRED" && !batchId) return toast.error("Choose the batch")
    if (noteRequired && note.trim().length < 3) return toast.error(kind === "ARREAR" ? "Say which subject or semester has the arrear" : "Give a reason")
    setBusy(true)
    try {
      await api(`/api/students/${studentId}/progression`, { method: "POST", body: { kind, ...(semesterId && kind !== "ARREAR" && kind !== "DISCONTINUED" ? { semesterId } : {}), ...(kind === "TRANSFERRED" ? { batchId } : {}), ...(note.trim() ? { note: note.trim() } : {}) } })
      toast.success("Recorded")
      onDone()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {kind === "TRANSFERRED" && (
        <Field><FieldLabel>New batch</FieldLabel>
          <OptionSelect className="w-full" value={batchId} onChange={(v) => { setBatchId(v); setSemesterId("") }} options={(batches.data ?? []).filter((b) => b.isActive && b.id !== me.batchId).map((b) => ({ value: b.id, label: b.program ? `${b.name} (${b.program.name})` : b.name }))} placeholder="Choose a batch" /></Field>
      )}
      {(kind === "PROMOTED" || kind === "REPEATED" || kind === "TRANSFERRED") && (
        <Field><FieldLabel>{kind === "TRANSFERRED" ? "Semester in the new batch (optional)" : "Semester"}</FieldLabel>
          <OptionSelect className="w-full" value={semesterId} onChange={setSemesterId} options={semOptions} placeholder={kind === "TRANSFERRED" && !batchId ? "Choose a batch first" : "Choose a semester"} /></Field>
      )}
      <Field><FieldLabel htmlFor="note">{noteRequired ? (kind === "ARREAR" ? "Subject or semester" : "Reason") : "Note (optional)"}</FieldLabel><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <DialogFooter><Button type="submit" variant={kind === "DISCONTINUED" ? "destructive" : "default"} disabled={busy}>{busy && <Spinner />}{kind === "DISCONTINUED" ? "Discontinue student" : "Save"}</Button></DialogFooter>
    </form>
  )
}
