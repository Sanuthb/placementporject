"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = { id: string; role: string; company: { name: string }; rounds: { id: string; order: number; type: string }[] }
type Summary = {
  session: { id: string; code: string; closedAt?: string | null } | null
  counts: { expected: number; present: number; absent: number; notMarked: number }
  students?: { id: string; name: string; enrollmentNo: string; attendance: { status: string } | null }[]
}

export default function AttendancePage() {
  const { id } = useParams<{ id: string }>()
  const drive = useApi<Drive>(`/api/drives/${id}`)
  const [roundId, setRoundId] = React.useState("")
  const [q, setQ] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [closing, setClosing] = React.useState(false)
  const sum = useApi<Summary>(`/api/drives/${id}/attendance`, { roundId, detail: true })
  const body = roundId ? { roundId } : {}

  async function call(path: string, extra: Record<string, unknown> = {}, ok?: string) {
    setBusy(true)
    try { await api(`/api/drives/${id}/attendance/${path}`, { method: "POST", body: { ...body, ...extra } }); if (ok) toast.success(ok); sum.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  const rounds = [{ value: "", label: "Whole drive" }, ...(drive.data?.rounds ?? []).map((r) => ({ value: r.id, label: `Round ${r.order}: ${titleCase(r.type)}` }))]
  const list = (sum.data?.students ?? []).filter((s) => !q || `${s.name} ${s.enrollmentNo}`.toLowerCase().includes(q.toLowerCase()))
  const c = sum.data?.counts

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" render={<Link href={`/staff/drives/${id}`} />}>Back to drive</Button>
        <span className="font-medium">{drive.data ? `${drive.data.company.name}: ${drive.data.role}` : ""}</span>
        <OptionSelect className="ml-auto w-56" value={roundId} onChange={setRoundId} options={rounds} placeholder="Round" />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader><CardTitle>Self check-in</CardTitle><CardDescription>Show this on the screen. Students scan it or type the code in their app.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sum.data?.session ? <div className="flex flex-col items-center gap-3"><div className="rounded-lg bg-white p-3"><QRCodeSVG value={`placement-checkin:${sum.data.session.id}:${sum.data.session.code}`} size={168} /></div><div className="text-center text-4xl font-semibold tracking-widest">{sum.data.session.code}</div></div> : <span className="text-sm text-muted-foreground">No session open yet.</span>}
            <div className="flex gap-2">
              {!sum.data?.session && <Button disabled={busy} onClick={() => call("session", {}, "Check-in opened")}>Open check-in</Button>}
              {sum.data?.session && <Button variant="outline" disabled={busy} onClick={() => call("rotate-code", {}, "New code issued")}>New code</Button>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Live counts</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {c ? <><Badge>{c.present} present</Badge><Badge variant="destructive">{c.absent} absent</Badge><Badge variant="secondary">{c.notMarked} not yet marked</Badge><Badge variant="outline">{c.expected} expected</Badge></> : <Skeleton className="h-6 w-64" />}
            <Button className="ml-auto" variant="outline" disabled={busy} onClick={() => setClosing(true)}>Close and mark the rest absent</Button>
          </CardContent>
        </Card>
      </div>

      <Input className="max-w-sm" placeholder="Search name or enrollment number" value={q} onChange={(e) => setQ(e.target.value)} />
      {sum.loading && !sum.data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Mark</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.name}<div className="text-xs text-muted-foreground">{s.enrollmentNo}</div></TableCell>
                <TableCell>{s.attendance ? <Badge variant={statusVariant(s.attendance.status === "PRESENT" ? "VERIFIED" : "ABSENT")}>{titleCase(s.attendance.status)}</Badge> : <span className="text-muted-foreground">Not marked</span>}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => call("mark", { studentId: s.id, status: "PRESENT" })}>Present</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => call("mark", { studentId: s.id, status: "ABSENT" })}>Absent</Button>
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No students expected yet. Students appear once they have applied.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={closing} onOpenChange={setClosing}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Close attendance?</AlertDialogTitle><AlertDialogDescription>Everyone not yet marked becomes absent. Absences count towards missed-drive blocking unless excused.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={async (e) => { e.preventDefault(); await call("close", {}, "Attendance closed"); setClosing(false) }}>{busy && <Spinner />}Close attendance</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
