"use client"

import Link from "next/link"

import { MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"

type I = { id: string; role: string; companyName: string | null; startDate: string; endDate: string; status: string; student: { name: string; enrollmentNo: string }; _count: { logs: number; evaluations: number } }

export default function InternshipsPage() {
  return (
    <MasterTab<I> endpoint="/api/internships" addLabel="Allot an internship"
      fields={[{ name: "studentId", label: "Student", type: "student", required: true }, { name: "companyName", label: "Company" }, { name: "role", label: "Role" }, { name: "startDate", label: "Starts", type: "date" }, { name: "endDate", label: "Ends", type: "date" }, { name: "mentorName", label: "Mentor name", required: false }, { name: "mentorEmail", label: "Mentor email", type: "email", required: false }]}
      toBody={(v) => Object.fromEntries(Object.entries({ studentId: v.studentId, companyName: v.companyName, role: v.role, startDate: v.startDate ? new Date(v.startDate as string).toISOString() : "", endDate: v.endDate ? new Date(v.endDate as string).toISOString() : "", mentorName: v.mentorName, mentorEmail: v.mentorEmail }).filter(([, x]) => x))}
      columns={[
        { label: "Student", cell: (r) => <Link className="font-medium underline-offset-4 hover:underline" href={`/staff/internships/${r.id}`}>{r.student.name}<div className="text-xs font-normal text-muted-foreground">{r.student.enrollmentNo}</div></Link> },
        { label: "Placement", cell: (r) => <>{r.companyName ?? "—"}<div className="text-xs text-muted-foreground">{r.role}</div></> },
        { label: "Dates", cell: (r) => `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}` },
        { label: "Status", cell: (r) => <Badge variant={statusVariant(r.status === "COMPLETED" ? "VERIFIED" : r.status === "TERMINATED" ? "REJECTED" : "PENDING")}>{titleCase(r.status)}</Badge> },
        { label: "Logs / evaluations", cell: (r) => `${r._count.logs} / ${r._count.evaluations}` },
      ]} />
  )
}
