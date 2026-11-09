"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { ConfirmDelete, RowActions } from "@/components/row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { DRIVE_STATUS } from "@/lib/web/enums"
import { fmtDate, fmtLpa, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = { id: string; role: string; jobType: string; status: string; driveDate: string; applicationDeadline: string; packageMinLpa: number | string | null; packageMaxLpa: number | string | null; company: { name: string; tier: string }; _count: { applications: number } }

const pay = (d: Drive) => (d.packageMinLpa || d.packageMaxLpa ? `${fmtLpa(d.packageMinLpa)} to ${fmtLpa(d.packageMaxLpa)}` : "—")
const StatusBadge = ({ s }: { s: string }) => <Badge variant={s === "PUBLISHED" ? "default" : s === "CANCELLED" ? "destructive" : "secondary"}>{titleCase(s)}</Badge>

export default function DrivesPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)
  const [status, setStatus] = React.useState("")
  const { data, loading, reload } = useApi<{ items: Drive[] }>("/api/drives", { status, limit: 100 })
  const [deleting, setDeleting] = React.useState<Drive | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api(`/api/drives/${deleting.id}`, { method: "DELETE" }); toast.success("Draft deleted"); setDeleting(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  // Only an untouched draft can be deleted; anything that went live is cancelled or closed from its page.
  const actions = (d: Drive) => <RowActions viewHref={`/staff/drives/${d.id}`} onDelete={canEdit && d.status === "DRAFT" && d._count.applications === 0 ? () => setDeleting(d) : undefined} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect className="w-44" value={status} onChange={setStatus} options={[{ value: "", label: "All statuses" }, ...DRIVE_STATUS]} placeholder="Status" />
        {canEdit && <Button className="ml-auto" render={<Link href="/staff/drives/new" />}>Create drive</Button>}
      </div>
      {loading && !data ? <Skeleton className="h-48 rounded-xl" /> : (<>
        <div className="hidden overflow-hidden rounded-xl border md:block">
          <Table>
            <TableHeader><TableRow><TableHead>Company / role</TableHead><TableHead>Type</TableHead><TableHead>Package</TableHead><TableHead>Deadline</TableHead><TableHead>Drive date</TableHead><TableHead>Applied</TableHead><TableHead>Status</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><Link href={`/staff/drives/${d.id}`} className="font-medium underline-offset-4 hover:underline">{d.company.name}</Link><div className="text-xs text-muted-foreground">{d.role}</div></TableCell>
                  <TableCell>{titleCase(d.jobType)}</TableCell>
                  <TableCell>{pay(d)}</TableCell>
                  <TableCell>{fmtDate(d.applicationDeadline)}</TableCell>
                  <TableCell>{fmtDate(d.driveDate)}</TableCell>
                  <TableCell>{d._count.applications}</TableCell>
                  <TableCell><StatusBadge s={d.status} /></TableCell>
                  <TableCell className="text-right">{actions(d)}</TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No drives yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 md:hidden">
          {data?.items.map((d) => (
            <div key={d.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/staff/drives/${d.id}`} className="min-w-0"><div className="font-medium">{d.company.name}</div><div className="text-xs text-muted-foreground">{d.role}</div></Link>
                <div className="flex items-center gap-1"><StatusBadge s={d.status} />{actions(d)}</div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Type</dt><dd>{titleCase(d.jobType)}</dd>
                <dt className="text-muted-foreground">Package</dt><dd>{pay(d)}</dd>
                <dt className="text-muted-foreground">Deadline</dt><dd>{fmtDate(d.applicationDeadline)}</dd>
                <dt className="text-muted-foreground">Drive date</dt><dd>{fmtDate(d.driveDate)}</dd>
                <dt className="text-muted-foreground">Applied</dt><dd>{d._count.applications}</dd>
              </dl>
            </div>
          ))}
          {data?.items.length === 0 && <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">No drives yet.</p>}
        </div>
      </>)}
      <ConfirmDelete open={!!deleting} what={deleting ? `the draft for ${deleting.company.name}` : "this drive"} busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
