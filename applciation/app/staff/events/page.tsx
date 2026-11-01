"use client"

import * as React from "react"
import { toast } from "sonner"

import { MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"

type E = { id: string; type: string; title: string; mode: string; startsAt: string; status: string; capacity: number | null }
const TYPES = ["CAREER_FAIR", "HACKATHON", "CODING_CONTEST", "CASE_CHALLENGE", "WORKSHOP"].map((v) => ({ value: v, label: titleCase(v) }))
const MODES = ["VIRTUAL", "ONSITE", "HYBRID"].map((v) => ({ value: v, label: titleCase(v) }))
const local = (d: unknown, t: unknown) => new Date(`${d}T${t || "09:00"}`).toISOString()

export default function EventsPage() {
  const [cancel, setCancel] = React.useState<{ id: string; reload: () => void } | null>(null)
  const [reason, setReason] = React.useState("")
  const act = (id: string, path: string, reload: () => void, ok: string, body?: unknown) => api(`/api/events/${id}/${path}`, { method: "POST", ...(body ? { body } : {}) }).then(() => { toast.success(ok); reload() }, toastError)
  return (
    <>
      <MasterTab<E> endpoint="/api/events" addLabel="Create event"
        fields={[{ name: "type", label: "Type", type: "select", options: TYPES, required: true }, { name: "title", label: "Title" }, { name: "mode", label: "Mode", type: "select", options: MODES, required: true }, { name: "venue", label: "Venue", required: false }, { name: "joinUrl", label: "Join link (virtual)", required: false }, { name: "date", label: "Date", type: "date" }, { name: "start", label: "Starts at (24h, for example 10:00)" }, { name: "end", label: "Ends at (24h, for example 13:00)" }, { name: "capacity", label: "Capacity", type: "number", required: false }, { name: "description", label: "Description", type: "textarea", required: false }]}
        toBody={(v) => Object.fromEntries(Object.entries({ type: v.type, title: v.title, mode: v.mode, venue: v.venue, joinUrl: v.joinUrl, startsAt: local(v.date, v.start), endsAt: local(v.date, v.end), capacity: v.capacity ? Number(v.capacity) : undefined, description: v.description }).filter(([, x]) => x !== "" && x !== undefined))}
        columns={[
          { label: "Event", cell: (r) => <>{r.title}<div className="text-xs text-muted-foreground">{titleCase(r.type)} · {titleCase(r.mode)}</div></> },
          { label: "When", cell: (r) => fmtDateTime(r.startsAt) },
          { label: "Status", cell: (r) => <Badge variant={r.status === "PUBLISHED" ? "default" : r.status === "CANCELLED" ? "destructive" : "secondary"}>{titleCase(r.status)}</Badge> },
          { label: "Actions", cell: (r, reload) => (
            <span className="space-x-2">
              {r.status === "DRAFT" && <Button size="sm" onClick={() => act(r.id, "publish", reload, "Published")}>Publish</Button>}
              {r.status === "PUBLISHED" && <Button size="sm" onClick={() => act(r.id, "complete", reload, "Marked complete")}>Complete</Button>}
              {(r.status === "DRAFT" || r.status === "PUBLISHED") && <Button size="sm" variant="outline" onClick={() => setCancel({ id: r.id, reload })}>Cancel</Button>}
              {r.status !== "DRAFT" && <Button size="sm" variant="outline" onClick={() => download(`/api/events/${r.id}/registrations`, { query: { format: "xlsx" } }).catch(toastError)}>Registrations</Button>}
            </span>
          ) },
        ]} />
      <Dialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel this event?</DialogTitle></DialogHeader>
          <Field><FieldLabel htmlFor="why">Reason (students are told)</FieldLabel><Input id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button variant="destructive" disabled={reason.trim().length < 3} onClick={() => { if (cancel) void act(cancel.id, "cancel", cancel.reload, "Event cancelled", { reason: reason.trim() }).then(() => { setCancel(null); setReason("") }) }}>Cancel event</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
