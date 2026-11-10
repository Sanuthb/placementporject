"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { StudentCampaign } from "@/components/student-campaign"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function Page() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/student/campaigns" />}>My preparation</Button></div>
      <StudentCampaign id={id} />
    </div>
  )
}
export default function StudentCampaignPage() {
  return <React.Suspense fallback={<Skeleton className="h-96" />}><Page /></React.Suspense>
}
