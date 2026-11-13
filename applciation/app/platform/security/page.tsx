"use client"

import * as React from "react"
import Link from "next/link"
import { InfoIcon, SearchIcon, ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { OptionSelect } from "@/components/option-select"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { EmptyNote, PageHeader, TableBox } from "../_components/page-header"

type ReviewState = "UNDER_REVIEW" | "RESOLVED" | "NO_ACTION"
type Ev = { id: string; source: "PLATFORM" | "INSTITUTION"; at: string; action: string; outcome: "success" | "failure"; actor: { email: string | null; name: string | null } | null; institution: { id: string; name: string | null } | null; review: { status: ReviewState; note: string | null; updatedAt: string } | null }
type Page = { items: Ev[]; page: number; total: number; totalPages: number }
type Admin = { id: string; isActive: boolean; mfaEnrolled: boolean | null }
type Denials = { days: number; total: number; routes: { route: string; kind: string; count: number }[]; institutions: { institution: string | null; count: number }[]; note: string }
type Policy = { mfa: { requireForInstitutionAdmins: boolean; activeInstitutionAdministrators: number; institutionsAlreadyRequiring: number; activeInstitutions: number } }

const REVIEW: Record<ReviewState, string> = { UNDER_REVIEW: "Under review", RESOLVED: "Resolved", NO_ACTION: "No action needed" }
const KNOWN: Record<string, string> = {
  "platform.mfa.enroll_started": "Started setting up an authenticator", "platform.mfa.removed": "Removed an authenticator", "platform.mfa.remove_failed": "Failed attempt to remove an authenticator",
  "platform.sessions.revoked_others": "Signed out other sessions", "institution.update": "Changed an institution", "staff.roles.platform_update": "Changed a staff role", "module.global_switch": "Used the module emergency switch",
  "security.review": "Reviewed a security event", "incident.create": "Recorded an incident", "incident.update": "Updated an incident", "incident.resolve": "Resolved an incident",
  "announcement.publish": "Published an announcement", "announcement.cancel": "Cancelled an announcement", "support.reopen": "Reopened a support request", "support.resolve": "Resolved a support request",
}
/** A readable name for a recorded action. Unknown actions are shown as words, never hidden. */
const plain = (a: string) => KNOWN[a] ?? (a.replace(/[._]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()))
const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

/**
 * Security centre. It reads the audit trail the platform already keeps and lets an administrator record what was done about an event.
 * It does not detect, score or label anything as an attack. Sign-in failures of institution users and access denials between institutions are not
 * recorded anywhere today, so they cannot appear here.
 */
export default function SecurityPage() {
  const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState("")
  const [f, setF] = React.useState({ outcome: "", source: "" }); const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const events = useApi<Page>("/api/platform/security/events", { q: dq || undefined, outcome: f.outcome || undefined, source: f.source || undefined, page, pageSize: 20 })
  const summary = useApi<{ underReview: number; resolved: number; noAction: number }>("/api/platform/security/summary")
  const failures = useApi<Page>("/api/platform/security/events", { outcome: "failure", from: since(30), pageSize: 1 })
  const admins = useApi<{ items: Admin[] }>("/api/platform/admins")
  const policy = useApi<Policy>("/api/platform/policy")
  const denials = useApi<Denials>("/api/platform/security/denials", { days: 7 })
  const [review, setReview] = React.useState<Ev | null>(null)

  const active = admins.data?.items.filter((a) => a.isActive) ?? []
  const enrolled = active.filter((a) => a.mfaEnrolled).length

  return (
    <>
      <PageHeader title="Security centre" description="Two-step sign-in, recorded administrator actions and what was done about them." actions={<Button variant="outline" size="sm" render={<Link href="/platform/audit" />}>Open the audit log</Button>} />

      <section aria-label="Security summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-primary" />Administrators with two-step sign-in</CardDescription><CardTitle className="text-3xl tabular-nums">{admins.error ? <span className="text-base font-normal text-muted-foreground">Unavailable</span> : !admins.data ? <Skeleton className="h-8 w-16" /> : `${enrolled} of ${active.length}`}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Required for every platform administrator. A status of unknown means the sign-in service could not be asked.</CardContent></Card>
        <Card><CardHeader><CardDescription>Institutions requiring two-step</CardDescription><CardTitle className="text-3xl tabular-nums">{policy.error ? <span className="text-base font-normal text-muted-foreground">Unavailable</span> : !policy.data ? <Skeleton className="h-8 w-16" /> : `${policy.data.mfa.institutionsAlreadyRequiring} of ${policy.data.mfa.activeInstitutions}`}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{policy.data ? (policy.data.mfa.requireForInstitutionAdmins ? "The platform requires it for all institution administrators." : "The platform does not require it; each institution chooses.") : ""} <Link className="text-primary underline-offset-4 hover:underline" href="/platform/policy">Change in policy</Link></CardContent></Card>
        <Card><CardHeader><CardDescription>Failed actions, last 30 days</CardDescription><CardTitle className="text-3xl tabular-nums">{failures.error ? <span className="text-base font-normal text-muted-foreground">Unavailable</span> : !failures.data ? <Skeleton className="h-8 w-16" /> : failures.data.total}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Recorded actions that did not complete. Not a measure of attacks.</CardContent></Card>
        <Card><CardHeader><CardDescription>Events under review</CardDescription><CardTitle className="text-3xl tabular-nums">{summary.error ? <span className="text-base font-normal text-muted-foreground">Unavailable</span> : !summary.data ? <Skeleton className="h-8 w-16" /> : summary.data.underReview}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{summary.data ? `${summary.data.resolved} resolved · ${summary.data.noAction} needed no action` : ""}</CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Refused requests, last 7 days</CardTitle><CardDescription>Signed-in requests that were refused because of a role or a module. One person following an old link produces one line, so a count here is not evidence of an attack.</CardDescription></CardHeader>
        <CardContent>
          {denials.error ? <Alert variant="destructive"><AlertTitle>Could not load refused requests</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{denials.error instanceof Error ? denials.error.message : "Try again"}<Button size="sm" variant="outline" onClick={denials.reload}>Try again</Button></AlertDescription></Alert>
            : !denials.data ? <Skeleton className="h-24 w-full" /> : denials.data.total === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No refused requests have been recorded in this period.</p> : (
              <div className="grid gap-6 md:grid-cols-2">
                <div><div className="mb-2 text-sm font-medium">{denials.data.total} refused, by page</div><ul className="flex flex-col divide-y text-sm">{denials.data.routes.map((r) => <li key={r.route + r.kind} className="flex items-center justify-between gap-3 py-1.5"><span className="min-w-0 truncate"><span className="font-mono text-xs">{r.route}</span><span className="ml-2 text-xs text-muted-foreground">{r.kind === "MODULE" ? "module off" : "role"}</span></span><span className="tabular-nums">{r.count}</span></li>)}</ul></div>
                <div><div className="mb-2 text-sm font-medium">By institution</div><ul className="flex flex-col divide-y text-sm">{denials.data.institutions.map((i, k) => <li key={k} className="flex items-center justify-between gap-3 py-1.5"><span className="truncate">{i.institution ?? "Not tied to an institution"}</span><span className="tabular-nums">{i.count}</span></li>)}</ul></div>
              </div>
            )}
          {denials.data && <p className="mt-3 text-xs text-muted-foreground">{denials.data.note}</p>}
        </CardContent>
      </Card>

      <Alert><InfoIcon /><AlertTitle>What is and is not recorded</AlertTitle><AlertDescription>This page shows platform administrators&apos; own security events and the changes they make to institutions. Sign-in failures of institution users happen inside the sign-in service and are not recorded here, and attempts to open another institution&apos;s record end as &ldquo;not found&rdquo; and are not recorded either. Nothing on this page is called an attack.</AlertDescription></Alert>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search events" className="pl-8" placeholder="Search action, person or institution" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <OptionSelect className="w-40" placeholder="Result" value={f.outcome} onChange={(v) => { setF({ ...f, outcome: v }); setPage(1) }} options={[{ value: "", label: "Any result" }, { value: "success", label: "Completed" }, { value: "failure", label: "Failed" }]} />
        <OptionSelect className="w-52" placeholder="Where" value={f.source} onChange={(v) => { setF({ ...f, source: v }); setPage(1) }} options={[{ value: "", label: "Everything" }, { value: "PLATFORM", label: "Administrator security events" }, { value: "INSTITUTION", label: "Changes to institutions" }]} />
      </div>

      {events.error ? <Alert variant="destructive"><AlertTitle>Could not load events</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{events.error instanceof Error ? events.error.message : "Try again"}<Button size="sm" variant="outline" onClick={events.reload}>Try again</Button></AlertDescription></Alert>
        : !events.data ? <Skeleton className="h-48 w-full rounded-xl" />
        : events.data.items.length === 0 ? <EmptyNote>No recorded events match.</EmptyNote> : (
          <TableBox>
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>What happened</TableHead><TableHead>Who</TableHead><TableHead>Institution</TableHead><TableHead>Result</TableHead><TableHead>Review</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {events.data.items.map((e) => (
                  <TableRow key={`${e.source}-${e.id}`}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(e.at)}</TableCell>
                    <TableCell className="font-medium">{plain(e.action)}</TableCell>
                    <TableCell className="text-sm">{e.actor?.name ?? e.actor?.email ?? "System"}</TableCell>
                    <TableCell className="text-sm">{e.institution?.name ?? "Platform"}</TableCell>
                    <TableCell><Badge variant={e.outcome === "success" ? "secondary" : "destructive"}>{e.outcome === "success" ? "Completed" : "Failed"}</Badge></TableCell>
                    <TableCell>{e.review ? <Badge variant={e.review.status === "UNDER_REVIEW" ? "outline" : "secondary"} className={e.review.status === "UNDER_REVIEW" ? "border-amber-500 bg-amber-100 text-amber-900" : ""}>{REVIEW[e.review.status]}</Badge> : <span className="text-xs text-muted-foreground">Not reviewed</span>}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setReview(e)}>{e.review ? "Update" : "Review"}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableBox>
        )}
      {events.data && events.data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{events.data.total} event{events.data.total === 1 ? "" : "s"} · page {events.data.page} of {events.data.totalPages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= events.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      )}

      <ReviewDialog ev={review} onClose={() => setReview(null)} onSaved={() => { setReview(null); events.reload(); summary.reload() }} />
    </>
  )
}

function ReviewDialog({ ev, onClose, onSaved }: { ev: Ev | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!ev} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{ev ? plain(ev.action) : "Review"}</DialogTitle><DialogDescription>{ev ? `${fmtDateTime(ev.at)} · ${ev.actor?.name ?? ev.actor?.email ?? "System"}${ev.institution?.name ? ` · ${ev.institution.name}` : ""}` : ""}</DialogDescription></DialogHeader>
        {ev && <ReviewForm key={`${ev.source}-${ev.id}`} ev={ev} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function ReviewForm({ ev, onClose, onSaved }: { ev: Ev; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = React.useState<ReviewState>(ev.review?.status ?? "UNDER_REVIEW")
  const [note, setNote] = React.useState(ev.review?.note ?? ""); const [busy, setBusy] = React.useState(false)
  const needsNote = status !== "UNDER_REVIEW"
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api("/api/platform/security/reviews", { method: "POST", body: { source: ev.source, eventId: ev.id, status, ...(note.trim() ? { note: note.trim() } : {}) } }); toast.success("Review saved"); onSaved() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Recording a review does not change the event. It says what was done about it.</p>
      <OptionSelect className="w-full" placeholder="Status" value={status} onChange={(s) => setStatus(s as ReviewState)} options={(Object.keys(REVIEW) as ReviewState[]).map((s) => ({ value: s, label: REVIEW[s] }))} />
      <Textarea aria-label="Note" rows={3} maxLength={1000} placeholder={needsNote ? "What was found or done (required)" : "Optional note"} value={note} onChange={(e) => setNote(e.target.value)} />
      {ev.review && <p className="text-xs text-muted-foreground">Last reviewed {fmtDateTime(ev.review.updatedAt)}.</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (needsNote && note.trim().length < 3)}>{busy && <Spinner />}Save review</Button></div>
    </form>
  )
}
