"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { CoursePlayer } from "@/components/course-player"
import { Button } from "@/components/ui/button"

export default function StudentCoursePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/student/courses" />}>All courses</Button></div>
      <CoursePlayer id={id} />
    </div>
  )
}
