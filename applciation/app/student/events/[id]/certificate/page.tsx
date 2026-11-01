"use client"

import { useParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/web/auth"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Past = { id: string; type: string; title: string; startsAt: string; rank: number | null; score: number | null; certificate: boolean }

/** A certificate of participation, made from the event record. Print it or save it as a PDF from the browser's print dialog. */
export default function CertificatePage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const { data } = useApi<Past[]>("/api/student/events", { scope: "past" })
  if (!data || state.status !== "ready") return <Skeleton className="h-64" />
  const e = data.find((x) => x.id === id && x.certificate)
  if (!e) return <p className="text-sm text-muted-foreground">No certificate is available for this event. Certificates are given to people marked as attended.</p>
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="print:hidden"><Button onClick={() => window.print()}>Save as PDF / print</Button></div>
      <div className="flex flex-col items-center gap-3 rounded-lg border-4 border-double p-10 text-center">
        <div className="text-sm uppercase tracking-widest text-muted-foreground">Certificate of participation</div>
        <div className="text-muted-foreground">This is to certify that</div>
        <div className="text-3xl font-semibold">{state.profile.name}</div>
        <div className="text-muted-foreground">took part in {titleCase(e.type)}</div>
        <div className="text-xl font-medium">{e.title}</div>
        <div className="text-muted-foreground">held on {fmtDate(e.startsAt)}</div>
        {e.rank !== null && <div className="font-medium">Rank {e.rank}</div>}
      </div>
    </div>
  )
}
