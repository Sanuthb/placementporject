"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LandmarkIcon, LogOutIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiClientError, api } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { supabase } from "@/lib/supabase/browser"
import { MfaGate, type Me } from "./mfa-gate"
import { PLATFORM_NAV, crumbsFor } from "./nav"

/** Tells the server about this sign-in once per session, for the sign-in history. Failure is harmless and never blocks anything. */
async function recordLogin() {
  try {
    const { data } = await supabase().auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    const sid = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id as string | undefined
    const key = `platform-login-recorded`
    if (!sid) return
    // Recorded again once the second step upgrades the session, so the history shows that it was confirmed.
    const aal = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal as string | undefined
    if (sessionStorage.getItem(key) === `${sid}:${aal}`) return
    const r = await fetch("/api/auth/login-event", { method: "POST", headers: { authorization: `Bearer ${token}` } })
    if (r.ok) sessionStorage.setItem(key, `${sid}:${aal}`)
  } catch { /* the history is a convenience */ }
}

/** The portal is always light. The rest of the app follows the system theme, so the dark class is removed while this portal is open and put back afterwards. */
function useForceLight() {
  React.useEffect(() => {
    const root = document.documentElement
    const had = root.classList.contains("dark")
    const strip = () => { if (root.classList.contains("dark")) root.classList.remove("dark") }
    strip()
    // Menus, dialogs and sheets render outside this page's tree, so the portal's colours are applied at the document root while it is open.
    root.classList.add("platform-theme")
    const mo = new MutationObserver(() => { strip(); if (!root.classList.contains("platform-theme")) root.classList.add("platform-theme") })
    mo.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => { mo.disconnect(); root.classList.remove("platform-theme"); if (had) root.classList.add("dark") }
  }, [])
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center bg-background p-6">{children}</div>
}

/**
 * The frame around every platform page: asks the server who this is, shows the sign-in or two-step screens when needed, then the sidebar, breadcrumbs and page.
 * It only presents state. The API still enforces platform administrator access and the second step on every call.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  useForceLight()
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const [tick, setTick] = React.useState(0)
  const [me, setMe] = React.useState<Me | null>(null)
  const [fail, setFail] = React.useState<{ status: number; message: string } | null>(null)

  React.useEffect(() => {
    let alive = true
    api<Me>("/api/platform/me")
      .then((m) => alive && setMe(m))
      .catch((e) => alive && setFail({ status: e instanceof ApiClientError ? e.status : 0, message: e instanceof Error ? e.message : "Could not load" }))
    return () => { alive = false }
  }, [tick])

  React.useEffect(() => { if (me) void recordLogin() }, [me])

  const wrap = (node: React.ReactNode) => <div className="platform-theme min-h-svh">{node}</div>

  if (fail && (fail.status === 401 || fail.status === 403)) {
    return wrap(
      <Centered>
        <div className="flex w-full max-w-md flex-col gap-3">
          <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{fail.status === 401 ? "Sign in to continue." : "This login is not a platform administrator, or the second step is missing."}</AlertDescription></Alert>
          <Button render={<Link href={`/login?next=${encodeURIComponent(pathname)}`} />}>Sign in</Button>
        </div>
      </Centered>,
    )
  }
  if (fail) {
    return wrap(
      <Centered>
        <div className="flex w-full max-w-md flex-col gap-3">
          <Alert variant="destructive"><AlertTitle>Could not load the portal</AlertTitle><AlertDescription>{fail.message}</AlertDescription></Alert>
          <Button variant="outline" onClick={() => { setFail(null); setTick((t) => t + 1) }}>Try again</Button>
        </div>
      </Centered>,
    )
  }
  if (!me) return wrap(<Centered><Spinner className="size-6" /></Centered>)
  if (me.mfa !== "ok") return wrap(<Centered><div className="w-full max-w-md rounded-xl border bg-card shadow-sm"><MfaGate me={me} onDone={() => setTick((t) => t + 1)} /></div></Centered>)

  const crumbs = crumbsFor(pathname)
  return wrap(
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><LandmarkIcon className="size-4" /></div>
                <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">Placement Platform</span><span className="truncate text-xs text-sidebar-foreground/70">Platform administration</span></div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-0">
          {PLATFORM_NAV.map((g) => (
            <SidebarGroup key={g.label} className="py-1">
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarMenu>
                {g.items.map((i) => {
                  const active = i.href === "/platform" ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)
                  return (
                    <SidebarMenuItem key={i.href}>
                      <SidebarMenuButton tooltip={i.title} isActive={active} render={<Link href={i.href} />}><i.icon /><span>{i.title}</span></SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none">
                <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{me.name || "Platform administrator"}</span><span className="truncate text-xs text-sidebar-foreground/70">{me.email}</span></div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign out" onClick={async () => { await signOut(); router.replace("/login") }}><LogOutIcon /><span>Sign out</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                <React.Fragment key={`${c.title}-${i}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>{i === crumbs.length - 1 || !c.href ? <BreadcrumbPage>{c.title}</BreadcrumbPage> : <BreadcrumbLink render={<Link href={c.href} />}>{c.title}</BreadcrumbLink>}</BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <React.Suspense fallback={<Skeleton className="h-64 w-full" />}>{children}</React.Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>,
  )
}
