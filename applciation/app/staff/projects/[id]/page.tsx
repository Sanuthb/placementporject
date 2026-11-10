"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { ProjectManager } from "@/components/project-manager"
import { Button } from "@/components/ui/button"
import { useAuth, hasRole } from "@/lib/web/auth"

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const staff = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN", "PLACEMENT_OFFICER")
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/projects" />}>All projects</Button></div>
      <ProjectManager id={id} isStaff={staff} />
    </div>
  )
}
