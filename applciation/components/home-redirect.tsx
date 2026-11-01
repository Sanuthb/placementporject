"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { homeFor, useAuth } from "@/lib/web/auth"

/** The front door: sends you to sign in, or to the area your login belongs to. */
export function HomeRedirect() {
  const { state } = useAuth()
  const router = useRouter()
  React.useEffect(() => {
    if (state.status === "anon") router.replace("/login")
    else if (state.status === "ready") router.replace(homeFor(state.profile.kind))
  }, [state, router])

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
