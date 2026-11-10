"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { StudentIntelligence } from "@/components/student-intelligence"
import { OnboardingReview } from "@/components/onboarding-review"
import { VerificationHistory } from "@/components/staff-extras"
import { AcademicRecordsPanel, DocumentsPanel, EducationPanel } from "@/components/student-academic"
import { ProgressionPanel } from "@/components/student-progression"
import { SectionReview } from "@/components/section-review"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { hasRole, isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { fmtDate, fmtDateTime, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { AssessmentHistory } from "@/components/assessment-history"
import { CareerProfile } from "@/components/career-profile"
import { RoadmapBoard } from "@/components/roadmap-board"
import { StaffResumes } from "@/components/staff-resumes"
import { useApi } from "@/lib/web/use-api"

type Name = { id: string; name: string; code?: string }
type Full = {
  profile: { id: string; name: string; enrollmentNo: string; email: string; phone: string | null; department: Name; batch: Name; program: Name | null; stage: string; participationStatus: string; participationReason: string | null; inviteStatus: string; isActive: boolean; isPlaced: boolean; placedTier: string | null }
  sections: { section: string; status: string; submittedAt: string | null; reviewedAt: string | null; hasPendingRevision: boolean; reviewComment: string | null }[]
  drives?: { summary: { applied: number; attended: number; absent: number; cleared: number; rejected: number }; items: { id: string; status: string; appliedAt: string; drive: { id: string; role: string; driveDate: string | null; company: { name: string } }; journey: { round: number; type: string; result: string | null; score: number | null; attendance: { status: string } | null }[] }[] }
  offers?: { id: string; role: string; packageLpa: number | string | null; status: string; isPpo: boolean; isHistorical: boolean; offeredAt: string }[]
  activeBlocks?: { id: string; reason: string; endsAt: string; source: string }[]
  notes: { id: string; body: string; createdAt: string; author: { name: string } }[]
  timeline: { at: string; type: string; title: string; detail?: string | null; actor?: string | null }[]
}
type Analysis = {
  performance: { semesterTrend: { semester: number; score: number }[]; latest: { semester: number; score: number } | null; change: number | null; direction: string | null }
  comparison: { cgpa: number | null; batchAverage: number | null; departmentAverage: number | null; batchPercentile: number | null }
  readiness: { skillsVerified: number; drivesApplied: number; drivesAttended: number | null; attendanceRate: number | null }
  atRisk: { flags: { flag: string; detail: string }[] }
}

const PARTICIPATION = ["REGISTERED", "OPTED_OUT", "HIGHER_STUDIES", "ENTREPRENEURSHIP", "NOT_ELIGIBLE"].map((v) => ({ value: v, label: titleCase(v) }))
const chartConfig = { score: { label: "Score", color: "var(--chart-2)" } } satisfies ChartConfig

export default function StudentPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)
  const full = useApi<Full>(`/api/students/${id}/360`)
  const [tab, setTab] = React.useState("onboarding")
  const analysis = useApi<Analysis>(tab === "analysis" ? `/api/students/${id}/analysis` : null)
  const [review, setReview] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [partOpen, setPartOpen] = React.useState(false)

  if (full.error) return <Alert variant="destructive"><AlertTitle>Could not load this student</AlertTitle><AlertDescription>{full.error instanceof Error ? full.error.message : "Try again"}</AlertDescription></Alert>
  if (!full.data) return <div className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>
  const d = full.data, p = d.profile

  async function onboard() {
    setBusy(true)
    try { await api(`/api/students/${id}/onboard`, { method: "POST" }); toast.success("Student onboarded"); full.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function addNote() {
    if (!note.trim()) return
    setBusy(true)
    try { await api(`/api/students/${id}/notes`, { method: "POST", body: { body: note.trim() } }); setNote(""); full.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{p.name}</CardTitle>
          <CardDescription>{p.enrollmentNo} · {p.email}{p.phone ? ` · ${p.phone}` : ""}</CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline">{p.department.name}</Badge>
            <Badge variant="outline">{p.batch.name}</Badge>
            {p.program && <Badge variant="outline">{p.program.name}</Badge>}
            <Badge variant={statusVariant(p.stage)}>{titleCase(p.stage)}</Badge>
            <Badge variant={statusVariant(p.participationStatus)}>{titleCase(p.participationStatus)}</Badge>
            <Badge variant={statusVariant(p.inviteStatus)}>Invite {titleCase(p.inviteStatus).toLowerCase()}</Badge>
            {p.isPlaced && <Badge>Placed</Badge>}
            {!p.isActive && <Badge variant="destructive">Deactivated</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canEdit && p.stage === "VERIFIED" && <Button disabled={busy} onClick={onboard}>{busy && <Spinner />}Mark as onboarded</Button>}
          {canEdit && <Button variant="outline" onClick={() => setPartOpen(true)}>Placement participation</Button>}
          <Button variant="outline" onClick={() => download(`/api/students/${id}/resume.pdf`).catch(toastError)}>Download resume</Button>
        </CardContent>
      </Card>

      {d.activeBlocks && d.activeBlocks.length > 0 && (
        <Alert variant="destructive"><AlertTitle>Blocked from drives</AlertTitle><AlertDescription>{d.activeBlocks.map((b) => `${b.reason} (until ${fmtDate(b.endsAt)})`).join("; ")}</AlertDescription></Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="intelligence">360° Intelligence</TabsTrigger>
          <TabsTrigger value="overview">Sections</TabsTrigger>
          <TabsTrigger value="education">Education</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="progression">Progression</TabsTrigger>
          {d.drives && <TabsTrigger value="drives">Drives</TabsTrigger>}
          {d.offers && <TabsTrigger value="offers">Offers</TabsTrigger>}
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="resumes">Resumes</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding"><OnboardingReview studentId={id} name={p.name} canAct onChanged={full.reload} /></TabsContent>
        <TabsContent value="intelligence">{tab === "intelligence" && <StudentIntelligence studentId={id} />}</TabsContent>
        <TabsContent value="resumes">{tab === "resumes" && <StaffResumes studentId={id} />}</TabsContent>
        <TabsContent value="education"><div className="flex flex-col gap-6"><EducationPanel studentId={id} canEdit={canEdit} /><AcademicRecordsPanel studentId={id} /></div></TabsContent>
        <TabsContent value="documents"><DocumentsPanel studentId={id} canEdit={canEdit} canReview={canEdit || (state.status === "ready" && isCoordinatorOnly(state.profile))} /></TabsContent>
        <TabsContent value="progression"><ProgressionPanel studentId={id} canEdit={canEdit} isAdmin={state.status === "ready" && hasRole(state.profile, "TPO_ADMIN")} /></TabsContent>

        <TabsContent value="overview">
          <Table>
            <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead>Reviewed</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.sections.map((s) => (
                <TableRow key={s.section}>
                  <TableCell>{titleCase(s.section)} {s.hasPendingRevision && <Badge variant="secondary">Revision</Badge>}</TableCell>
                  <TableCell><Badge variant={statusVariant(s.status)}>{titleCase(s.status)}</Badge></TableCell>
                  <TableCell>{fmtDate(s.submittedAt)}</TableCell>
                  <TableCell>{fmtDate(s.reviewedAt)}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" disabled={s.status === "DRAFT" && !s.submittedAt} onClick={() => setReview(s.section)}>{s.status === "SUBMITTED" ? "Review" : "View"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-6"><VerificationHistory studentId={id} /></div>
        </TabsContent>

        {d.drives && (
          <TabsContent value="drives" className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.drives.summary).map(([k, v]) => <Badge key={k} variant="secondary">{titleCase(k)}: {v}</Badge>)}
            </div>
            {d.drives.items.length === 0 && <span className="text-sm text-muted-foreground">No drive applications yet.</span>}
            {d.drives.items.map((a) => (
              <Card key={a.id} size="sm">
                <CardHeader><CardTitle>{a.drive.company.name}, {a.drive.role}</CardTitle><CardDescription>Applied {fmtDate(a.appliedAt)} · <Badge variant={statusVariant(a.status)}>{titleCase(a.status)}</Badge></CardDescription></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {a.journey.map((j) => <Badge key={j.round} variant={j.result ? statusVariant(j.result) : "outline"}>R{j.round} {titleCase(j.type)}: {j.result ? titleCase(j.result) : "pending"}{j.score !== null ? ` (${j.score})` : ""}</Badge>)}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}

        {d.offers && (
          <TabsContent value="offers">
            {d.offers.length === 0 ? <span className="text-sm text-muted-foreground">No offers yet.</span> : (
              <Table>
                <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Package</TableHead><TableHead>Status</TableHead><TableHead>Offered</TableHead></TableRow></TableHeader>
                <TableBody>{d.offers.map((o) => <TableRow key={o.id}><TableCell>{o.role} {o.isPpo && <Badge variant="secondary">PPO</Badge>} {o.isHistorical && <Badge variant="outline">Archived</Badge>}</TableCell><TableCell>{fmtLpa(o.packageLpa)}</TableCell><TableCell><Badge variant={statusVariant(o.status)}>{titleCase(o.status)}</Badge></TableCell><TableCell>{fmtDate(o.offeredAt)}</TableCell></TableRow>)}</TableBody>
              </Table>
            )}
          </TabsContent>
        )}

        <TabsContent value="roadmap"><RoadmapBoard mode="review" base={`/api/students/${id}/roadmap`} studentName={p.name} /></TabsContent>
        <TabsContent value="analysis" className="flex flex-col gap-4">
          <CareerProfile endpoint={`/api/students/${id}/career-profile`} title="Career profile" />
          <AssessmentHistory endpoint={`/api/students/${id}/assessment-history`} title="Assessment history" />
          {analysis.loading && !analysis.data ? <Skeleton className="h-64" /> : analysis.data && (
            <>
              {analysis.data.atRisk.flags.length > 0 && <Alert variant="destructive"><AlertTitle>At risk</AlertTitle><AlertDescription>{analysis.data.atRisk.flags.map((f) => f.detail).join(" · ")}</AlertDescription></Alert>}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Semester performance</CardTitle><CardDescription>{analysis.data.performance.direction ? `Trend: ${analysis.data.performance.direction}` : "Needs verified academics"}</CardDescription></CardHeader>
                  <CardContent>
                    {analysis.data.performance.semesterTrend.length ? (
                      <ChartContainer config={chartConfig} className="h-52 w-full">
                        <BarChart data={analysis.data.performance.semesterTrend}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="semester" tickFormatter={(v) => `S${v}`} />
                          <YAxis domain={[0, 100]} width={32} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="score" fill="var(--color-score)" radius={4} />
                        </BarChart>
                      </ChartContainer>
                    ) : <span className="text-sm text-muted-foreground">No semester results yet.</span>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Compared with peers</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-muted-foreground">CGPA</div>{analysis.data.comparison.cgpa ?? "—"}</div>
                    <div><div className="text-muted-foreground">Batch percentile</div>{analysis.data.comparison.batchPercentile ?? "—"}</div>
                    <div><div className="text-muted-foreground">Batch average</div>{analysis.data.comparison.batchAverage ?? "—"}</div>
                    <div><div className="text-muted-foreground">Department average</div>{analysis.data.comparison.departmentAverage ?? "—"}</div>
                    <div><div className="text-muted-foreground">Verified skills</div>{analysis.data.readiness.skillsVerified}</div>
                    <div><div className="text-muted-foreground">Drives applied / attended</div>{analysis.data.readiness.drivesApplied} / {analysis.data.readiness.drivesAttended ?? "—"}</div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="notes" className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="note">Add a note (visible to placement staff)</FieldLabel>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div><Button disabled={busy || !note.trim()} onClick={addNote}>{busy && <Spinner />}Add note</Button></div>
          {d.notes.map((n) => <Card key={n.id} size="sm"><CardContent className="text-sm">{n.body}<div className="pt-2 text-xs text-muted-foreground">{n.author.name} · {fmtDateTime(n.createdAt)}</div></CardContent></Card>)}
        </TabsContent>

        <TabsContent value="timeline">
          <ul className="flex flex-col gap-3 text-sm">
            {d.timeline.map((t, i) => (
              <li key={i} className="flex gap-3"><span className="w-36 shrink-0 text-muted-foreground">{fmtDateTime(t.at)}</span><span><span className="font-medium">{t.title}</span>{t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}{t.actor && <span className="text-muted-foreground"> · {t.actor}</span>}</span></li>
            ))}
            {d.timeline.length === 0 && <span className="text-muted-foreground">Nothing recorded yet.</span>}
          </ul>
        </TabsContent>
      </Tabs>

      {review && <SectionReview studentId={id} studentName={p.name} section={review} open onOpenChange={(o) => !o && setReview(null)} onDone={full.reload} />}
      <ParticipationDialog open={partOpen} onOpenChange={setPartOpen} studentId={id} current={p.participationStatus} onDone={full.reload} />
    </div>
  )
}

function ParticipationDialog({ open, onOpenChange, studentId, current, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; studentId: string; current: string; onDone: () => void }) {
  const [status, setStatus] = React.useState(current)
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function save() {
    if (status === "NOT_ELIGIBLE" && !reason.trim()) { toast.error("A reason is required when marking a student not eligible"); return }
    setBusy(true)
    try {
      await api(`/api/students/${studentId}/participation`, { method: "PATCH", body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) } })
      toast.success("Participation updated")
      onOpenChange(false)
      onDone()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Placement participation</DialogTitle><DialogDescription>Opted-out students are left out of eligibility lists and unplaced counts. The change is kept in the history.</DialogDescription></DialogHeader>
        <Field><FieldLabel>Status</FieldLabel><OptionSelect className="w-full" value={status} onChange={setStatus} options={PARTICIPATION} placeholder="Status" /></Field>
        <Field><FieldLabel htmlFor="reason">Reason {status === "NOT_ELIGIBLE" ? "(required)" : "(optional)"}</FieldLabel><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <DialogFooter><Button disabled={busy} onClick={save}>{busy && <Spinner />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
