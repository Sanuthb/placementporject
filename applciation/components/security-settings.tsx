"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type Data = { requireMfaForAdmins: boolean; admins: { id: string; name: string; email: string; mfa: boolean }[] }

export function SecuritySettings() {
  const { data, reload } = useApi<Data>("/api/settings/security")
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48 rounded-xl" />
  async function set(on: boolean) {
    setBusy(true)
    try { await api("/api/settings/security", { method: "PATCH", body: { requireMfaForAdmins: on } }); toast.success(on ? "Two-step sign-in is now required for administrators" : "Two-step sign-in is optional again"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const missing = data.admins.filter((a) => !a.mfa)
  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Two-step sign-in for administrators</CardTitle><CardDescription>Administrators who set up an authenticator app are always asked for a code. This setting also forces the ones who have not.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="text-sm"><div className="font-medium">Require it for every administrator</div><div className="text-muted-foreground">Administrators without an authenticator app are sent to set one up before they can use the app.</div></div>
          <Switch checked={data.requireMfaForAdmins} disabled={busy} onCheckedChange={set} aria-label="Require two-step sign-in for administrators" />
        </div>
        {missing.length > 0 && <Alert><AlertTitle>{missing.length} administrator{missing.length > 1 ? "s have" : " has"} not set it up</AlertTitle><AlertDescription>{missing.map((a) => a.name).join(", ")}. {data.requireMfaForAdmins ? "They will be asked at their next sign-in." : "Turn the requirement on to make them."}</AlertDescription></Alert>}
        <ul className="flex flex-col gap-1 text-sm">{data.admins.map((a) => <li key={a.id} className="flex items-center gap-2">{a.name}<span className="text-muted-foreground">{a.email}</span><Badge variant={a.mfa ? "default" : "outline"}>{a.mfa ? "Set up" : "Not set up"}</Badge></li>)}</ul>
        <div><Button variant="outline" render={<Link href="/staff/security" />}>Set up my own authenticator app</Button></div>
      </CardContent>
    </Card>
  )
}
