"use client"

import { MfaCard } from "@/components/mfa-panel"
import { SignInHistory } from "@/components/sign-in-history"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** My own two-step sign-in and recent sign-ins. */
export default function SecurityPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card><CardHeader><CardTitle>Two-step sign-in</CardTitle><CardDescription>Protect your account with a code from an authenticator app.</CardDescription></CardHeader><CardContent><MfaCard /></CardContent></Card>
      <Card><CardHeader><CardTitle>Recent sign-ins</CardTitle><CardDescription>If you see one you do not recognise, change your password and tell your administrator.</CardDescription></CardHeader><CardContent><SignInHistory path="/api/me/logins" /></CardContent></Card>
    </div>
  )
}
