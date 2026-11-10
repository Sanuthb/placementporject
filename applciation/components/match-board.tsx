"use client"

import * as React from "react"
import { toast } from "sonner"

import Link from "next/link"
import { MatchEvidence, type Param, type Req } from "@/components/match-evidence"
import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Cand = { studentId: string; name: string; enrollmentNo: string; department: string; eligible: boolean; viaException: boolean; reasons: string[]; score: number; mandatoryStatus: string; mandatoryMet: number; mandatoryTotal: number; skills: { matched: string[]; partial: string[]; missing: string[] }; cgpa: number | null; rank: number | null; shortlisted: boolean; applied: string | null }
type Board = { jd: { id: string; title: string; company: string; driveId: string | null }; weights: { key: string; label: string; weight: number }[]; requirements: number; considered: number; eligible: number; truncated: boolean; candidates: Cand[]; ineligible: Cand[]; ineligibleCount: number }
type Detail = {
  student: { id: string; name: string; enrollmentNo: string; department: string }; eligibility: { eligible: boolean; viaException: boolean; reasons: string[] }
  result: { score: number; parameters: (Param & { points: number })[]; requirements: Req[]; mandatory: { status: string; met: number; total: number }; skills: { matched: string[]; partial: string[]; missing: string[] }; projects: { title: string; why: string }[]; internships: { title: string; why: string }[]; explanation: string[] }
  resumes: { id: string; title: string; isPrimary: boolean }[]; preparation: { skill: string; courses: { id: string; title: string }[]; resources: { id: string; title: string }[] }[]
}
type SL = { studentId: string; name: string; enrollmentNo: string; department: string; score: number; mandatoryStatus: string; note: string | null; decidedBy: string; createdAt: string }
const MAND: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = { ALL_MET: { label: "All required met", variant: "default" }, NEEDS_REVIEW: { label: "Needs review", variant: "secondary" }, UNMET: { label: "Required missing", variant: "destructive" }, NONE: { label: "No required criteria", variant: "outline" } }

