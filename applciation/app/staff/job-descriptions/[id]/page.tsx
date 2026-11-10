"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { JdReview } from "@/components/jd-review"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function Page() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-6xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/job-descriptions" />}>All job descriptions</Button></div>
      <JdReview id={id} />
    </div>
  )
}
export default function JobDescriptionPage() {
  return <React.Suspense fallback={<Skeleton className="h-96" />}><Page /></React.Suspense>
}
