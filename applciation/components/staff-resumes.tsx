"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { download, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type V = { id: string; number: number; title: string; kind: string; template: string; isPrimary: boolean; targetCompany: string | null; targetRole: string | null; verifiedOnly: boolean; approvedAt: string | null }

/** The resumes a student has approved, with downloads. Drafts are the student's own work and are not shown. */
export function StaffResumes({ studentId }: { studentId: string }) {
  const { data } = useApi<V[]>(`/api/students/${studentId}/resumes`)
  if (!data) return <Skeleton className="h-32" />
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Resume</TableHead><TableHead>Kind</TableHead><TableHead>Approved</TableHead><TableHead className="text-right">Download</TableHead></TableRow></TableHeader>
      <TableBody>
        {data.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.title} {v.isPrimary && <Badge variant="secondary">Main</Badge>}{v.verifiedOnly && <Badge variant="outline" className="ml-1">Checked material only</Badge>}<div className="text-xs font-normal text-muted-foreground">v{v.number}{v.targetCompany ? ` · for ${v.targetCompany}` : ""}{v.targetRole ? ` (${v.targetRole})` : ""}</div></TableCell>
            <TableCell>{titleCase(v.kind)}</TableCell><TableCell>{fmtDate(v.approvedAt)}</TableCell>
            <TableCell className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => download(`/api/students/${studentId}/resumes/${v.id}/export`, { query: { format: "pdf" } }).catch(toastError)}>PDF</Button><Button size="sm" variant="outline" onClick={() => download(`/api/students/${studentId}/resumes/${v.id}/export`, { query: { format: "docx" } }).catch(toastError)}>Word</Button></TableCell>
          </TableRow>
        ))}
        {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">The student has not approved a resume yet. You can still download the college-format resume above.</TableCell></TableRow>}
      </TableBody>
    </Table>
  )
}
