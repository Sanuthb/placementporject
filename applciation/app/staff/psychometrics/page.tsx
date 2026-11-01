"use client"

import * as React from "react"
import { toast } from "sonner"

import { DataView } from "@/components/section-review"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useAuth } from "@/lib/web/auth"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Completion = { total: number; completed: number; pending: number; students: { id: string; name: string; enrollmentNo: string; completed: boolean; completedAt: string | null }[] }
type Group = { name: string; hidden: boolean; reason?: string; students?: number; [k: string]: unknown }

type Entry = { id: string; at: string; reason: string; staff: { name: string } | null; student: { name: string; enrollmentNo: string } | null }

export default function PsychometricsPage() {
  const { state } = useAuth()
  const isAdmin = state.status === "ready" && state.profile.role === "TPO_ADMIN"
  const log = useApi<Entry[]>(isAdmin ? "/api/psychometrics/access-log" : null)
  const [who, setWho] = React.useState<{ id: string; name: string } | null>(null)
  const [reason, setReason] = React.useState("")
  const [shown, setShown] = React.useState<unknown>(null)
  const [looking, setLooking] = React.useState(false)
  async function open() {
    setLooking(true)
    try { setShown(await api(`/api/psychometrics/students/${who!.id}/result`, { query: { reason: reason.trim() } })); log.reload() } catch (e) { toastError(e) } finally { setLooking(false) }
  }
  const close = () => { setWho(null); setReason(""); setShown(null) }
  const lk = useLookups()
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const comp = useApi<Completion>("/api/psychometrics/completion", { departmentId: dept, batchId: batch, limit: 200 })
  const cohort = useApi<{ overall: Group; groups: Group[] }>("/api/psychometrics/cohort", { departmentId: dept, batchId: batch, groupBy: "department" })

  async function remind() {
    setBusy(true)
    try { const r = await api<{ sent?: number }>("/api/psychometrics/reminders", { method: "POST", body: { ...(dept ? { departmentId: dept } : {}), ...(batch ? { batchId: batch } : {}) } }); toast.success(`Reminders sent${r?.sent !== undefined ? ` to ${r.sent} students` : ""}`) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <OptionSelect className="w-44" value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="Department" />
      <OptionSelect className="w-40" value={batch} onChange={setBatch} options={[{ value: "", label: "All batches" }, ...lk.batches]} placeholder="Batch" />
    </div>
  )
  return (
    <Tabs defaultValue="completion">
      <TabsList><TabsTrigger value="completion">Who has completed it</TabsTrigger><TabsTrigger value="cohort">Cohort results</TabsTrigger>{isAdmin && <TabsTrigger value="log">Access log</TabsTrigger>}</TabsList>
      <TabsContent value="completion" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">{filters}<Button className="ml-auto" variant="outline" disabled={busy} onClick={remind}>{busy && <Spinner />}Remind students who have not finished</Button></div>
        {!comp.data ? <Skeleton className="h-40" /> : (
          <>
            <div className="flex gap-2"><Badge>{comp.data.completed} completed</Badge><Badge variant="secondary">{comp.data.pending} pending</Badge></div>
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead><TableHead>Completed</TableHead>{isAdmin && <TableHead className="text-right">Result</TableHead>}</TableRow></TableHeader>
              <TableBody>{comp.data.students.map((s) => <TableRow key={s.id}><TableCell>{s.name}<div className="text-xs text-muted-foreground">{s.enrollmentNo}</div></TableCell><TableCell><Badge variant={s.completed ? "default" : "outline"}>{s.completed ? "Done" : "Pending"}</Badge></TableCell><TableCell>{fmtDateTime(s.completedAt)}</TableCell>{isAdmin && <TableCell className="text-right">{s.completed && <Button size="sm" variant="outline" onClick={() => setWho({ id: s.id, name: s.name })}>View</Button>}</TableCell>}</TableRow>)}</TableBody>
            </Table>
          </>
        )}
      </TabsContent>
      <TabsContent value="cohort" className="flex flex-col gap-3">
        {filters}
        <p className="text-sm text-muted-foreground">Group averages only. Groups with fewer than five students are hidden to protect privacy, and results are never used to block or reject a student.</p>
        {!cohort.data ? <Skeleton className="h-40" /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {[cohort.data.overall, ...cohort.data.groups].map((g) => {
              const { name, hidden, reason, ...rest } = g
              return <Card key={name}><CardHeader><CardTitle>{name}</CardTitle><CardDescription>{hidden ? reason : `${g.students} students`}</CardDescription></CardHeader>{!hidden && <CardContent><DataView value={rest} /></CardContent>}</Card>
            })}
          </div>
        )}
      </TabsContent>
      {isAdmin && (
        <TabsContent value="log">
          <p className="pb-2 text-sm text-muted-foreground">Every time staff open an individual result, who and why is recorded here.</p>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Opened by</TableHead><TableHead>Student</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
            <TableBody>
              {log.data?.map((e) => <TableRow key={e.id}><TableCell>{fmtDateTime(e.at)}</TableCell><TableCell>{e.staff?.name ?? "—"}</TableCell><TableCell>{e.student?.name}<div className="text-xs text-muted-foreground">{e.student?.enrollmentNo}</div></TableCell><TableCell className="text-muted-foreground">{e.reason}</TableCell></TableRow>)}
              {log.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No results have been opened.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>
      )}
      <Dialog open={!!who} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{who?.name}: personality result</DialogTitle><DialogDescription>Individual results are for guidance only. Opening one is logged with your reason.</DialogDescription></DialogHeader>
          {shown === null ? (
            <>
              <Field><FieldLabel htmlFor="why">Why do you need this result?</FieldLabel><Textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <DialogFooter><Button disabled={looking || reason.trim().length < 5} onClick={open}>{looking && <Spinner />}Open result</Button></DialogFooter>
            </>
          ) : <DataView value={shown} />}
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}