"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { CourseBuilder } from "@/components/course-builder"
import { Button } from "@/components/ui/button"

export default function CoursePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex max-w-6xl flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/staff/courses" />}>Back to courses</Button></div>
      <CourseBuilder id={id} />
    </div>
  )
}
