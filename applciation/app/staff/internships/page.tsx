"use client"

import Link from "next/link"

import { Applications, InternshipOverview, Postings } from "@/components/internship-admin"
import { MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth, hasRole } from "@/lib/web/auth"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"

type I = { id: string; role: string; companyName: string | null; startDate: string; endDate: string; status: string; ppoStatus: string; student: { name: string; enrollmentNo: string }; _count: { logs: number; evaluations: number; tasks: number } }

/** Internships: running ones, postings, the application queue and an overview. A faculty mentor sees only the internships they mentor. */
export default function InternshipsPage() {
  const { state } = useAuth()
  const staff = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN", "PLACEMENT_OFFICER")
  const list = (
    <MasterTab<I> endpoint="/api/internships" addLabel={staff ? "Allot an internship" : ""}
      fields={staff ? [{ name: "studentId", label: "Student", type: "student", required: true }, { name: "companyName", label: "Company" }, { name: "role", label: "Role" }, { name: "startDate", label: "Starts", type: "date" }, { name: "endDate", label: "Ends", type: "date" }, { name: "mentorName", label: "Company mentor's name", required: false }, { name: "mentorEmail", label: "Company mentor's email", type: "email", required: false }] : []}
      toBody={(v) => Object.fromEntries(Object.entries({ studentId: v.studentId, companyName: v.companyName, role: v.role, startDate: v.startDate ? new Date(v.startDate as string).toISOString() : "", endDate: v.endDate ? new Date(v.endDate as string).toISOString() : "", mentorName: v.mentorName, mentorEmail: v.mentorEmail }).filter(([, x]) => x))}
      columns={[
        { label: "Student", cell: (r) => <Link className="font-medium underline-offset-4 hover:underline" href={`/staff/internships/${r.id}`}>{r.student.name}<div className="text-xs font-normal text-muted-foreground">{r.student.enrollmentNo}</div></Link> },
        { label: "Placement", cell: (r) => <>{r.companyName ?? "—"}<div className="text-xs text-muted-foreground">{r.role}</div></> },
        { label: "Dates", cell: (r) => `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}` },
        { label: "Status", cell: (r) => <Badge variant={statusVariant(r.status === "COMPLETED" ? "VERIFIED" : r.status === "TERMINATED" ? "REJECTED" : "PENDING")}>{titleCase(r.status)}</Badge> },
        { label: "Offer", cell: (r) => (r.ppoStatus === "NONE" ? "—" : titleCase(r.ppoStatus)) },
        { label: "Logs / evaluations / tasks", cell: (r) => `${r._count.logs} / ${r._count.evaluations} / ${r._count.tasks}` },
      ]} />
  )
  if (!staff) return list
  return (
    <Tabs defaultValue="running">
      <TabsList><TabsTrigger value="running">Internships</TabsTrigger><TabsTrigger value="postings">Postings</TabsTrigger><TabsTrigger value="applications">Applications</TabsTrigger><TabsTrigger value="overview">Overview</TabsTrigger></TabsList>
      <TabsContent value="running">{list}</TabsContent>
      <TabsContent value="postings"><Postings /></TabsContent>
      <TabsContent value="applications"><Applications /></TabsContent>
      <TabsContent value="overview"><InternshipOverview /></TabsContent>
    </Tabs>
  )
}
