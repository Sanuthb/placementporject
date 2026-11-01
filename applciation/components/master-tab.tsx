"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect, type Option } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

export type FieldDef = { name: string; label: string; type?: "text" | "number" | "date" | "email" | "select" | "checkbox" | "student" | "textarea"; options?: Option[]; required?: boolean }
type Row = { id: string; isActive?: boolean }

/** A list with an "Add" dialog, driven by a short config. Used for every simple setup table (departments, batches, staff...). */
export function MasterTab<T extends Row>({ endpoint, addLabel, fields, columns, toBody, patchPath, canEdit = true }: {
  endpoint: string; addLabel: string; fields: FieldDef[]
  columns: { label: string; cell: (r: T, reload: () => void) => React.ReactNode }[]
  toBody?: (v: Record<string, string | boolean>) => Record<string, unknown>
  patchPath?: (r: T) => string; canEdit?: boolean
}) {
  const res = useApi<T[] | { items: T[] }>(endpoint)
  const { loading, reload } = res
  const data = res.data === undefined ? undefined : Array.isArray(res.data) ? res.data : res.data.items
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, string | boolean>>({})
  const [busy, setBusy] = React.useState(false)
  const set = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    for (const f of fields) if (f.required && (f.type === "select" || f.type === "student") && !values[f.name]) { toast.error(`Choose ${f.label.toLowerCase()}`); return }
    setBusy(true)
    try {
      const body = toBody ? toBody(values) : Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""))
      await api(endpoint, { method: "POST", body })
      toast.success("Saved")
      setOpen(false); setValues({}); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  async function toggle(r: T) {
    try { await api(patchPath!(r), { method: "PATCH", body: { isActive: !r.isActive } }); reload() } catch (e) { toastError(e) }
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && <div><Button onClick={() => { setValues({}); setOpen(true) }}>{addLabel}</Button></div>}
      {loading && !data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader>
            <TableRow>{columns.map((c) => <TableHead key={c.label}>{c.label}</TableHead>)}{patchPath && canEdit && <TableHead className="text-right">Status</TableHead>}</TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((r) => (
              <TableRow key={r.id}>
                {columns.map((c) => <TableCell key={c.label}>{c.cell(r, reload)}</TableCell>)}
                {patchPath && canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant={r.isActive === false ? "outline" : "secondary"} onClick={() => toggle(r)}>{r.isActive === false ? "Inactive: reactivate" : "Active: deactivate"}</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {data?.length === 0 && <TableRow><TableCell colSpan={columns.length + 1} className="text-muted-foreground">Nothing here yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{addLabel}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit}>
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
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
