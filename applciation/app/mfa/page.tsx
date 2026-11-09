"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { AuthPage } from "@/components/auth-page"
import { MfaChallenge, MfaSetup, useFactors } from "@/components/mfa-panel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/web/auth"

/** Where administrators land to enter their authenticator code, or to set up an authenticator app when their college requires one. */
function MfaContent() {
  const router = useRouter()
  const next = useSearchParams().get("next")
  const { refresh } = useAuth()
  const { factors, verified } = useFactors()
  const go = async () => { await refresh(); router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/") }
  return (
    <AuthPage>
      <Card>
        <CardHeader className="text-center"><CardTitle className="text-xl">{verified.length ? "Confirm it is you" : "Set up two-step sign-in"}</CardTitle><CardDescription>{verified.length ? "Administrator accounts need a second step." : "Your college requires administrators to use an authenticator app."}</CardDescription></CardHeader>
        <CardContent>{!factors ? <Skeleton className="h-32" /> : verified.length ? <MfaChallenge factorId={verified[0].id} onDone={go} /> : <MfaSetup onDone={go} />}</CardContent>
      </Card>
    </AuthPage>
  )
}

/** useSearchParams() needs a Suspense boundary or the page cannot be prerendered; only this small part reads the address. */
export default function MfaPage() {
  return <React.Suspense fallback={<AuthPage><Skeleton className="h-48" /></AuthPage>}><MfaContent /></React.Suspense>
}
