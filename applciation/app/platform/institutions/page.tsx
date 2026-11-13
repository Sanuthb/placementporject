"use client"

import * as React from "react"
import Link from "next/link"
import { PlusIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { EmptyNote, PageHeader, TableBox } from "../_components/page-header"

type Institution = { id: string; name: string; slug: string; isActive: boolean; createdAt: string; _count: { users: number; students: number; departments: number } }
type Sort = "name" | "createdAt" | "staff" | "students"
const EMPTY = { name: "", slug: "", adminName: "", adminEmail: "", departments: "" }

/** Institutions: create one, switch one on or off, open one. The API stays the only place that enforces who may do this. */
export default function InstitutionsPage() {
  const [q, setQ] = React.useState("")
  const [dq, setDq] = React.useState("")
  const [status, setStatus] = React.useState<"all" | "active" | "inactive">("all")
  const [sort, setSort] = React.useState<Sort>("createdAt")
  const [order, setOrder] = React.useState<"asc" | "desc">("desc")
  const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const { data: list, error, loading, reload } = useApi<{ items: Institution[]; page: number; total: number; totalPages: number }>("/api/platform/institutions", { q: dq || undefined, status, sort, order, page, pageSize: 20 })
  const sortBy = (k: Sort) => { if (k === sort) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder(k === "name" ? "asc" : "desc") } setPage(1) }
  const arrow = (k: Sort) => (k === sort ? (order === "asc" ? " ▲" : " ▼") : "")

  const [open, setOpen] = React.useState(false)
  const [v, setV] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [toggle, setToggle] = React.useState<Institution | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // "CODE Name" per line, for example "CSE Computer Science". Optional.
      const departments = v.departments.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [code, ...rest] = l.split(/\s+/); return { code, name: rest.join(" ") || code } })
      await api("/api/platform/institutions", { method: "POST", body: { name: v.name, ...(v.slug ? { slug: v.slug } : {}), admin: { name: v.adminName, email: v.adminEmail }, ...(departments.length ? { departments } : {}) } })
      toast.success("Institution created. The administrator has been emailed an invitation.")
      setV(EMPTY); setOpen(false); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  async function confirmToggle() {
    if (!toggle) return
    try { await api(`/api/platform/institutions/${toggle.id}`, { method: "PATCH", body: { isActive: !toggle.isActive } }); toast.success(toggle.isActive ? "Institution deactivated" : "Institution reactivated"); reload() } catch (err) { toastError(err) } finally { setToggle(null) }
  }
  const th = (k: Sort, label: string) => <TableHead><button type="button" className="font-medium hover:text-foreground" onClick={() => sortBy(k)}>{label}{arrow(k)}</button></TableHead>

  return (
    <>
      <PageHeader
        title="Institutions"
        description="Create institutions and switch them on or off. You cannot see or change an institution's own records from here."
        actions={<Button onClick={() => setOpen(true)}><PlusIcon />New institution</Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search institutions" className="pl-8" placeholder="Search name, address or administrator email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by status">
          {(["all", "active", "inactive"] as const).map((st) => <Button key={st} size="sm" variant={status === st ? "default" : "outline"} aria-pressed={status === st} onClick={() => { setStatus(st); setPage(1) }}>{st === "all" ? "All" : st === "active" ? "Active" : "Inactive"}</Button>)}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive"><AlertTitle>Could not load institutions</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{error instanceof Error ? error.message : "Try again"}<Button size="sm" variant="outline" onClick={reload}>Try again</Button></AlertDescription></Alert>
      ) : loading && !list ? <Skeleton className="h-48 w-full rounded-xl" /> : list && list.items.length === 0 ? (
        <EmptyNote>{dq || status !== "all" ? "No institutions match your search." : "No institutions yet. Use “New institution” to add the first one."}</EmptyNote>
      ) : (
        <TableBox>
          <Table>
            <TableHeader><TableRow>{th("name", "Institution")}{th("createdAt", "Created")}{th("staff", "Staff")}{th("students", "Students")}<TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {list?.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell><Link href={`/platform/institutions/${i.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{i.name}</Link><div className="text-xs text-muted-foreground">{i.slug}</div></TableCell>
                  <TableCell>{fmtDate(i.createdAt)}</TableCell><TableCell>{i._count.users}</TableCell><TableCell>{i._count.students}</TableCell>
                  <TableCell><Badge variant={i.isActive ? "default" : "secondary"}>{i.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" render={<Link href={`/platform/institutions/${i.id}`} />}>Details</Button><Button variant="outline" size="sm" onClick={() => setToggle(i)}>{i.isActive ? "Deactivate" : "Reactivate"}</Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableBox>
      )}
      {list && list.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{list.total} institution{list.total === 1 ? "" : "s"} · page {list.page} of {list.totalPages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= list.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>New institution</DialogTitle><DialogDescription>Creates the institution, its settings and its first TPO administrator, who is invited by email.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="i-name">Institution name</FieldLabel><Input id="i-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-slug">Address (optional)</FieldLabel><Input id="i-slug" placeholder="made from the name if empty" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-an">Administrator name</FieldLabel><Input id="i-an" required value={v.adminName} onChange={(e) => setV({ ...v, adminName: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-ae">Administrator email</FieldLabel><Input id="i-ae" type="email" required value={v.adminEmail} onChange={(e) => setV({ ...v, adminEmail: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="i-d">Starting departments (optional)</FieldLabel><textarea id="i-d" rows={3} className="rounded-md border bg-transparent p-2 text-sm" placeholder={"CSE Computer Science\nECE Electronics"} value={v.departments} onChange={(e) => setV({ ...v, departments: e.target.value })} /></Field>
            </FieldGroup>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Spinner />}Create institution</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toggle} onOpenChange={(o) => { if (!o) setToggle(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggle?.isActive ? "Deactivate" : "Reactivate"} {toggle?.name}?</AlertDialogTitle>
            <AlertDialogDescription>{toggle?.isActive ? "Everyone at this institution, staff, students and employers, loses access until you reactivate it. Their records are kept." : "People at this institution can sign in again."} The change is recorded in the audit log.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant={toggle?.isActive ? "destructive" : "default"} onClick={confirmToggle}>{toggle?.isActive ? "Deactivate" : "Reactivate"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
