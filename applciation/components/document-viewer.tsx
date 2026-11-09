"use client"

import * as React from "react"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, FileTextIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { statusVariant, titleCase } from "@/lib/web/format"

export type ViewDoc = { id: string; category: string; fileName: string; mimeType: string; status: string; rejectReason?: string | null; url: string | null }
export const isImage = (d: Pick<ViewDoc, "mimeType">) => d.mimeType.startsWith("image/")

/** A small preview of a document: the image itself, or a file icon for PDFs. */
export function DocThumb({ doc, className = "" }: { doc: ViewDoc; className?: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-md border bg-muted ${className}`}>
      {isImage(doc) && doc.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={doc.url} alt="" loading="lazy" className="size-full object-cover" />
      ) : <FileTextIcon className="size-5 text-muted-foreground" aria-hidden />}
    </div>
  )
}

/**
 * Opens a document in the page: images are shown directly, PDFs in a frame, with the link always available as a fallback.
 * Staff (`studentId` set) can verify, reject with a reason, or reopen the document without leaving the viewer.
 */
export function DocumentViewer({ docs, index, onIndex, onClose, studentId, onChanged }: { docs: ViewDoc[]; index: number | null; onIndex: (i: number) => void; onClose: () => void; studentId?: string; onChanged?: () => void }) {
  const doc = index !== null ? docs[index] : null
  const [reason, setReason] = React.useState("")
  const [rejecting, setRejecting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [broken, setBroken] = React.useState(false)
  const reset = () => { setReason(""); setRejecting(false); setBroken(false) }

  React.useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === "ArrowRight" && index < docs.length - 1) { reset(); onIndex(index + 1) }
      if (e.key === "ArrowLeft" && index > 0) { reset(); onIndex(index - 1) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, docs.length, onIndex])

  async function review(status: "VERIFIED" | "REJECTED" | "PENDING") {
    if (!doc || !studentId) return
    setBusy(true)
    try {
      await api(`/api/students/${studentId}/documents/${doc.id}`, { method: "PATCH", body: { status, rejectReason: status === "REJECTED" ? reason : undefined } })
      toast.success(status === "VERIFIED" ? "Document verified" : status === "REJECTED" ? "Document rejected" : "Document reopened")
      reset(); onChanged?.()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!doc} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="flex max-h-[94svh] w-[min(96vw,60rem)] max-w-none flex-col gap-3 sm:max-w-none">
        {doc && (<>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-base"><span className="truncate">{doc.fileName}</span><Badge variant={statusVariant(doc.status)}>{titleCase(doc.status)}</Badge></DialogTitle>
            <DialogDescription>{titleCase(doc.category)} · {index! + 1} of {docs.length}{doc.status === "REJECTED" && doc.rejectReason ? ` · Rejected: ${doc.rejectReason}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="relative flex min-h-64 flex-1 items-center justify-center overflow-auto rounded-lg border bg-muted/40">
            {!doc.url || broken ? <p className="p-6 text-sm text-muted-foreground">This file cannot be shown here. Use “Open in new tab”.</p>
              : isImage(doc) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={doc.id} src={doc.url} alt={doc.fileName} onError={() => setBroken(true)} className="max-h-[62svh] max-w-full object-contain" />
              ) : <iframe key={doc.id} src={doc.url} title={doc.fileName} className="h-[62svh] w-full bg-white" />}
            {index! > 0 && <Button size="icon" variant="secondary" className="absolute left-2 top-1/2 -translate-y-1/2" aria-label="Previous document" onClick={() => { reset(); onIndex(index! - 1) }}><ChevronLeftIcon /></Button>}
            {index! < docs.length - 1 && <Button size="icon" variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Next document" onClick={() => { reset(); onIndex(index! + 1) }}><ChevronRightIcon /></Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {doc.url && <Button variant="outline" size="sm" render={<a href={doc.url} target="_blank" rel="noreferrer" />}><ExternalLinkIcon />Open in new tab</Button>}
            {studentId && !rejecting && (
              <div className="ml-auto flex flex-wrap gap-2">
                {doc.status !== "VERIFIED" && <Button size="sm" disabled={busy} onClick={() => review("VERIFIED")}>{busy ? <Spinner /> : <CheckIcon />}Verify</Button>}
                {doc.status !== "REJECTED" && <Button size="sm" variant="outline" onClick={() => setRejecting(true)}><XIcon />Reject</Button>}
                {doc.status !== "PENDING" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => review("PENDING")}><RotateCcwIcon />Reopen</Button>}
              </div>
            )}
            {studentId && rejecting && (
              <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it rejected? (shown to the student)" className="min-w-0 flex-1 sm:w-72" maxLength={300} />
                <Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => review("REJECTED")}>{busy && <Spinner />}Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </>)}
      </DialogContent>
    </Dialog>
  )
}
