"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { MatchBoard } from "@/components/match-board"
import { JdReadiness } from "@/components/staff-readiness"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function Page() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-6xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href={`/staff/job-descriptions/${id}`} />}>Back to the job description</Button></div>
      <Tabs defaultValue="match"><TabsList><TabsTrigger value="match">Candidate matching</TabsTrigger><TabsTrigger value="readiness">Readiness</TabsTrigger></TabsList>
        <TabsContent value="match"><MatchBoard id={id} /></TabsContent>
        <TabsContent value="readiness"><JdReadiness jdId={id} /></TabsContent></Tabs>
    </div>
  )
}
export default function MatchesPage() {
  return <React.Suspense fallback={<Skeleton className="h-96" />}><Page /></React.Suspense>
}