/** The ranking for one job description: eligibility kept apart from the score, evidence for every student, comparison, and shortlisting. A person decides; nothing here selects anyone. */
export function MatchBoard({ id }: { id: string }) {
  const [dept, setDept] = React.useState("")
  const [onlyMet, setOnlyMet] = React.useState(false)
  const board = useApi<Board>(`/api/jds/${id}/matches`, { departmentId: dept || undefined })
  const sl = useApi<SL[]>(`/api/jds/${id}/shortlist`)
  const lk = useLookups()
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [open, setOpen] = React.useState<string | null>(null)
  const [cmp, setCmp] = React.useState(false)
  const [dlg, setDlg] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [notify, setNotify] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (!board.data) return <Skeleton className="h-96" />
  const b = board.data
  const rows = b.candidates.filter((c) => !onlyMet || c.mandatoryStatus === "ALL_MET" || c.mandatoryStatus === "NONE")
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else if (n.size < 200) n.add(k); return n })
  async function shortlist() {
    setBusy(true)
    try { const r = await api<{ added: number; alreadyShortlisted: number }>(`/api/jds/${id}/shortlist`, { method: "POST", body: { studentIds: [...picked], note: note || undefined, notify } }); toast.success(`${r.added} shortlisted${r.alreadyShortlisted ? `, ${r.alreadyShortlisted} already were` : ""}`); setDlg(false); setPicked(new Set()); setNote(""); board.reload(); sl.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div><h1 className="text-xl font-semibold">Matches: {b.jd.title}</h1><p className="text-sm text-muted-foreground">{b.jd.company} · {b.eligible} of {b.considered} students pass the eligibility rules · {b.requirements} requirements</p></div>
      <Alert><AlertTitle>A guide, not a decision</AlertTitle><AlertDescription>Eligibility is decided by the rules alone and is kept apart from the score. The score weighs {b.weights.map((w) => `${w.label.toLowerCase()} ${w.weight}%`).join(", ")} (change the weights on the job description). Personality and interest results are never used. People choose who is shortlisted, and selection happens in the drive&apos;s rounds.</AlertDescription></Alert>
      {b.truncated && <Alert variant="destructive"><AlertTitle>Only the first 1,500 eligible students are matched</AlertTitle><AlertDescription>Narrow it by department to see the rest.</AlertDescription></Alert>}

      <Tabs defaultValue="ranking">
        <TabsList><TabsTrigger value="ranking">Ranking ({rows.length})</TabsTrigger><TabsTrigger value="shortlist">Shortlist ({sl.data?.length ?? 0})</TabsTrigger><TabsTrigger value="ineligible">Not eligible ({b.ineligibleCount})</TabsTrigger></TabsList>

        <TabsContent value="ranking" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <OptionSelect className="w-52" value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="All departments" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={onlyMet} onCheckedChange={setOnlyMet} />Only students who meet every required criterion</label>
            <div className="ml-auto flex gap-2"><Button variant="outline" render={<Link href={`/staff/campaigns?jd=${id}`} />}>Start a preparation campaign</Button><Button variant="outline" disabled={picked.size < 2 || picked.size > 4} onClick={() => setCmp(true)}>Compare ({picked.size})</Button><Button disabled={picked.size === 0} onClick={() => setDlg(true)}>Shortlist {picked.size || ""}</Button></div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead /><TableHead>#</TableHead><TableHead>Student</TableHead><TableHead className="w-44">Match score</TableHead><TableHead>Required criteria</TableHead><TableHead>Skills</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.studentId}>
                  <TableCell><Checkbox aria-label={`Select ${c.name}`} checked={picked.has(c.studentId)} disabled={c.shortlisted} onCheckedChange={() => toggle(c.studentId)} /></TableCell>
                  <TableCell>{c.rank}</TableCell>
                  <TableCell className="font-medium">{c.name}<div className="text-xs font-normal text-muted-foreground">{c.department} · {c.enrollmentNo}{c.cgpa !== null ? ` · CGPA ${c.cgpa}` : ""}</div>{c.viaException && <Badge variant="outline">Eligible by exception</Badge>}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><Progress value={c.score} /><span className="w-8 text-right">{c.score}</span></div></TableCell>
                  <TableCell><Badge variant={MAND[c.mandatoryStatus].variant}>{MAND[c.mandatoryStatus].label}</Badge>{c.mandatoryTotal > 0 && <div className="text-xs text-muted-foreground">{c.mandatoryMet} of {c.mandatoryTotal}</div>}</TableCell>
                  <TableCell className="text-xs"><span className="text-foreground">{c.skills.matched.length} matched</span>{c.skills.partial.length > 0 && <span className="text-muted-foreground">, {c.skills.partial.length} partly</span>}{c.skills.missing.length > 0 && <span className="text-destructive">, {c.skills.missing.length} missing</span>}{c.skills.missing.length > 0 && <div className="text-muted-foreground">{c.skills.missing.slice(0, 3).join(", ")}</div>}</TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1">{c.shortlisted && <Badge variant="secondary">Shortlisted</Badge>}{c.applied && <Badge variant="outline">{titleCase(c.applied)}</Badge>}<Button size="sm" variant="outline" onClick={() => setOpen(c.studentId)}>Evidence</Button></div></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No students to show.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="shortlist" className="flex flex-col gap-3">
          <div><Button variant="outline" size="sm" onClick={() => download(`/api/jds/${id}/shortlist`, { query: { format: "xlsx" } }).catch(toastError)}>Download as Excel</Button></div>
          <Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Score then</TableHead><TableHead>Required criteria</TableHead><TableHead>By</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {sl.data?.map((x) => <TableRow key={x.studentId}><TableCell className="font-medium">{x.name}<div className="text-xs font-normal text-muted-foreground">{x.department} · {x.enrollmentNo}{x.note ? ` · ${x.note}` : ""}</div></TableCell><TableCell>{x.score}</TableCell><TableCell><Badge variant={MAND[x.mandatoryStatus]?.variant ?? "outline"}>{MAND[x.mandatoryStatus]?.label ?? x.mandatoryStatus}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{x.decidedBy}<br />{fmtDateTime(x.createdAt)}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => api(`/api/jds/${id}/shortlist/${x.studentId}`, { method: "DELETE" }).then(() => { toast.success("Removed"); sl.reload(); board.reload() }, toastError)}>Remove</Button></TableCell></TableRow>)}
              {sl.data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nobody shortlisted yet. Tick students in the ranking.</TableCell></TableRow>}
            </TableBody></Table>
        </TabsContent>

        <TabsContent value="ineligible" className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">These students do not pass the rules, so they are not scored. {b.ineligibleCount > b.ineligible.length ? `Showing ${b.ineligible.length} of ${b.ineligibleCount}.` : ""}</p>
          {b.ineligible.map((c) => <div key={c.studentId} className="flex flex-wrap justify-between gap-2 rounded-md border p-2"><span className="font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">{c.department} · {c.enrollmentNo}</span></span><span className="text-xs text-muted-foreground">{c.reasons.join("; ")}</span></div>)}
        </TabsContent>
      </Tabs>

      {open && <Evidence jdId={id} studentId={open} onClose={() => setOpen(null)} />}
      {cmp && <Compare jdId={id} ids={[...picked]} onClose={() => setCmp(false)} />}
      <Dialog open={dlg} onOpenChange={setDlg}><DialogContent><DialogHeader><DialogTitle>Shortlist {picked.size} student{picked.size === 1 ? "" : "s"}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Their score and evidence are kept with this decision. It does not select them: the drive&apos;s rounds do that.</p>
        <Textarea aria-label="Note" placeholder="A note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={notify} onCheckedChange={setNotify} />Tell the students they have been shortlisted</label>
        <DialogFooter><Button disabled={busy} onClick={shortlist}>{busy && <Spinner />}Shortlist</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}

