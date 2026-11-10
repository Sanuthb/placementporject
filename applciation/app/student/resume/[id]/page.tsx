"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { ResumeEditor } from "@/components/resume-editor"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function Editor() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex flex-col gap-3">
      <div><Button variant="outline" size="sm" render={<Link href="/student/resume" />}>All resumes</Button></div>
      <ResumeEditor id={id} />
    </div>
  )
}

export default function ResumeEditorPage() {
  return <React.Suspense fallback={<Skeleton className="h-96" />}><Editor /></React.Suspense>
}
