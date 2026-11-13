"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OptionSelect } from "@/components/option-select"
import { api, toastError } from "@/lib/web/api"
import { titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { denied } from "../../../_components/denied"

const ROLES = ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY", "PRINCIPAL"]
type Staff = { id: string; name: string; email: string; roles: string[]; departmentId: string | null; departmentName: string | null; isActive: boolean }
type Data = { items: Staff[]; departments: { id: string; name: string }[]; page: number; total: number; totalPages: number }

export default function StaffRolesPage() {
  return <React.Suspense fallback={<div className="mx-auto max-w-5xl p-6"><Skeleton className="h-64 w-full" /></div>}><Loader /></React.Suspense>
}

/** Assign the existing roles to an institution's staff. No custom roles, no permission editing. The API refuses self-changes and removing the last administrator. */
function Loader() {
  const { id } = useParams<{ id: string }>()
  const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState(""); const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const { data, error, loading, reload } = useApi<Data>(`/api/platform/institutions/${id}/staff`, { q: dq || undefined, page, pageSize: 25 })
  const d = denied(error); if (d) return d
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Staff roles</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Assign the existing roles. A department is needed exactly when Department Coordinator is chosen. Every change is audited.</p></div>
        <Button variant="outline" size="sm" render={<Link href={`/platform/institutions/${id}`} />}>Back to institution</Button>
      </header>
      <Input aria-label="Search staff" className="w-72" placeholder="Search name or e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
      {error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert> : loading && !data ? <Skeleton className="h-48" /> : data && (
        <>
          <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Roles</TableHead><TableHead>Department</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{data.items.map((s) => <Row key={s.id + s.roles.join() + s.departmentId} id={id} s={s} departments={data.departments} reload={reload} />)}
              {data.items.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No staff match.</TableCell></TableRow>}</TableBody></Table></div>
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{data.total} staff · page {data.page} of {data.totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        </>
      )}
    </div>
  )
}

function Row({ id, s, departments, reload }: { id: string; s: Staff; departments: Data["departments"]; reload: () => void }) {
  const [roles, setRoles] = React.useState(s.roles); const [dept, setDept] = React.useState(s.departmentId ?? ""); const [busy, setBusy] = React.useState(false)
  const dirty = roles.join() !== s.roles.join() || (dept || null) !== s.departmentId
  const save = async () => {
    setBusy(true)
    try { await api(`/api/platform/institutions/${id}/staff/${s.id}`, { method: "PATCH", body: { roles, departmentId: roles.includes("DEPARTMENT_COORDINATOR") ? dept || null : null } }); toast.success("Roles saved"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <TableRow data-testid={`staff-${s.email}`}>
      <TableCell>{s.name}<div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
      <TableCell><div className="flex flex-wrap gap-x-3 gap-y-1">{ROLES.map((r) => <label key={r} className="flex items-center gap-1 text-xs"><Checkbox aria-label={`${s.email} ${titleCase(r)}`} checked={roles.includes(r)} onCheckedChange={(c) => setRoles(c ? [...roles, r].slice(0, 3) : roles.filter((x) => x !== r))} />{titleCase(r)}</label>)}</div>
        {dirty && <Button size="sm" className="mt-2" disabled={busy || roles.length === 0} onClick={save} aria-label={`Save roles for ${s.email}`}>Save</Button>}</TableCell>
      <TableCell>{roles.includes("DEPARTMENT_COORDINATOR") ? <OptionSelect className="w-44" placeholder="Department" value={dept} onChange={setDept} options={[{ value: "", label: "Choose" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} /> : <span className="text-xs text-muted-foreground">{s.departmentName ?? "—"}</span>}</TableCell>
      <TableCell><Badge variant={s.isActive ? "default" : "secondary"}>{s.isActive ? "Active" : "Inactive"}</Badge></TableCell>
    </TableRow>
  )
}
