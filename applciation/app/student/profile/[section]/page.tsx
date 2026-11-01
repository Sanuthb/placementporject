"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { SECTIONS, type SField } from "@/lib/web/sections"
import { useApi } from "@/lib/web/use-api"

type Detail = { section: string; status: string; data: Record<string, unknown>; pendingData: Record<string, unknown> | null; reviewComment: string | null; verifiedBy?: { name: string; at: string } | null; documents: { id: string; fileName: string; mimeType?: string; url: string | null }[] }
type Item = Record<string, string>

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v))
/** Turns what was typed into what the API stores: numbers become numbers, empty fields are dropped. */
function clean(fields: SField[], v: Record<string, string>) {
  const out: Record<string, unknown> = {}
  for (const f of fields) { const x = (v[f.name] ?? "").trim(); if (x !== "") out[f.name] = f.type === "number" ? Number(x) : x }
  return out
}

export default function SectionPage() {
  const { section } = useParams<{ section: string }>()
  const router = useRouter()
  const cfg = SECTIONS[section]
  const { data, reload } = useApi<Detail>(cfg ? `/api/student/sections/${section}` : null)
  if (!cfg) return <Alert variant="destructive"><AlertTitle>Unknown section</AlertTitle><AlertDescription><Link href="/student/profile" className="underline">Back to your profile</Link></AlertDescription></Alert>
  if (!data) return <Skeleton className="h-64" />
  const locked = data.status === "SUBMITTED"
  return <Editor key={data.status + str(data.pendingData ? "p" : "")} section={section} cfg={cfg} detail={data} locked={locked} onSaved={(done) => { if (done) router.push("/student/profile"); else reload() }} reload={reload} />
}

