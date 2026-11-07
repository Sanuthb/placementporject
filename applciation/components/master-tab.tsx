"use client"

import * as React from "react"
import { EllipsisIcon, EyeIcon, PencilIcon, PowerIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect, type Option } from "@/components/option-select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

export type FieldDef = {
  name: string; label: string
  type?: "text" | "number" | "date" | "email" | "select" | "checkbox" | "student" | "textarea"
  options?: Option[]; required?: boolean
  /** Set to false to leave the field out of the Edit form (for example an email that cannot change). */
  editable?: boolean
}
type Row = { id: string; isActive?: boolean }
type Values = Record<string, string | boolean>

const ISO = /^\d{4}-\d{2}-\d{2}T/
/** A raw value turned into something readable for the View dialog; null means "not worth showing". */
const show = (v: unknown): React.ReactNode =>
  v === null || v === undefined || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "string" && ISO.test(v) ? fmtDate(v) : typeof v === "object" ? null : String(v)

/** The form inputs for a list of fields, shared by the Add and Edit dialogs. */
function FieldInputs({ fields, values, set }: { fields: FieldDef[]; values: Values; set: (k: string, v: string | boolean) => void }) {
  return (
    <FieldGroup>
      {fields.map((f) => f.type === "student" ? (
        <Field key={f.name}><FieldLabel>{f.label}</FieldLabel><StudentPicker value={String(values[f.name] ?? "")} onChange={(v) => set(f.name, v)} /></Field>
      ) : f.type === "textarea" ? (
        <Field key={f.name}><FieldLabel htmlFor={f.name}>{f.label}</FieldLabel><Textarea id={f.name} required={f.required ?? true} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} /></Field>
      ) : f.type === "select" ? (
        <Field key={f.name}><FieldLabel>{f.label}</FieldLabel><OptionSelect className="w-full" value={String(values[f.name] ?? "")} onChange={(v) => set(f.name, v)} options={f.options ?? []} placeholder={`Choose ${f.label.toLowerCase()}`} /></Field>
      ) : f.type === "checkbox" ? (
        <label key={f.name} className="flex items-center gap-2 text-sm"><Checkbox checked={!!values[f.name]} onCheckedChange={(on) => set(f.name, !!on)} />{f.label}</label>
      ) : (
        <Field key={f.name}><FieldLabel htmlFor={f.name}>{f.label}</FieldLabel><Input id={f.name} type={f.type ?? "text"} required={f.required ?? true} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} /></Field>
      ))}
    </FieldGroup>
  )
}

/**
 * A list with an "Add" dialog, driven by a short config. Used for every simple setup table (departments, batches, staff...).
 * Each row has a menu: View (always), Edit (`editable`), Deactivate / Reactivate (`patchPath`) and Delete (`deletePath`).
 * Wide screens get a table; phones get one card per row.
 */
