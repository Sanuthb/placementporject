"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { RoadmapBoard } from "@/components/roadmap-board"
import { Button } from "@/components/ui/button"

/** One student's roadmap for their mentor or the placement staff: read, confirm milestones and leave notes. */
export default function ReviewRoadmapPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/roadmaps" />}>Back to roadmaps</Button></div>
      <RoadmapBoard mode="review" base={`/api/students/${id}/roadmap`} />
    </div>
  )
}
