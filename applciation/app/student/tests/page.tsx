"use client"

import Link from "next/link"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { categoryLabel } from "@/lib/reassessment"

type Test = { key: string; title: string; description: string; category: string; private: boolean; minutes: number; items: number; attempts: number; lastAt: string | null; canTake: boolean; blockedReason: string | null; availableFrom: string | null }
type List = { consentAt: string | null; sharedWithStaff: boolean; tests: Test[] }

export default function CareerTestsPage() {
  const { data, reload } = useApi<List>("/api/student/instruments")
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-64" />
  const hasPrivate = data.tests.some((t) => t.private)

  async function consent(v: boolean) {
    setBusy(true)
    try { await api("/api/student/psychometrics/consent", { method: "POST", body: { consent: v } }); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function share(v: boolean) {
    try { await api("/api/student/psychometrics/sharing", { method: "POST", body: { share: v } }); reload() } catch (e) { toastError(e) }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Alert>
        <AlertTitle>Career tests</AlertTitle>
        <AlertDescription>Short tests that help you see your interests, working style and communication. They are for your own guidance. They are never used to decide whether you are eligible for a drive, to block you, or to reject you.</AlertDescription>
      </Alert>

      {hasPrivate && (
        <Card>
          <CardHeader>
            <CardTitle>Your privacy</CardTitle>
            <CardDescription>Career interests and behavioural style are personal. Only you can see your results unless you choose to share them. The placement office sees group averages only.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {data.consentAt
              ? <div className="flex flex-wrap items-center gap-3"><Badge>Consent given {fmtDate(data.consentAt)}</Badge><Button size="sm" variant="outline" disabled={busy} onClick={() => consent(false)}>Withdraw consent</Button></div>
              : <div className="flex flex-col items-start gap-2"><span>To take these two tests, please agree that your answers are stored and used only for your guidance and for group-level figures.</span><Button size="sm" disabled={busy} onClick={() => consent(true)}>{busy && <Spinner />}I understand and agree</Button></div>}
            <div className="flex items-center gap-3"><Switch id="share" checked={data.sharedWithStaff} onCheckedChange={share} /><Label htmlFor="share">Let a placement admin open my individual results (they must give a reason, and each view is logged)</Label></div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.tests.map((t) => {
          const locked = t.private && !data.consentAt
          return (
            <Card key={t.key}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">{t.title} <Badge variant="outline">{categoryLabel(t.category)}</Badge>{t.private && <Badge variant="secondary">Private</Badge>}</CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">About {t.minutes} minutes · {t.items} question{t.items > 1 ? "s" : ""}{t.attempts ? ` · taken ${t.attempts} time${t.attempts > 1 ? "s" : ""}, last ${fmtDate(t.lastAt)}` : ""}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {t.attempts > 0 && <Button size="sm" variant="outline" render={<Link href={`/student/tests/${t.key}`} />}>See results</Button>}
                  {t.canTake && <Button size="sm" disabled={locked} render={locked ? undefined : <Link href={`/student/tests/${t.key}?take=1`} />}>{t.attempts ? "Take again" : "Start"}</Button>}
                  {locked && <span className="text-xs text-muted-foreground">Give your consent above first.</span>}
                  {!t.canTake && t.blockedReason && t.attempts > 0 && <span className="text-xs text-muted-foreground">{t.availableFrom ? `You can take it again from ${fmtDate(t.availableFrom)}.` : t.blockedReason}</span>}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {data.tests.length === 0 && <p className="text-sm text-muted-foreground">No career tests are available yet.</p>}
      </div>
    </div>
  )
}
