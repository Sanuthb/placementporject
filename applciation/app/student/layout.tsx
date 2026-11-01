import { Suspense } from "react"

import { AppShell } from "@/components/app-shell"
import { Spinner } from "@/components/ui/spinner"

/** Every screen here sits behind sign-in and loads its data in the browser, so there is no static page to validate for instant navigation. */
export const instant = false

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center"><Spinner className="size-6" /></div>}>
      <AppShell kind="student">{children}</AppShell>
    </Suspense>
  )
}
