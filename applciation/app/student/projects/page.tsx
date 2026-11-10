"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type P = {
  id: string; title: string; problemStatement: string; skills: string[]; type: string; status: string; minTeamSize: number; maxTeamSize: number; industryPartner: string | null; dueAt: string | null; selfFormTeams: boolean; rejectReason: string | null
  guide: string | null; proposedByMe: boolean; myTeamId: string | null; canStartTeam: boolean; joinable: { id: string; name: string; members: number }[]
}

/** Projects: the ones I am in, the open ones I can take, and a form to propose my own. */
export default function StudentProjectsPage() {
  const { data, reload } = useApi<P[]>("/api/student/projects")
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [v, setV] = React.useState({ title: "", problemStatement: "", skills: "", type: "INDIVIDUAL" })
  if (!data) return <Skeleton className="h-48" />
  const mine = data.filter((p) => p.myTeamId), open = data.filter((p) => !p.myTeamId && p.status === "OPEN")

  async function take(p: P, teamId?: string) {
    setBusy(p.id)
    try { const r = await api<{ teamId: string }>(`/api/student/projects/${p.id}/teams`, { method: "POST", body: teamId ? { teamId } : {} }); toast.success(teamId ? "You joined the team" : "Team created"); router.push(`/student/projects/team/${r.teamId}`) } catch (e) { toastError(e); setBusy(null) }
  }
  async function propose(e: React.FormEvent) {
    e.preventDefault(); setBusy("propose")
    try { await api("/api/student/projects", { method: "POST", body: { title: v.title, problemStatement: v.problemStatement, skills: v.skills.split(",").map((s) => s.trim()).filter(Boolean), type: v.type } }); toast.success("Sent for approval. You will be told the answer."); setV({ title: "", problemStatement: "", skills: "", type: "INDIVIDUAL" }); reload() } catch (err) { toastError(err) } finally { setBusy(null) }
  }
  return (
    <Tabs defaultValue={mine.length ? "mine" : "open"}>
      <TabsList><TabsTrigger value="mine">My projects ({mine.length})</TabsTrigger><TabsTrigger value="open">Open projects ({open.length})</TabsTrigger><TabsTrigger value="propose">Propose my own</TabsTrigger></TabsList>
      <TabsContent value="mine" className="grid gap-4 md:grid-cols-2">
        {mine.map((p) => <Card key={p.id}><CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{titleCase(p.type)}{p.guide ? ` · guide ${p.guide}` : ""}{p.dueAt ? ` · due ${fmtDate(p.dueAt)}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">{p.status === "PROPOSED" && <Badge variant="secondary">Waiting for approval</Badge>}{p.rejectReason && <Alert variant="destructive"><AlertTitle>Not approved</AlertTitle><AlertDescription>{p.rejectReason}</AlertDescription></Alert>}</CardContent>
          <CardFooter><Button size="sm" render={<Link href={`/student/projects/team/${p.myTeamId}`} />}>Open workspace</Button></CardFooter></Card>)}
        {mine.length === 0 && <p className="text-sm text-muted-foreground">You are not in a project yet. Take an open one or propose your own.</p>}
      </TabsContent>
      <TabsContent value="open" className="grid gap-4 md:grid-cols-2">
        {open.map((p) => <Card key={p.id}><CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{titleCase(p.type)}{p.type !== "INDIVIDUAL" ? ` · teams of ${p.minTeamSize} to ${p.maxTeamSize}` : ""}{p.guide ? ` · guide ${p.guide}` : ""}{p.industryPartner ? ` · with ${p.industryPartner}` : ""}{p.dueAt ? ` · due ${fmtDate(p.dueAt)}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm"><p className="line-clamp-5 whitespace-pre-wrap">{p.problemStatement}</p><div className="flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div></CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {p.canStartTeam && <Button size="sm" disabled={busy === p.id} onClick={() => take(p)}>{busy === p.id && <Spinner />}{p.type === "INDIVIDUAL" ? "Take this project" : "Start a team"}</Button>}
            {p.joinable.map((t) => <Button key={t.id} size="sm" variant="outline" disabled={busy === p.id} onClick={() => take(p, t.id)}>Join {t.name} ({t.members})</Button>)}
            {!p.selfFormTeams && <span className="text-xs text-muted-foreground">Your placement office allocates students to this project.</span>}
          </CardFooter></Card>)}
        {open.length === 0 && <p className="text-sm text-muted-foreground">No open projects right now.</p>}
      </TabsContent>
      <TabsContent value="propose" className="max-w-xl">
        <form onSubmit={propose} className="flex flex-col gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor="pp-title">Project title</FieldLabel><Input id="pp-title" required minLength={3} value={v.title} onChange={(e) => setV((o) => ({ ...o, title: e.target.value }))} /></Field>
            <Field><FieldLabel htmlFor="pp-prob">What problem will it solve? (at least 30 characters)</FieldLabel><Textarea id="pp-prob" required minLength={30} className="min-h-28" value={v.problemStatement} onChange={(e) => setV((o) => ({ ...o, problemStatement: e.target.value }))} /></Field>
            <Field><FieldLabel htmlFor="pp-skills">Skills it uses, separated by commas</FieldLabel><Input id="pp-skills" value={v.skills} onChange={(e) => setV((o) => ({ ...o, skills: e.target.value }))} /></Field>
            <Field><FieldLabel>Working alone or with a team?</FieldLabel><OptionSelect className="w-full" value={v.type} onChange={(x) => setV((o) => ({ ...o, type: x }))} options={[{ value: "INDIVIDUAL", label: "Alone" }, { value: "TEAM", label: "With a team (you can add people after approval)" }]} placeholder="Choose" /></Field>
          </FieldGroup>
          <div><Button type="submit" disabled={busy === "propose"}>{busy === "propose" && <Spinner />}Send for approval</Button></div>
        </form>
      </TabsContent>
    </Tabs>
  )
}
