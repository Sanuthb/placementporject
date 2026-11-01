"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { homeFor, useAuth, type Kind } from "@/lib/web/auth"
import { NAV } from "@/lib/web/nav"

/** The one layout every dashboard uses: signs you in if needed, sends you to the right area, then shows sidebar + page. */
export function AppShell({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const { state, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const wrongKind = state.status === "ready" && state.profile.kind !== kind
  React.useEffect(() => {
    if (state.status === "anon") router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    else if (state.status === "ready" && state.profile.kind !== kind) router.replace(homeFor(state.profile.kind))
  }, [state, kind, pathname, router])

  if (state.status === "error" || state.status === "noaccess") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>{state.status === "noaccess" ? "No access" : "Could not load your account"}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            {state.status === "noaccess" ? "This login is not linked to an active account. If your account was deactivated, or your college has switched the placement portal off, contact your placement office." : state.message}
            <Button variant="outline" onClick={async () => { await signOut(); router.replace("/login") }}>Sign out</Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  if (state.status !== "ready" || wrongKind) {
    return <div className="flex min-h-svh items-center justify-center"><Spinner className="size-6" /></div>
  }

  const current = NAV[kind].flatMap((s) => s.items).find((i) => i.href === pathname)
  return (
    <SidebarProvider>
      <AppSidebar profile={state.profile} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbPage>{current?.title ?? "Placement"}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
