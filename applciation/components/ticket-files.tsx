"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"

export type Attachment = { id: string; fileName: string; url: string | null }

/** Upload files to a support request (screenshots, PDFs up to 5 MB). Returns after every file is sent. */
export async function uploadTicketFiles(ticketId: string, files: File[]) {
  for (const file of files) {
    const fd = new FormData(); fd.set("file", file)
    await api(`/api/student/tickets/${ticketId}/attachments`, { method: "POST", body: fd })
  }
}

/** Download links for a request's files. */
export function AttachmentList({ items }: { items: Attachment[] }) {
  if (items.length === 0) return null
  return <div className="flex flex-wrap gap-2 text-sm">{items.map((a) => a.url ? <a key={a.id} className="underline underline-offset-4" href={a.url} target="_blank" rel="noreferrer">{a.fileName}</a> : <span key={a.id}>{a.fileName}</span>)}</div>
}

/** A file picker that adds to an existing request. */
export function AttachButton({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <>
      <input ref={ref} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={async (e) => {
        const files = [...(e.target.files ?? [])]
        if (!files.length) return
        setBusy(true)
        try { await uploadTicketFiles(ticketId, files); onDone() } catch (err) { toastError(err) } finally { setBusy(false); if (ref.current) ref.current.value = "" }
      }} />
      <Button variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy && <Spinner />}Attach a file</Button>
    </>
  )
}
