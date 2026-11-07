"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, download, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type FieldDef = { key: string; label: string; required: boolean }
type Upload = { jobId: string; fileName: string; totalRows: number; headers: string[]; mapping: Record<string, string>; sample: Record<string, string>[]; fields: FieldDef[] }
type Counts = { total: number; ready: number; skipped: number; invalid: number; excluded: number }
type Status = "ok" | "skipped" | "failed" | "excluded"
type RowItem = { row: number; data: Record<string, string>; status: Status; reasons: string[] }
type Rows = { counts: Counts; total: number; page: number; pageSize: number; items: RowItem[] }
type Result = { created: number; skipped: number; failed: number; excluded: number; errorFile: string | null }

const NONE = "__none"
const FILTERS: { value: "all" | Status; label: string }[] = [{ value: "all", label: "All" }, { value: "ok", label: "Ready" }, { value: "failed", label: "Invalid" }, { value: "skipped", label: "Duplicates" }, { value: "excluded", label: "Left out" }]
const badge = (s: Status) => s === "ok" ? <Badge>Ready</Badge> : s === "failed" ? <Badge variant="destructive">Invalid</Badge> : s === "skipped" ? <Badge variant="secondary">Duplicate</Badge> : <Badge variant="outline">Left out</Badge>

export default function ImportStudentsPage() {
  const [upload, setUpload] = React.useState<Upload | null>(null)
  const [mapping, setMapping] = React.useState<Record<string, string>>({})
  const [counts, setCounts] = React.useState<Counts | null>(null)
  const [result, setResult] = React.useState<Result | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [filter, setFilter] = React.useState<"all" | Status>("all")
  const [page, setPage] = React.useState(1)
  const [fixing, setFixing] = React.useState<RowItem | null>(null)

  const step = result ? 4 : counts ? 3 : upload ? 2 : 1

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const u = await api<Upload>("/api/students/import/preview", { method: "POST", body })
      setUpload(u); setMapping(u.mapping); setCounts(null)
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  async function onMap() {
    if (!upload) return
    setBusy(true)
    try {
      const r = await api<{ counts: Counts }>(`/api/students/import/${upload.jobId}/mapping`, { method: "PUT", body: { mapping } })
      setCounts(r.counts); setFilter("all"); setPage(1)
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  const list = useApi<Rows>(upload && counts ? `/api/students/import/${upload.jobId}/rows` : null, { status: filter, page })
  const rows = list.data ?? null
  const live = rows?.counts ?? counts
  const load = list.reload

  async function patchRow(row: number, body: { data?: Record<string, string>; excluded?: boolean }) {
    if (!upload) return false
    try {
      await api(`/api/students/import/${upload.jobId}/rows/${row}`, { method: "PATCH", body })
      await load()
      return true
    } catch (err) { toastError(err); return false }
  }

  async function onConfirm() {
    if (!upload) return
    setBusy(true)
    try {
      setResult(await api<Result>(`/api/students/import/${upload.jobId}/confirm`, { method: "POST" }))
      toast.success("Import finished")
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  function reset() { setUpload(null); setMapping({}); setCounts(null); setResult(null); setFilter("all"); setPage(1) }

  const missing = upload?.fields.filter((f) => f.required && !mapping[f.key]) ?? []
  const pages = rows ? Math.max(1, Math.ceil(rows.total / rows.pageSize)) : 1

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Progress">
        {["Upload", "Match columns", "Review rows", "Done"].map((l, i) => (
          <li key={l} className={`rounded-full border px-3 py-1 ${i + 1 === step ? "border-primary bg-primary/10 font-medium text-primary" : i + 1 < step ? "" : "text-muted-foreground"}`}>{i + 1}. {l}</li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Import admitted students</CardTitle><CardDescription>Upload an Excel or CSV file. Nothing is saved until you have matched the columns, reviewed the rows and confirmed.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="file">Spreadsheet</FieldLabel>
                <Input id="file" name="file" type="file" accept=".xlsx,.csv" required />
                <FieldDescription>Up to 5 MB and 5,000 rows. Your own column headings are fine, you will match them next. The template lists the departments, programmes and batches that exist.</FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>{busy && <Spinner />}Upload</Button>
                <Button type="button" variant="outline" onClick={() => download("/api/students/import/template").catch(toastError)}>Download sample template</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && upload && (
        <Card>
          <CardHeader><CardTitle>Match columns</CardTitle><CardDescription>{upload.fileName} · {upload.totalRows} rows. We matched what we could. Check each field and fix any that are wrong.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {upload.fields.map((f) => {
                const col = mapping[f.key]
                return (
                  <Field key={f.key}>
                    <FieldLabel>{f.label}{f.required && <span className="text-destructive"> *</span>}</FieldLabel>
                    <OptionSelect className="w-full" value={col ?? NONE} onChange={(v) => setMapping((m) => { const n = { ...m }; if (v === NONE) delete n[f.key]; else n[f.key] = v; return n })}
                      options={[{ value: NONE, label: "Not in my file" }, ...upload.headers.map((h) => ({ value: h, label: h }))]} placeholder="Choose a column" />
                    {col && <FieldDescription className="truncate">e.g. {upload.sample.map((s) => s[col]).filter(Boolean).slice(0, 2).join(", ") || "(empty)"}</FieldDescription>}
                  </Field>
                )
              })}
            </div>
            {missing.length > 0 && <Alert><AlertTitle>Still to match</AlertTitle><AlertDescription>{missing.map((m) => m.label).join(", ")}</AlertDescription></Alert>}
            {new Set(Object.values(mapping)).size < Object.values(mapping).length && <Alert variant="destructive"><AlertTitle>A column is used twice</AlertTitle><AlertDescription>Each column can feed only one field.</AlertDescription></Alert>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || missing.length > 0 || new Set(Object.values(mapping)).size < Object.values(mapping).length} onClick={onMap}>{busy && <Spinner />}Check rows</Button>
              <Button variant="outline" disabled={busy} onClick={reset}>Choose another file</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && upload && counts && live && (
        <Card>
          <CardHeader><CardTitle>Review rows</CardTitle><CardDescription>Fix a row to correct it, or leave it out. Duplicates of existing students are never imported.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const n = f.value === "all" ? live.total : f.value === "ok" ? live.ready : f.value === "failed" ? live.invalid : f.value === "skipped" ? live.skipped : live.excluded
                return <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "outline"} onClick={() => { setFilter(f.value); setPage(1) }}>{f.label} ({n})</Button>
              })}
            </div>

            {!rows ? <div className="flex justify-center py-8"><Spinner /></div> : (<>
              <div className="hidden overflow-hidden rounded-xl border md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Student</TableHead><TableHead>Batch</TableHead><TableHead>Result</TableHead><TableHead>Why</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.items.map((r) => (
                      <TableRow key={r.row}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell>{r.data.name} <div className="text-xs text-muted-foreground">{r.data.enrollment_no} · {r.data.email}</div></TableCell>
                        <TableCell>{r.data.batch_name}</TableCell>
                        <TableCell>{badge(r.status)}</TableCell>
                        <TableCell className="max-w-xs text-muted-foreground">{r.reasons.join("; ")}</TableCell>
                        <TableCell className="text-right"><RowButtons r={r} onFix={() => setFixing(r)} onExclude={(x) => patchRow(r.row, { excluded: x })} /></TableCell>
                      </TableRow>
                    ))}
                    {rows.items.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No rows here.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2 md:hidden">
                {rows.items.map((r) => (
                  <div key={r.row} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium">{r.data.name}</div><div className="truncate text-xs text-muted-foreground">Row {r.row} · {r.data.enrollment_no} · {r.data.email}</div></div>{badge(r.status)}</div>
                    {r.reasons.length > 0 && <p className="text-muted-foreground">{r.reasons.join("; ")}</p>}
                    <div className="flex justify-end"><RowButtons r={r} onFix={() => setFixing(r)} onExclude={(x) => patchRow(r.row, { excluded: x })} /></div>
                  </div>
                ))}
                {rows.items.length === 0 && <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">No rows here.</p>}
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-muted-foreground">Page {page} of {pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              )}
            </>)}

            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || live.ready === 0} onClick={onConfirm}>{busy && <Spinner />}Import {live.ready} students</Button>
              <Button variant="outline" disabled={busy} onClick={() => setCounts(null)}>Back to columns</Button>
              <Button variant="ghost" disabled={busy} onClick={reset}>Start over</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && result && (
        <Card>
          <CardHeader><CardTitle>Import complete</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{result.created} created</Badge>
              <Badge variant="secondary">{result.skipped} duplicates skipped</Badge>
              <Badge variant="destructive">{result.failed} invalid</Badge>
              <Badge variant="outline">{result.excluded} left out</Badge>
            </div>
            {result.errorFile && <Alert><AlertTitle>Some rows were not imported</AlertTitle><AlertDescription>Download the error file to see each row and the reason, correct it, and import that file again.</AlertDescription></Alert>}
            <p className="text-sm text-muted-foreground">The new students have no login yet. Select them on the Students list and choose Send invites.</p>
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href="/staff/students" />}>View students</Button>
              {result.errorFile && <Button variant="outline" onClick={() => download(result.errorFile!).catch(toastError)}>Download error file</Button>}
              <Button variant="outline" onClick={reset}>Import another file</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <FixDialog row={fixing} fields={upload?.fields ?? []} onClose={() => setFixing(null)} onSave={async (data) => { if (fixing && (await patchRow(fixing.row, { data }))) setFixing(null) }} />
    </div>
  )
}

function RowButtons({ r, onFix, onExclude }: { r: RowItem; onFix: () => void; onExclude: (excluded: boolean) => void }) {
  return (
    <div className="flex justify-end gap-1">
      {r.status !== "excluded" && <Button variant="outline" size="sm" onClick={onFix}>{r.status === "ok" ? "Edit" : "Fix"}</Button>}
      {r.status === "excluded" ? <Button variant="outline" size="sm" onClick={() => onExclude(false)}>Include</Button> : <Button variant="ghost" size="sm" onClick={() => onExclude(true)}>Leave out</Button>}
    </div>
  )
}

function FixDialog({ row, fields, onClose, onSave }: { row: RowItem | null; fields: FieldDef[]; onClose: () => void; onSave: (data: Record<string, string>) => Promise<void> }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Row {row?.row}</DialogTitle><DialogDescription>{row?.reasons.length ? row.reasons.join("; ") : "Change any value, then save. The row is checked again."}</DialogDescription></DialogHeader>
        {row && <FixForm key={row.row} row={row} fields={fields} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  )
}

function FixForm({ row, fields, onSave }: { row: RowItem; fields: FieldDef[]; onSave: (data: Record<string, string>) => Promise<void> }) {
  const [v, setV] = React.useState<Record<string, string>>(row.data)
  const [busy, setBusy] = React.useState(false)
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(v); setBusy(false) }} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => <Field key={f.key}><FieldLabel>{f.label}</FieldLabel><Input value={v[f.key] ?? ""} onChange={(e) => setV((o) => ({ ...o, [f.key]: e.target.value }))} /></Field>)}
      </div>
      <DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Save and check again</Button></DialogFooter>
    </form>
  )
}
