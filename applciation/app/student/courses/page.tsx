"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, toastError } from "@/lib/web/api"
import { titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type C = { id: string; title: string; summary: string | null; category: string | null; level: string | null; skills: string[]; status: string; lessons: number; learners: number; certificate: boolean; selfEnrol: boolean; enrolled: boolean; completed: boolean; percent: number; certificateSerial: string | null }

type Rec = { id: string; title: string; summary: string | null; category: string | null; level: string | null; selfEnrol: boolean; why: string[] }

export default function StudentCoursesPage() {
  const { data, reload } = useApi<C[]>("/api/student/courses")
  const recs = useApi<Rec[]>("/api/student/courses/recommended")
  const [q, setQ] = React.useState("")
  if (!data) return <Skeleton className="h-48" />
  const match = (c: C) => !q.trim() || [c.title, c.summary, c.category, ...c.skills].some((t) => t?.toLowerCase().includes(q.trim().toLowerCase()))
  const mine = data.filter((c) => c.enrolled), open = data.filter((c) => !c.enrolled && c.status === "PUBLISHED" && match(c))
  const join = (c: { id: string; title: string }) => api(`/api/student/courses/${c.id}/enrol`, { method: "POST" }).then(() => { toast.success(`You joined ${c.title}`); reload(); recs.reload() }, toastError)
  return (
    <Tabs defaultValue={mine.length ? "mine" : "browse"}>
      <TabsList><TabsTrigger value="mine">My courses ({mine.length})</TabsTrigger><TabsTrigger value="browse">Browse courses</TabsTrigger></TabsList>
      <TabsContent value="mine" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mine.map((c) => (
          <Card key={c.id}>
            <CardHeader><CardTitle>{c.title}</CardTitle><CardDescription>{c.completed ? "Completed" : `${c.percent}% done`}{c.status === "ARCHIVED" && " · closed to new students"}</CardDescription></CardHeader>
            <CardContent><Progress value={c.percent} /></CardContent>
            <CardFooter className="gap-2"><Button size="sm" render={<Link href={`/student/courses/${c.id}`} />}>{c.completed ? "Review" : c.percent ? "Continue" : "Start"}</Button>{c.certificateSerial && <Button size="sm" variant="outline" render={<Link href={`/student/courses/${c.id}/certificate`} />}>Certificate</Button>}</CardFooter>
          </Card>
        ))}
        {mine.length === 0 && <p className="text-sm text-muted-foreground">You have not joined a course yet. Look under Browse courses.</p>}
      </TabsContent>
      <TabsContent value="browse" className="flex flex-col gap-4">
        {(recs.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-2"><h2 className="font-medium">Recommended for you</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {recs.data!.map((c) => (
                <Card key={c.id} size="sm">
                  <CardHeader><CardTitle>{c.title}</CardTitle><CardDescription>{[c.category, c.level && titleCase(c.level)].filter(Boolean).join(" · ")}</CardDescription></CardHeader>
                  <CardContent><ul className="list-disc pl-4 text-xs text-muted-foreground">{c.why.map((w) => <li key={w}>{w}</li>)}</ul></CardContent>
                  <CardFooter className="gap-2"><Button size="sm" variant="outline" render={<Link href={`/student/courses/${c.id}`} />}>Details</Button>{c.selfEnrol && <Button size="sm" onClick={() => join(c)}>Join</Button>}</CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}
        <Input className="max-w-sm" aria-label="Search courses" placeholder="Search by title, topic or skill" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {open.map((c) => (
            <Card key={c.id}>
              <CardHeader><CardTitle>{c.title}</CardTitle><CardDescription>{[c.category, c.level && titleCase(c.level), `${c.lessons} lessons`].filter(Boolean).join(" · ")}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm"><p>{c.summary}</p><div className="flex flex-wrap gap-1">{c.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}{c.certificate && <Badge variant="outline">Certificate</Badge>}</div></CardContent>
              <CardFooter className="gap-2"><Button size="sm" variant="outline" render={<Link href={`/student/courses/${c.id}`} />}>Details</Button>{c.selfEnrol ? <Button size="sm" onClick={() => join(c)}>Join</Button> : <span className="text-xs text-muted-foreground">Your placement office enrols students</span>}</CardFooter>
            </Card>
          ))}
          {open.length === 0 && <p className="text-sm text-muted-foreground">No courses to join right now.</p>}
        </div>
      </TabsContent>
    </Tabs>
  )
}
