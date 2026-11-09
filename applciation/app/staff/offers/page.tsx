"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { OFFER_STATUS } from "@/lib/web/enums"
import { fmtDate, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Offer = { id: string; role: string; packageLpa: number | string; isPpo: boolean; status: string; offeredAt: string; joiningStatus: string; joiningDate: string | null; studentJoiningDate?: string | null; joiningProofName?: string | null; letterName?: string | null; student: { id: string; name: string; enrollmentNo: string }; company: { name: string } }
const JOINING = ["PENDING", "JOINED", "NOT_JOINED"].map((v) => ({ value: v, label: titleCase(v) }))

export default function OffersPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)
  const [status, setStatus] = React.useState("")
  const { data, loading, reload } = useApi<{ items: Offer[] }>("/api/offers", { status, limit: 100 })
  const [revoke, setRevoke] = React.useState<Offer | null>(null)
  const [join, setJoin] = React.useState<Offer | null>(null)
  const [letter, setLetter] = React.useState<Offer | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [js, setJs] = React.useState("PENDING")
  const [jd, setJd] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function doRevoke() {
    setBusy(true)
    try { await api(`/api/offers/${revoke!.id}/revoke`, { method: "POST", body: { reason: reason.trim() } }); toast.success("Offer revoked"); setRevoke(null); setReason(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function uploadLetter(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !letter) return
    const body = new FormData(); body.set("file", file)
    setUploading(true)
    try { await api(`/api/offers/${letter.id}/letter`, { method: "POST", body }); toast.success("Offer letter saved"); setLetter(null); reload() } catch (err) { toastError(err) } finally { setUploading(false); e.target.value = "" }
  }
  async function doJoin() {
    setBusy(true)
    try { await api(`/api/offers/${join!.id}/joining`, { method: "PATCH", body: { joiningStatus: js, ...(jd ? { joiningDate: jd } : {}) } }); toast.success("Joining updated"); setJoin(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect className="w-44" value={status} onChange={setStatus} options={[{ value: "", label: "All statuses" }, ...OFFER_STATUS]} placeholder="Status" />
        <Button variant="outline" className="ml-auto" onClick={() => download("/api/offers/export").catch(toastError)}>Export</Button>
      </div>
      {loading && !data ? <Skeleton className="h-48" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Company / role</TableHead><TableHead>Package</TableHead><TableHead>Status</TableHead><TableHead>Joining</TableHead>{canEdit && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {data?.items.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.student.name}<div className="text-xs text-muted-foreground">{o.student.enrollmentNo}</div></TableCell>
                <TableCell>{o.company.name}<div className="text-xs text-muted-foreground">{o.role} {o.isPpo && <Badge variant="secondary">PPO</Badge>}</div></TableCell>
                <TableCell>{fmtLpa(o.packageLpa)}</TableCell>
                <TableCell><Badge variant={statusVariant(o.status)}>{titleCase(o.status)}</Badge><div className="text-xs text-muted-foreground">{fmtDate(o.offeredAt)}</div></TableCell>
                <TableCell>{o.status === "ACCEPTED" ? <>{titleCase(o.joiningStatus)}{o.joiningDate && <div className="text-xs text-muted-foreground">{fmtDate(o.joiningDate)}</div>}</> : "—"}</TableCell>
                {canEdit && (
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setLetter(o)}>{o.letterName ? "Replace letter" : "Add letter"}</Button>
                    {o.status === "ACCEPTED" && <Button size="sm" variant="outline" onClick={() => { setJoin(o); setJs(o.joiningStatus); setJd(o.joiningDate?.slice(0, 10) ?? "") }}>Joining</Button>}
                    {(o.status === "OFFERED" || o.status === "ACCEPTED") && <Button size="sm" variant="outline" onClick={() => setRevoke(o)}>Revoke</Button>}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No offers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revoke offer for {revoke?.student.name}</DialogTitle><DialogDescription>The student is told, and the reason is logged.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="reason">Reason</FieldLabel><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={doRevoke}>{busy && <Spinner />}Revoke offer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!letter} onOpenChange={(o) => !o && setLetter(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Offer letter for {letter?.student.name}</DialogTitle><DialogDescription>{letter?.letterName ? `Current file: ${letter.letterName}. Uploading replaces it.` : "The student can download it from their offers page."}</DialogDescription></DialogHeader>
          <div className="flex items-center gap-2"><Input type="file" accept=".pdf,.png,.jpg" onChange={uploadLetter} disabled={uploading} />{uploading && <Spinner />}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!join} onOpenChange={(o) => !o && setJoin(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Joining status for {join?.student.name}</DialogTitle></DialogHeader>
          {join?.studentJoiningDate && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
              <span>Student reports joining on {fmtDate(join.studentJoiningDate)}.</span>
              {join.joiningProofName && <Button size="sm" variant="outline" onClick={async () => { try { const r = await api<{ url: string }>(`/api/offers/${join.id}/joining-proof`); window.open(r.url, "_blank", "noopener") } catch (e) { toastError(e) } }}>Open {join.joiningProofName}</Button>}
              <Button size="sm" variant="ghost" onClick={() => { setJs("JOINED"); setJd(join.studentJoiningDate!.slice(0, 10)) }}>Use these details</Button>
            </div>
          )}
          <Field><FieldLabel>Status</FieldLabel><OptionSelect className="w-full" value={js} onChange={setJs} options={JOINING} placeholder="Status" /></Field>
          <Field><FieldLabel htmlFor="jd">Joining date</FieldLabel><Input id="jd" type="date" value={jd} onChange={(e) => setJd(e.target.value)} /></Field>
          <DialogFooter><Button disabled={busy} onClick={doJoin}>{busy && <Spinner />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
