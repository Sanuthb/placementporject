"use client"

import * as React from "react"
import { FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api, toastError } from "@/lib/web/api"
import { statusVariant, titleCase } from "@/lib/web/format"
import { supabase } from "@/lib/supabase/browser"

export type Doc = { id: string; category: string; fileName: string; mimeType: string; sizeBytes: number; status: string; rejectReason: string | null; url: string | null }
const CATEGORIES: [string, string][] = [["TENTH_MARKS", "SSLC / 10th marks card"], ["TWELFTH_MARKS", "PUC / 12th marks card"], ["DIPLOMA_CERTIFICATE", "Diploma certificate (if applicable)"], ["DEGREE_MARKS", "Degree semester marks cards"], ["DEGREE_CERTIFICATE", "Degree or provisional certificate"], ["OTHER", "Other documents your institution asks for"]]
const TYPES = ["application/pdf", "image/png", "image/jpeg"]
const MAX = 10 * 1024 * 1024
const size = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`)

/** Upload with real progress (fetch cannot report upload progress, so this uses XHR). */
async function upload(file: File, category: string, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase().auth.getSession()
  const form = new FormData()
  form.set("file", file); form.set("category", category)
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open("POST", "/api/student/documents")
    if (data.session) x.setRequestHeader("authorization", `Bearer ${data.session.access_token}`)
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve()
      let msg = `Upload failed (${x.status})`
      try { msg = JSON.parse(x.responseText)?.error?.message ?? msg } catch { /* keep default */ }
      reject(new Error(msg))
    }
    x.onerror = () => reject(new Error("Could not reach the server"))
    x.send(form)
  })
}

export function DocumentsStep({ docs, required, editable, onChanged }: { docs: Doc[]; required: string[]; editable: boolean; onChanged: () => void }) {
  const [progress, setProgress] = React.useState<Record<string, number>>({})
  async function pick(category: string, files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      if (!TYPES.includes(file.type)) { toast.error(`${file.name}: only PDF, PNG or JPEG files are accepted`); continue }
      if (file.size > MAX) { toast.error(`${file.name}: larger than 10 MB`); continue }
      const key = `${category}|${file.name}`
      setProgress((p) => ({ ...p, [key]: 0 }))
      try { await upload(file, category, (pct) => setProgress((p) => ({ ...p, [key]: pct }))); toast.success(`${file.name} uploaded`); onChanged() } catch (e) { toast.error(`${file.name}: ${(e as Error).message}`) }
      setProgress((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)))
    }
  }
  async function remove(d: Doc) {
    try { await api(`/api/student/documents/${d.id}`, { method: "DELETE" }); onChanged() } catch (e) { toastError(e) }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Upload clear scans or photos (PDF, PNG or JPEG, up to 10 MB each). Staff check each document against what you entered. Only you and authorised staff can open them.</p>
      {CATEGORIES.map(([cat, label]) => {
        const mine = docs.filter((d) => d.category === cat)
        const uploading = Object.entries(progress).filter(([k]) => k.startsWith(`${cat}|`))
        const need = required.includes(cat)
        return (
          <div key={cat} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{label}</span>
              {need && <Badge variant={mine.some((d) => d.status !== "REJECTED") ? "default" : "destructive"}>{mine.some((d) => d.status !== "REJECTED") ? "Required · uploaded" : "Required"}</Badge>}
              {editable && (
                <label className="ml-auto">
                  <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple onChange={(e) => { void pick(cat, e.target.files); e.target.value = "" }} aria-label={`Upload ${label}`} />
                  <span className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted focus-within:ring-3"><UploadIcon className="size-3.5" />Upload</span>
                </label>
              )}
            </div>
            {uploading.map(([k, pct]) => (
              <div key={k} className="text-xs"><div className="flex justify-between"><span>{k.split("|")[1]}</span><span>{pct}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div></div>
            ))}
            {mine.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 truncate underline-offset-4 hover:underline">{d.fileName}</a> : <span className="truncate">{d.fileName}</span>}
                <span className="text-xs text-muted-foreground">{size(d.sizeBytes)}</span>
                <Badge variant={statusVariant(d.status)}>{titleCase(d.status)}</Badge>
                {d.status === "REJECTED" && d.rejectReason && <span className="text-xs text-destructive">{d.rejectReason}</span>}
                {editable && d.status !== "VERIFIED" && <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Remove ${d.fileName}`} onClick={() => remove(d)}><Trash2Icon /></Button>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