export function MasterTab<T extends Row>({ endpoint, addLabel, fields, columns, toBody, patchPath, canEdit = true, editable = false, editFields, toEditBody, deletePath, noun = "item" }: {
  endpoint: string; addLabel: string; fields: FieldDef[]
  columns: { label: string; cell: (r: T, reload: () => void) => React.ReactNode }[]
  toBody?: (v: Values) => Record<string, unknown>
  patchPath?: (r: T) => string; canEdit?: boolean
  /** Show Edit. Sends a PATCH to `patchPath` with the form's values. */
  editable?: boolean; editFields?: FieldDef[]; toEditBody?: (v: Values) => Record<string, unknown>
  /** Show Delete. Sends a DELETE here; the server refuses when the record is still in use. */
  deletePath?: (r: T) => string
  /** What a row is called in messages, for example "department". */
  noun?: string
}) {
  const res = useApi<T[] | { items: T[] }>(endpoint)
  const { loading, reload } = res
  const data = res.data === undefined ? undefined : Array.isArray(res.data) ? res.data : res.data.items
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Values>({})
  const [busy, setBusy] = React.useState(false)
  const [viewing, setViewing] = React.useState<T | null>(null)
  const [editing, setEditing] = React.useState<T | null>(null)
  const [deleting, setDeleting] = React.useState<T | null>(null)
  const set = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }))
  const formFields = editFields ?? fields.filter((f) => f.editable !== false)

  function missingChoice(list: FieldDef[]) {
    const f = list.find((x) => x.required && (x.type === "select" || x.type === "student") && !values[x.name])
    if (f) toast.error(`Choose ${f.label.toLowerCase()}`)
    return !!f
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (missingChoice(fields)) return
    setBusy(true)
    try {
      const body = toBody ? toBody(values) : Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""))
      await api(endpoint, { method: "POST", body })
      toast.success("Saved")
      setOpen(false); setValues({}); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  function startEdit(r: T) {
    const row = r as unknown as Record<string, unknown>
    setValues(Object.fromEntries(formFields.map((f) => {
      const v = row[f.name]
      return [f.name, f.type === "checkbox" ? !!v : f.type === "date" && typeof v === "string" ? v.slice(0, 10) : v == null ? "" : String(v)]
    })))
    setEditing(r)
  }
  async function onEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing || !patchPath || missingChoice(formFields)) return
    setBusy(true)
    try {
      const body = toEditBody ? toEditBody(values) : Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""))
      await api(patchPath(editing), { method: "PATCH", body })
      toast.success("Changes saved")
      setEditing(null); setValues({}); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  async function toggle(r: T) {
    try { await api(patchPath!(r), { method: "PATCH", body: { isActive: !r.isActive } }); reload() } catch (e) { toastError(e) }
  }
  async function remove() {
    if (!deleting || !deletePath) return
    setBusy(true)
    try { await api(deletePath(deleting), { method: "DELETE" }); toast.success("Deleted"); setDeleting(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  const menu = (r: T) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}><EllipsisIcon /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setViewing(r)}><EyeIcon />View details</DropdownMenuItem>
        {canEdit && editable && patchPath && <DropdownMenuItem onClick={() => startEdit(r)}><PencilIcon />Edit</DropdownMenuItem>}
        {canEdit && patchPath && r.isActive !== undefined && <DropdownMenuItem onClick={() => toggle(r)}><PowerIcon />{r.isActive === false ? "Reactivate" : "Deactivate"}</DropdownMenuItem>}
        {canEdit && deletePath && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDeleting(r)}><Trash2Icon />Delete</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const labelled = columns.filter((c) => c.label)
  // Fields the table does not already show (a template's message, a FAQ's answer...) are added to the View dialog.
  const extra = viewing
    ? fields.filter((f) => !labelled.some((c) => c.label.toLowerCase() === f.label.toLowerCase()))
        .map((f) => ({ label: f.label, value: show((viewing as unknown as Record<string, unknown>)[f.name]) })).filter((x) => x.value !== null)
    : []

  return (
    <div className="flex flex-col gap-3">
      {canEdit && addLabel && <div><Button onClick={() => { setValues({}); setOpen(true) }}>{addLabel}</Button></div>}
      {loading && !data ? <Skeleton className="h-40 rounded-xl" /> : (<>
        <div className="hidden overflow-hidden rounded-xl border md:block">
          <Table>
            <TableHeader>
              <TableRow>{columns.map((c, i) => <TableHead key={c.label || i}>{c.label}</TableHead>)}<TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.id}>
                  {columns.map((c, i) => <TableCell key={c.label || i}>{c.cell(r, reload)}</TableCell>)}
                  <TableCell className="text-right">{menu(r)}</TableCell>
                </TableRow>
              ))}
              {data?.length === 0 && <TableRow><TableCell colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">Nothing here yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 md:hidden">
          {(data ?? []).map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-medium">{columns[0]?.cell(r, reload)}</div>
                {menu(r)}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {columns.slice(1).map((c, i) => c.label
                  ? <React.Fragment key={c.label}><dt className="text-muted-foreground">{c.label}</dt><dd className="min-w-0 break-words">{c.cell(r, reload)}</dd></React.Fragment>
                  : <dd key={i} className="col-span-2">{c.cell(r, reload)}</dd>)}
              </dl>
            </div>
          ))}
          {data?.length === 0 && <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
        </div>
      </>)}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{addLabel}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit}>
            <FieldInputs fields={fields} values={values} set={set} />
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setValues({}) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {noun}</DialogTitle></DialogHeader>
          <form onSubmit={onEdit}>
            <FieldInputs fields={formFields} values={values} set={set} />
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save changes</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewing && columns[0]?.cell(viewing, reload)}</DialogTitle></DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {[...labelled.slice(1).map((c) => ({ label: c.label, value: c.cell(viewing, reload) })), ...extra].map((x) => (
                <React.Fragment key={x.label}><dt className="text-muted-foreground">{x.label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{x.value}</dd></React.Fragment>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {noun}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. If anything still uses it, it will not be deleted and you can deactivate it instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); remove() }}>{busy && <Spinner />}Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const ActiveBadge = ({ active }: { active?: boolean }) => (active === false ? <Badge variant="destructive">Inactive</Badge> : <Badge variant="outline">Active</Badge>)

/** Search by name or enrollment number, then choose from the results. */
export function StudentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [q, setQ] = React.useState("")
  const search = React.useDeferredValue(q)
  const found = useApi<{ items: { id: string; name: string; enrollmentNo: string }[] }>(search.length >= 2 ? "/api/students" : null, { q: search, limit: 10 })
  return (
    <div className="flex flex-col gap-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or enrollment number" />
      {found.data && <OptionSelect className="w-full" value={value} onChange={onChange} options={found.data.items.map((s) => ({ value: s.id, label: `${s.name} (${s.enrollmentNo})` }))} placeholder={found.data.items.length ? "Choose from results" : "No students found"} />}
    </div>
  )
}
