"use client"

import * as React from "react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Offer = { id: string; role: string; packageLpa: number | string; isPpo: boolean; status: string; offeredAt: string; expiresAt: string | null; joiningStatus: string; studentJoiningDate?: string | null; joiningProofName?: string | null; letterUrl: string | null; company: { name: string } }

export default function StudentOffersPage() {
  const { data, reload } = useApi<Offer[]>("/api/student/offers")
  const [pending, setPending] = React.useState<{ offer: Offer; decision: "ACCEPT" | "DECLINE" } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const rules = useApi<{ rules: string[] }>("/api/student/offer-rules")
  const [joinFor, setJoinFor] = React.useState<Offer | null>(null)
  const [joinDate, setJoinDate] = React.useState("")
  const [joinFile, setJoinFile] = React.useState<File | null>(null)
  async function reportJoining() {
    setBusy(true)
    try {
      const fd = new FormData(); fd.set("joiningDate", joinDate); if (joinFile) fd.set("file", joinFile)
      await api(`/api/student/offers/${joinFor!.id}/joining`, { method: "POST", body: fd }); toast.success("Sent to the placement office"); setJoinFor(null); setJoinFile(null); reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (!data) return <Skeleton className="h-64" />

  async function respond() {
    setBusy(true)
    try { await api(`/api/student/offers/${pending!.offer.id}/respond`, { method: "POST", body: { decision: pending!.decision } }); toast.success(pending!.decision === "ACCEPT" ? "Offer accepted" : "Offer declined"); setPending(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No offers yet.</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rules.data && <Alert className="md:col-span-2"><AlertTitle>College rules for offers</AlertTitle><AlertDescription><ul className="list-disc pl-5">{rules.data.rules.map((r) => <li key={r}>{r}</li>)}</ul></AlertDescription></Alert>}
      {data.map((o) => (
        <Card key={o.id}>
          <CardHeader><CardTitle>{o.company.name}</CardTitle><CardDescription>{o.role} · {fmtLpa(o.packageLpa)} {o.isPpo && <Badge variant="secondary">PPO</Badge>}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2"><Badge variant={statusVariant(o.status)}>{titleCase(o.status)}</Badge><span className="text-muted-foreground">Offered {fmtDate(o.offeredAt)}{o.expiresAt ? ` · reply by ${fmtDate(o.expiresAt)}` : ""}</span></div>
            {o.status === "ACCEPTED" && (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>Joining: {titleCase(o.joiningStatus)}</span>
                {o.studentJoiningDate && <span>(you reported {fmtDate(o.studentJoiningDate)}{o.joiningProofName ? `, ${o.joiningProofName}` : ""})</span>}
                {o.joiningStatus === "PENDING" && <Button size="sm" variant="outline" onClick={() => { setJoinFor(o); setJoinDate(o.studentJoiningDate?.slice(0, 10) ?? "") }}>{o.studentJoiningDate ? "Update joining details" : "I have joined"}</Button>}
              </div>
            )}
            {o.letterUrl && <a className="underline underline-offset-4" href={o.letterUrl} target="_blank" rel="noreferrer">Offer letter</a>}
            {o.status === "OFFERED" && <div className="flex gap-2"><Button onClick={() => setPending({ offer: o, decision: "ACCEPT" })}>Accept</Button><Button variant="outline" onClick={() => setPending({ offer: o, decision: "DECLINE" })}>Decline</Button></div>}
          </CardContent>
        </Card>
      ))}
      <Dialog open={!!joinFor} onOpenChange={(o) => !o && setJoinFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm that you joined {joinFor?.company.name}</DialogTitle><DialogDescription>The placement office checks this and updates your record.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="jd">Joining date</FieldLabel><Input id="jd" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="jf">Joining letter or ID (optional)</FieldLabel><Input id="jf" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setJoinFile(e.target.files?.[0] ?? null)} /></Field>
          </FieldGroup>
          <DialogFooter><Button disabled={busy || !joinDate} onClick={reportJoining}>{busy && <Spinner />}Send</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{pending?.decision === "ACCEPT" ? "Accept this offer?" : "Decline this offer?"}</AlertDialogTitle><AlertDialogDescription>{pending?.decision === "ACCEPT" ? "Accepting marks you as placed, and college rules may limit applying to other drives. This cannot be undone." : "This cannot be undone."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void respond() }}>{busy && <Spinner />}Confirm</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
