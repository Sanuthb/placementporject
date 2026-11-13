"use client"


import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { denied } from "../_components/denied"

type Item = { key: string; label: string; value: string | number | boolean | null; source: string; note?: string }
type Data = { generatedAt: string; groups: { key: string; label: string; items: Item[] }[] }
const show = (v: Item["value"]) => (v === null ? "not set" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v))

/** System configuration: read-only. Shows the non-secret settings in effect and where each comes from. Nothing can be edited here and no secret is ever shown. */
export default function SystemPage() {
  const { data, error, loading } = useApi<Data>("/api/platform/system")
  const d = denied(error); if (d) return d
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">System configuration</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Read-only. Settings in effect and where they come from. Secrets are never shown. Retention and the two-step rule are changed under Policy.</p></div>
        </header>
      {error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert> : loading && !data ? <Skeleton className="h-64 w-full" /> : data?.groups.map((g) => (
        <Card key={g.key}><CardHeader><CardTitle>{g.label}</CardTitle></CardHeader>
          <CardContent><dl className="divide-y text-sm">
            {g.items.map((i) => (
              <div key={i.key} className="flex flex-wrap items-start justify-between gap-2 py-2" data-testid={`cfg-${i.key}`}>
                <dt className="max-w-md">{i.label}{i.note && <div className="text-xs text-muted-foreground">{i.note}</div>}</dt>
                <dd className="flex items-center gap-2"><span className="font-medium">{show(i.value)}</span><Badge variant="outline">{i.source}</Badge></dd>
              </div>
            ))}
          </dl></CardContent></Card>
      ))}
      <Card><CardHeader><CardTitle>Backups and releases</CardTitle><CardDescription>What this application does and does not provide</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">Backups.</span> Database backups are managed in the Supabase dashboard. This application cannot read backup status and has no restore feature, so no backup state is shown here.</p>
          <p><span className="font-medium text-foreground">Releases.</span> The application is deployed from the hosting provider. It has no release history or deployment controls, and none are shown here.</p>
        </CardContent></Card>
      {data && <p className="text-xs text-muted-foreground">Read {fmtDateTime(data.generatedAt)}. Sources: environment = a deployment setting; database = changed by a platform administrator in this app; default = nothing set; code = fixed in the software.</p>}
    </div>
  )
}
