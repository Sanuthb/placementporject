"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { KIND_LABEL, KINDS, TEMPLATE_LABEL, TEMPLATES, type MasterProfile } from "@/lib/resumeEngine"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type V = { id: string; number: number; title: string; kind: string; template: string; status: string; isPrimary: boolean; targetCompany: string | null; verifiedOnly: boolean; approvedAt: string | null; newItems: number }
type Master = { master: MasterProfile; changes: { version: number; title: string; added: { key: string; label: string }[]; removed: number } | null }
type R = { score: number; ready: boolean; checks: { key: string; label: string; ok: boolean }[]; improvements: string[]; keywords: string[] }
const LEVEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = { VERIFIED: { label: "Verified", variant: "default" }, EVIDENCED: { label: "Backed by records", variant: "secondary" }, CLAIMED: { label: "Claimed", variant: "outline" } }

/** Resumes: the ones I made, my master career profile (with what backs each skill), and how ready my profile is. */
export default function ResumePage() {
  const list = useApi<V[]>("/api/student/resumes")
  const master = useApi<Master>("/api/student/resume/master")
  const ready = useApi<R>("/api/student/resume")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [f, setF] = React.useState({ kind: "MASTER", template: "ATS", title: "", company: "", role: "", jd: "", verifiedOnly: false })
  const [busy, setBusy] = React.useState<string | null>(null)
  const company = f.kind === "COMPANY_SPECIFIC"

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy("create")
    try { const r = await api<{ id: string }>("/api/student/resumes", { method: "POST", body: { kind: f.kind, template: f.template, title: f.title || undefined, targetCompany: f.company || null, targetRole: f.role || null, targetText: f.jd || null, verifiedOnly: f.verifiedOnly } }); router.push(`/student/resume/${r.id}`) } catch (err) { toastError(err); setBusy(null) }
  }
  const act = (id: string, path: string, ok: string, method: "POST" | "DELETE" = "POST") => api(`/api/student/resumes/${id}${path}`, { method }).then(() => { toast.success(ok); list.reload() }, toastError)

  return (
    <Tabs defaultValue="resumes">
      <div className="flex flex-wrap items-center justify-between gap-2"><TabsList><TabsTrigger value="resumes">My resumes</TabsTrigger><TabsTrigger value="master">Master profile</TabsTrigger><TabsTrigger value="ready">Readiness</TabsTrigger></TabsList><Button onClick={() => setOpen(true)}>New resume</Button></div>

      <TabsContent value="resumes" className="flex flex-col gap-4">
        {(master.data?.changes?.added.length ?? 0) > 0 && <Alert><AlertTitle>{master.data!.changes!.added.length} new item{master.data!.changes!.added.length === 1 ? "" : "s"} in your profile since your main resume</AlertTitle><AlertDescription>{master.data!.changes!.added.slice(0, 6).map((x) => x.label).join("; ")}. Open the resume and make a copy to include them.</AlertDescription></Alert>}
        {!list.data ? <Skeleton className="h-40" /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.data.map((v) => (
              <Card key={v.id}>
                <CardHeader><CardTitle>{v.title}</CardTitle><CardDescription>{titleCase(v.kind)} · {TEMPLATE_LABEL[v.template as keyof typeof TEMPLATE_LABEL]?.split(" (")[0] ?? v.template} · v{v.number}{v.approvedAt ? ` · approved ${fmtDate(v.approvedAt)}` : ""}</CardDescription></CardHeader>
                <CardContent className="flex flex-wrap gap-1"><Badge variant={v.status === "APPROVED" ? "default" : "outline"}>{titleCase(v.status)}</Badge>{v.isPrimary && <Badge variant="secondary">Main resume</Badge>}{v.verifiedOnly && <Badge variant="outline">Checked material only</Badge>}{v.newItems > 0 && <Badge variant="destructive">{v.newItems} new in your profile</Badge>}</CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button size="sm" render={<Link href={`/student/resume/${v.id}`} />}>{v.status === "DRAFT" ? "Edit" : "Open"}</Button>
                  <Button size="sm" variant="outline" onClick={() => download(`/api/student/resumes/${v.id}/export`, { query: { format: "pdf" } }).catch(toastError)}>PDF</Button>
                  <Button size="sm" variant="outline" onClick={() => download(`/api/student/resumes/${v.id}/export`, { query: { format: "docx" } }).catch(toastError)}>Word</Button>
                  {v.status === "APPROVED" && !v.isPrimary && <Button size="sm" variant="ghost" onClick={() => act(v.id, "/primary", "Now your main resume")}>Make main</Button>}
                  {v.status === "DRAFT" ? <Button size="sm" variant="ghost" onClick={() => act(v.id, "", "Deleted", "DELETE")}>Delete</Button> : <Button size="sm" variant="ghost" onClick={() => act(v.id, "/archive", "Archived")}>Archive</Button>}
                </CardFooter>
              </Card>
            ))}
            {list.data.length === 0 && <p className="text-sm text-muted-foreground">You have not made a resume yet. Start with New resume: it is built from your profile, so there is nothing to retype.</p>}
          </div>
        )}
      </TabsContent>

      <TabsContent value="master" className="flex flex-col gap-4">
        {!master.data ? <Skeleton className="h-48" /> : <MasterView m={master.data.master} />}
      </TabsContent>

      <TabsContent value="ready">
        {!ready.data ? <Skeleton className="h-48" /> : (
          <div className="flex max-w-3xl flex-col gap-4">
            <Card><CardHeader><CardTitle>Profile readiness: {ready.data.score}%</CardTitle><CardDescription>{ready.data.ready ? "Your profile is ready to share." : "A few things would make it stronger."}</CardDescription></CardHeader><CardContent><Progress value={ready.data.score} /></CardContent></Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card><CardHeader><CardTitle>Checklist</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{ready.data.checks.map((c) => <div key={c.key} className="flex items-center justify-between gap-2"><span>{c.label}</span><Badge variant={c.ok ? "default" : "secondary"}>{c.ok ? "Done" : "To do"}</Badge></div>)}</CardContent></Card>
              <Card><CardHeader><CardTitle>How to improve</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{ready.data.improvements.length ? <ul className="list-disc pl-5">{ready.data.improvements.map((i) => <li key={i}>{i}</li>)}</ul> : <span className="text-muted-foreground">Nothing to add.</span>}</CardContent></Card>
            </div>
          </div>
        )}
      </TabsContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>New resume</DialogTitle></DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-4"><FieldGroup>
            <Field><FieldLabel>Kind of resume</FieldLabel><OptionSelect className="w-full" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} placeholder="Kind" /></Field>
            <Field><FieldLabel>Template</FieldLabel><OptionSelect className="w-full" value={f.template} onChange={(v) => setF({ ...f, template: v })} options={TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_LABEL[t] }))} placeholder="Template" /></Field>
            <Field><FieldLabel htmlFor="n-title">Name (optional)</FieldLabel><Input id="n-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            {company && <>
              <Field><FieldLabel htmlFor="n-co">Company</FieldLabel><Input id="n-co" required value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="n-ro">Role</FieldLabel><Input id="n-ro" required value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="n-jd">Paste the job description or the skills they want</FieldLabel><Textarea id="n-jd" className="min-h-24" value={f.jd} onChange={(e) => setF({ ...f, jd: e.target.value })} /></Field>
            </>}
          </FieldGroup><DialogFooter><Button type="submit" disabled={!!busy}>{busy === "create" && <Spinner />}Create draft</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}