function Evidence({ jdId, studentId, onClose }: { jdId: string; studentId: string; onClose: () => void }) {
  const { data: d } = useApi<Detail>(`/api/jds/${jdId}/matches/${studentId}`)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{d ? `${d.student.name}: ${d.result.score}%` : "Loading"}</SheetTitle></SheetHeader>
        {!d ? <Skeleton className="m-4 h-64" /> : (
          <div className="flex flex-col gap-4 p-4 text-sm">
            <p className="text-muted-foreground">{d.student.department} · {d.student.enrollmentNo}</p>
            <div className="flex flex-wrap gap-2"><Badge variant={d.eligibility.eligible ? "default" : "destructive"}>{d.eligibility.eligible ? (d.eligibility.viaException ? "Eligible by exception" : "Passes the eligibility rules") : "Not eligible"}</Badge><Badge variant={MAND[d.result.mandatory.status].variant}>{MAND[d.result.mandatory.status].label}</Badge></div>
            {!d.eligibility.eligible && <Alert variant="destructive"><AlertDescription>{d.eligibility.reasons.join("; ")}</AlertDescription></Alert>}
            <div><h3 className="mb-1 font-medium">Why this student matches</h3><ul className="list-disc pl-5">{d.result.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
            <MatchEvidence parameters={d.result.parameters} requirements={d.result.requirements} />
            {d.result.projects.length > 0 && <div><h3 className="mb-1 font-medium">Relevant projects</h3>{d.result.projects.map((p) => <div key={p.title}>{p.title} <span className="text-muted-foreground">· {p.why}</span></div>)}</div>}
            {d.result.internships.length > 0 && <div><h3 className="mb-1 font-medium">Relevant internships</h3>{d.result.internships.map((p) => <div key={p.title}>{p.title} <span className="text-muted-foreground">· {p.why}</span></div>)}</div>}
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => download(`/api/students/${d.student.id}/resume.pdf`).catch(toastError)}>College-format resume</Button>{d.resumes.map((r) => <Button key={r.id} size="sm" variant="outline" onClick={() => download(`/api/students/${d.student.id}/resumes/${r.id}/export`, { query: { format: "pdf" } }).catch(toastError)}>{r.title}{r.isPrimary ? " (main)" : ""}</Button>)}</div>
            {d.preparation.length > 0 && <div><h3 className="mb-1 font-medium">Recommended preparation</h3>{d.preparation.map((p) => <div key={p.skill} className="mb-1"><span className="font-medium">{p.skill}: </span>{p.courses.length + p.resources.length === 0 ? <span className="text-muted-foreground">nothing in the college yet teaches this</span> : [...p.courses.map((c) => `course "${c.title}"`), ...p.resources.map((r) => `material "${r.title}"`)].join("; ")}</div>)}</div>}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function Compare({ jdId, ids, onClose }: { jdId: string; ids: string[]; onClose: () => void }) {
  const [rows, setRows] = React.useState<Detail[] | null>(null)
  React.useEffect(() => { Promise.all(ids.map((i) => api<Detail>(`/api/jds/${jdId}/matches/${i}`))).then(setRows, (e) => { toastError(e); onClose() }) }, [jdId, ids, onClose])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Compare candidates</DialogTitle></DialogHeader>
      {!rows ? <Skeleton className="h-64" /> : (
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead /> {rows.map((r) => <TableHead key={r.student.id}>{r.student.name}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell className="font-medium">Match score</TableCell>{rows.map((r) => <TableCell key={r.student.id}>{r.result.score}</TableCell>)}</TableRow>
            <TableRow><TableCell className="font-medium">Required criteria</TableCell>{rows.map((r) => <TableCell key={r.student.id}>{MAND[r.result.mandatory.status].label} ({r.result.mandatory.met}/{r.result.mandatory.total})</TableCell>)}</TableRow>
            {rows[0].result.parameters.map((p, i) => <TableRow key={p.label}><TableCell>{p.label} ({p.weight}%)</TableCell>{rows.map((r) => <TableCell key={r.student.id}>{r.result.parameters[i].value === null ? "n/a" : `${Math.round((r.result.parameters[i].value ?? 0) * 100)}%`}</TableCell>)}</TableRow>)}
            <TableRow><TableCell className="font-medium">Skills matched</TableCell>{rows.map((r) => <TableCell key={r.student.id} className="text-xs">{r.result.skills.matched.join(", ") || "—"}</TableCell>)}</TableRow>
            <TableRow><TableCell className="font-medium">Partly matched</TableCell>{rows.map((r) => <TableCell key={r.student.id} className="text-xs">{r.result.skills.partial.join(", ") || "—"}</TableCell>)}</TableRow>
            <TableRow><TableCell className="font-medium">Missing</TableCell>{rows.map((r) => <TableCell key={r.student.id} className="text-xs text-destructive">{r.result.skills.missing.join(", ") || "—"}</TableCell>)}</TableRow>
            <TableRow><TableCell className="font-medium">Projects</TableCell>{rows.map((r) => <TableCell key={r.student.id} className="text-xs">{r.result.projects.map((p) => p.title).join("; ") || "—"}</TableCell>)}</TableRow>
            <TableRow><TableCell className="font-medium">Internships</TableCell>{rows.map((r) => <TableCell key={r.student.id} className="text-xs">{r.result.internships.map((p) => p.title).join("; ") || "—"}</TableCell>)}</TableRow>
          </TableBody></Table></div>
      )}
    </DialogContent></Dialog>
  )
}
