"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type Option = { value: string; label: string }

/** shadcn Select wired to a plain list of options; `value=""` means nothing chosen. */
export function OptionSelect({ value, onChange, options, placeholder, className }: { value: string; onChange: (v: string) => void; options: Option[]; placeholder: string; className?: string }) {
  return (
    <Select items={options} value={value || null} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
