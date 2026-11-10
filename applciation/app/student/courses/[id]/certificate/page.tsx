"use client"

import { useParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type D = { title: string; completedAt: string | null; certificate: { serial: string; issuedAt: string; studentName: string } | null }

/** A course certificate. Print it or save it as a PDF from the browser's print dialog. */
export default function CourseCertificatePage() {
  const { id } = useParams<{ id: string }>()
  const { data } = useApi<D>(`/api/student/courses/${id}`)
  if (!data) return <Skeleton className="h-64" />
  const c = data.certificate
  if (!c) return <p className="text-sm text-muted-foreground">No certificate yet. It is issued when you finish every required lesson of the course, if the course gives one.</p>
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="print:hidden"><Button onClick={() => window.print()}>Save as PDF / print</Button></div>
      <div className="flex flex-col items-center gap-3 rounded-lg border-4 border-double p-10 text-center">
        <div className="text-sm uppercase tracking-widest text-muted-foreground">Certificate of completion</div>
        <div className="text-muted-foreground">This is to certify that</div>
        <div className="text-3xl font-semibold">{c.studentName}</div>
        <div className="text-muted-foreground">has successfully completed the course</div>
        <div className="text-xl font-medium">{data.title}</div>
        <div className="text-muted-foreground">on {fmtDate(data.completedAt ?? c.issuedAt)}</div>
        <div className="text-xs text-muted-foreground">Certificate number {c.serial}</div>
      </div>
    </div>
  )
}
