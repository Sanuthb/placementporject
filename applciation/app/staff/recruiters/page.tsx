"use client"

import * as React from "react"
import { toast } from "sonner"

import { ActiveBadge, MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Rec = { id: string; name: string; email: string; isActive: boolean; company: { id: string; name: string } }
type Job = { id: string; title: string; jobType: string; applyUrl: string; description: string | null; recruiter: { name: string; company: { name: string } } }

export default function RecruitersPage() {
  const companies = useApi<{ items: { id: string; name: string }[] }>("/api/companies", { limit: 100 })
  const jobs = useApi<Job[]>("/api/recruiter-jobs", { status: "PENDING_REVIEW" })
  const [target, setTarget] = React.useState<Job | null>(null)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function review(decision: "APPROVE" | "REJECT") {
    setBusy(true)
    try { await api(`/api/recruiter-jobs/${target!.id}/review`, { method: "POST", body: { decision, ...(note.trim() ? { note: note.trim() } : {}) } }); toast.success(decision === "APPROVE" ? "Approved and shared with students" : "Rejected"); setTarget(null); setNote(""); jobs.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Tabs defaultValue="people">
      <TabsList><TabsTrigger value="people">Recruiters</TabsTrigger><TabsTrigger value="jobs">Job posts to review {jobs.data?.length ? <Badge className="ml-1">{jobs.data.length}</Badge> : null}</TabsTrigger></TabsList>
      <TabsContent value="people">
        <MasterTab<Rec> endpoint="/api/recruiters" addLabel="Invite a recruiter" patchPath={(r) => `/api/recruiters/${r.id}`}
          fields={[{ name: "name", label: "Full name" }, { name: "email", label: "Email", type: "email" }, { name: "companyId", label: "Company", type: "select", required: true, options: (companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })) }]}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "Email", cell: (r) => r.email }, { label: "Company", cell: (r) => r.company.name }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
      </TabsContent>
      <TabsContent value="jobs">
        {!jobs.data ? <Skeleton className="h-32" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Posted by</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {jobs.data.map((j) => <TableRow key={j.id}><TableCell>{j.title}<div className="text-xs text-muted-foreground">{titleCase(j.jobType)} · <a className="underline" href={j.applyUrl} target="_blank" rel="noreferrer">link</a></div></TableCell><TableCell>{j.recruiter.name}, {j.recruiter.company.name}</TableCell><TableCell className="text-right"><Button size="sm" onClick={() => setTarget(j)}>Review</Button></TableCell></TableRow>)}
              {jobs.data.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">Nothing waiting for review.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </TabsContent>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{target?.title}</DialogTitle><DialogDescription>{target?.description ?? "No description."} Approving shares it with students as a job alert.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="note">Note (required to reject)</FieldLabel><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <DialogFooter><Button variant="outline" disabled={busy || !note.trim()} onClick={() => review("REJECT")}>Reject</Button><Button disabled={busy} onClick={() => review("APPROVE")}>{busy && <Spinner />}Approve</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
