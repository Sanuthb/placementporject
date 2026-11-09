"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"
import { categoryLabel } from "@/lib/reassessment"

type Starter = { key: string; name: string; category: string; description: string; questions: number; durationMin: number; imported: boolean }

/** Ready-made banks (aptitude, digital literacy, communication, technical). Importing makes a normal bank plus a ready paper; nothing existing is overwritten. */
export function StarterBanks({ onImported }: { onImported: () => void }) {
  const { data, reload } = useApi<Starter[]>("/api/assessments/starter")
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!data) return <Skeleton className="h-32 rounded-xl" />
  async function run(keys: string[]) {
    setBusy(keys.join())
    try {
      const r = await api<{ key: string; imported: boolean; questions: number }[]>("/api/assessments/starter", { method: "POST", body: { keys } })
      toast.success(`${r.filter((x) => x.imported).length} bank${r.filter((x) => x.imported).length === 1 ? "" : "s"} imported with a ready paper each`)
      reload(); onImported()
    } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  const todo = data.filter((b) => !b.imported).map((b) => b.key)
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Ready-made question banks</CardTitle>
        <CardDescription>Import a bank and a ready paper in one click, then schedule it for a department or batch. You can edit the questions and add your own afterwards, for example more technical banks for your programmes.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.map((b) => (
          <div key={b.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
            <div className="min-w-0 flex-1"><div className="font-medium">{b.name} <Badge variant="outline">{categoryLabel(b.category)}</Badge></div><div className="text-muted-foreground">{b.description} {b.durationMin} minutes.</div></div>
            {b.imported ? <Badge variant="secondary">Imported</Badge> : <Button size="sm" disabled={busy !== null} onClick={() => run([b.key])}>{busy === b.key && <Spinner />}Import</Button>}
          </div>
        ))}
        {todo.length > 1 && <div><Button variant="outline" disabled={busy !== null} onClick={() => run(todo)}>{busy === todo.join() && <Spinner />}Import all {todo.length}</Button></div>}
      </CardContent>
    </Card>
  )
}
