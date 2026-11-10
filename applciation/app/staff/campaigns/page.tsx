"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { useAuth, hasRole } from "@/lib/web/auth"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; name: string; company: string; jobRole: string; status: string; startsAt: string; deadline: string; members: number; accepted: number }

function Campaigns() {
  const { data } = useApi<Row[]>("/api/campaigns")
  const jds = useApi<{ id: string; title: string; companyName: string }[]>("/api/jds", { status: "APPROVED" })
  const { state } = useAuth()
  const staff = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN", "PLACEMENT_OFFICER")
  const params = useSearchParams()
  const router = useRouter()
  const [open, setOpen] = React.useState(!!params.get("jd"))
  const [f, setF] = React.useState({ jdId: params.get("jd") ?? "", name: "", description: "", startsAt: "", deadline: "" })
  const [busy, setBusy] = React.useState(false)
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { const r = await api<{ id: string }>("/api/campaigns", { method: "POST", body: { jdId: f.jdId, name: f.name, description: f.description || null, startsAt: new Date(f.startsAt).toISOString(), deadline: new Date(f.deadline).toISOString() } }); router.push(`/staff/campaigns/${r.id}`) } catch (err) { toastError(err); setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">A preparation campaign helps chosen students get ready for one job: a personal plan for each, mock tests and interviews, and progress you can follow.</p>{staff && <Button onClick={() => setOpen(true)}><PlusIcon />New campaign</Button>}</div>
      {!data ? <Skeleton className="h-48" /> : (
        <Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>State</TableHead><TableHead>Dates</TableHead><TableHead>Students</TableHead></TableRow></TableHeader>
          <TableBody>{data.map((c) => <TableRow key={c.id}><TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/staff/campaigns/${c.id}`}>{c.name}</Link><div className="text-xs text-muted-foreground">{c.jobRole} at {c.company}</div></TableCell><TableCell><Badge variant={c.status === "ACTIVE" ? "default" : "outline"}>{titleCase(c.status)}</Badge></TableCell><TableCell>{fmtDate(c.startsAt)} to {fmtDate(c.deadline)}</TableCell><TableCell>{c.members} ({c.accepted} accepted)</TableCell></TableRow>)}
            {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No campaigns yet. Start one from an approved job description.</TableCell></TableRow>}</TableBody></Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>New preparation campaign</DialogTitle></DialogHeader>
        <form onSubmit={create} className="flex flex-col gap-4"><FieldGroup>
          <Field><FieldLabel>Approved job description</FieldLabel><OptionSelect className="w-full" value={f.jdId} onChange={(v) => { const j = jds.data?.find((x) => x.id === v); setF({ ...f, jdId: v, name: f.name || (j ? `${j.title} preparation` : "") }) }} options={(jds.data ?? []).map((j) => ({ value: j.id, label: `${j.title} (${j.companyName})` }))} placeholder="Choose" /></Field>
          <Field><FieldLabel htmlFor="n">Campaign name</FieldLabel><Input id="n" required minLength={3} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="d">What students should know</FieldLabel><Textarea id="d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="s">Preparation starts</FieldLabel><Input id="s" type="date" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field><Field><FieldLabel htmlFor="e">Deadline</FieldLabel><Input id="e" type="date" required value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field></div>
        </FieldGroup><DialogFooter><Button type="submit" disabled={busy || !f.jdId}>{busy && <Spinner />}Create draft</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  )
}
export default function CampaignsPage() {
  return <React.Suspense fallback={<Skeleton className="h-64" />}><Campaigns /></React.Suspense>
}
