"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { BLANK, ProjectForm, STATUS, toBody } from "@/components/project-manager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, toastError } from "@/lib/web/api"
import { useAuth, hasRole } from "@/lib/web/auth"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; title: string; type: string; status: string; skills: string[]; dueAt: string | null; teams: number; students: number }
type Summary = {
  projects: { total: number; open: number; draft: number; closed: number; proposals: number }; teams: { forming: number; active: number; submitted: number; evaluated: number }
  proposals: { id: string; title: string }[]; behind: { project: string; team: string; teamId: string; projectId: string; overdue: number; percent: number }[]
  awaitingReview: { project: string; team: string; teamId: string; projectId: string }[]; lowContribution: { project: string; team: string; teamId: string; projectId: string; student: string; sharePercent: number }[]
}

/** The project repository (placement staff see all; a faculty member sees the projects they guide) and a monitoring view. */
export default function ProjectsPage() {
  const { data } = useApi<Row[]>("/api/projects")
  const sum = useApi<Summary>("/api/projects/summary")
  const { state } = useAuth()
  const staff = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN", "PLACEMENT_OFFICER")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [v, setV] = React.useState(BLANK)
  const [busy, setBusy] = React.useState(false)
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { const p = await api<{ id: string }>("/api/projects", { method: "POST", body: toBody(v) }); router.push(`/staff/projects/${p.id}`) } catch (err) { toastError(err); setBusy(false) }
  }
  return (
    <Tabs defaultValue="projects">
      <div className="flex flex-wrap items-center justify-between gap-2"><TabsList><TabsTrigger value="projects">Projects</TabsTrigger><TabsTrigger value="monitor">Monitor</TabsTrigger></TabsList><Button onClick={() => { setV(BLANK); setOpen(true) }}><PlusIcon />New project</Button></div>
      <TabsContent value="projects">
        {!data ? <Skeleton className="h-48" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Kind</TableHead><TableHead>State</TableHead><TableHead>Teams</TableHead><TableHead>Students</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((p) => <TableRow key={p.id}><TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/staff/projects/${p.id}`}>{p.title}</Link><div className="text-xs text-muted-foreground">{p.skills.join(", ")}</div></TableCell><TableCell>{titleCase(p.type)}</TableCell><TableCell><Badge variant={STATUS[p.status]}>{p.status === "PROPOSED" ? "Student proposal" : titleCase(p.status)}</Badge></TableCell><TableCell>{p.teams}</TableCell><TableCell>{p.students}</TableCell><TableCell>{fmtDate(p.dueAt)}</TableCell></TableRow>)}
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No projects yet. Add a problem statement with New project.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </TabsContent>
      <TabsContent value="monitor">
        {!sum.data ? <Skeleton className="h-48" /> : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["Open projects", sum.data.projects.open], ["Proposals waiting", sum.data.projects.proposals], ["Teams working", sum.data.teams.active], ["Submitted, to review", sum.data.teams.submitted]].map(([l, x]) => <Card key={l as string} size="sm"><CardHeader><CardDescription>{l}</CardDescription><CardTitle className="text-2xl">{x}</CardTitle></CardHeader></Card>)}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card size="sm"><CardHeader><CardTitle>Proposals waiting</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{sum.data.proposals.length === 0 ? <span className="text-muted-foreground">None.</span> : sum.data.proposals.map((p) => <Link key={p.id} className="underline-offset-4 hover:underline" href={`/staff/projects/${p.id}`}>{p.title}</Link>)}</CardContent></Card>
              <Card size="sm"><CardHeader><CardTitle>Waiting for a final review</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{sum.data.awaitingReview.length === 0 ? <span className="text-muted-foreground">None.</span> : sum.data.awaitingReview.map((t) => <Link key={t.teamId} className="underline-offset-4 hover:underline" href={`/staff/projects/${t.projectId}/teams/${t.teamId}`}>{t.project}: {t.team}</Link>)}</CardContent></Card>
              <Card size="sm"><CardHeader><CardTitle>Behind schedule</CardTitle><CardDescription>Teams with late milestones or tasks</CardDescription></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{sum.data.behind.length === 0 ? <span className="text-muted-foreground">None.</span> : sum.data.behind.map((t) => <Link key={t.teamId} className="flex justify-between gap-3 underline-offset-4 hover:underline" href={`/staff/projects/${t.projectId}/teams/${t.teamId}`}><span>{t.project}: {t.team}</span><span className="text-muted-foreground">{t.overdue} late · {t.percent}% done</span></Link>)}</CardContent></Card>
              <Card size="sm"><CardHeader><CardTitle>Little recorded work</CardTitle><CardDescription>Members with under half of a fair share of their team&apos;s recorded work. A prompt to ask, not a verdict.</CardDescription></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{sum.data.lowContribution.length === 0 ? <span className="text-muted-foreground">None.</span> : sum.data.lowContribution.map((t, i) => <Link key={i} className="flex justify-between gap-3 underline-offset-4 hover:underline" href={`/staff/projects/${t.projectId}/teams/${t.teamId}`}><span>{t.student} ({t.team})</span><span className="text-muted-foreground">{t.sharePercent}% of the work</span></Link>)}</CardContent></Card>
            </div>
          </div>
        )}
      </TabsContent>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <form onSubmit={create} className="flex flex-col gap-4"><ProjectForm v={v} set={(x) => setV((o) => ({ ...o, ...x }))} canPickGuide={staff} /><DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Save as draft</Button></DialogFooter></form></DialogContent></Dialog>
    </Tabs>
  )
}
