"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { ChartColumnIcon, HistoryIcon, LayoutGridIcon, LifeBuoyIcon, PuzzleIcon, ShieldCheckIcon, UserCogIcon } from "lucide-react"
import { PlatformTab, PlatformTabList } from "../../_components/tabs"
import { HealthPanel } from "./health-panel"
import { platformAvailability } from "@/lib/moduleRollout"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiClientError, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { EmptyNote, TableBox } from "../../_components/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Detail = {
  id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; isActive: boolean; createdAt: string; updatedAt: string; registrationStatus: string
  modules: { module: string; enabled: boolean }[]; firstAdministrator: { name: string; email: string; isActive: boolean } | null
  counts: { staff: number; students: number; activeStudents: number; departments: number; programs: number; batches: number }; lastActivity: string | null
  security?: { requireMfaForAdmins: boolean }
  history: { id: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string; by: { name: string; email: string } | null }[]
}
type Usage = {
  period: { from: string; to: string; defaulted: boolean }
  snapshot: { users: number; activeUsers: number; students: number; activeStudents: number; documents: number; storageBytes: number }
  activity: { signIns: number; distinctSignedInUsers: number; newUsers: number; newStudents: number; uploads: number; uploadBytes: number; ai: { calls: number; failures: number; blocked: number; byPurpose: { purpose: string; calls: number }[] } }
  basis: string
}
type StaffPage = { items: { id: string; name: string; email: string; roles: string[]; departmentName: string | null; isActive: boolean }[]; total: number }
type SupportRows = { items: { id: string; subject: string; status: string; category: string; createdAt: string; assignee: { name: string | null } | null; entryCount: number }[]; total: number }
type Tab = "overview" | "modules" | "administrators" | "usage" | "activity" | "support" | "security"
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)
const show = (v: unknown) => (Array.isArray(v) ? v.map(titleCase).join(", ") || "none" : v === null || v === undefined ? "none" : String(v))

/** Institution detail, editing and usage for platform administrators. The API enforces access, the second step, uniqueness and concurrency; this page only displays and sends. */
export default function InstitutionPage() {
  return <React.Suspense fallback={<div className="mx-auto max-w-4xl p-6"><Skeleton className="h-64 w-full" /></div>}><InstitutionLoader /></React.Suspense>
}

function InstitutionLoader() {
  const { id } = useParams<{ id: string }>()
  const { data, error, loading, reload } = useApi<Detail>(`/api/platform/institutions/${id}`)
  const [tab, setTab] = React.useState<Tab>("overview") // kept here so saving (which remounts the body) does not send you back to the first tab
  if (error instanceof ApiClientError && [401, 403].includes(error.status)) return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6"><Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert><Button render={<Link href="/platform" />}>Go to platform sign-in</Button></div>
  )
  if (error) return <div className="mx-auto max-w-md p-6"><Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert></div>
  if (loading || !data) return <div className="mx-auto max-w-4xl p-6"><Skeleton className="h-64 w-full" /></div>
  return <Body key={data.updatedAt} id={id} data={data} reload={reload} tab={tab} setTab={setTab} /> // remounts with fresh form values after every save
}

