"use client"

import * as React from "react"
import { EllipsisIcon, HistoryIcon, KeyRoundIcon, PencilIcon, PlusIcon, PowerIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { SignInHistory } from "@/components/sign-in-history"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Staff = { id: string; name: string; email: string; roles: string[]; departmentId: string | null; isActive: boolean }
const ROLES = [
  ["TPO_ADMIN", "Head TPO / admin", "Everything, including settings and approvals."],
  ["PLACEMENT_OFFICER", "Placement officer", "Runs drives, students and offers day to day."],
  ["DEPARTMENT_COORDINATOR", "Department coordinator", "Sees and supports the students of one department."],
] as const
const label = (r: string) => ROLES.find((x) => x[0] === r)?.[1] ?? titleCase(r)

/** Pick one or more roles. The first one ticked is the main role; a department is asked for when coordinator is among them. */
function RolePicker({ roles, onChange }: { roles: string[]; onChange: (r: string[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {ROLES.map(([key, name, hint]) => (
        <label key={key} className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={roles.includes(key)} onCheckedChange={(on) => onChange(on ? [...roles, key] : roles.filter((x) => x !== key))} />
          <span><span className="font-medium">{name}</span><span className="block text-muted-foreground">{hint}</span></span>
        </label>
      ))}
      <p className="text-xs text-muted-foreground">A person can hold several roles. They get everything each role allows. A coordinator who is also an officer or admin sees all departments.</p>
    </div>
  )
}

type Dept = { id: string; name: string; isActive: boolean }

export function StaffPanel() {
  const { state } = useAuth()
  const me = state.status === "ready" ? state.profile.email : ""
  const staff = useApi<Staff[]>("/api/settings/staff")
  const depts = useApi<Dept[]>("/api/settings/departments")
  const [edit, setEdit] = React.useState<Staff | "new" | null>(null)
  const [hist, setHist] = React.useState<Staff | null>(null)
  const [reset, setReset] = React.useState<Staff | null>(null)
  const deptName = (id: string | null) => (id ? depts.data?.find((d) => d.id === id)?.name ?? "—" : "—")

  async function toggle(u: Staff) {
    try { await api(`/api/settings/staff/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }); toast.success(u.isActive ? "Deactivated" : "Reactivated"); staff.reload() } catch (e) { toastError(e) }
  }
  if (!staff.data) return <Skeleton className="h-64 rounded-xl" />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><Button onClick={() => setEdit("new")}><PlusIcon />Invite staff member</Button></div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Roles</TableHead><TableHead>Department</TableHead><TableHead>State</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {staff.data.map((u) => (
              <TableRow key={u.id} className={u.isActive ? "" : "opacity-60"}>
                <TableCell className="font-medium">{u.name}{u.email === me && <Badge variant="outline" className="ml-2">You</Badge>}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{u.roles.map((r, i) => <Badge key={r} variant={i === 0 ? "default" : "secondary"} title={i === 0 ? "Main role" : undefined}>{label(r)}</Badge>)}</div></TableCell>
                <TableCell>{deptName(u.departmentId)}</TableCell>
                <TableCell><Badge variant={u.isActive ? "outline" : "destructive"}>{u.isActive ? "Active" : "Deactivated"}</Badge></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`} />}><EllipsisIcon /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setEdit(u)}><PencilIcon />Edit roles and details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setHist(u)}><HistoryIcon />Sign-in history</DropdownMenuItem>
                      {u.email !== me && <DropdownMenuItem onClick={() => setReset(u)}><KeyRoundIcon />Reset access</DropdownMenuItem>}
                      {u.email !== me && <DropdownMenuItem onClick={() => toggle(u)}><PowerIcon />{u.isActive ? "Deactivate" : "Reactivate"}</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <EditDialog target={edit} depts={(depts.data ?? []).filter((d) => d.isActive)} onClose={() => setEdit(null)} onSaved={staff.reload} />
      <Dialog open={!!hist} onOpenChange={(o) => { if (!o) setHist(null) }}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Sign-in history: {hist?.name}</DialogTitle><DialogDescription>Recent sign-ins, newest first.</DialogDescription></DialogHeader>{hist && <SignInHistory path={`/api/settings/staff/${hist.id}/logins`} />}</DialogContent>
      </Dialog>
      <ResetDialog target={reset} onClose={() => setReset(null)} />
    </div>
  )
}

function EditDialog({ target, depts, onClose, onSaved }: { target: Staff | "new" | null; depts: Dept[]; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{target === "new" ? "Invite a staff member" : "Edit staff member"}</DialogTitle><DialogDescription>{target === "new" ? "They get an email to set a password." : "Changes apply the next time they use the app."}</DialogDescription></DialogHeader>
        {target && <EditForm key={target === "new" ? "new" : target.id} target={target} depts={depts} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ target, depts, onClose, onSaved }: { target: Staff | "new"; depts: Dept[]; onClose: () => void; onSaved: () => void }) {
  const isNew = target === "new"
  const [name, setName] = React.useState(isNew ? "" : target.name)
  const [email, setEmail] = React.useState("")
  const [roles, setRoles] = React.useState<string[]>(isNew ? [] : target.roles)
  const [dept, setDept] = React.useState(isNew ? "" : target.departmentId ?? "")
  const [busy, setBusy] = React.useState(false)
  const coordinator = roles.includes("DEPARTMENT_COORDINATOR")
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!roles.length) return void toast.error("Choose at least one role")
    if (coordinator && !dept) return void toast.error("Choose the coordinator's department")
    setBusy(true)
    try {
      const body = { name: name.trim(), roles, departmentId: coordinator ? dept : null, ...(isNew ? { email: email.trim() } : {}) }
      await api(isNew ? "/api/settings/staff" : `/api/settings/staff/${target.id}`, { method: isNew ? "POST" : "PATCH", body })
      toast.success(isNew ? "Invitation sent" : "Saved")
      onClose(); onSaved()
    } catch (x) { toastError(x) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="sname">Full name</FieldLabel><Input id="sname" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required /></Field>
        {isNew && <Field><FieldLabel htmlFor="semail">Email</FieldLabel><Input id="semail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>}
        <Field><FieldLabel>Roles</FieldLabel><RolePicker roles={roles} onChange={setRoles} /><FieldDescription>The first role ticked is shown as the main role.</FieldDescription></Field>
        {coordinator && <Field><FieldLabel>Department (for the coordinator role)</FieldLabel><OptionSelect className="w-full" value={dept} onChange={setDept} options={depts.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a department" /></Field>}
      </FieldGroup>
      <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}{isNew ? "Send invitation" : "Save"}</Button></DialogFooter>
    </form>
  )
}

function ResetDialog({ target, onClose }: { target: Staff | null; onClose: () => void }) {
  const [pw, setPw] = React.useState(true)
  const [mfa, setMfa] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const close = () => { setPw(true); setMfa(false); onClose() }
  async function go() {
    if (!target) return
    setBusy(true)
    try {
      const actions = [...(pw ? ["password"] : []), ...(mfa ? ["mfa"] : [])]
      await api(`/api/settings/staff/${target.id}/reset-access`, { method: "POST", body: { actions } })
      toast.success(`Done for ${target.name}`)
      close()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset access for {target?.name}</DialogTitle><DialogDescription>Choose what to reset. Each action is recorded in the audit log.</DialogDescription></DialogHeader>
        <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={pw} onCheckedChange={(v) => setPw(!!v)} /><span><span className="font-medium">Send a password reset email</span><span className="block text-muted-foreground">They choose a new password from the link.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={mfa} onCheckedChange={(v) => setMfa(!!v)} /><span><span className="font-medium">Remove their authenticator app</span><span className="block text-muted-foreground">For a lost or replaced phone. They set up a new one at their next sign-in.</span></span></label>
        <DialogFooter><Button onClick={go} disabled={busy || (!pw && !mfa)}>{busy && <Spinner />}Reset</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
