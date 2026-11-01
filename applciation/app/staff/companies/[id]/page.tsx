"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { RELATIONSHIP, TIERS } from "@/lib/web/enums"
import { fmtDate, fmtDateTime, fmtLpa, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Company = {
  id: string; name: string; industry: string | null; website: string | null; tier: string; relationshipStatus: string
  contacts: { name: string; email?: string; phone?: string; designation?: string }[]
  history: { years: number[]; driveCount: number; studentsHired: number; ppoConversions: number; highestPackageLpa: number | null; averagePackageLpa: number | null; drives: { id: string; role: string; driveDate: string; status: string; packageMinLpa: number | string | null; packageMaxLpa: number | string | null }[] }
}
type Note = { id: string; kind: string; body: string; followUpDate: string | null; createdAt: string; author?: { name: string } }

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const canEdit = state.status === "ready" && state.profile.role !== "DEPARTMENT_COORDINATOR"
  const c = useApi<Company>(`/api/companies/${id}`)
  const notes = useApi<Note[]>(`/api/companies/${id}/notes`)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  if (!c.data) return <Skeleton className="h-64" />
  const co = c.data

  async function patch(body: Record<string, unknown>) {
    try { await api(`/api/companies/${id}`, { method: "PATCH", body }); toast.success("Saved"); c.reload() } catch (e) { toastError(e) }
  }
  async function addNote() {
    setBusy(true)
    try { await api(`/api/companies/${id}/notes`, { method: "POST", body: { body: note.trim() } }); setNote(""); notes.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{co.name}</CardTitle>
          <CardDescription>{co.industry ?? "No industry set"}{co.website && <> · <a className="underline underline-offset-4" href={co.website} target="_blank" rel="noreferrer">{co.website}</a></>}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {canEdit ? (
            <>
              <OptionSelect className="w-40" value={co.tier} onChange={(v) => patch({ tier: v })} options={TIERS} placeholder="Tier" />
              <OptionSelect className="w-40" value={co.relationshipStatus} onChange={(v) => patch({ relationshipStatus: v })} options={RELATIONSHIP} placeholder="Relationship" />
            </>
          ) : <><Badge variant="outline">{titleCase(co.tier)}</Badge><Badge variant="outline">{titleCase(co.relationshipStatus)}</Badge></>}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Drives held", co.history.driveCount], ["Students hired", co.history.studentsHired], ["Highest package", fmtLpa(co.history.highestPackageLpa)], ["Average package", fmtLpa(co.history.averagePackageLpa)]].map(([l, v]) => (
          <Card key={String(l)} size="sm"><CardHeader><CardDescription>{l}</CardDescription><CardTitle className="text-2xl">{v}</CardTitle></CardHeader></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Drive history</CardTitle><CardDescription>Years visited: {co.history.years.join(", ") || "none yet"}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {co.history.drives.map((d) => <div key={d.id} className="flex justify-between gap-2"><Link className="underline-offset-4 hover:underline" href={`/staff/drives/${d.id}`}>{d.role}</Link><span className="text-muted-foreground">{fmtDate(d.driveDate)} · {titleCase(d.status)}</span></div>)}
            {co.history.drives.length === 0 && <span className="text-muted-foreground">No published drives.</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {co.contacts.map((p, i) => <div key={i}><span className="font-medium">{p.name}</span> {p.designation && <span className="text-muted-foreground">· {p.designation}</span>}<div className="text-muted-foreground">{[p.email, p.phone].filter(Boolean).join(" · ")}</div></div>)}
            {co.contacts.length === 0 && <span className="text-muted-foreground">No contacts recorded.</span>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Notes and follow-ups</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {canEdit && (
            <Field><FieldLabel htmlFor="note">Add a note</FieldLabel><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} /><div><Button disabled={busy || !note.trim()} onClick={addNote}>{busy && <Spinner />}Add note</Button></div></Field>
          )}
          {notes.data?.map((n) => <div key={n.id} className="rounded-md border p-3 text-sm">{n.body}<div className="pt-1 text-xs text-muted-foreground">{n.author?.name} · {fmtDateTime(n.createdAt)}{n.followUpDate && ` · follow up ${fmtDate(n.followUpDate)}`}</div></div>)}
        </CardContent>
      </Card>
    </div>
  )
}