function Body({ id, data, reload, tab, setTab }: { id: string; data: Detail; reload: () => void; tab: Tab; setTab: (t: Tab) => void }) {
  const [range, setRange] = React.useState({ from: "", to: "" })
  const usage = useApi<Usage>(`/api/platform/institutions/${id}/usage`, { from: range.from || undefined, to: range.to || undefined })
  const [f, setF] = React.useState({ name: data.name, brandColor: data.brandColor ?? "", logoUrl: data.logoUrl ?? "", modules: data.modules.filter((m) => m.enabled).map((m) => m.module) })
  const [busy, setBusy] = React.useState(false)
  const [confirmOff, setConfirmOff] = React.useState(false)
  const staff = useApi<StaffPage>(tab === "administrators" ? `/api/platform/institutions/${id}/staff` : null, { pageSize: 100 })
  const platformModules = useApi<{ items: { module: string; globallyEnabled: boolean; availableFrom: string | null; rolloutPercent: number }[] }>(tab === "modules" ? "/api/platform/modules" : null)
  const policy = useApi<{ mfa: { requireForInstitutionAdmins: boolean } }>(tab === "security" ? "/api/platform/policy" : null)
  const support = useApi<SupportRows>(tab === "support" ? "/api/platform/support" : null, { institution: id, pageSize: 20 })
  const save = async () => {
    setBusy(true)
    try {
      await api(`/api/platform/institutions/${id}`, { method: "PATCH", body: { name: f.name, brandColor: f.brandColor || null, logoUrl: f.logoUrl || null, modules: f.modules, expectedUpdatedAt: data.updatedAt } })
      toast.success("Saved"); reload(); usage.reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const toggleStatus = async () => { setBusy(true); try { await api(`/api/platform/institutions/${id}`, { method: "PATCH", body: { isActive: !data.isActive, expectedUpdatedAt: data.updatedAt } }); toast.success(data.isActive ? "Deactivated" : "Reactivated"); reload() } catch (e) { toastError(e) } finally { setBusy(false) } }
  const u = usage.data
  const admins = (staff.data?.items ?? []).filter((x) => x.roles.includes("TPO_ADMIN"))
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{data.slug} · registered {fmtDate(data.createdAt)} · <Badge variant={data.isActive ? "default" : "secondary"}>{titleCase(data.registrationStatus)}</Badge></p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" render={<Link href={`/platform/institutions/${id}/staff`} />}>Staff roles</Button><Button variant={data.isActive ? "outline" : "default"} size="sm" disabled={busy} onClick={() => (data.isActive ? setConfirmOff(true) : toggleStatus())}>{data.isActive ? "Deactivate" : "Reactivate"}</Button></div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <PlatformTabList aria-label="Institution sections">
          <PlatformTab value="overview" icon={LayoutGridIcon}>Overview</PlatformTab><PlatformTab value="modules" icon={PuzzleIcon}>Modules</PlatformTab><PlatformTab value="administrators" icon={UserCogIcon}>Administrators</PlatformTab>
          <PlatformTab value="usage" icon={ChartColumnIcon}>Usage</PlatformTab><PlatformTab value="activity" icon={HistoryIcon}>Activity</PlatformTab><PlatformTab value="support" icon={LifeBuoyIcon}>Support</PlatformTab><PlatformTab value="security" icon={ShieldCheckIcon}>Security</PlatformTab>
        </PlatformTabList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Overview</CardTitle><CardDescription>Counts only. No student or staff records are shown here.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
              <div><div className="text-muted-foreground">First administrator</div>{data.firstAdministrator ? <>{data.firstAdministrator.name}<div className="text-xs text-muted-foreground">{data.firstAdministrator.email}</div></> : "none"}</div>
              <div><div className="text-muted-foreground">Staff</div>{data.counts.staff}</div><div><div className="text-muted-foreground">Students</div>{data.counts.students} ({data.counts.activeStudents} active)</div>
              <div><div className="text-muted-foreground">Departments / programmes / batches</div>{data.counts.departments} / {data.counts.programs} / {data.counts.batches}</div>
              <div><div className="text-muted-foreground">Last activity</div>{data.lastActivity ? fmtDateTime(data.lastActivity) : "none yet"}</div>
              <div><div className="text-muted-foreground">Modules on</div>{data.modules.filter((m) => m.enabled).length} of {data.modules.length}</div>
            </CardContent></Card>
          <HealthPanel id={id} firstAdministrator={data.firstAdministrator} counts={data.counts} modules={data.modules} lastActivity={data.lastActivity} />
        </TabsContent>

        <TabsContent value="modules" className="mt-4">
          <Card><CardHeader><CardTitle>Details and modules</CardTitle><CardDescription>Switching a module off hides it from the institution; its data is kept. A module being on does not give anyone extra permissions. A module marked by the platform as off, not launched or not yet released to this institution is unavailable here whatever is chosen (see Module management).</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Input aria-label="Institution name" className="min-w-64 flex-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <Input aria-label="Brand colour" className="w-36" placeholder="#1a73e8" value={f.brandColor} onChange={(e) => setF({ ...f, brandColor: e.target.value })} />
                <Input aria-label="Logo address" className="min-w-64 flex-1" placeholder="https://…" value={f.logoUrl} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} />
              </div>
              <fieldset className="grid gap-2 sm:grid-cols-3"><legend className="mb-1 text-sm text-muted-foreground">Modules</legend>
                {data.modules.map((m) => (
                  <label key={m.module} className="flex flex-wrap items-center gap-2 text-sm"><Checkbox aria-label={titleCase(m.module)} checked={f.modules.includes(m.module)} onCheckedChange={(c) => setF({ ...f, modules: c ? [...f.modules, m.module] : f.modules.filter((x) => x !== m.module) })} />{titleCase(m.module)}{(() => {
                    const p = platformModules.data?.items.find((x) => x.module === m.module)
                    if (!p) return null
                    const a = platformAvailability({ globallyEnabled: p.globallyEnabled, availableFrom: p.availableFrom ? new Date(p.availableFrom) : null, rolloutPercent: p.rolloutPercent }, id, m.module, new Date())
                    return a.available ? null : <Badge variant={a.reason === "off" ? "destructive" : "secondary"}>{a.reason === "off" ? "Off for everyone" : a.reason === "not_yet" ? "Not launched yet" : "Not released to this institution yet"}</Badge>
                  })()}</label>
                ))}
              </fieldset>
              <div><Button disabled={busy} onClick={save}>Save changes</Button></div>
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="administrators" className="mt-4">
          <Card><CardHeader><CardTitle>Administrators</CardTitle><CardDescription>Staff holding the Head TPO role. Change anyone&apos;s role on the staff roles page.</CardDescription></CardHeader>
            <CardContent>
              {staff.error ? <Alert variant="destructive"><AlertTitle>Could not load administrators</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{staff.error instanceof Error ? staff.error.message : "Try again"}<Button size="sm" variant="outline" onClick={staff.reload}>Try again</Button></AlertDescription></Alert>
                : !staff.data ? <Skeleton className="h-24 w-full" /> : admins.length === 0 ? <EmptyNote>No Head TPO administrator found among the first 100 staff.</EmptyNote> : (
                  <TableBox><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>{admins.map((a) => <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.email}</TableCell><TableCell><Badge variant={a.isActive ? "default" : "secondary"}>{a.isActive ? "Active" : "Inactive"}</Badge></TableCell></TableRow>)}</TableBody></Table></TableBox>
                )}
              {staff.data && <p className="mt-3 text-xs text-muted-foreground">{staff.data.total} staff in total.</p>}
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <Card><CardHeader><CardTitle>Usage</CardTitle><CardDescription>{u ? `${u.period.from} to ${u.period.to}${u.period.defaulted ? " (last 30 days)" : ""}` : "Loading"}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2"><Input aria-label="Usage from" type="date" className="w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /><Input aria-label="Usage to" type="date" className="w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /><Button variant="ghost" size="sm" onClick={() => setRange({ from: "", to: "" })}>Last 30 days</Button></div>
              {usage.error ? <Alert variant="destructive"><AlertTitle>Could not load usage</AlertTitle><AlertDescription>{usage.error instanceof Error ? usage.error.message : "Try again"}</AlertDescription></Alert> : !u ? <Skeleton className="h-24" /> : (
                <dl className="grid gap-3 text-sm sm:grid-cols-3" data-testid="usage">
                  <div><dt className="text-muted-foreground">Users (active)</dt><dd data-testid="u-users">{u.snapshot.users} ({u.snapshot.activeUsers})</dd></div>
                  <div><dt className="text-muted-foreground">Students (active)</dt><dd data-testid="u-students">{u.snapshot.students} ({u.snapshot.activeStudents})</dd></div>
                  <div><dt className="text-muted-foreground">Stored documents</dt><dd data-testid="u-docs">{u.snapshot.documents} · {bytes(u.snapshot.storageBytes)}</dd></div>
                  <div><dt className="text-muted-foreground">Sign-ins in period</dt><dd data-testid="u-signins">{u.activity.signIns} by {u.activity.distinctSignedInUsers} people</dd></div>
                  <div><dt className="text-muted-foreground">Uploads in period</dt><dd data-testid="u-uploads">{u.activity.uploads} · {bytes(u.activity.uploadBytes)}</dd></div>
                  <div><dt className="text-muted-foreground">AI calls in period</dt><dd data-testid="u-ai">{u.activity.ai.calls} ({u.activity.ai.failures} failed, {u.activity.ai.blocked} blocked)</dd></div>
                </dl>
              )}
              {u && <p className="text-xs text-muted-foreground">{u.basis}</p>}
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card><CardHeader><CardTitle>Change history</CardTitle><CardDescription>What platform administrators changed, newest first.</CardDescription></CardHeader>
            <CardContent>{data.history.length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded.</p> : (
              <ol className="flex flex-col gap-2" data-testid="history">{data.history.map((h) => (
                <li key={h.id} className="rounded-md border p-3 text-sm"><div className="text-xs text-muted-foreground">{h.action} · {h.by?.name ?? "Administrator"} · {fmtDateTime(h.createdAt)}</div>
                  {h.after && Object.keys(h.after).map((k) => <div key={k}>{titleCase(k)}: <span className="text-muted-foreground">{show(h.before?.[k])}</span> → {show(h.after?.[k])}</div>)}</li>
              ))}</ol>
            )}</CardContent></Card>
        </TabsContent>

        <TabsContent value="support" className="mt-4">
          <Card><CardHeader><CardTitle>Support requests</CardTitle><CardDescription>Requests from this institution&apos;s administrators, newest first. Personal details are hidden.</CardDescription></CardHeader>
            <CardContent>
              {support.error ? <Alert variant="destructive"><AlertTitle>Could not load support requests</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{support.error instanceof Error ? support.error.message : "Try again"}<Button size="sm" variant="outline" onClick={support.reload}>Try again</Button></AlertDescription></Alert>
                : !support.data ? <Skeleton className="h-24 w-full" /> : support.data.items.length === 0 ? <EmptyNote>This institution has no support requests.</EmptyNote> : (
                  <TableBox><Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Assigned to</TableHead><TableHead>Opened</TableHead></TableRow></TableHeader>
                    <TableBody>{support.data.items.map((r) => <TableRow key={r.id}><TableCell className="font-medium">{r.subject}</TableCell><TableCell>{titleCase(r.category)}</TableCell><TableCell><Badge variant={r.status === "RESOLVED" ? "secondary" : "default"}>{titleCase(r.status)}</Badge></TableCell><TableCell>{r.assignee?.name ?? "Unassigned"}</TableCell><TableCell>{fmtDate(r.createdAt)}</TableCell></TableRow>)}</TableBody></Table></TableBox>
                )}
              <div className="mt-3"><Button variant="outline" size="sm" render={<Link href="/platform/support" />}>Open support requests</Button></div>
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card><CardHeader><CardTitle>Security</CardTitle><CardDescription>How administrators at this institution sign in. Settings only: no person is shown.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <div className="flex items-start gap-3"><ShieldCheckIcon className="mt-0.5 size-5 text-primary" />
                <div><div className="font-medium">Two-step sign-in for administrators</div>
                  <div className="text-muted-foreground">{policy.error ? "The platform rule could not be loaded." : !policy.data || !data.security ? "Loading" : policy.data.mfa.requireForInstitutionAdmins ? "Required by the platform for every institution." : data.security.requireMfaForAdmins ? "Required by this institution." : "Not required: each administrator chooses."}</div></div></div>
              <p className="rounded-md border bg-muted/40 p-3 text-muted-foreground">Not shown here: which individual administrators have set up two-step sign-in, sign-in failures and sign-in history for this institution. The platform does not record sign-in failures, and administrator-level detail belongs to the institution. The platform&apos;s own changes to this institution are under Activity.</p>
              <div><Button variant="outline" size="sm" render={<Link href="/platform/policy" />}>Open the platform security policy</Button></div>
            </CardContent></Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Deactivate {data.name}?</AlertDialogTitle><AlertDialogDescription>Everyone at this institution, staff, students and employers, loses access until you reactivate it. Their records are kept. The change is recorded in the audit log.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setConfirmOff(false); void toggleStatus() }}>Deactivate</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
