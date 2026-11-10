"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { CampaignWorkspace } from "@/components/campaign-workspace"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function Page() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-6xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/campaigns" />}>All campaigns</Button></div>
      <CampaignWorkspace id={id} />
    </div>
  )
}
export default function CampaignPage() {
  return <React.Suspense fallback={<Skeleton className="h-96" />}><Page /></React.Suspense>
}
