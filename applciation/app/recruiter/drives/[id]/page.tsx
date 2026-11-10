"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { MatchEvidence, type Param, type Req } from "@/components/match-evidence"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = { id: string; role: string; jobType: string; status: string; location: string | null; driveDate: string; venue: string | null; description: string | null; rounds: { id: string; order: number; type: string; scheduledAt: string | null; venue: string | null }[]; applications: Record<string, number> }
type Cand = { id: string; currentRound: number; clearedAllRounds: boolean; student: { id: string; name: string; enrollmentNo: string; email: string; department: string; cgpa: number | null } }
type Slot = { id: string; startsAt: string; endsAt: string; status: string; round: { order: number; type: string }; panel: { name: string; room: string | null } | null; candidate: { name: string } }
type Fb = { onStudents: string | null; onProcess: string | null; improvements: string | null }

export default function RecruiterDrivePage() {
  const { id } = useParams<{ id: string }>()
  const d = useApi<Drive>(`/api/recruiter/drives/${id}`)
  const [round, setRound] = React.useState("")
  const cands = useApi<Cand[]>(`/api/recruiter/drives/${id}/candidates`, { roundId: round })
  const [why, setWhy] = React.useState<string | null>(null)
  const match = useApi<{ available: boolean; score?: number; parameters?: Param[]; requirements?: Req[]; explanation?: string[]; skills?: { matched: string[]; partial: string[]; missing: string[] } }>(why ? `/api/recruiter/drives/${id}/candidates/${why}/match` : null)
  const slots = useApi<Slot[]>(`/api/recruiter/drives/${id}/schedule`)
  const fb = useApi<Fb>(`/api/recruiter/drives/${id}/feedback`)
  const [busy, setBusy] = React.useState(false)
  if (!d.data) return <Skeleton className="h-64" />
  async function saveFb(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api(`/api/recruiter/drives/${id}/feedback`, { method: "PUT", body: { onStudents: f.get("onStudents"), onProcess: f.get("onProcess"), improvements: f.get("improvements") } }); toast.success("Feedback saved") } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-xl">{d.data.role}</CardTitle><CardDescription>{titleCase(d.data.jobType)} · {fmtDate(d.data.driveDate)}{d.data.venue ? ` · ${d.data.venue}` : ""}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{Object.entries(d.data.applications).map(([k, v]) => <Badge key={k} variant="secondary">{titleCase(k)}: {v}</Badge>)}</CardContent>
      </Card>
      <Tabs defaultValue="candidates">
        <TabsList><TabsTrigger value="candidates">Candidates</TabsTrigger><TabsTrigger value="schedule">Schedule</TabsTrigger><TabsTrigger value="feedback">Feedback</TabsTrigger></TabsList>
        <TabsContent value="candidates" className="flex flex-col gap-3">
          <OptionSelect className="w-56" value={round} onChange={setRound} options={[{ value: "", label: "All shortlisted" }, ...d.data.rounds.map((r) => ({ value: r.id, label: `Round ${r.order}: ${titleCase(r.type)}` }))]} placeholder="Round" />
          <Table>
            <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Department</TableHead><TableHead>CGPA</TableHead><TableHead>Round</TableHead><TableHead className="text-right">Resume</TableHead></TableRow></TableHeader>
            <TableBody>
              {cands.data?.map((c) => <TableRow key={c.id}><TableCell>{c.student.name}<div className="text-xs text-muted-foreground">{c.student.email}</div></TableCell><TableCell>{c.student.department}</TableCell><TableCell>{c.student.cgpa ?? "—"}</TableCell><TableCell>{c.clearedAllRounds ? "Cleared all" : c.currentRound}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setWhy(c.student.id)}>Why they match</Button><Button size="sm" variant="outline" onClick={() => download(`/api/recruiter/drives/${id}/candidates/${c.student.id}/resume.pdf`).catch(toastError)}>Download</Button></div></TableCell></TableRow>)}
              {cands.data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No shortlisted candidates yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="schedule">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Candidate</TableHead><TableHead>Round</TableHead><TableHead>Panel</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {slots.data?.map((s) => <TableRow key={s.id}><TableCell>{fmtDateTime(s.startsAt)}</TableCell><TableCell>{s.candidate.name}</TableCell><TableCell>{s.round.order}. {titleCase(s.round.type)}</TableCell><TableCell>{s.panel ? `${s.panel.name}${s.panel.room ? `, ${s.panel.room}` : ""}` : "—"}</TableCell><TableCell>{titleCase(s.status)}</TableCell></TableRow>)}
              {slots.data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No interviews scheduled yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="feedback">
          {fb.data && (
            <form onSubmit={saveFb} className="max-w-2xl">
              <FieldGroup>
                <Field><FieldLabel htmlFor="onStudents">About the students</FieldLabel><Textarea id="onStudents" name="onStudents" defaultValue={fb.data.onStudents ?? ""} /></Field>
                <Field><FieldLabel htmlFor="onProcess">About the process</FieldLabel><Textarea id="onProcess" name="onProcess" defaultValue={fb.data.onProcess ?? ""} /></Field>
                <Field><FieldLabel htmlFor="improvements">What to improve next year</FieldLabel><Textarea id="improvements" name="improvements" defaultValue={fb.data.improvements ?? ""} /></Field>
                <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Save feedback</Button></Field>
              </FieldGroup>
            </form>
          )}
        </TabsContent>
      </Tabs>
      {why && (
        <Dialog open onOpenChange={(o) => !o && setWhy(null)}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Why this candidate matches{match.data?.score !== undefined ? `: ${match.data.score}%` : ""}</DialogTitle></DialogHeader>
          {!match.data ? <Skeleton className="h-40" /> : !match.data.available ? <p className="text-sm text-muted-foreground">This drive has no approved job description, so there is no match to show.</p> : (
            <div className="flex flex-col gap-4 text-sm"><p className="text-xs text-muted-foreground">A guide from the college&apos;s records. Selection stays with you and the college.</p><ul className="list-disc pl-5">{match.data.explanation?.map((e, i) => <li key={i}>{e}</li>)}</ul><MatchEvidence parameters={match.data.parameters ?? []} requirements={match.data.requirements ?? []} /></div>
          )}
        </DialogContent></Dialog>
      )}
    </div>
  )
}
