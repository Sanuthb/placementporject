"use client"

import { Button } from "@/components/ui/button"
import { MasterTab } from "@/components/master-tab"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"

type P = { id: string; headline: string | null; views: number; expiresAt: string | null; student: { name: string; enrollmentNo: string } }

export default function ShowcasePage() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Students who have switched on a shareable profile for employers. You can switch any of them off.</p>
      <MasterTab<P> endpoint="/api/showcase/manage" addLabel="" fields={[]} canEdit={false}
        columns={[
          { label: "Student", cell: (r) => <>{r.student.name}<div className="text-xs text-muted-foreground">{r.student.enrollmentNo}</div></> },
          { label: "Headline", cell: (r) => r.headline ?? "—" }, { label: "Views", cell: (r) => r.views }, { label: "Link expires", cell: (r) => fmtDate(r.expiresAt) },
          { label: "Action", cell: (r, reload) => <Button size="sm" variant="outline" onClick={() => api(`/api/showcase/manage/${r.id}/revoke`, { method: "POST" }).then(reload, toastError)}>Switch off</Button> },
        ]} />
    </div>
  )
}
