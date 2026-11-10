"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { InternshipDetail } from "@/components/internship-detail"
import { Button } from "@/components/ui/button"

export default function InternshipPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/internships" />}>All internships</Button></div>
      <InternshipDetail id={id} />
    </div>
  )
}
