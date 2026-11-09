"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/web/auth"

/** Placeholder landing content until each area's real dashboard is built: confirms who is signed in and which modules are on. */
export function SessionSummary() {
  const { state } = useAuth()
  if (state.status !== "ready") return null
  const { profile } = state
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Welcome, {profile.name}</CardTitle>
        <CardDescription>{profile.email}{profile.roles.length ? ` · ${profile.roles.map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {profile.modules.length ? profile.modules.map((m) => <Badge key={m} variant="secondary">{m.replaceAll("_", " ").toLowerCase()}</Badge>) : <span className="text-sm text-muted-foreground">No add-on modules enabled.</span>}
      </CardContent>
    </Card>
  )
}
