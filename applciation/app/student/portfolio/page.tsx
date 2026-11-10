"use client"

import * as React from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/web/auth"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type W = { teamId: string; title: string; problem: string; type: string; skills: string[]; industryPartner: string | null; teamName: string; teammates: string[]; myRole: string | null; tasksDone: number; summary: string | null; repoUrl: string | null; submittedAt: string | null; myResultPercent: number | null; showInPortfolio: boolean }

/** My project portfolio, made from the work I submitted in college projects. Print it or save it as a PDF from the browser. Hide a project from the team's Team tab. */
export default function PortfolioPage() {
  const { data } = useApi<W[]>("/api/student/portfolio")
  const { state } = useAuth()
  if (!data || state.status !== "ready") return <Skeleton className="h-64" />
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden"><p className="text-sm text-muted-foreground">Made from the project work you submitted. Projects you hide are left out of this page&apos;s printout, your shareable profile and your resume.</p><Button onClick={() => window.print()}>Save as PDF / print</Button></div>
      <div><h1 className="text-2xl font-semibold">{state.profile.name}: project portfolio</h1></div>
      {data.filter((w) => w.showInPortfolio).map((w) => (
        <Card key={w.teamId} className="break-inside-avoid">
          <CardHeader><CardTitle>{w.title}</CardTitle><CardDescription>{[titleCase(w.type), w.myRole, w.industryPartner && `with ${w.industryPartner}`, w.submittedAt && fmtDate(w.submittedAt)].filter(Boolean).join(" · ")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="whitespace-pre-wrap">{w.summary ?? w.problem}</p>
            <div className="flex flex-wrap gap-1">{w.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
            <p className="text-muted-foreground">{w.teammates.length ? `Team ${w.teamName} with ${w.teammates.join(", ")}.` : "Individual project."} {w.tasksDone} tasks completed.{w.myResultPercent !== null ? ` Result: ${w.myResultPercent}%.` : ""}</p>
            {w.repoUrl && <a className="underline underline-offset-4" href={w.repoUrl} target="_blank" rel="noreferrer">{w.repoUrl}</a>}
          </CardContent>
        </Card>
      ))}
      {data.filter((w) => w.showInPortfolio).length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet. A project appears once your team has submitted its work. <Link className="underline underline-offset-4" href="/student/projects">Go to projects</Link>.</p>}
      {data.some((w) => !w.showInPortfolio) && <p className="text-xs text-muted-foreground print:hidden">{data.filter((w) => !w.showInPortfolio).length} hidden project(s): {data.filter((w) => !w.showInPortfolio).map((w) => w.title).join(", ")}. Show them from the project&apos;s Team tab.</p>}
    </div>
  )
}
