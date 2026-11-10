"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; title: string; companyName: string; status: string; source: string; driveId: string | null; extractedAt: string | null; approvedAt: string | null; updatedAt: string }
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = { APPROVED: "default", IN_REVIEW: "secondary", DRAFT: "outline", ARCHIVED: "outline" }
const STATUSES = [{ value: "", label: "Any state" }, ...["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"].map((v) => ({ value: v, label: titleCase(v) }))]

/** Job descriptions: upload, paste or write one, let the AI read it, review and approve it, then start a drive from it. */
export default function JobDescriptionsPage() {
  const [status, setStatus] = React.useState("")
  const { data } = useApi<Row[]>("/api/jds", { status: status || undefined })
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [text, setText] = React.useState("")
  const [t, setT] = React.useState({ title: "", company: "" })
  const [mode, setMode] = React.useState("upload")

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      let r: { id: string }
      if (mode === "upload") { if (!file) return; const fd = new FormData(); fd.set("file", file); fd.set("title", t.title); fd.set("company", t.company); r = await api<{ id: string }>("/api/jds", { method: "POST", body: fd }) }
      else r = await api<{ id: string }>("/api/jds", { method: "POST", body: { source: mode === "paste" ? "PASTE" : "MANUAL", text: mode === "paste" ? text : undefined, title: t.title, company: t.company } })
      router.push(`/staff/job-descriptions/${r.id}`)
    } catch (err) { toastError(err); setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><OptionSelect className="w-44" value={status} onChange={setStatus} options={STATUSES} placeholder="Any state" /><Button onClick={() => { setFile(null); setText(""); setT({ title: "", company: "" }); setOpen(true) }}><PlusIcon />New job description</Button></div>
      {!data ? <Skeleton className="h-48" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>State</TableHead><TableHead>Source</TableHead><TableHead>Drive</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((j) => <TableRow key={j.id}><TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/staff/job-descriptions/${j.id}`}>{j.title}</Link><div className="text-xs text-muted-foreground">{j.companyName}</div></TableCell><TableCell><Badge variant={STATUS_VARIANT[j.status]}>{titleCase(j.status)}</Badge>{j.extractedAt && <span className="ml-1 text-xs text-muted-foreground">AI-read</span>}</TableCell><TableCell>{titleCase(j.source)}</TableCell><TableCell>{j.driveId ? <Link className="underline underline-offset-4" href={`/staff/drives/${j.driveId}`}>Open drive</Link> : "—"}</TableCell><TableCell>{fmtDate(j.updatedAt)}</TableCell></TableRow>)}
            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No job descriptions yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>New job description</DialogTitle></DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Tabs value={mode} onValueChange={(v) => setMode(String(v))}><TabsList><TabsTrigger value="upload">Upload a file</TabsTrigger><TabsTrigger value="paste">Paste text</TabsTrigger><TabsTrigger value="manual">Write it myself</TabsTrigger></TabsList>
              <TabsContent value="upload"><Field><FieldLabel htmlFor="jd-file">PDF, Word (.docx) or text file, up to 10 MB</FieldLabel><Input id="jd-file" type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field></TabsContent>
              <TabsContent value="paste"><Field><FieldLabel htmlFor="jd-text">The job description</FieldLabel><Textarea id="jd-text" className="min-h-40" value={text} onChange={(e) => setText(e.target.value)} /></Field></TabsContent>
              <TabsContent value="manual"><p className="text-sm text-muted-foreground">You fill in every field yourself on the next page.</p></TabsContent>
            </Tabs>
            <FieldGroup>
              <Field><FieldLabel htmlFor="jd-t">Job title (optional, the AI can find it)</FieldLabel><Input id="jd-t" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="jd-c">Company (optional)</FieldLabel><Input id="jd-c" value={t.company} onChange={(e) => setT({ ...t, company: e.target.value })} /></Field>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={busy || (mode === "upload" && !file) || (mode === "paste" && text.trim().length < 80)}>{busy && <Spinner />}Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
