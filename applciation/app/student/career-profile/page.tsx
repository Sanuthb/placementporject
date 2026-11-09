"use client"

import { CareerProfile } from "@/components/career-profile"

export default function StudentCareerProfilePage() {
  return <div className="max-w-5xl"><CareerProfile endpoint="/api/student/career-profile" printable title="My career profile" /></div>
}
