"use client"

import { RoadmapBoard } from "@/components/roadmap-board"

export default function StudentRoadmapPage() {
  return <div className="max-w-5xl"><RoadmapBoard mode="student" base="/api/student/roadmap" /></div>
}
