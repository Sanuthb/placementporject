"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { hasRole, useAuth } from "@/lib/web/auth"
import { useApi } from "@/lib/web/use-api"
import { ASSESSMENT_CATEGORIES } from "@/lib/reassessment"

const OPTIONS = ASSESSMENT_CATEGORIES.map(([value, label]) => ({ value, label }))

/** Change what an existing paper measures. Questions stay frozen; only the tag changes. */
export function PaperCategory({ paper, onSaved }: { paper: { id: string; category: string }; onSaved: () => void }) {
  const [busy, setBusy] = React.useState(false)
  async function set(category: string) {
    if (!category || category === paper.category) return
    setBusy(true)
    try { await api(`/api/assessments/papers/${paper.id}`, { method: "PATCH", body: { category } }); toast.success("Category saved"); onSaved() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return <div className="flex items-center gap-1">{busy && <Spinner />}<OptionSelect className="w-56" value={paper.category} onChange={set} options={OPTIONS} placeholder="Category" /></div>
}

type Rule = { category: string; label: string; maxAttempts: number | null; cooldownDays: number; custom: boolean }
type Draft = Record<string, { max: string; days: string }>
const toDraft = (rules: Rule[]): Draft => Object.fromEntries(rules.map((r) => [r.category, { max: r.maxAttempts == null ? "" : String(r.maxAttempts), days: String(r.cooldownDays) }]))

/** How many attempts a student gets per category and how long they wait between them. TPO admins edit; everyone else reads. */
export function RetakeRules() {
  const { data, reload } = useApi<Rule[]>("/api/assessments/rules")
  const { state } = useAuth()
  const isAdmin = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN")
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-64 rounded-xl" />
  const d = draft ?? toDraft(data)
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(data))
  const set = (c: string, k: "max" | "days", v: string) => setDraft({ ...d, [c]: { ...d[c], [k]: v } })

  async function save() {
    const rules = data!.map((r) => ({ category: r.category, maxAttempts: d[r.category].max.trim() === "" ? null : Number(d[r.category].max), cooldownDays: Number(d[r.category].days || 0) }))
    if (rules.some((r) => (r.maxAttempts != null && (!Number.isInteger(r.maxAttempts) || r.maxAttempts < 1)) || !Number.isInteger(r.cooldownDays) || r.cooldownDays < 0)) return toast.error("Attempts must be a whole number of 1 or more (or empty for no limit), and days 0 or more")
    setBusy(true)
    try { await api("/api/assessments/rules", { method: "PUT", body: { rules } }); toast.success("Retake rules saved"); setDraft(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Retake rules</CardTitle>
        <CardDescription>How many times a student may take a test of each kind, and how many days they wait in between. Every attempt is kept; the newest one counts. Practice tests can always be retaken.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!isAdmin && <Alert><AlertTitle>Read only</AlertTitle><AlertDescription>Only a TPO admin can change these rules.</AlertDescription></Alert>}
        <Table>
          <TableHeader><TableRow><TableHead>Test kind</TableHead><TableHead className="w-40">Attempts allowed</TableHead><TableHead className="w-40">Days between attempts</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.category}>
                <TableCell>{r.label} {!r.custom && <Badge variant="outline">Default</Badge>}</TableCell>
                <TableCell><Input type="number" min={1} placeholder="No limit" aria-label={`Attempts allowed for ${r.label}`} value={d[r.category].max} disabled={!isAdmin} onChange={(e) => set(r.category, "max", e.target.value)} /></TableCell>
                <TableCell><Input type="number" min={0} aria-label={`Days between attempts for ${r.label}`} value={d[r.category].days} disabled={!isAdmin} onChange={(e) => set(r.category, "days", e.target.value)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {isAdmin && <div className="flex gap-2"><Button disabled={!dirty || busy} onClick={save}>{busy && <Spinner />}Save rules</Button>{dirty && <Button variant="ghost" onClick={() => setDraft(null)}>Undo changes</Button>}</div>}
      </CardContent>
    </Card>
  )
}
