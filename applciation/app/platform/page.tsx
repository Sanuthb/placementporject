"use client"

import * as React from "react"
import Link from "next/link"
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
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Institution = { id: string; name: string; slug: string; isActive: boolean; createdAt: string; _count: { users: number; students: number; departments: number } }

/**
 * Platform administration: creating institutions. Separate from the staff console on purpose; only identities listed as platform
 * administrators can use it, and the API refuses everyone else, including college administrators.
 */
export default function PlatformPage() {
  const { data, error, loading, reload } = useApi<Institution[]>("/api/platform/institutions")
  const [v, setV] = React.useState({ name: "", slug: "", adminName: "", adminEmail: "", departments: "" })
  const [busy, setBusy] = React.useState(false)

  if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
        <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : "This login is not a platform administrator."}</AlertDescription></Alert>
        <Button render={<Link href="/login?next=/platform" />}>Sign in</Button>
      </div>
    )
  }

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
      {loading ? <Skeleton className="h-32 w-full" /> : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Institution</TableHead><TableHead>Created</TableHead><TableHead>Staff</TableHead><TableHead>Students</TableHead><TableHead>State</TableHead><TableHead /></TableRow></TableHeader>
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
    </div>
  )
}
