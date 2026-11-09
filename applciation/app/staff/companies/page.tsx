"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { ConfirmDelete, RowActions } from "@/components/row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { RELATIONSHIP, TIERS } from "@/lib/web/enums"
import { statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Company = { id: string; name: string; industry: string | null; website?: string | null; tier: string; relationshipStatus: string; isActive: boolean }

const RelBadge = ({ s }: { s: string }) => <Badge variant={statusVariant(s === "ACTIVE" ? "VERIFIED" : s === "BLACKLISTED" ? "REJECTED" : "")}>{titleCase(s)}</Badge>

/** One form for adding and editing a company. `initial` is set when editing. It is remounted on every open, so its state starts fresh. */
function CompanyDialog({ open, initial, onClose, onSaved }: { open: boolean; initial: Company | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit company" : "Add a company"}</DialogTitle></DialogHeader>
        {open && <CompanyForm key={initial?.id ?? "new"} initial={initial} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function CompanyForm({ initial, onClose, onSaved }: { initial: Company | null; onClose: () => void; onSaved: () => void }) {
  const [tier, setTier] = React.useState(initial?.tier ?? "REGULAR")
  const [rel, setRel] = React.useState(initial?.relationshipStatus ?? "ACTIVE")
  const [busy, setBusy] = React.useState(false)

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const text = (k: string) => String(f.get(k) ?? "").trim()
    setBusy(true)
    try {
      if (initial) await api(`/api/companies/${initial.id}`, { method: "PATCH", body: { name: text("name"), industry: text("industry") || null, website: text("website") || null, tier, relationshipStatus: rel } })
      else {
        const body: Record<string, unknown> = { name: text("name"), tier }
        for (const k of ["industry", "website"]) if (text(k)) body[k] = text(k)
        await api("/api/companies", { method: "POST", body })
      }
      toast.success(initial ? "Company updated" : "Company added")
      onClose(); onSaved()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" minLength={2} defaultValue={initial?.name ?? ""} required /></Field>
        <Field><FieldLabel htmlFor="industry">Industry</FieldLabel><Input id="industry" name="industry" defaultValue={initial?.industry ?? ""} /></Field>
        <Field><FieldLabel htmlFor="website">Website</FieldLabel><Input id="website" name="website" type="url" placeholder="https://" defaultValue={initial?.website ?? ""} /></Field>
        <Field><FieldLabel>Tier</FieldLabel><OptionSelect className="w-full" value={tier} onChange={setTier} options={TIERS} placeholder="Tier" /></Field>
        {initial && <Field><FieldLabel>Relationship</FieldLabel><OptionSelect className="w-full" value={rel} onChange={setRel} options={RELATIONSHIP} placeholder="Relationship" /></Field>}
      </FieldGroup>
      <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}{initial ? "Save changes" : "Add company"}</Button></DialogFooter>
    </form>
  )
}

export default function CompaniesPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)
  const [q, setQ] = React.useState("")
  const [tier, setTier] = React.useState("")
  const search = React.useDeferredValue(q)
  const { data, loading, reload } = useApi<{ items: Company[] }>("/api/companies", { q: search, tier, limit: 100 })
  const [dialog, setDialog] = React.useState<{ open: boolean; company: Company | null }>({ open: false, company: null })
  const [deleting, setDeleting] = React.useState<Company | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api(`/api/companies/${deleting.id}`, { method: "DELETE" }); toast.success("Company deleted"); setDeleting(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const actions = (c: Company) => (
    <RowActions viewHref={`/staff/companies/${c.id}`}
      onEdit={canEdit ? () => setDialog({ open: true, company: c }) : undefined}
      onToggle={canEdit ? async () => { try { await api(`/api/companies/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } }); reload() } catch (e) { toastError(e) } } : undefined}
      toggleLabel={c.isActive ? "Deactivate" : "Reactivate"}
      onDelete={canEdit ? () => setDeleting(c) : undefined} />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-64" placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-40" value={tier} onChange={setTier} options={[{ value: "", label: "All tiers" }, ...TIERS]} placeholder="Tier" />
        {canEdit && <Button className="sm:ml-auto" onClick={() => setDialog({ open: true, company: null })}>Add company</Button>}
      </div>
      {loading && !data ? <Skeleton className="h-48 rounded-xl" /> : (<>
        <div className="hidden overflow-hidden rounded-xl border md:block">
          <Table>
            <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Industry</TableHead><TableHead>Tier</TableHead><TableHead>Relationship</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.items.map((c) => (
                <TableRow key={c.id} className={c.isActive ? "" : "opacity-60"}>
                  <TableCell><Link href={`/staff/companies/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.name}</Link></TableCell>
                  <TableCell>{c.industry ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{titleCase(c.tier)}</Badge></TableCell>
                  <TableCell><RelBadge s={c.relationshipStatus} /></TableCell>
                  <TableCell className="text-right">{actions(c)}</TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No companies yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 md:hidden">
          {data?.items.map((c) => (
            <div key={c.id} className={`flex flex-col gap-2 rounded-xl border p-3 text-sm ${c.isActive ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <Link href={`/staff/companies/${c.id}`} className="min-w-0 font-medium">{c.name}<div className="text-xs font-normal text-muted-foreground">{c.industry ?? "No industry"}</div></Link>
                {actions(c)}
              </div>
              <div className="flex flex-wrap gap-2"><Badge variant="outline">{titleCase(c.tier)}</Badge><RelBadge s={c.relationshipStatus} /></div>
            </div>
          ))}
          {data?.items.length === 0 && <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">No companies yet.</p>}
        </div>
      </>)}
      <CompanyDialog open={dialog.open} initial={dialog.company} onClose={() => setDialog({ open: false, company: null })} onSaved={reload} />
      <ConfirmDelete open={!!deleting} what={deleting ? deleting.name : "this company"} busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
