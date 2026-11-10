"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { TeamWorkspace } from "@/components/team-workspace"
import { Button } from "@/components/ui/button"

export default function TeamPage() {
  const { tid } = useParams<{ tid: string }>()
  return (
    <div className="flex flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/student/projects" />}>All projects</Button></div>
      <TeamWorkspace teamId={tid} />
    </div>
  )
}
