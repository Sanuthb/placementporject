"use client"

import type { Option } from "@/components/option-select"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; name: string; code?: string; isActive?: boolean }

/** Departments, batches and programs as select options, loaded once per screen that needs them. */
export function useLookups() {
  const dep = useApi<Row[]>("/api/settings/departments")
  const bat = useApi<Row[]>("/api/settings/batches")
  const prog = useApi<Row[]>("/api/settings/programs")
  const opts = (rows?: Row[], withCode = false): Option[] => (rows ?? []).filter((r) => r.isActive !== false).map((r) => ({ value: r.id, label: withCode && r.code ? `${r.name} (${r.code})` : r.name }))
  const all = (rows?: Row[]) => Object.fromEntries((rows ?? []).map((r) => [r.id, r.name]))
  return {
    departments: opts(dep.data), batches: opts(bat.data), programs: opts(prog.data),
    departmentName: all(dep.data), batchName: all(bat.data), programName: all(prog.data),
    loading: dep.loading || bat.loading || prog.loading,
  }
}
