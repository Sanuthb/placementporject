"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useApi } from "@/lib/web/use-api"

type Me = { name: string; departments: { id: string; name: string }[]; programs: { id: string; name: string }[]; batches: { id: string; name: string }[]; menteeCount: number }
type Student = { id: string; name: string; enrollmentNo: string; email: string; isMentee: boolean; department: { name: string }; program: { name: string } | null; batch: { name: string }; currentSemester: { name: string } | null }

/** The faculty member's own view: their allocations and the students they mentor or teach. */
export default function FacultyHome() {
  const me = useApi<Me>("/api/faculty/me")
  const students = useApi<{ items: Student[] }>("/api/faculty/students")
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>{me.data ? `Welcome, ${me.data.name}` : "Faculty"}</CardTitle><CardDescription>The departments, programmes and batches you are allocated to.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {me.data ? (
            <>
              <div>Departments: {me.data.departments.map((d) => d.name).join(", ") || "none yet"}</div>
              <div>Programmes: {me.data.programs.map((d) => d.name).join(", ") || "none yet"}</div>
              <div>Batches: {me.data.batches.map((d) => d.name).join(", ") || "none yet"}</div>
              <div>Mentees: {me.data.menteeCount}</div>
            </>
          ) : <Skeleton className="h-16 w-full" />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My students</CardTitle><CardDescription>Your mentees and the students of your allocated programmes and batches.</CardDescription></CardHeader>
        <CardContent>
          {!students.data ? <Skeleton className="h-32 w-full" /> : !students.data.items.length ? <p className="text-sm text-muted-foreground">No students allocated to you yet.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Admission no.</TableHead><TableHead>Department</TableHead><TableHead>Programme</TableHead><TableHead>Batch</TableHead><TableHead>Semester</TableHead></TableRow></TableHeader>
                <TableBody>
                  {students.data.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><div className="font-medium">{s.name} {s.isMentee && <Badge variant="secondary">Mentee</Badge>}</div><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                      <TableCell>{s.enrollmentNo}</TableCell><TableCell>{s.department.name}</TableCell><TableCell>{s.program?.name ?? "—"}</TableCell><TableCell>{s.batch.name}</TableCell><TableCell>{s.currentSemester?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
