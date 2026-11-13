import { Suspense } from "react"

import { Spinner } from "@/components/ui/spinner"
import { PlatformShell } from "./_components/shell"

/** Every screen here loads its data in the browser behind sign-in, so there is no static page to validate for instant navigation. */
export const instant = false

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center"><Spinner className="size-6" /></div>}>
      <PlatformShell>{children}</PlatformShell>
    </Suspense>
  )
}