function Editor({ section, cfg, detail, locked, onSaved, reload }: { section: string; cfg: (typeof SECTIONS)[string]; detail: Detail; locked: boolean; onSaved: (leave: boolean) => void; reload: () => void }) {
  const source = (detail.pendingData ?? detail.data) as Record<string, unknown>
  const [vals, setVals] = React.useState<Record<string, string>>(() => Object.fromEntries((cfg.fields ?? []).map((f) => [f.name, str(source[f.name])])))
  const [tags, setTags] = React.useState(() => (cfg.tags ? ((source[cfg.tags.key] as unknown[]) ?? []).map((x) => (typeof x === "object" && x ? str((x as { name?: unknown }).name) : str(x))).join(", ") : ""))
  const [items, setItems] = React.useState<Item[]>(() => (cfg.list ? ((source[cfg.list.key] as Record<string, unknown>[]) ?? []).map((r) => Object.fromEntries(cfg.list!.fields.map((f) => [f.name, str(r[f.name])]))) : []))
  const [busy, setBusy] = React.useState<"save" | "submit" | null>(null)
  const [preview, setPreview] = React.useState<{ name: string; url: string; image: boolean } | null>(null)
  const [uploading, setUploading] = React.useState(false)

  function build() {
    const data: Record<string, unknown> = { ...(cfg.fields ? clean(cfg.fields, vals) : {}) }
    if (cfg.tags) data[cfg.tags.key] = tags.split(",").map((s) => s.trim()).filter(Boolean)
    if (cfg.list) data[cfg.list.key] = items.map((i) => clean(cfg.list!.fields, i)).filter((i) => Object.keys(i).length)
    return data
  }
  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "save")
    try { await api(`/api/student/sections/${section}`, { method: "PUT", body: { data: build(), submit } }); toast.success(submit ? "Submitted for review" : "Draft saved"); onSaved(submit) } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const body = new FormData(); body.set("file", file)
    setUploading(true)
    try { await api(`/api/student/sections/${section}/documents`, { method: "POST", body }); toast.success("Uploaded"); reload() } catch (err) { toastError(err) } finally { setUploading(false); e.target.value = "" }
  }
  async function replaceDoc(id: string, file?: File) {
    if (!file) return
    const body = new FormData(); body.set("file", file)
    setUploading(true)
    try { await api(`/api/student/sections/${section}/documents`, { method: "POST", body }); await api(`/api/student/sections/${section}/documents/${id}`, { method: "DELETE" }); toast.success("Replaced"); reload() } catch (err) { toastError(err) } finally { setUploading(false) }
  }
  async function removeDoc(id: string) {
    try { await api(`/api/student/sections/${section}/documents/${id}`, { method: "DELETE" }); reload() } catch (e) { toastError(e) }
  }

  const input = (f: SField, value: string, set: (v: string) => void, id: string) => (
    <Field key={f.name}>
      <FieldLabel htmlFor={id}>{f.label}</FieldLabel>
      {f.type === "textarea" ? <Textarea id={id} value={value} disabled={locked} onChange={(e) => set(e.target.value)} /> : <Input id={id} type={f.type ?? "text"} step={f.type === "number" ? "any" : undefined} value={value} disabled={locked} onChange={(e) => set(e.target.value)} />}
    </Field>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{titleCase(section)} <Badge variant={statusVariant(detail.status)}>{titleCase(detail.status)}</Badge></CardTitle>
          <CardDescription>{cfg.hint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.status === "CHANGES_REQUESTED" && detail.reviewComment && <Alert variant="destructive"><AlertTitle>Changes requested</AlertTitle><AlertDescription>{detail.reviewComment}</AlertDescription></Alert>}
          {locked && <Alert><AlertTitle>Waiting for review</AlertTitle><AlertDescription>This section is with the placement cell. You can edit it again if they ask for changes.</AlertDescription></Alert>}
          {detail.status === "VERIFIED" && <Alert><AlertTitle>Verified{detail.verifiedBy ? ` by ${detail.verifiedBy.name} on ${fmtDate(detail.verifiedBy.at)}` : ""}</AlertTitle><AlertDescription>Your verified details stay in force. If you change anything, the new values wait for review before replacing them.</AlertDescription></Alert>}

          <FieldGroup>
            {cfg.fields?.map((f) => input(f, vals[f.name] ?? "", (v) => setVals((s) => ({ ...s, [f.name]: v })), `f-${f.name}`))}
            {cfg.tags && <Field><FieldLabel htmlFor="tags">{cfg.tags.label}</FieldLabel><Textarea id="tags" value={tags} disabled={locked} onChange={(e) => setTags(e.target.value)} placeholder="React, SQL, Communication" /></Field>}
          </FieldGroup>

          {cfg.list && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{cfg.list.label}</h3>
              {items.map((it, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-md border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">{cfg.list!.fields.map((f) => input(f, it[f.name] ?? "", (v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [f.name]: v } : x))), `i${i}-${f.name}`))}</div>
                  {!locked && <div><Button type="button" size="sm" variant="ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2Icon />Remove</Button></div>}
                </div>
              ))}
              {!locked && <div><Button type="button" variant="outline" onClick={() => setItems((xs) => [...xs, {}])}><PlusIcon />Add {cfg.list.itemLabel}</Button></div>}
            </div>
          )}

          {(cfg.uploads || section === "ACADEMICS") && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Documents</h3>
              {detail.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.fileName}</span>
                  <span className="flex items-center gap-1">
                    {d.url && <Button size="sm" variant="outline" onClick={() => setPreview({ name: d.fileName, url: d.url!, image: (d.mimeType ?? "").startsWith("image/") })}>Preview</Button>}
                    {!locked && <label className="inline-flex"><input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" disabled={uploading} onChange={(e) => { void replaceDoc(d.id, e.target.files?.[0]); e.target.value = "" }} /><span className="inline-flex h-7 cursor-pointer items-center rounded-lg border px-2.5 text-[0.8rem] hover:bg-muted">Replace</span></label>}
                    {!locked && <Button size="sm" variant="ghost" onClick={() => removeDoc(d.id)}><Trash2Icon />Remove</Button>}
                  </span>
                </div>
              ))}
              {!locked && <div className="flex items-center gap-2"><Input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={upload} disabled={uploading} />{uploading && <Spinner />}</div>}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>
          {preview && (preview.image ? <img src={preview.url} alt={preview.name} className="max-h-[70dvh] w-full object-contain" /> : <iframe src={preview.url} title={preview.name} className="h-[70dvh] w-full rounded-md border" />)}
        </DialogContent>
      </Dialog>
      {!locked && (
        <div className="flex gap-2">
          {!cfg.uploads && <Button variant="outline" disabled={busy !== null} onClick={() => save(false)}>{busy === "save" && <Spinner />}Save draft</Button>}
          <Button disabled={busy !== null} onClick={() => save(true)}>{busy === "submit" && <Spinner />}Submit for review</Button>
        </div>
      )}
    </div>
  )
}
