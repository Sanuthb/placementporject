"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { ResourceManager } from "@/components/resource-manager"
import { Button } from "@/components/ui/button"

export default function ResourcePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/resources" />}>Back to library</Button></div>
      <ResourceManager id={id} />
    </div>
  )
}
