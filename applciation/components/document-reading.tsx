"use client"

import * as React from "react"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import type { ExtractionView } from "@/lib/documentAi"

type Reading = { enabled: boolean; reading: ExtractionView | null }

/**
 * "Read with AI" for one document. Students see suggestions they can accept into their draft or dismiss; staff (`studentId` set) see what was
 * read and the flags, as an aid next to the document itself. Nothing here ever verifies anything.
 */
export function DocumentReading({ docId, studentId, onApplied }: { docId: string; studentId?: string; onApplied?: () => void }) {
  const base = studentId ? `/api/students/${studentId}/documents/${docId}/reading` : `/api/student/documents/${docId}/reading`
  const { data, reload } = useApi<Reading>(base)
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!data || (!data.enabled && !data.reading)) return null
  const r = data.reading

  async function read() {
    setBusy("read")
    try { await api(base, { method: "POST" }); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  async function decide(key: string, decision: "APPLY" | "DISMISS") {
    if (!r) return
    setBusy(key)
    try {
      await api(`${base}/decide`, { method: "POST", body: { extractionId: r.id, key, decision } })
      if (decision === "APPLY") { toast.success("Added to your draft. Staff will check it against the document"); onApplied?.() }
      reload()
    } catch (e) { toastError(e) } finally { setBusy(null) }
  }

  const flags = r?.suggestions.filter((s) => s.kind === "flag") ?? []
  const changes = r?.suggestions.filter((s) => s.kind !== "flag") ?? []
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">AI reading</span>
        {r && <span className="text-xs text-muted-foreground">{r.status === "FAILED" ? "failed" : `read ${fmtDateTime(r.createdAt)}`}{r.fields?.confidence ? ` · ${r.fields.confidence} confidence` : ""}</span>}
        {data.enabled && <Button size="sm" variant={r ? "ghost" : "outline"} className="ml-auto" disabled={busy !== null} onClick={read}>{busy === "read" && <Spinner />}{r ? "Read again" : "Read with AI"}</Button>}
      </div>
      {!r && <p className="text-xs text-muted-foreground">The AI can read this document and suggest values{studentId ? "" : " for your profile. You decide what to use; staff still check the document"}.</p>}
      {r?.status === "FAILED" && <p className="text-xs text-destructive">{r.error}</p>}
      {flags.map((f) => (
        <Alert key={f.key} variant={f.key === "flag:name" || f.key === "flag:kind" ? "destructive" : "default"}>
          <AlertTitle>{f.label}</AlertTitle>
          <AlertDescription>{f.suggested}</AlertDescription>
        </Alert>
      ))}
      {studentId && r?.fields && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {([["Name", r.fields.candidateName], ["Board / university", r.fields.boardOrUniversity], ["Year", r.fields.examYear], ["Semester", r.fields.semesterNumber], ["Total", r.fields.totalObtained != null ? `${r.fields.totalObtained} / ${r.fields.totalMax}` : null], ["Percentage", r.fields.percentage], ["SGPA", r.fields.sgpa], ["Result", r.fields.result]] as const)
            .filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>)}
          {r.fields.subjects.length > 0 && <div className="col-span-full"><dt className="text-muted-foreground">Subjects read</dt><dd>{r.fields.subjects.length}</dd></div>}
        </dl>
      )}
      {changes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {changes.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.label}:</span>
              <span className="text-muted-foreground">{s.current ?? "not entered"} →</span>
              <span>{s.suggested}</span>
              {s.state !== "OPEN" ? <Badge variant="secondary">{s.state === "APPLIED" ? "Used" : "Dismissed"}</Badge> : !studentId && (
                <span className="ml-auto flex gap-1">
                  <Button size="sm" disabled={busy !== null} onClick={() => decide(s.key, "APPLY")}>{busy === s.key && <Spinner />}Use</Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => decide(s.key, "DISMISS")}>Dismiss</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {r?.status === "DONE" && changes.length === 0 && flags.length === 0 && <p className="text-xs text-muted-foreground">What the AI read matches what is in the profile.</p>}
    </div>
  )
}
