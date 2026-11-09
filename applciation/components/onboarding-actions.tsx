"use client"

import * as React from "react"
import Link from "next/link"
import { CopyIcon, EllipsisIcon, HistoryIcon, KeyRoundIcon, LogInIcon, MailIcon, MessageSquareWarningIcon, PencilIcon, PowerIcon, ShieldCheckIcon, UserIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { SignInHistory } from "@/components/sign-in-history"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { CAN_REQUEST_CHANGES, INVITATION_LABEL, REVIEWABLE } from "@/lib/web/onboarding"
import { useApi } from "@/lib/web/use-api"

export type ActionStudent = { id: string; name: string; onboardingStatus: string; isActive: boolean; invitation: { status: string; expiresAt: string } | null }
export type Dlg = null | "invitation" | "link" | "revoke" | "corrections" | "verify" | "reject" | "history" | "signins" | "reset"

/** The "..." menu on a student row, with every invitation and verification action. Each one confirms or collects what it needs in a dialog. */
export function StudentActionMenu({ student, onChanged, canInvite, onEdit, onToggle }: { student: ActionStudent; onChanged: () => void; canInvite: boolean; onEdit?: () => void; onToggle?: () => void }) {
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const inv = student.invitation
  const open = inv && inv.status !== "ACCEPTED"
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${student.name}`} />}><EllipsisIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {inv && <DropdownMenuItem onClick={() => setDlg("invitation")}><MailIcon />View invitation</DropdownMenuItem>}
          {canInvite && open && <DropdownMenuItem onClick={() => resend(student.id, onChanged)}><MailIcon />Resend invitation</DropdownMenuItem>}
          {canInvite && open && <DropdownMenuItem onClick={() => setDlg("link")}><CopyIcon />Copy invitation link</DropdownMenuItem>}
          {canInvite && open && inv.status !== "REVOKED" && <DropdownMenuItem variant="destructive" onClick={() => setDlg("revoke")}><XCircleIcon />Revoke invitation</DropdownMenuItem>}
          {(inv || canInvite) && <DropdownMenuSeparator />}
          <DropdownMenuItem render={<Link href={`/staff/students/${student.id}`} />}><UserIcon />View student profile</DropdownMenuItem>
          {CAN_REQUEST_CHANGES.includes(student.onboardingStatus) && <DropdownMenuItem onClick={() => setDlg("corrections")}><MessageSquareWarningIcon />Request corrections</DropdownMenuItem>}
          {REVIEWABLE.includes(student.onboardingStatus) && <DropdownMenuItem onClick={() => setDlg("verify")}><ShieldCheckIcon />Verify profile</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setDlg("history")}><HistoryIcon />View audit history</DropdownMenuItem>
          {canInvite && student.invitation?.status === "ACCEPTED" && <DropdownMenuItem onClick={() => setDlg("signins")}><LogInIcon />Sign-in history</DropdownMenuItem>}
          {canInvite && student.invitation?.status === "ACCEPTED" && <DropdownMenuItem onClick={() => setDlg("reset")}><KeyRoundIcon />Reset access</DropdownMenuItem>}
          {(onEdit || onToggle) && <DropdownMenuSeparator />}
          {onEdit && <DropdownMenuItem onClick={onEdit}><PencilIcon />Edit</DropdownMenuItem>}
          {onToggle && <DropdownMenuItem onClick={onToggle}><PowerIcon />{student.isActive ? "Deactivate" : "Reactivate"}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <StudentDialogs studentId={student.id} name={student.name} dlg={dlg} close={() => setDlg(null)} onChanged={onChanged} />
    </>
  )
}

async function resend(id: string, done: () => void) {
  try {
    const r = await api<{ emailSent: boolean; emailError: string | null }>(`/api/students/${id}/invitation/resend`, { method: "POST" })
    if (r.emailSent) toast.success("A new invitation was emailed")
    else toast.warning("A new link was issued but the email could not be sent", { description: r.emailError ?? undefined })
    done()
  } catch (e) { toastError(e) }
}

/** All the dialogs behind the actions. Also used by the student page, which opens them from its own buttons. */
export function StudentDialogs({ studentId, name, dlg, close, onChanged }: { studentId: string; name: string; dlg: Dlg; close: () => void; onChanged: () => void }) {
  return (
    <>
      <InvitationDialog open={dlg === "invitation"} studentId={studentId} name={name} onClose={close} />
      <LinkDialog open={dlg === "link"} studentId={studentId} onClose={close} onChanged={onChanged} />
      <RevokeDialog open={dlg === "revoke"} studentId={studentId} name={name} onClose={close} onChanged={onChanged} />
      <CorrectionsDialog open={dlg === "corrections"} studentId={studentId} name={name} onClose={close} onChanged={onChanged} />
      <VerifyDialog open={dlg === "verify"} studentId={studentId} name={name} onClose={close} onChanged={onChanged} />
      <RejectDialog open={dlg === "reject"} studentId={studentId} name={name} onClose={close} onChanged={onChanged} />
      <HistoryDialog open={dlg === "history"} studentId={studentId} name={name} onClose={close} />
      <Dialog open={dlg === "signins"} onOpenChange={(o) => { if (!o) close() }}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Sign-in history: {name}</DialogTitle><DialogDescription>Recent sign-ins, newest first.</DialogDescription></DialogHeader>{dlg === "signins" && <SignInHistory path={`/api/students/${studentId}/logins`} />}</DialogContent>
      </Dialog>
      <ResetAccessDialog open={dlg === "reset"} studentId={studentId} name={name} onClose={close} />
    </>
  )
}

type Invitation = { id: string; invitedEmail: string; admissionNumber: string; status: string; expiresAt: string; sentAt: string | null; acceptedAt: string | null; lastResentAt: string | null; resendCount: number; revokedAt: string | null; createdAt: string; campus: { name: string } | null; emails: { id: string; kind: string; status: string; error: string | null; createdAt: string; toEmail: string }[] }

function InvitationDialog({ open, studentId, name, onClose }: { open: boolean; studentId: string; name: string; onClose: () => void }) {
  const { data, loading } = useApi<{ invitation: Invitation | null }>(open ? `/api/students/${studentId}/invitation` : null)
  const inv = data?.invitation
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Invitation for {name}</DialogTitle><DialogDescription>The link itself is never shown here. Use “Copy invitation link” to issue a new one.</DialogDescription></DialogHeader>
        {loading && !inv ? <Skeleton className="h-32" /> : !inv ? <p className="text-sm text-muted-foreground">This student has no invitation.</p> : (
          <div className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Status</dt><dd><Badge variant={statusVariant(inv.status)}>{INVITATION_LABEL[inv.status] ?? inv.status}</Badge></dd>
              <dt className="text-muted-foreground">Invited email</dt><dd className="break-all">{inv.invitedEmail}</dd>
              <dt className="text-muted-foreground">Admission no</dt><dd>{inv.admissionNumber}</dd>
              <dt className="text-muted-foreground">Created</dt><dd>{fmtDateTime(inv.createdAt)}</dd>
              <dt className="text-muted-foreground">Sent</dt><dd>{fmtDateTime(inv.sentAt)}</dd>
              <dt className="text-muted-foreground">Expires</dt><dd>{fmtDateTime(inv.expiresAt)}</dd>
              <dt className="text-muted-foreground">Accepted</dt><dd>{fmtDateTime(inv.acceptedAt)}</dd>
              <dt className="text-muted-foreground">Resent</dt><dd>{inv.resendCount ? `${inv.resendCount} time${inv.resendCount > 1 ? "s" : ""}, last ${fmtDateTime(inv.lastResentAt)}` : "Never"}</dd>
            </dl>
            <div>
              <div className="pb-1 font-medium">Email attempts</div>
              {inv.emails.length === 0 ? <p className="text-muted-foreground">No email has been sent yet.</p> : (
                <ul className="flex flex-col gap-1">
                  {inv.emails.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2">
                      <Badge variant={m.status === "SENT" ? "default" : m.status === "FAILED" ? "destructive" : "secondary"}>{titleCase(m.status)}</Badge>
                      <span>{titleCase(m.kind)}</span><span className="text-muted-foreground">{fmtDateTime(m.createdAt)}</span>
                      {m.error && <span className="text-xs text-destructive">{m.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LinkDialog({ open, studentId, onClose, onChanged }: { open: boolean; studentId: string; onClose: () => void; onChanged: () => void }) {
  const [link, setLink] = React.useState<{ link: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const close = () => { setLink(null); setCopied(false); onClose() }
  async function issue() {
    setBusy(true)
    try { setLink(await api(`/api/students/${studentId}/invitation/link`, { method: "POST" })); onChanged() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link.link); setCopied(true); toast.success("Link copied") } catch { toast.error("Could not copy. Select the link and copy it by hand") }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Copy invitation link</DialogTitle><DialogDescription>Only a fingerprint of each link is stored, so an old link cannot be read back. This issues a new active link and cancels the previous one. Share it only with the invited student.</DialogDescription></DialogHeader>
        {link ? (
          <div className="flex flex-col gap-2">
            <Input readOnly value={link.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
            <p className="text-xs text-muted-foreground">Expires {fmtDateTime(link.expiresAt)}. This link is shown only now.</p>
          </div>
        ) : null}
        <DialogFooter>
          {link ? <Button onClick={copy}><CopyIcon />{copied ? "Copied" : "Copy link"}</Button> : <Button onClick={issue} disabled={busy}>{busy && <Spinner />}Issue new link</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevokeDialog({ open, studentId, name, onClose, onChanged }: { open: boolean; studentId: string; name: string; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false)
  async function go() {
    setBusy(true)
    try { await api(`/api/students/${studentId}/invitation/revoke`, { method: "POST" }); toast.success("Invitation revoked"); onClose(); onChanged() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Revoke the invitation for {name}?</AlertDialogTitle><AlertDialogDescription>The link stops working immediately. You can issue a new one later by resending.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); void go() }}>{busy && <Spinner />}Revoke</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const SECTION_CHOICES = [["PERSONAL", "Personal"], ["ACADEMICS", "Academic marks"], ["EDUCATION_HISTORY", "Education history"], ["SKILLS", "Skills"], ["PROJECTS", "Projects"], ["INTERNSHIPS", "Internships"], ["RESUME", "Summary"], ["DOCUMENTS", "Documents"], ["ACHIEVEMENTS", "Achievements"]] as const

function CorrectionsDialog({ open, studentId, name, onClose, onChanged }: { open: boolean; studentId: string; name: string; onClose: () => void; onChanged: () => void }) {
  const [comment, setComment] = React.useState("")
  const [only, setOnly] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const close = () => { setComment(""); setOnly(new Set()); onClose() }
  async function go() {
    setBusy(true)
    try {
      await api(`/api/students/${studentId}/onboarding/request-corrections`, { method: "POST", body: { comment, sections: only.size ? [...only] : undefined } })
      toast.success("The student was asked to make changes"); close(); onChanged()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request corrections from {name}</DialogTitle><DialogDescription>The student is notified, can edit the profile again, and resubmits it.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="corr">What needs to change?</FieldLabel><Textarea id="corr" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="For example: the 12th percentage does not match the marks card." /></Field>
        <div className="text-sm">
          <div className="pb-1 text-muted-foreground">Reopen only some sections (leave empty to reopen everything under review)</div>
          <div className="flex flex-wrap gap-1.5">
            {SECTION_CHOICES.map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={only.has(k) ? "default" : "outline"} aria-pressed={only.has(k)} onClick={() => setOnly((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })}>{label}</Button>
            ))}
          </div>
        </div>
        <DialogFooter><Button onClick={go} disabled={busy || comment.trim().length < 3}>{busy && <Spinner />}Send to student</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Review = { nameReview: { invited: string; entered: string; decidedAt: string | null } | null; documents: { id: string; status: string }[]; missingDocuments: string[]; sections: { status: string }[] }

function VerifyDialog({ open, studentId, name, onClose, onChanged }: { open: boolean; studentId: string; name: string; onClose: () => void; onChanged: () => void }) {
  const { data } = useApi<Review>(open ? `/api/students/${studentId}/onboarding` : null)
  const [decision, setDecision] = React.useState("")
  const [comment, setComment] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const close = () => { setDecision(""); setComment(""); onClose() }
  const openDocs = data?.documents.filter((d) => d.status !== "VERIFIED").length ?? 0
  const needsName = !!data?.nameReview && !data.nameReview.decidedAt
  async function go() {
    setBusy(true)
    try { await api(`/api/students/${studentId}/onboarding/verify`, { method: "POST", body: { comment: comment || undefined, nameDecision: needsName ? decision : undefined } }); toast.success("Profile verified"); close(); onChanged() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Verify {name}’s profile</DialogTitle><DialogDescription>This approves every section under review. Check the details and documents on the student’s page first.</DialogDescription></DialogHeader>
        {!data ? <Skeleton className="h-16" /> : (<>
          {openDocs > 0 && <Alert variant="destructive"><AlertTitle>{openDocs} document{openDocs > 1 ? "s" : ""} not verified</AlertTitle><AlertDescription>Verify or reject each document on the student’s page. A profile cannot be verified while documents are waiting or rejected.</AlertDescription></Alert>}
          {data.missingDocuments.length > 0 && <Alert><AlertTitle>Expected documents are missing</AlertTitle><AlertDescription>{data.missingDocuments.map(titleCase).join(", ")}</AlertDescription></Alert>}
          {needsName && data.nameReview && (
            <Field>
              <FieldLabel>The student entered a different name</FieldLabel>
              <RadioGroup value={decision} onValueChange={setDecision}>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="keep" />Keep the invited name: <strong>{data.nameReview.invited}</strong></label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="accept" />Use the name the student entered: <strong>{data.nameReview.entered}</strong></label>
              </RadioGroup>
            </Field>
          )}
          <Field><FieldLabel htmlFor="vc">Comment (optional)</FieldLabel><Input id="vc" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} /></Field>
        </>)}
        <DialogFooter><Button onClick={go} disabled={busy || !data || openDocs > 0 || (needsName && !decision)}>{busy && <Spinner />}Verify profile</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ open, studentId, name, onClose, onChanged }: { open: boolean; studentId: string; name: string; onClose: () => void; onChanged: () => void }) {
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const close = () => { setReason(""); onClose() }
  async function go() {
    setBusy(true)
    try { await api(`/api/students/${studentId}/onboarding/reject`, { method: "POST", body: { reason } }); toast.success("Profile rejected"); close(); onChanged() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject {name}’s profile</DialogTitle><DialogDescription>The student is told why and cannot edit until you request corrections. Prefer “Request corrections” when the problem can be fixed.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="rej">Reason</FieldLabel><Textarea id="rej" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <DialogFooter><Button variant="destructive" onClick={go} disabled={busy || reason.trim().length < 5}>{busy && <Spinner />}Reject profile</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetAccessDialog({ open, studentId, name, onClose }: { open: boolean; studentId: string; name: string; onClose: () => void }) {
  const [busy, setBusy] = React.useState(false)
  async function go() {
    setBusy(true)
    try { await api(`/api/students/${studentId}/reset-access`, { method: "POST" }); toast.success(`A password reset email was sent to ${name}`); onClose() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Reset access for {name}?</AlertDialogTitle><AlertDialogDescription>They get an email with a link to choose a new password. Their current password keeps working until they use it. This is recorded in the audit log.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void go() }}>{busy && <Spinner />}Send reset email</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type Item = { id: string; at: string; by: string; action: string; detail: string | null }
function HistoryDialog({ open, studentId, name, onClose }: { open: boolean; studentId: string; name: string; onClose: () => void }) {
  const { data, loading } = useApi<{ items: Item[] }>(open ? `/api/students/${studentId}/history` : null)
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Audit history: {name}</DialogTitle><DialogDescription>Every invitation, edit and verification action, newest first.</DialogDescription></DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading && !data ? <Skeleton className="h-32" /> : !data?.items.length ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : (
            <ul className="flex flex-col divide-y text-sm">
              {data.items.map((i) => (
                <li key={i.id} className="flex flex-col gap-0.5 py-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{titleCase(i.action.replaceAll(".", " "))}</span><span className="text-xs text-muted-foreground">{fmtDateTime(i.at)} by {i.by}</span></div>
                  {i.detail && <div className="text-muted-foreground">{i.detail}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

