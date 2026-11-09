"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function Text({ id, label, value, onChange, type = "text", hint, disabled, required, area, placeholder }: { id: string; label: string; value: string | number | null | undefined; onChange: (v: string) => void; type?: string; hint?: string; disabled?: boolean; required?: boolean; area?: boolean; placeholder?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}{required && <span aria-hidden className="text-destructive"> *</span>}</FieldLabel>
      {area ? <Textarea id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={3} placeholder={placeholder} /> : <Input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />}
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

/** Comma-separated entries kept as a list. The text is turned into entries when the field loses focus. */
export function Tags({ id, label, value, onChange, disabled, hint }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void; disabled?: boolean; hint?: string }) {
  const [text, setText] = React.useState(value.join(", "))
  const commit = () => { const list = [...new Set(text.split(",").map((x) => x.trim()).filter(Boolean))]; onChange(list); setText(list.join(", ")) }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} disabled={disabled} placeholder="Separate with commas" />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

export type ListField = { name: string; label: string; type?: "text" | "number" | "textarea" }

/** A repeating group, such as projects. Each entry is a small form. */
export function ListEditor<T extends Record<string, unknown>>({ id, title, noun, fields, items, onChange, disabled, max = 20 }: { id: string; title: string; noun: string; fields: ListField[]; items: T[]; onChange: (v: T[]) => void; disabled?: boolean; max?: number }) {
  const set = (i: number, name: string, v: string, type?: string) => onChange(items.map((it, j) => (j === i ? { ...it, [name]: type === "number" ? (v === "" ? null : Number(v)) : v } : it)))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><div className="text-sm font-medium">{title}</div>
        {!disabled && items.length < max && <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, {} as T])}><PlusIcon />Add {noun}</Button>}
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">None added.</p>}
      {items.map((it, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
              <Text id={`${id}-${i}-${f.name}`} label={f.label} type={f.type === "number" ? "number" : "text"} area={f.type === "textarea"} value={(it[f.name] as string | number | null | undefined) ?? ""} onChange={(v) => set(i, f.name, v, f.type)} disabled={disabled} />
            </div>
          ))}
          {!disabled && <div className="sm:col-span-2"><Button type="button" size="sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2Icon />Remove {noun}</Button></div>}
        </div>
      ))}
    </div>
  )
}
