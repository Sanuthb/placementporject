"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { StudentInternship } from "@/components/student-internship"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Posting = { id: string; title: string; companyName: string; description: string | null; location: string | null; mode: string; stipendInr: number | null; openings: number | null; skills: string[]; startDate: string; endDate: string; applicationDeadline: string; eligible: boolean; gaps: string[]; application: string | null }
type App = { id: string; status: string; selfSourced: boolean; title: string | null; company: string | null; collegeNote: string | null; companyNote: string | null; createdAt: string }
type Mine = { id: string; companyName: string | null; role: string; status: string; startDate: string; endDate: string }
const STATUS: Record<string, string> = { APPLIED: "Waiting for the college", COLLEGE_APPROVED: "Approved by the college, waiting for the company", COLLEGE_REJECTED: "Not approved by the college", COMPANY_REJECTED: "Not selected by the company", ALLOTTED: "Selected", WITHDRAWN: "Withdrawn" }

/** Internships: ones running or finished, open postings to apply for, my applications, and a form for an internship I found myself. */
export default function InternshipsPage() {
  const mine = useApi<Mine[]>("/api/student/internships")
  const posts = useApi<Posting[]>("/api/student/internship-postings")
  const apps = useApi<App[]>("/api/student/internship-applications")
  const [apply, setApply] = React.useState<Posting | null>(null)
  const [self, setSelf] = React.useState(false)
  const reload = () => { mine.reload(); posts.reload(); apps.reload() }
  if (!mine.data) return <Skeleton className="h-48" />
  return (
    <Tabs defaultValue={mine.data.length ? "mine" : "open"}>
      <TabsList><TabsTrigger value="mine">My internships ({mine.data.length})</TabsTrigger><TabsTrigger value="open">Open internships</TabsTrigger><TabsTrigger value="applications">My applications</TabsTrigger></TabsList>
      <TabsContent value="mine" className="flex flex-col gap-4">
        {mine.data.map((i) => <StudentInternship key={i.id} id={i.id} title={`${i.companyName}: ${i.role}`} />)}
        {mine.data.length === 0 && <p className="text-sm text-muted-foreground">You have no internship yet. Apply to an open one, or submit one you found yourself.</p>}
      </TabsContent>
      <TabsContent value="open" className="flex flex-col gap-4">
        <div><Button variant="outline" onClick={() => setSelf(true)}>I found an internship myself</Button></div>
        <div className="grid gap-4 md:grid-cols-2">
          {posts.data?.map((p) => (
            <Card key={p.id}><CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{p.companyName} · {titleCase(p.mode)}{p.location ? ` · ${p.location}` : ""}{p.stipendInr ? ` · ₹${p.stipendInr} a month` : ""}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm"><p>{fmtDate(p.startDate)} to {fmtDate(p.endDate)} · apply by {fmtDate(p.applicationDeadline)}{p.openings ? ` · ${p.openings} openings` : ""}</p>{p.description && <p className="line-clamp-4 whitespace-pre-wrap">{p.description}</p>}<div className="flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                {!p.eligible && <Alert><AlertTitle>You cannot apply yet</AlertTitle><AlertDescription><ul className="list-disc pl-4">{p.gaps.map((g) => <li key={g}>{g}</li>)}</ul></AlertDescription></Alert>}</CardContent>
              <CardFooter>{p.application ? <Badge variant="outline">{STATUS[p.application] ?? titleCase(p.application)}</Badge> : <Button size="sm" disabled={!p.eligible} onClick={() => setApply(p)}>Apply</Button>}</CardFooter></Card>
          ))}
          {posts.data?.length === 0 && <p className="text-sm text-muted-foreground">No internships are open right now.</p>}
        </div>
      </TabsContent>
      <TabsContent value="applications" className="flex flex-col gap-3">
        {apps.data?.map((a) => (
          <Card key={a.id} size="sm"><CardHeader><CardTitle>{a.title} at {a.company}</CardTitle><CardDescription>{STATUS[a.status] ?? titleCase(a.status)}{a.selfSourced ? " · found by you" : ""} · {fmtDate(a.createdAt)}</CardDescription></CardHeader>
            <CardContent className="text-sm">{a.collegeNote && <p>College: {a.collegeNote}</p>}{a.companyNote && <p>Company: {a.companyNote}</p>}{(a.status === "APPLIED" || a.status === "COLLEGE_APPROVED") && <Button size="sm" variant="outline" className="mt-2" onClick={() => api(`/api/student/internship-applications/${a.id}`, { method: "DELETE" }).then(() => { toast.success("Withdrawn"); reload() }, toastError)}>Withdraw</Button>}</CardContent></Card>
        ))}
        {apps.data?.length === 0 && <p className="text-sm text-muted-foreground">You have not applied yet.</p>}
      </TabsContent>
      {apply && <ApplyDialog p={apply} onClose={() => setApply(null)} onDone={() => { setApply(null); reload() }} />}
      {self && <SelfDialog onClose={() => setSelf(false)} onDone={() => { setSelf(false); reload() }} />}
    </Tabs>
  )
}

