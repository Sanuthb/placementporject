"use client"

import { DataView } from "@/components/section-review"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/web/auth"
import { fmtDate, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type View = {
  student: { name: string; enrollmentNo: string; email: string; phone: string | null; stage: string; department: { name: string }; batch: { name: string }; program: { name: string } | null }
  sections: { section: string; status: string; data: unknown; hasPendingChange: boolean; reviewedAt: string | null; documents: { id: string; fileName: string }[] }[]
}
type App = { id: string; status: string; drive: { role: string; driveDate: string; company: { name: string } }; journey: { round: number; type: string; result: string | null }[] }
type Offer = { id: string; role: string; packageLpa: number | string; status: string; company: { name: string } }
type Block = { id: string; reason: string; endsAt: string }

/** My whole record on one page. "Save as PDF" uses the browser's print dialog, which can save to PDF. */
export default function OverviewPage() {
  const { state } = useAuth()
  const mods = state.status === "ready" ? state.profile.modules : []
  const view = useApi<View>(mods.includes("ONBOARDING") ? "/api/student/profile-view" : null)
  const apps = useApi<App[]>(mods.includes("DRIVES") ? "/api/student/applications" : null)
  const offers = useApi<Offer[]>(mods.includes("DRIVES") ? "/api/student/offers" : null)
  const blocks = useApi<Block[]>(mods.includes("ATTENDANCE_BLOCKING") ? "/api/student/blocks" : null)
  if (mods.includes("ONBOARDING") && !view.data) return <Skeleton className="h-64" />
  const s = view.data?.student
  return (
    <div className="flex max-w-3xl flex-col gap-4 print:max-w-none">
      <div className="flex items-center gap-2 print:hidden"><h2 className="text-lg font-semibold">My full view</h2><Button className="ml-auto" variant="outline" onClick={() => window.print()}>Save as PDF / print</Button></div>
      {s && (
        <Card>
          <CardHeader><CardTitle>{s.name}</CardTitle><CardDescription>{s.enrollmentNo} · {s.department.name} · {s.batch.name}{s.program ? ` · ${s.program.name}` : ""}</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{s.email}{s.phone ? ` · ${s.phone}` : ""} · <Badge variant={statusVariant(s.stage)}>{titleCase(s.stage)}</Badge></CardContent>
        </Card>
      )}
      {view.data?.sections.map((sec) => (
        <Card key={sec.section} className="break-inside-avoid">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base">{titleCase(sec.section)}<Badge variant={statusVariant(sec.status)}>{titleCase(sec.status)}</Badge>{sec.hasPendingChange && <Badge variant="secondary">Change awaiting review</Badge>}</CardTitle>{sec.reviewedAt && <CardDescription>Reviewed {fmtDate(sec.reviewedAt)}</CardDescription>}</CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <DataView value={sec.data} />
            {sec.documents.length > 0 && <div className="text-muted-foreground">Documents: {sec.documents.map((d) => d.fileName).join(", ")}</div>}
          </CardContent>
        </Card>
      ))}
      {apps.data && (
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle className="text-base">Drives and rounds</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {apps.data.map((a) => <div key={a.id}>{a.drive.company.name}: {a.drive.role} <Badge variant={statusVariant(a.status)}>{titleCase(a.status)}</Badge><div className="text-muted-foreground">{a.journey.map((j) => `${titleCase(j.type)}: ${j.result ? titleCase(j.result) : "pending"}`).join(" → ") || "No rounds yet"}</div></div>)}
            {apps.data.length === 0 && <span className="text-muted-foreground">No applications yet.</span>}
          </CardContent>
        </Card>
      )}
      {offers.data && (
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle className="text-base">Offers</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {offers.data.map((o) => <div key={o.id}>{o.company.name}: {o.role}, {fmtLpa(o.packageLpa)} <Badge variant={statusVariant(o.status)}>{titleCase(o.status)}</Badge></div>)}
            {offers.data.length === 0 && <span className="text-muted-foreground">No offers yet.</span>}
          </CardContent>
        </Card>
      )}
      {blocks.data && (
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle className="text-base">Blocks</CardTitle></CardHeader>
          <CardContent className="text-sm">{blocks.data.length ? blocks.data.map((b) => <div key={b.id}>{b.reason} (until {fmtDate(b.endsAt)})</div>) : <span className="text-muted-foreground">No active blocks.</span>}</CardContent>
        </Card>
      )}
    </div>
  )
}
