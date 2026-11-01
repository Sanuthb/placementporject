"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { TIERS } from "@/lib/web/enums"
import { statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Company = { id: string; name: string; industry: string | null; tier: string; relationshipStatus: string; isActive: boolean }

export default function CompaniesPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && state.profile.role !== "DEPARTMENT_COORDINATOR"
  const [q, setQ] = React.useState("")
  const [tier, setTier] = React.useState("")
  const search = React.useDeferredValue(q)
  const { data, loading, reload } = useApi<{ items: Company[] }>("/api/companies", { q: search, tier, limit: 100 })
  const [open, setOpen] = React.useState(false)
  const [newTier, setNewTier] = React.useState("REGULAR")
  const [busy, setBusy] = React.useState(false)

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body: Record<string, unknown> = { name: f.get("name"), tier: newTier }
    for (const k of ["industry", "website"]) if (String(f.get(k)).trim()) body[k] = String(f.get(k)).trim()
    setBusy(true)
    try { await api("/api/companies", { method: "POST", body }); toast.success("Company added"); setOpen(false); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-40" value={tier} onChange={setTier} options={[{ value: "", label: "All tiers" }, ...TIERS]} placeholder="Tier" />
        {canEdit && <Button className="ml-auto" onClick={() => setOpen(true)}>Add company</Button>}
      </div>
      {loading && !data ? <Skeleton className="h-48" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Industry</TableHead><TableHead>Tier</TableHead><TableHead>Relationship</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items.map((c) => (
              <TableRow key={c.id}>
                <TableCell><Link href={`/staff/companies/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.name}</Link></TableCell>
                <TableCell>{c.industry ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{titleCase(c.tier)}</Badge></TableCell>
                <TableCell><Badge variant={statusVariant(c.relationshipStatus === "ACTIVE" ? "VERIFIED" : c.relationshipStatus === "BLACKLISTED" ? "REJECTED" : "")}>{titleCase(c.relationshipStatus)}</Badge></TableCell>
              </TableRow>
            ))}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No companies yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a company</DialogTitle></DialogHeader>
          <form onSubmit={create}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" minLength={2} required /></Field>
              <Field><FieldLabel htmlFor="industry">Industry</FieldLabel><Input id="industry" name="industry" /></Field>
              <Field><FieldLabel htmlFor="website">Website</FieldLabel><Input id="website" name="website" type="url" placeholder="https://" /></Field>
              <Field><FieldLabel>Tier</FieldLabel><OptionSelect className="w-full" value={newTier} onChange={setNewTier} options={TIERS} placeholder="Tier" /></Field>
            </FieldGroup>
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Add company</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