function ApplyDialog({ p, onClose, onDone }: { p: Posting; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Apply: {p.title} at {p.companyName}</DialogTitle></DialogHeader>
      <Field><FieldLabel htmlFor="ap-n">Why are you a good fit? (optional)</FieldLabel><Textarea id="ap-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <DialogFooter><Button disabled={busy} onClick={async () => { setBusy(true); try { await api(`/api/student/internship-postings/${p.id}/apply`, { method: "POST", body: { note: note || undefined } }); toast.success("Application sent to your placement office"); onDone() } catch (e) { toastError(e) } finally { setBusy(false) } }}>{busy && <Spinner />}Send application</Button></DialogFooter></DialogContent></Dialog>
  )
}

function SelfDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = React.useState({ companyName: "", role: "", startDate: "", endDate: "", mentorName: "", mentorEmail: "", note: "" })
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((o) => ({ ...o, [k]: e.target.value }))
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!file) return; setBusy(true)
    try { const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.set(k, v)); fd.set("file", file); await api("/api/student/internship-applications", { method: "POST", body: fd }); toast.success("Sent to your placement office for approval"); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>An internship I found myself</DialogTitle></DialogHeader>
      <form onSubmit={send} className="flex flex-col gap-4"><FieldGroup>
        <p className="text-sm text-muted-foreground">Your placement office approves it. You need the company&apos;s offer letter.</p>
        <Field><FieldLabel htmlFor="se-c">Company</FieldLabel><Input id="se-c" required minLength={2} value={f.companyName} onChange={set("companyName")} /></Field>
        <Field><FieldLabel htmlFor="se-r">Role</FieldLabel><Input id="se-r" required minLength={2} value={f.role} onChange={set("role")} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="se-s">Starts</FieldLabel><Input id="se-s" type="date" required value={f.startDate} onChange={set("startDate")} /></Field><Field><FieldLabel htmlFor="se-e">Ends</FieldLabel><Input id="se-e" type="date" required value={f.endDate} onChange={set("endDate")} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="se-mn">Company mentor (optional)</FieldLabel><Input id="se-mn" value={f.mentorName} onChange={set("mentorName")} /></Field><Field><FieldLabel htmlFor="se-me">Mentor&apos;s email (optional)</FieldLabel><Input id="se-me" type="email" value={f.mentorEmail} onChange={set("mentorEmail")} /></Field></div>
        <Field><FieldLabel htmlFor="se-f">Offer letter (PDF, PNG or JPEG, up to 10 MB)</FieldLabel><Input id="se-f" type="file" required accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field><FieldLabel htmlFor="se-n">Anything else to tell us</FieldLabel><Textarea id="se-n" value={f.note} onChange={set("note")} /></Field>
      </FieldGroup><DialogFooter><Button type="submit" disabled={busy || !file}>{busy && <Spinner />}Send for approval</Button></DialogFooter></form></DialogContent></Dialog>
  )
}
