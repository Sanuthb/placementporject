"use client"

/* eslint-disable @next/next/no-img-element -- study images are short-lived signed URLs, so next/image cannot optimise them */

import * as React from "react"
import { StarIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Res = {
  id: string; title: string; description: string | null; type: string; category: string; subject: string | null; topic: string | null; skills: string[]; difficulty: string | null; language: string; durationMin: number | null
  assigned: boolean; assignedNote: string | null; dueAt: string | null; opened: boolean; completed: boolean; newVersion: boolean; myRating: number | null; expiresAt: string | null; why?: string[]; minutes?: number
}
type Detail = Res & { url: string | null; viewUrl: string | null; downloadUrl: string | null; mimeType: string | null; fileName: string | null; isFile: boolean; myFeedback: string | null }
const TYPES = [{ value: "", label: "Any type" }, ...["DOCUMENT", "IMAGE", "VIDEO", "AUDIO", "VIDEO_LINK", "WEBSITE", "QUESTION_BANK", "SAMPLE_TEST", "CODING_PRACTICE", "COMPANY_MATERIAL"].map((v) => ({ value: v, label: titleCase(v) }))]
const DIFFS = [{ value: "", label: "Any difficulty" }, { value: "EASY", label: "Easy" }, { value: "MEDIUM", label: "Medium" }, { value: "HARD", label: "Hard" }]

/** Study material for me: a short recommended list, what was assigned, and the open library. */
export default function StudentResourcesPage() {
  const [q, setQ] = React.useState("")
  const search = React.useDeferredValue(q)
  const [type, setType] = React.useState("")
  const [difficulty, setDifficulty] = React.useState("")
  const [hours, setHours] = React.useState("")
  const [open, setOpen] = React.useState<string | null>(null)
  const f = { q: search || undefined, type: type || undefined, difficulty: difficulty || undefined }
  const assigned = useApi<Res[]>("/api/student/resources", { scope: "assigned", ...f })
  const library = useApi<Res[]>("/api/student/resources", { scope: "library", ...f })
  const rec = useApi<Res[]>("/api/student/resources/recommended", { hours: hours ? Number(hours) : undefined })
  const reloadAll = () => { assigned.reload(); library.reload(); rec.reload() }

  const grid = (rows: Res[] | undefined, empty: string) => !rows ? <Skeleton className="h-40" /> : (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => <Card key={r.id} size="sm">
        <CardHeader><CardTitle>{r.title}</CardTitle><CardDescription>{[titleCase(r.type), r.difficulty && titleCase(r.difficulty), r.durationMin && `${r.durationMin} min`, r.language].filter(Boolean).join(" · ")}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {r.description && <p className="line-clamp-3">{r.description}</p>}
          {r.why && <ul className="list-disc pl-4 text-xs text-muted-foreground">{r.why.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div className="flex flex-wrap gap-1">{r.assigned && <Badge>Assigned</Badge>}{r.dueAt && <Badge variant="outline">By {fmtDate(r.dueAt)}</Badge>}{r.completed && !r.newVersion && <Badge variant="secondary">Finished</Badge>}{r.newVersion && <Badge variant="outline">New version</Badge>}</div>
          {r.assignedNote && <p className="text-xs text-muted-foreground">Note: {r.assignedNote}</p>}
        </CardContent>
        <CardFooter><Button size="sm" onClick={() => setOpen(r.id)}>{r.completed && !r.newVersion ? "View again" : "Open"}</Button></CardFooter>
      </Card>)}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" aria-label="Search" placeholder="Search by title, topic or skill" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-44" value={type} onChange={setType} options={TYPES} placeholder="Any type" />
        <OptionSelect className="w-44" value={difficulty} onChange={setDifficulty} options={DIFFS} placeholder="Any difficulty" />
      </div>
      <Tabs defaultValue="recommended">
        <TabsList><TabsTrigger value="recommended">For you</TabsTrigger><TabsTrigger value="assigned">Assigned to me ({assigned.data?.length ?? "…"})</TabsTrigger><TabsTrigger value="library">Library</TabsTrigger></TabsList>
        <TabsContent value="recommended" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm"><label htmlFor="hours">Hours I have this week</label><Input id="hours" className="w-24" type="number" min={0.5} max={40} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">A short list chosen from your assessment results, target role and skills. It is never more than five, and fits your hours when you give them.</p>
          {grid(rec.data, "Nothing to suggest yet. Take an assessment or set a target role on your roadmap, and check the library.")}
        </TabsContent>
        <TabsContent value="assigned">{grid(assigned.data, "Nothing has been assigned to you.")}</TabsContent>
        <TabsContent value="library">{grid(library.data, "No open resources match.")}</TabsContent>
      </Tabs>
      {open && <ResourceDialog id={open} onClose={() => setOpen(null)} onChanged={reloadAll} />}
    </div>
  )
}

function ResourceDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: r, reload } = useApi<Detail>(`/api/student/resources/${id}`)
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const post = (body: object) => api(`/api/student/resources/${id}/progress`, { method: "POST", body })
  const opened = () => { void post({ opened: true }).then(onChanged, () => undefined) }
  async function act(body: object, ok: string) {
    setBusy(true)
    try { await post(body); toast.success(ok); reload(); onChanged() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const media = r?.viewUrl && r.mimeType?.startsWith("video/") ? <video controls className="w-full rounded-md" src={r.viewUrl} onPlay={opened} /> : r?.viewUrl && r.mimeType?.startsWith("audio/") ? <audio controls className="w-full" src={r.viewUrl} onPlay={opened} /> : null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{r?.title ?? "Resource"}</DialogTitle></DialogHeader>
        {!r ? <Skeleton className="h-40" /> : (
          <div className="flex flex-col gap-4 text-sm">
            {r.description && <p className="whitespace-pre-wrap">{r.description}</p>}
            <p className="text-muted-foreground">{[r.subject, r.topic, r.skills.join(", ")].filter(Boolean).join(" · ")}</p>
            {media}
            {r.viewUrl && r.mimeType?.startsWith("image/") && <img alt={r.title} className="max-w-full rounded-md" src={r.viewUrl} onLoad={opened} />}
            <div className="flex flex-wrap gap-2">
              {r.url && <Button render={<a href={r.url} target="_blank" rel="noreferrer" onClick={opened} />}>Open the link</Button>}
              {r.viewUrl && !r.mimeType?.startsWith("image/") && !media && <Button render={<a href={r.viewUrl} target="_blank" rel="noreferrer" onClick={opened} />}>Open {r.fileName}</Button>}
              {r.downloadUrl && <Button variant="outline" render={<a href={r.downloadUrl} onClick={opened} />}>Download</Button>}
            </div>
            {r.newVersion && <p className="text-muted-foreground">Your teacher added a new version since you finished this one.</p>}
            <div className="flex flex-col gap-2 border-t pt-3">
              <div className="flex items-center gap-2">
                {r.completed && !r.newVersion ? <><Badge variant="secondary">Finished</Badge><Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ completed: false }, "Marked as not finished")}>Undo</Button></> : <Button size="sm" disabled={busy} onClick={() => act({ completed: true }, "Marked as finished")}>{busy && <Spinner />}Mark as finished</Button>}
              </div>
              <div className="flex items-center gap-1"><span className="mr-1">How useful was it?</span>{[1, 2, 3, 4, 5].map((n) => <Button key={n} type="button" size="icon-sm" variant="ghost" aria-label={`${n} star${n > 1 ? "s" : ""}`} disabled={busy} onClick={() => act({ rating: n }, "Thanks for rating it")}><StarIcon className={(r.myRating ?? 0) >= n ? "fill-primary text-primary" : "text-muted-foreground"} /></Button>)}</div>
              <Textarea aria-label="Feedback" placeholder="Anything to tell your teachers about it? (optional)" value={feedback ?? r.myFeedback ?? ""} onChange={(e) => setFeedback(e.target.value)} />
              <div><Button size="sm" variant="outline" disabled={busy || feedback === null} onClick={() => act({ feedback: feedback ?? "" }, "Feedback sent")}>Send feedback</Button></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
