"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, download, toastError } from "@/lib/web/api"
import { statusVariant } from "@/lib/web/format"

type Preview = {
  jobId: string; totalRows: number; willCreate: number; willSkip: number; invalid: number
  preview: { row: number; data: Record<string, string>; status: "ok" | "skipped" | "failed"; reasons: string[] }[]
}
type Result = { created: number; skipped: number; failed: number; errorFile: string | null }

export default function ImportStudentsPage() {
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [result, setResult] = React.useState<Result | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = new FormData(e.currentTarget)
    setBusy(true)
    try { setPreview(await api<Preview>("/api/students/import/preview", { method: "POST", body })) } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  async function onConfirm() {
    if (!preview) return
    setBusy(true)
    try {
      setResult(await api<Result>(`/api/students/import/${preview.jobId}/confirm`, { method: "POST" }))
      setPreview(null)
      toast.success("Import finished")
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {!preview && !result && (
        <Card>
          <CardHeader><CardTitle>Import admitted students</CardTitle><CardDescription>Upload an Excel or CSV file. You will see a preview before anything is saved.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="file">Spreadsheet</FieldLabel>
                <Input id="file" name="file" type="file" accept=".xlsx,.csv" required />
                <FieldDescription>Up to 5 MB. Rows with problems are skipped; the rest are imported.</FieldDescription>
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>{busy && <Spinner />}Upload and preview</Button>
                <Button type="button" variant="outline" onClick={() => download("/api/students/import/template").catch(toastError)}>Download blank template</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>{preview.totalRows} rows read. Showing the first {preview.preview.length}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{preview.willCreate} will be created</Badge>
              <Badge variant="secondary">{preview.willSkip} will be skipped</Badge>
              <Badge variant="destructive">{preview.invalid} invalid</Badge>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Student</TableHead><TableHead>Result</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
              <TableBody>
                {preview.preview.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell>{r.row}</TableCell>
                    <TableCell>{r.data.name} <span className="text-muted-foreground">{r.data.enrollment_no} · {r.data.email}</span></TableCell>
                    <TableCell><Badge variant={r.status === "ok" ? statusVariant("VERIFIED") : r.status === "failed" ? "destructive" : "secondary"}>{r.status === "ok" ? "Ready" : r.status === "failed" ? "Invalid" : "Skipped"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.reasons.join("; ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              <Button onClick={onConfirm} disabled={busy || preview.willCreate === 0}>{busy && <Spinner />}Import {preview.willCreate} students</Button>
              <Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>Choose another file</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle>Import complete</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{result.created} created</Badge>
              <Badge variant="secondary">{result.skipped} skipped</Badge>
              <Badge variant="destructive">{result.failed} failed</Badge>
            </div>
            {result.errorFile && (
              <Alert><AlertTitle>Some rows were not imported</AlertTitle><AlertDescription>Download the error file to see each row and the reason.</AlertDescription></Alert>
            )}
            <div className="flex gap-2">
              <Button render={<Link href="/staff/students" />}>View students</Button>
              {result.errorFile && <Button variant="outline" onClick={() => download(result.errorFile!).catch(toastError)}>Download error file</Button>}
              <Button variant="outline" onClick={() => setResult(null)}>Import another file</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