function MasterView({ m }: { m: MasterProfile }) {
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">Everything a resume can say. It updates itself when you finish a course, a project or an internship, or when staff check your details. Each skill shows what backs it.</p>
      <Card size="sm"><CardHeader><CardTitle>Skills ({m.skills.length})</CardTitle><CardDescription>Verified: staff checked your skills list. Backed by records: a project, course, internship, assessment or achievement supports it. Claimed: only you say so; it helps to add evidence.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">{m.skills.map((s) => <div key={s.name} className="flex flex-wrap items-center gap-2"><span className="w-40 font-medium">{s.name}</span><Badge variant={LEVEL[s.level].variant}>{LEVEL[s.level].label}</Badge><span className="text-xs text-muted-foreground">{s.evidence.map((e) => e.label).join("; ")}</span></div>)}{m.skills.length === 0 && <span className="text-muted-foreground">No skills yet. Add them in your profile.</span>}</CardContent></Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card size="sm"><CardHeader><CardTitle>Projects ({m.projects.length})</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{m.projects.map((p) => <div key={p.key} className="flex justify-between gap-2"><span>{p.title}</span><Badge variant={p.verified ? "secondary" : "outline"}>{p.source === "COLLEGE" ? "College project" : p.verified ? "Checked" : "Not checked"}</Badge></div>)}</CardContent></Card>
        <Card size="sm"><CardHeader><CardTitle>Internships ({m.internships.length})</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{m.internships.map((p) => <div key={p.key} className="flex justify-between gap-2"><span>{p.role} at {p.company}</span><Badge variant={p.verified ? "secondary" : "outline"}>{p.source === "COLLEGE" ? "College record" : p.verified ? "Checked" : "Not checked"}</Badge></div>)}</CardContent></Card>
        <Card size="sm"><CardHeader><CardTitle>Courses completed ({m.courses.length})</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{m.courses.map((c) => <div key={c.key} className="flex justify-between gap-2"><span>{c.title}</span><span className="text-muted-foreground">{fmtDate(c.completedOn)}</span></div>)}</CardContent></Card>
        <Card size="sm"><CardHeader><CardTitle>Achievements ({m.achievements.length})</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{m.achievements.map((a) => <div key={a.key} className="flex justify-between gap-2"><span>{a.title}</span><Badge variant={a.verified ? "secondary" : "outline"}>{a.verified ? "Checked" : "Not checked"}</Badge></div>)}</CardContent></Card>
      </div>
    </div>
  )
}
