"use client"

import * as React from "react"
import Link from "next/link"
import { ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, ApiClientError, toastError } from "@/lib/web/api"
import { supabase } from "@/lib/supabase/browser"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Institution = { id: string; name: string; slug: string; isActive: boolean; createdAt: string; _count: { users: number; students: number; departments: number } }

/**
 * Platform administration: creating institutions. Separate from the staff console on purpose; only identities listed as platform
 * administrators can use it, and the API refuses everyone else, including college administrators.
 */
function InstitutionsView() {
  const [q, setQ] = React.useState("")
  const [dq, setDq] = React.useState("")
  const [status, setStatus] = React.useState<"all" | "active" | "inactive">("all")
  const [sort, setSort] = React.useState<"name" | "createdAt" | "staff" | "students">("createdAt")
  const [order, setOrder] = React.useState<"asc" | "desc">("desc")
  const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const { data: list, loading, reload } = useApi<{ items: Institution[]; page: number; total: number; totalPages: number }>("/api/platform/institutions", { q: dq || undefined, status, sort, order, page, pageSize: 20 })
  const data = list?.items
  const sortBy = (k: typeof sort) => { if (k === sort) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder(k === "name" ? "asc" : "desc") } setPage(1) }
  const arrow = (k: typeof sort) => (k === sort ? (order === "asc" ? " ▲" : " ▼") : "")
  const [v, setV] = React.useState({ name: "", slug: "", adminName: "", adminEmail: "", departments: "" })
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // "CODE Name" per line, for example "CSE Computer Science". Optional.
      const departments = v.departments.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [code, ...rest] = l.split(/\s+/); return { code, name: rest.join(" ") || code } })
      await api("/api/platform/institutions", { method: "POST", body: { name: v.name, ...(v.slug ? { slug: v.slug } : {}), admin: { name: v.adminName, email: v.adminEmail }, ...(departments.length ? { departments } : {}) } })
      toast.success("Institution created. The administrator has been emailed an invitation.")
      setV({ name: "", slug: "", adminName: "", adminEmail: "", departments: "" }); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  async function setActive(i: Institution) {
    try { await api(`/api/platform/institutions/${i.id}`, { method: "PATCH", body: { isActive: !i.isActive } }); reload() } catch (err) { toastError(err) }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-8">
      <header><h1 className="text-xl font-semibold tracking-tight">Institutions</h1><p className="text-sm text-muted-foreground">Create institutions and switch them on or off. You cannot see or change an institution&apos;s own records from here.</p></header>
      <Card>
        <CardHeader><CardTitle>New institution</CardTitle><CardDescription>Creates the institution, its settings and its first TPO administrator, who is invited by email.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="i-name">Institution name</FieldLabel><Input id="i-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-slug">Address (optional)</FieldLabel><Input id="i-slug" placeholder="made from the name if empty" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-an">Administrator name</FieldLabel><Input id="i-an" required value={v.adminName} onChange={(e) => setV({ ...v, adminName: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-ae">Administrator email</FieldLabel><Input id="i-ae" type="email" required value={v.adminEmail} onChange={(e) => setV({ ...v, adminEmail: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-d">Starting departments (optional)</FieldLabel><textarea id="i-d" rows={3} className="rounded-md border bg-transparent p-2 text-sm" placeholder={"CSE Computer Science\nECE Electronics"} value={v.departments} onChange={(e) => setV({ ...v, departments: e.target.value })} /><FieldDescription>One per line: code, then name. Leave empty to let the administrator set these up.</FieldDescription></Field>
            </FieldGroup>
            <div><Button type="submit" disabled={busy}>{busy && <Spinner />}Create institution</Button></div>
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search institutions" className="max-w-xs" placeholder="Search name, address or administrator email" value={q} onChange={(e) => setQ(e.target.value)} />
        {(["all", "active", "inactive"] as const).map((st) => <Button key={st} size="sm" variant={status === st ? "default" : "outline"} onClick={() => { setStatus(st); setPage(1) }}>{st === "all" ? "All" : st === "active" ? "Active" : "Inactive"}</Button>)}
      </div>
      {loading && !list ? <Skeleton className="h-32 w-full" /> : data && data.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">{dq || status !== "all" ? "No institutions match your search." : "No institutions yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead><button type="button" onClick={() => sortBy("name")}>Institution{arrow("name")}</button></TableHead><TableHead><button type="button" onClick={() => sortBy("createdAt")}>Created{arrow("createdAt")}</button></TableHead><TableHead><button type="button" onClick={() => sortBy("staff")}>Staff{arrow("staff")}</button></TableHead><TableHead><button type="button" onClick={() => sortBy("students")}>Students{arrow("students")}</button></TableHead><TableHead>State</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data?.map((i) => (
                <TableRow key={i.id}>
                  <TableCell><div className="font-medium">{i.name}</div><div className="text-xs text-muted-foreground">{i.slug}</div></TableCell>
                  <TableCell>{fmtDate(i.createdAt)}</TableCell><TableCell>{i._count.users}</TableCell><TableCell>{i._count.students}</TableCell>
                  <TableCell><Badge variant={i.isActive ? "default" : "secondary"}>{i.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => setActive(i)}>{i.isActive ? "Deactivate" : "Reactivate"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {list && list.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{list.total} institution{list.total === 1 ? "" : "s"} · page {list.page} of {list.totalPages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= list.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      )}
    </div>
  )
}

type Me = { email: string; name: string; mfa: "setup_required" | "challenge" | "ok" }
const digits = (v: string) => v.replace(/\s+/g, "")

/** Hands the upgraded (two-step) session the server returned to the browser's Supabase client. */
async function adopt(t: { access_token: string; refresh_token: string }) {
  const { error } = await supabase().auth.setSession(t)
  if (error) throw error
}

function CodeForm({ label, onSubmit, busy }: { label: string; onSubmit: (code: string) => void; busy: boolean }) {
  const [code, setCode] = React.useState("")
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(digits(code)) }} className="flex max-w-sm flex-col gap-3">
      <Field><FieldLabel htmlFor="p-code">{label}</FieldLabel><Input id="p-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <div><Button type="submit" disabled={busy || digits(code).length < 6}>{busy && <Spinner />}Confirm</Button></div>
    </form>
  )
}

/** Mandatory two-step sign-in. The server refuses every platform call until this is complete; this screen only walks the person through it. */
function MfaGate({ me, onDone }: { me: Me; onDone: () => void }) {
  const [step, setStep] = React.useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [factorId, setFactorId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (me.mfa !== "challenge") return
    void (async () => { const { data } = await supabase().auth.mfa.listFactors(); setFactorId(data?.totp?.[0]?.id ?? null) })()
  }, [me.mfa])

  async function begin() {
    setBusy(true)
    try { setStep(await api<{ factorId: string; qr: string; secret: string }>("/api/platform/mfa/enroll", { method: "POST" })) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function verify(id: string, code: string) {
    setBusy(true)
    try { await adopt(await api<{ access_token: string; refresh_token: string }>("/api/platform/mfa/verify", { method: "POST", body: { factorId: id, code } })); onDone() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <Alert><ShieldCheckIcon /><AlertTitle>{me.mfa === "challenge" ? "Confirm it is you" : "Set up two-step sign-in"}</AlertTitle><AlertDescription>{me.mfa === "challenge" ? "Enter the code from your authenticator app to continue." : "Platform administrators must use an authenticator app. You cannot continue until it is set up."}</AlertDescription></Alert>
      {me.mfa === "challenge" ? (factorId ? <CodeForm label="Code from your authenticator app" busy={busy} onSubmit={(c) => verify(factorId, c)} /> : <Skeleton className="h-20" />) : !step ? (
        <div><Button onClick={begin} disabled={busy}>{busy ? <Spinner /> : <ShieldCheckIcon />}Set up authenticator app</Button></div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Scan this code with an authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg border bg-white p-2" />
          <p className="text-xs text-muted-foreground">Cannot scan? Type this key: <code className="break-all select-all">{step.secret}</code></p>
          <CodeForm label="Code from the app" busy={busy} onSubmit={(c) => verify(step.factorId, c)} />
        </div>
      )}
    </div>
  )
}

function RemoveMfa({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  async function remove(code: string) {
    setBusy(true)
    try { await api("/api/platform/mfa", { method: "DELETE", body: { code } }); toast.success("Authenticator removed. Set up a new one to continue."); onDone() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return open ? (
    <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">Removing it locks platform access until you set up a new authenticator. Enter a current code to confirm.</p><CodeForm label="Current code" busy={busy} onSubmit={remove} /></div>
  ) : <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Remove authenticator</Button>
}

export default function PlatformPage() {
  const [tick, setTick] = React.useState(0)
  const { data: me, error, loading } = useApi<Me>("/api/platform/me", { t: tick })
  const reload = () => setTick((t) => t + 1)
  if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
        <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : "This login is not a platform administrator."}</AlertDescription></Alert>
        <Button render={<Link href="/login?next=/platform" />}>Sign in</Button>
      </div>
    )
  }
  if (error) return <div className="mx-auto max-w-md p-6"><Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert></div>
  if (loading && !me) return <div className="mx-auto max-w-md p-6"><Skeleton className="h-32" /></div>
  if (!me) return null
  if (me.mfa !== "ok") return <MfaGate me={me} onDone={reload} />
  return (
    <>
      <InstitutionsView />
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 pb-8 md:px-8"><Button variant="outline" size="sm" render={<Link href="/platform/analytics" />}>Analytics</Button><Button variant="outline" size="sm" render={<Link href="/platform/ai" />}>AI</Button><Button variant="outline" size="sm" render={<Link href="/platform/monitoring" />}>System health</Button><Button variant="outline" size="sm" render={<Link href="/platform/audit" />}>Audit log</Button><RemoveMfa onDone={reload} /></div>
    </>
  )
}
