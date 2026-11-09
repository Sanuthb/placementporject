"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { hasRole, isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Block = { id: string; source: string; reason: string; endsAt: string; status: string; student: { id: string; name: string; enrollmentNo: string } }
type Policy = { id: string; type: string; name: string; isActive: boolean; params: { threshold?: number; blockDays?: number; windowDays?: number } }
type Stu = { id: string; name: string; enrollmentNo: string }

export default function BlockingPage() {
  const { state } = useAuth()
  const profile = state.status === "ready" ? state.profile : undefined
  const canEdit = !profile || !isCoordinatorOnly(profile)
  const isAdmin = !!profile && hasRole(profile, "TPO_ADMIN")
  const blocks = useApi<{ items: Block[] }>("/api/blocking/blocks", { state: "active", limit: 100 })
  const policies = useApi<Policy[]>(canEdit ? "/api/blocking/policies" : null)
  const [lift, setLift] = React.useState<Block | null>(null)
  const [reason, setReason] = React.useState("")
  const [manual, setManual] = React.useState(false)
  const [policyOpen, setPolicyOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function doLift() {
    setBusy(true)
    try { await api(`/api/blocking/blocks/${lift!.id}/lift`, { method: "POST", body: { reason: reason.trim() } }); toast.success("Block lifted"); setLift(null); setReason(""); blocks.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function runNow() {
    setBusy(true)
    try { await api("/api/blocking/evaluate", { method: "POST" }); toast.success("Policies applied"); blocks.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function togglePolicy(p: Policy) {
    try { await api(`/api/blocking/policies/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } }); policies.reload() } catch (e) { toastError(e) }
  }

  return (
    <Tabs defaultValue="blocks">
      <TabsList><TabsTrigger value="blocks">Active blocks</TabsTrigger>{canEdit && <TabsTrigger value="policies">Policies</TabsTrigger>}</TabsList>
      <TabsContent value="blocks" className="flex flex-col gap-3">
        {canEdit && <div><Button onClick={() => setManual(true)}>Add a block</Button></div>}
        {blocks.loading && !blocks.data ? <Skeleton className="h-40" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Source</TableHead><TableHead>Until</TableHead>{canEdit && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {blocks.data?.items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.student.name}<div className="text-xs text-muted-foreground">{b.student.enrollmentNo}</div></TableCell>
                  <TableCell>{b.reason}</TableCell>
                  <TableCell><Badge variant="outline">{titleCase(b.source)}</Badge></TableCell>
                  <TableCell>{fmtDate(b.endsAt)}</TableCell>
                  {canEdit && <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setLift(b)}>Lift</Button></TableCell>}
                </TableRow>
              ))}
              {blocks.data?.items.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No active blocks.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      {canEdit && (
        <TabsContent value="policies" className="flex flex-col gap-3">
          <div className="flex gap-2">
            {isAdmin && <Button onClick={() => setPolicyOpen(true)}>Add policy</Button>}
            {isAdmin && <Button variant="outline" disabled={busy} onClick={runNow}>{busy && <Spinner />}Apply policies now</Button>}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Policy</TableHead><TableHead>Rule</TableHead><TableHead>State</TableHead>{isAdmin && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {policies.data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.type === "MISSED_DRIVES" ? `Block for ${p.params.blockDays} days after ${p.params.threshold} missed drives${p.params.windowDays ? ` within ${p.params.windowDays} days` : ""}` : "Placed students are blocked from lower-tier drives"}</TableCell>
                  <TableCell><Badge variant={p.isActive ? "default" : "outline"}>{p.isActive ? "On" : "Off"}</Badge></TableCell>
                  {isAdmin && <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => togglePolicy(p)}>{p.isActive ? "Turn off" : "Turn on"}</Button></TableCell>}
                </TableRow>
              ))}
              {policies.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No policies yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">Policies are applied automatically every day.</p>
        </TabsContent>
      )}

      <Dialog open={!!lift} onOpenChange={(o) => !o && setLift(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lift block for {lift?.student.name}</DialogTitle><DialogDescription>The reason is required and is logged as an override.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="r">Reason</FieldLabel><Textarea id="r" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button disabled={busy || reason.trim().length < 5} onClick={doLift}>{busy && <Spinner />}Lift block</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ManualBlockDialog open={manual} onOpenChange={setManual} onDone={blocks.reload} />
      <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} onDone={policies.reload} />
    </Tabs>
  )
}

function ManualBlockDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [q, setQ] = React.useState("")
  const search = React.useDeferredValue(q)
  const found = useApi<{ items: Stu[] }>(open && search.length >= 2 ? "/api/students" : null, { q: search, limit: 10 })
  const [student, setStudent] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!student) { toast.error("Choose a student"); return }
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api("/api/blocking/blocks", { method: "POST", body: { studentId: student, reason: f.get("reason"), endsAt: new Date(`${f.get("endsAt")}T23:59:59`).toISOString() } }); toast.success("Student blocked"); onOpenChange(false); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Block a student</DialogTitle><DialogDescription>They are told when and why they are blocked.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="find">Find student</FieldLabel><Input id="find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or enrollment number" /></Field>
            {found.data && <Field><OptionSelect className="w-full" value={student} onChange={setStudent} options={found.data.items.map((s) => ({ value: s.id, label: `${s.name} (${s.enrollmentNo})` }))} placeholder="Choose from results" /></Field>}
            <Field><FieldLabel htmlFor="reason2">Reason</FieldLabel><Textarea id="reason2" name="reason" minLength={3} required /></Field>
            <Field><FieldLabel htmlFor="endsAt">Blocked until</FieldLabel><Input id="endsAt" name="endsAt" type="date" required /></Field>
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Block student</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PolicyDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [type, setType] = React.useState("MISSED_DRIVES")
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const win = String(f.get("windowDays") ?? "")
    const params = type === "MISSED_DRIVES" ? { threshold: Number(f.get("threshold")), blockDays: Number(f.get("blockDays")), ...(win ? { windowDays: Number(win) } : {}) } : {}
    setBusy(true)
    try { await api("/api/blocking/policies", { method: "POST", body: { type, name: f.get("name"), params } }); toast.success("Policy added"); onOpenChange(false); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a blocking policy</DialogTitle></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel>Type</FieldLabel><OptionSelect className="w-full" value={type} onChange={setType} options={[{ value: "MISSED_DRIVES", label: "Block after missed drives" }, { value: "PLACED_LOWER_TIER", label: "Placed students and lower-tier drives" }]} placeholder="Type" /></Field>
            <Field><FieldLabel htmlFor="pname">Name</FieldLabel><Input id="pname" name="name" minLength={2} required /></Field>
            {type === "MISSED_DRIVES" && (
              <>
                <Field><FieldLabel htmlFor="threshold">Missed drives before blocking</FieldLabel><Input id="threshold" name="threshold" type="number" min={1} required /></Field>
                <Field><FieldLabel htmlFor="blockDays">Block for (days)</FieldLabel><Input id="blockDays" name="blockDays" type="number" min={1} required /></Field>
                <Field><FieldLabel htmlFor="windowDays">Only count the last (days, optional)</FieldLabel><Input id="windowDays" name="windowDays" type="number" min={1} /></Field>
              </>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Add policy</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
