"use client"

import * as React from "react"
import { toast } from "sonner"

import { MasterTab } from "@/components/master-tab"
import { OptionSelect } from "@/components/option-select"
import { ProspectDialog } from "@/components/staff-extras"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type P = { id: string; companyName: string; industry: string | null; contactName: string | null; contactEmail: string | null; stage: string; nextFollowUpAt: string | null; owner?: { name: string } }
const STAGES = ["PROSPECT", "IN_CONVERSATION", "DRIVE_SCHEDULED", "WON", "LOST"].map((v) => ({ value: v, label: titleCase(v) }))

export default function CrmPage() {
  const pipe = useApi<{ stages: { stage: string; count: number }[]; followUpsDue: number }>("/api/crm/pipeline")
  const [lost, setLost] = React.useState<{ id: string; reload: () => void } | null>(null)
  const [reason, setReason] = React.useState("")
  const [log, setLog] = React.useState<string | null>(null)
  async function move(id: string, stage: string, reload: () => void, lostReason?: string) {
    if (stage === "LOST" && !lostReason) { setLost({ id, reload }); return }
    try { await api(`/api/crm/prospects/${id}/stage`, { method: "POST", body: { stage, ...(lostReason ? { lostReason } : {}) } }); toast.success("Stage updated"); setLost(null); setReason(""); reload(); pipe.reload() } catch (e) { toastError(e) }
  }
  return (
    <div className="flex flex-col gap-4">
      {pipe.data && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pipe.data.stages.map((s) => <Card key={s.stage} size="sm"><CardHeader><CardDescription>{titleCase(s.stage)}</CardDescription><CardTitle className="text-2xl">{s.count}</CardTitle></CardHeader></Card>)}
          <Card size="sm"><CardHeader><CardDescription>Follow-ups due</CardDescription><CardTitle className="text-2xl">{pipe.data.followUpsDue}</CardTitle></CardHeader></Card>
        </div>
      )}
      <MasterTab<P> endpoint="/api/crm/prospects" addLabel="Add prospect"
        fields={[{ name: "companyName", label: "Company" }, { name: "industry", label: "Industry", required: false }, { name: "contactName", label: "Contact name", required: false }, { name: "contactEmail", label: "Contact email", type: "email", required: false }, { name: "nextFollowUpAt", label: "Follow up on", type: "date", required: false }]}
        toBody={(v) => Object.fromEntries(Object.entries({ companyName: v.companyName, industry: v.industry, contactName: v.contactName, contactEmail: v.contactEmail, nextFollowUpAt: v.nextFollowUpAt ? new Date(`${v.nextFollowUpAt}T09:00:00`).toISOString() : "" }).filter(([, x]) => x))}
        columns={[
          { label: "Company", cell: (r) => <>{r.companyName}<div className="text-xs text-muted-foreground">{[r.contactName, r.contactEmail].filter(Boolean).join(" · ")}</div></> },
          { label: "Stage", cell: (r, reload) => <OptionSelect className="w-44" value={r.stage} onChange={(v) => move(r.id, v, reload)} options={STAGES} placeholder="Stage" /> },
          { label: "Log", cell: (r) => <Button size="sm" variant="outline" onClick={() => setLog(r.id)}>Open log</Button> },
          { label: "Follow up", cell: (r) => r.nextFollowUpAt ? <Badge variant={new Date(r.nextFollowUpAt) <= new Date() ? "destructive" : "outline"}>{fmtDate(r.nextFollowUpAt)}</Badge> : "—" },
        ]} />
      <ProspectDialog id={log} onClose={() => setLog(null)} onChanged={pipe.reload} />
      <Dialog open={!!lost} onOpenChange={(o) => !o && setLost(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Why was this prospect lost?</DialogTitle></DialogHeader>
          <Field><FieldLabel htmlFor="why">Reason</FieldLabel><Input id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button disabled={reason.trim().length < 3} onClick={() => lost && move(lost.id, "LOST", lost.reload, reason.trim())}>Mark as lost</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
