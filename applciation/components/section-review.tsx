"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Detail = {
  section: string; status: string; data: unknown; pendingData: unknown | null; reviewComment?: string | null
  documents: { id: string; fileName: string; url: string | null }[]
  history: { id: string; action: string; comment: string | null; createdAt: string; actor: { name: string } | null }[]
}

/** Shows any section's data (objects, lists, values) as a readable nested list. */
export function DataView({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted-foreground">None</span>
    return <div className="flex flex-col gap-2">{value.map((v, i) => <div key={i} className="rounded-md border p-2"><DataView value={v} /></div>)}</div>
  }
  if (typeof value === "object") {
    return (
      <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <React.Fragment key={k}><dt className="text-muted-foreground">{titleCase(k.replace(/([A-Z])/g, "_$1"))}</dt><dd><DataView value={v} /></dd></React.Fragment>
        ))}
      </dl>
    )
  }
  return <span>{String(value)}</span>
}

export function SectionReview({ studentId, studentName, section, open, onOpenChange, onDone }: {
  studentId: string; studentName?: string; section: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void
}) {
  const { data, loading } = useApi<Detail>(open ? `/api/students/${studentId}/sections/${section}` : null)
  const [comment, setComment] = React.useState("")
  const [busy, setBusy] = React.useState<"approve" | "changes" | null>(null)
  const canReview = data?.status === "SUBMITTED"

  async function act(kind: "approve" | "changes") {
    if (kind === "changes" && comment.trim().length < 3) { toast.error("Write a comment so the student knows what to change"); return }
    setBusy(kind)
    try {
      if (kind === "approve") await api(`/api/students/${studentId}/sections/${section}/approve`, { method: "POST", body: comment.trim() ? { comment: comment.trim() } : {} })
      else await api(`/api/students/${studentId}/sections/${section}/request-changes`, { method: "POST", body: { comment: comment.trim() } })
      toast.success(kind === "approve" ? "Section approved" : "Changes requested")
      setComment("")
      onOpenChange(false)
      onDone()
    } catch (e) { toastError(e) } finally { setBusy(null) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{titleCase(section)}</SheetTitle>
          <SheetDescription>{studentName ?? "Student"}{data && <> · <Badge variant={statusVariant(data.status)}>{titleCase(data.status)}</Badge></>}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4">
          {loading && !data ? <Skeleton className="h-64" /> : data && (
            <div className="flex flex-col gap-4 pb-4">
              {data.pendingData !== null && data.pendingData !== undefined && (
                <Alert><AlertTitle>Revision of verified data</AlertTitle><AlertDescription>The student changed verified details. The current values stay in force until you approve.</AlertDescription></Alert>
              )}
              {data.reviewComment && data.status === "CHANGES_REQUESTED" && <Alert><AlertTitle>Changes were requested</AlertTitle><AlertDescription>{data.reviewComment}</AlertDescription></Alert>}
              {data.pendingData !== null && data.pendingData !== undefined ? (
                <>
                  <div><h3 className="mb-2 text-sm font-medium">Proposed values</h3><DataView value={data.pendingData} /></div>
                  <Separator />
                  <div><h3 className="mb-2 text-sm font-medium">Currently verified</h3><DataView value={data.data} /></div>
                </>
              ) : (
                <div><h3 className="mb-2 text-sm font-medium">Submitted data</h3><DataView value={data.data} /></div>
              )}
              <Separator />
              <div>
                <h3 className="mb-2 text-sm font-medium">Proof documents</h3>
                {data.documents.length ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {data.documents.map((d) => <li key={d.id}>{d.url ? <a className="underline underline-offset-4" href={d.url} target="_blank" rel="noreferrer">{d.fileName}</a> : d.fileName}</li>)}
                  </ul>
                ) : <span className="text-sm text-muted-foreground">No documents uploaded.</span>}
              </div>
              <Separator />
              <div>
                <h3 className="mb-2 text-sm font-medium">History</h3>
                {data.history.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {data.history.map((h) => <li key={h.id}><span className="font-medium">{titleCase(h.action)}</span> by {h.actor?.name ?? "system"} · <span className="text-muted-foreground">{fmtDateTime(h.createdAt)}</span>{h.comment && <div className="text-muted-foreground">{h.comment}</div>}</li>)}
                  </ul>
                ) : <span className="text-sm text-muted-foreground">No reviews yet.</span>}
              </div>
            </div>
          )}
        </ScrollArea>
        {canReview && (
          <SheetFooter>
            <Field>
              <FieldLabel htmlFor="review-comment">Comment (required to request changes)</FieldLabel>
              <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What should the student fix?" />
            </Field>
            <div className="flex gap-2">
              <Button disabled={busy !== null} onClick={() => act("approve")}>{busy === "approve" && <Spinner />}Approve</Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => act("changes")}>{busy === "changes" && <Spinner />}Request changes</Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
