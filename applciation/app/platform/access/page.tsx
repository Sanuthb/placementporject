"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OptionSelect } from "@/components/option-select"
import { api, toastError } from "@/lib/web/api"
import { titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { denied } from "../_components/denied"

type Matrix = { roles: string[]; endpointCount: number; perRole: Record<string, { allowed: number; refused: number }>; audiences: Record<string, number>; note: string; scope: { statement: string; staffRoutes: number; narrowing: { handler: number; shared: number; noneDetected: number }; narrowingNote: string }; items: { method: string; path: string; audience: string; allowedRoles: string[] | null; anyStaffRole: boolean; narrowing: "handler" | "shared" | "none-detected" | null }[]; page: number; total: number; totalPages: number }
const ROLE_INFO: { role: string; title: string; summary: string }[] = [
  { role: "TPO_ADMIN", title: "Head TPO", summary: "Runs placement for the institution: companies, drives, job descriptions, preparation campaigns, reports, student onboarding, staff and institution settings." },
  { role: "PLACEMENT_OFFICER", title: "Placement Officer", summary: "Works the placement process day to day: job descriptions, matching and shortlisting, campaigns, assessments, notifications and student progress. Cannot manage staff or change institution settings." },
  { role: "DEPARTMENT_COORDINATOR", title: "Department Coordinator (HOD)", summary: "Follows the students and readiness of their own department. Cannot create drives, manage companies or manage staff." },
  { role: "FACULTY", title: "Faculty and mentors", summary: "Teaching staff and mentors. No placement access; limited to the faculty tools for the students they mentor." },
  { role: "PRINCIPAL", title: "Principal", summary: "Read-only view of the institution: dashboard, analytics and reports. Changes nothing." },
]
type Admin = { id: string; email: string; name: string; isActive: boolean; createdAt: string; mfaEnrolled: boolean | null }

/** Access: the read-only role and permission matrix (roles are fixed; permissions cannot be edited) and the platform administrators. The API enforces everything. */
export default function AccessPage() {
  const [role, setRole] = React.useState(""); const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState(""); const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const m = useApi<Matrix>("/api/platform/roles", { role: role || undefined, q: dq || undefined, audience: role ? "staff" : undefined, page, pageSize: 25 })
  const a = useApi<{ items: Admin[] }>("/api/platform/admins")
  const [busy, setBusy] = React.useState(false)
  const d = denied(m.error) ?? denied(a.error); if (d) return d
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); a.reload() } catch (e) { toastError(e) } finally { setBusy(false) } }
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Access</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Who administers the platform, and what each institution role is for.</p></div>
        
      </header>

      <Card><CardHeader><CardTitle>Platform administrators</CardTitle><CardDescription>Platform administrator accounts are created by the platform team with a script, not here. You can deactivate an administrator; you cannot remove yourself or the last active administrator.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!a.data ? <Skeleton className="h-20" /> : (
            <div className="w-full overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>E-mail</TableHead><TableHead>Two-step</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{a.data.items.map((x) => (
                <TableRow key={x.id} data-testid={`admin-${x.email}`}><TableCell>{x.name}</TableCell><TableCell>{x.email}</TableCell><TableCell>{x.mfaEnrolled === null ? "unknown" : x.mfaEnrolled ? "set up" : "not yet"}</TableCell><TableCell><Badge variant={x.isActive ? "default" : "secondary"}>{x.isActive ? "Active" : "Removed"}</Badge></TableCell>
                  <TableCell>{x.isActive && <Button size="sm" variant="outline" disabled={busy} aria-label={`Remove ${x.email}`} onClick={() => run(() => api(`/api/platform/admins/${x.id}`, { method: "DELETE" }), "Administrator removed")}>Remove</Button>}</TableCell></TableRow>
              ))}</TableBody></Table></div>
          )}
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Institution roles</CardTitle><CardDescription>The five roles are fixed and cannot be edited or extended. Assign them to an institution&apos;s staff from that institution&apos;s page. This is a summary of intent; what a person can actually do also depends on the modules their institution has switched on.</CardDescription></CardHeader>
        <CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ROLE_INFO.map((r) => <div key={r.role} className="rounded-lg border p-3"><div className="text-sm font-medium">{r.title}</div><p className="mt-1 text-sm text-muted-foreground">{r.summary}</p></div>)}</div></CardContent></Card>

      <details className="group rounded-xl border bg-card shadow-xs open:pb-1" data-testid="technical-matrix">
        <summary className="cursor-pointer list-none rounded-xl p-4 text-sm font-medium marker:hidden hover:bg-muted/40">Technical authorization matrix <span className="font-normal text-muted-foreground">· for audit and security review; expand to view</span></summary>
      <Card className="border-0 shadow-none"><CardHeader><CardTitle>Roles and permissions</CardTitle><CardDescription>Read-only. Shows the route-level rule only, generated from the authorization rules in the code. Roles are fixed and permissions cannot be edited. Assign existing roles to an institution&apos;s staff from that institution&apos;s page.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {m.error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{m.error instanceof Error ? m.error.message : "Try again"}</AlertDescription></Alert> : !m.data ? <Skeleton className="h-40" /> : (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-5" data-testid="per-role">{m.data.roles.map((r) => <div key={r} className="rounded-md border p-2"><div className="font-medium">{titleCase(r)}</div><div className="text-xs text-muted-foreground">{m.data!.perRole[r].allowed} allowed · {m.data!.perRole[r].refused} refused</div></div>)}</div>
              <Alert data-testid="matrix-scope"><AlertTitle>Route-level rules, not every effective permission</AlertTitle><AlertDescription>{m.data.scope.statement} Of {m.data.scope.staffRoutes} staff endpoints, {m.data.scope.narrowing.handler} narrow access in their own code, {m.data.scope.narrowing.shared} use shared code that may narrow it, and {m.data.scope.narrowing.noneDetected} showed no further rule in a source scan (a heuristic, not proof).</AlertDescription></Alert>
              <p className="text-xs text-muted-foreground">{m.data.endpointCount} endpoints: {Object.entries(m.data.audiences).map(([k, n]) => `${n} ${k}`).join(", ")}. {m.data.note}</p>
              <div className="flex flex-wrap gap-2"><Input aria-label="Search paths" className="w-64" placeholder="Search a path" value={q} onChange={(e) => setQ(e.target.value)} /><OptionSelect className="w-56" placeholder="Role" value={role} onChange={(v) => { setRole(v); setPage(1) }} options={[{ value: "", label: "All endpoints" }, ...m.data.roles.map((r) => ({ value: r, label: `Allowed for ${titleCase(r)}` }))]} /></div>
              <div className="w-full overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Path</TableHead><TableHead>Audience</TableHead><TableHead>Route-level: allowed staff roles</TableHead><TableHead>Further narrowing</TableHead></TableRow></TableHeader>
                <TableBody>{m.data.items.map((x) => <TableRow key={x.method + x.path}><TableCell>{x.method}</TableCell><TableCell className="font-mono text-xs">{x.path}</TableCell><TableCell>{x.audience}</TableCell><TableCell className="text-xs">{x.allowedRoles ? (x.allowedRoles.length ? x.allowedRoles.map(titleCase).join(", ") : "none") : "—"}{x.anyStaffRole ? " (no role list: any placement role)" : ""}</TableCell><TableCell className="text-xs" data-testid="narrowing">{x.narrowing === "handler" ? "Narrowed in the handler" : x.narrowing === "shared" ? "May be narrowed in shared code" : x.narrowing === "none-detected" ? "None detected (not proof)" : "—"}</TableCell></TableRow>)}</TableBody></Table></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{m.data.total} endpoints · page {m.data.page} of {m.data.totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= m.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
            </>
          )}
        </CardContent></Card>
      </details>
    </div>
  )
}
