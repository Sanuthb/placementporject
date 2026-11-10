"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { TeamReview } from "@/components/team-review"
import { Button } from "@/components/ui/button"

export default function TeamReviewPage() {
  const { id, tid } = useParams<{ id: string; tid: string }>()
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href={`/staff/projects/${id}`} />}>Back to the project</Button></div>
      <TeamReview projectId={id} teamId={tid} />
    </div>
  )
}
