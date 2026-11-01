"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = { id: string; role: string; company: { name: string }; rounds: { id: string; order: number; type: string }[] }
type Panel = { id: string; name: string; room: string | null; inInterview: { id: string } | null; next: { id: string; startsAt: string } | null }
type Slot = { id: string; roundId: string; panelId: string; startsAt: string; endsAt: string; status: string; rescheduleCount: number; application: { id: string; student: { name: string; enrollmentNo: string } } }
type Cand = { items: { id: string; student: { name: string; enrollmentNo: string } }[] }

export default function InterviewsPage() {
  const { id } = useParams<{ id: string }>()
  const drive = useApi<Drive>(`/api/drives/${id}`)
  const board = useApi<{ panels: Panel[]; slots: Slot[] }>(`/api/drives/${id}/slots`)
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [slotOpen, setSlotOpen] = React.useState(false)
  const [moving, setMoving] = React.useState<Slot | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function addPanel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api(`/api/drives/${id}/panels`, { method: "POST", body: { name: f.get("name"), ...(String(f.get("room")) ? { room: f.get("room") } : {}) } }); toast.success("Panel added"); setPanelOpen(false); board.reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  const setStatus = (slotId: string, status: string) => api(`/api/drives/${id}/slots/${slotId}`, { method: "PATCH", body: { status } }).then(() => board.reload(), toastError)
  const removePanel = (panelId: string) => api(`/api/drives/${id}/panels/${panelId}`, { method: "DELETE" }).then(() => { toast.success("Panel removed"); board.reload() }, toastError)
  const panelName = (pid: string) => board.data?.panels.find((p) => p.id === pid)?.name ?? "—"
  const roundLabel = (rid: string) => { const r = drive.data?.rounds.find((x) => x.id === rid); return r ? `Round ${r.order}` : "—" }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" render={<Link href={`/staff/drives/${id}`} />}>Back to drive</Button>
        <span className="font-medium">{drive.data ? `${drive.data.company.name}: ${drive.data.role}` : ""}</span>
        <Button className="ml-auto" variant="outline" onClick={() => setPanelOpen(true)}>Add panel</Button>
        <Button onClick={() => setSlotOpen(true)} disabled={!board.data?.panels.length}>Schedule an interview</Button>
      </div>

      {!board.data ? <Skeleton className="h-40" /> : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {board.data.panels.map((p) => (
              <Card key={p.id} size="sm">
                <CardHeader><CardTitle>{p.name}</CardTitle><CardDescription>{p.room ?? "No room set"}</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">{p.inInterview ? <Badge>In interview</Badge> : <Badge variant="outline">Free</Badge>}{p.next && <span className="text-muted-foreground">Next {fmtDateTime(p.next.startsAt)}</span>}</div>
                  <div><Button size="sm" variant="ghost" onClick={() => removePanel(p.id)}>Remove</Button></div>
                </CardContent>
              </Card>
            ))}
            {board.data.panels.length === 0 && <p className="text-sm text-muted-foreground">Add a panel (an interview table or room) first.</p>}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Candidate</TableHead><TableHead>Round</TableHead><TableHead>Panel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {board.data.slots.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{fmtDateTime(s.startsAt)}{s.rescheduleCount > 0 && <div className="text-xs text-muted-foreground">Moved {s.rescheduleCount}×</div>}</TableCell>
                  <TableCell>{s.application.student.name}<div className="text-xs text-muted-foreground">{s.application.student.enrollmentNo}</div></TableCell>
                  <TableCell>{roundLabel(s.roundId)}</TableCell>
                  <TableCell>{panelName(s.panelId)}</TableCell>
                  <TableCell><Badge variant={statusVariant(s.status === "COMPLETED" ? "VERIFIED" : s.status === "NO_SHOW" || s.status === "CANCELLED" ? "REJECTED" : "PENDING")}>{titleCase(s.status)}</Badge></TableCell>
                  <TableCell className="space-x-2 text-right">
                    {s.status === "SCHEDULED" && <><Button size="sm" onClick={() => setStatus(s.id, "IN_PROGRESS")}>Start</Button><Button size="sm" variant="outline" onClick={() => setMoving(s)}>Reschedule</Button><Button size="sm" variant="outline" onClick={() => setStatus(s.id, "NO_SHOW")}>No-show</Button></>}
                    {s.status === "IN_PROGRESS" && <Button size="sm" onClick={() => setStatus(s.id, "COMPLETED")}>Finish</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {board.data.slots.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No interviews scheduled.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add an interview panel</DialogTitle></DialogHeader>
          <form onSubmit={addPanel}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="pn">Name</FieldLabel><Input id="pn" name="name" required /></Field>
              <Field><FieldLabel htmlFor="pr">Room (optional)</FieldLabel><Input id="pr" name="room" /></Field>
            </FieldGroup>
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Add panel</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {drive.data && board.data && <SlotDialog open={slotOpen} onOpenChange={setSlotOpen} driveId={id} rounds={drive.data.rounds} panels={board.data.panels} onDone={board.reload} />}
      <RescheduleDialog slot={moving} onClose={() => setMoving(null)} driveId={id} panels={board.data?.panels ?? []} onDone={board.reload} />
    </div>
  )
}

const iso = (d: unknown, t: unknown) => new Date(`${d}T${t}`).toISOString()

function SlotDialog({ open, onOpenChange, driveId, rounds, panels, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; driveId: string; rounds: Drive["rounds"]; panels: Panel[]; onDone: () => void }) {
  const [round, setRound] = React.useState("")
  const [panel, setPanel] = React.useState("")
  const [app, setApp] = React.useState("")
  const cands = useApi<Cand>(open && round ? `/api/drives/${driveId}/rounds/${round}/candidates` : null)
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!round || !panel || !app) { toast.error("Choose a round, a panel and a candidate"); return }
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api(`/api/drives/${driveId}/slots`, { method: "POST", body: { roundId: round, panelId: panel, applicationId: app, startsAt: iso(f.get("date"), f.get("start")), endsAt: iso(f.get("date"), f.get("end")) } }); toast.success("Interview scheduled"); onOpenChange(false); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Schedule an interview</DialogTitle><DialogDescription>Only students shortlisted for the round can be scheduled. They are notified.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel>Round</FieldLabel><OptionSelect className="w-full" value={round} onChange={(v) => { setRound(v); setApp("") }} options={rounds.map((r) => ({ value: r.id, label: `Round ${r.order}: ${titleCase(r.type)}` }))} placeholder="Choose a round" /></Field>
            <Field><FieldLabel>Candidate</FieldLabel><OptionSelect className="w-full" value={app} onChange={setApp} options={(cands.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.student.name} (${c.student.enrollmentNo})` }))} placeholder={round ? "Choose a candidate" : "Choose a round first"} /></Field>
            <Field><FieldLabel>Panel</FieldLabel><OptionSelect className="w-full" value={panel} onChange={setPanel} options={panels.map((p) => ({ value: p.id, label: p.name }))} placeholder="Choose a panel" /></Field>
            <div className="grid grid-cols-3 gap-3"><Field><FieldLabel htmlFor="d">Date</FieldLabel><Input id="d" name="date" type="date" required /></Field><Field><FieldLabel htmlFor="s">From</FieldLabel><Input id="s" name="start" type="time" required /></Field><Field><FieldLabel htmlFor="e">To</FieldLabel><Input id="e" name="end" type="time" required /></Field></div>
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Schedule</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RescheduleDialog({ slot, onClose, driveId, panels, onDone }: { slot: Slot | null; onClose: () => void; driveId: string; panels: Panel[]; onDone: () => void }) {
  const [panel, setPanel] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api(`/api/drives/${driveId}/slots/${slot!.id}/reschedule`, { method: "POST", body: { startsAt: iso(f.get("date"), f.get("start")), endsAt: iso(f.get("date"), f.get("end")), ...(panel ? { panelId: panel } : {}), ...(String(f.get("reason")) ? { reason: f.get("reason") } : {}) } }); toast.success("Rescheduled. The student is notified."); onClose(); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reschedule {slot?.application.student.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel>Panel (optional)</FieldLabel><OptionSelect className="w-full" value={panel} onChange={setPanel} options={[{ value: "", label: "Keep the same panel" }, ...panels.map((p) => ({ value: p.id, label: p.name }))]} placeholder="Keep the same panel" /></Field>
            <div className="grid grid-cols-3 gap-3"><Field><FieldLabel htmlFor="rd">Date</FieldLabel><Input id="rd" name="date" type="date" required /></Field><Field><FieldLabel htmlFor="rs">From</FieldLabel><Input id="rs" name="start" type="time" required /></Field><Field><FieldLabel htmlFor="re">To</FieldLabel><Input id="re" name="end" type="time" required /></Field></div>
            <Field><FieldLabel htmlFor="why">Reason (optional)</FieldLabel><Input id="why" name="reason" /></Field>
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Reschedule</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
