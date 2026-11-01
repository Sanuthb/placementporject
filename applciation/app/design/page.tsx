import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { DesignShowcase } from "./showcase"

export default function DesignPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <DesignShowcase />
    </Suspense>
  )
}
