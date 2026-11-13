"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/web/api"
import { homeFor, useAuth } from "@/lib/web/auth"

/**
 * The front door: sends you to sign in, or to the area your login belongs to.
 * Platform administrators have no staff, student or employer record by design, so the checks above do not recognise them. When none matches, the platform
 * check is tried before concluding "No access". The platform API still decides: this only chooses where to send the browser.
 */
export function HomeRedirect() {
  const { state } = useAuth()
  const router = useRouter()
  const [notPlatform, setNotPlatform] = React.useState(false) // true once the platform check has said "this login is not a platform administrator"
  React.useEffect(() => {
    if (state.status === "anon") router.replace("/login")
    else if (state.status === "ready") router.replace(homeFor(state.profile.kind))
    else if (state.status === "noaccess") {
      let alive = true
      api("/api/platform/me").then(() => alive && router.replace("/platform")).catch(() => alive && setNotPlatform(true))
      return () => { alive = false }
    }
  }, [state, router])

  if (state.status === "noaccess" && !notPlatform) return <div className="flex min-h-svh items-center justify-center"><Spinner className="size-6" /></div>
  if (state.status === "error" || state.status === "noaccess") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>{state.status === "noaccess" ? "No access" : "Could not load your account"}</AlertTitle>
          <AlertDescription>{state.status === "noaccess" ? "This login is not linked to an active account. Ask your placement cell." : state.message}</AlertDescription>
        </Alert>
      </div>
    )
  }
  return <div className="flex min-h-svh items-center justify-center"><Spinner className="size-6" /></div>
}
