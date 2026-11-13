"use client"

import * as React from "react"
import { ShieldCheckIcon, ShieldAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { EmptyNote, PageHeader, TableBox } from "../_components/page-header"
import { RemoveMfa, type Me } from "../_components/mfa-gate"

type Login = { id: string; current: boolean; at: string; method: string | null; twoStep: boolean; ip: string | null; device: string | null }
type Admin = { id: string; email: string; name: string; isActive: boolean; createdAt: string; mfaEnrolled: boolean | null }

/** Who you are and how you sign in. Only what the platform already records is shown; session lists and revocation are not available yet, and the page says so. */
export default function AccountPage() {
  const me = useApi<Me>("/api/platform/me")
  const admins = useApi<{ items: Admin[] }>("/api/platform/admins")
  const logins = useApi<{ items: Login[] }>("/api/platform/me/logins")
  const [busy, setBusy] = React.useState(false)
  const signOutOthers = async () => { setBusy(true); try { await api("/api/platform/me/sessions/revoke-others", { method: "POST" }); toast.success("Your other sessions were signed out") } catch (e) { toastError(e) } finally { setBusy(false) } }
  const mine = admins.data?.items.find((a) => a.email.toLowerCase() === me.data?.email.toLowerCase())

  return (
    <>
      <PageHeader title="Administrator account" description="Your profile and two-step sign-in. Platform administrator accounts are created by the platform team, not from this screen." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle><CardDescription>As recorded for this administrator account.</CardDescription></CardHeader>
          <CardContent>
            {me.error ? <Alert variant="destructive"><AlertTitle>Could not load your profile</AlertTitle><AlertDescription>{me.error instanceof Error ? me.error.message : "Try again"}</AlertDescription></Alert> : !me.data ? <Skeleton className="h-24 w-full" /> : (
              <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
                <dt className="text-muted-foreground">Name</dt><dd className="font-medium">{me.data.name}</dd>
                <dt className="text-muted-foreground">Email</dt><dd className="break-all font-medium">{me.data.email}</dd>
                <dt className="text-muted-foreground">Status</dt><dd>{mine ? <Badge variant={mine.isActive ? "default" : "secondary"}>{mine.isActive ? "Active" : "Removed"}</Badge> : "—"}</dd>
                <dt className="text-muted-foreground">Account created</dt><dd>{mine ? fmtDate(mine.createdAt) : "—"}</dd>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Two-step sign-in</CardTitle><CardDescription>Required for every platform administrator and cannot be turned off.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!me.data ? <Skeleton className="h-24 w-full" /> : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  {me.data.mfa === "ok" ? <ShieldCheckIcon className="size-5 text-primary" /> : <ShieldAlertIcon className="size-5 text-destructive" />}
                  <span>{me.data.mfa === "ok" ? "An authenticator app is set up and this session is confirmed." : "Two-step sign-in is not complete for this session."}</span>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Removing your authenticator locks platform access until you set up a new one.</div>
                <RemoveMfa onDone={() => window.location.reload()} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent sign-ins</CardTitle><CardDescription>Your own sign-ins, newest first. If you do not recognise one, sign out your other sessions and change your password.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {logins.error ? <Alert variant="destructive"><AlertTitle>Could not load sign-in history</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{logins.error instanceof Error ? logins.error.message : "Try again"}<Button size="sm" variant="outline" onClick={logins.reload}>Try again</Button></AlertDescription></Alert>
            : !logins.data ? <Skeleton className="h-24 w-full" /> : logins.data.items.length === 0 ? <EmptyNote>No sign-ins have been recorded yet. They are recorded from now on, one entry per sign-in.</EmptyNote> : (
              <TableBox><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Two-step</TableHead><TableHead>Address</TableHead><TableHead>Device</TableHead></TableRow></TableHeader>
                <TableBody>{logins.data.items.map((l) => <TableRow key={l.id}><TableCell className="whitespace-nowrap">{fmtDateTime(l.at)}{l.current && <Badge className="ml-2" variant="secondary">This session</Badge>}</TableCell><TableCell>{l.twoStep ? "Confirmed" : "Not confirmed"}</TableCell><TableCell className="font-mono text-xs">{l.ip ?? "—"}</TableCell><TableCell className="max-w-xs truncate text-xs text-muted-foreground">{l.device ?? "—"}</TableCell></TableRow>)}</TableBody></Table></TableBox>
            )}
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm"><span className="flex-1 text-muted-foreground">The sign-in service can sign you out everywhere except here. It cannot list individual sessions or end a chosen one.</span><Button variant="outline" size="sm" disabled={busy} onClick={signOutOthers}>{busy && <Spinner />}Sign out my other sessions</Button></div>
        </CardContent>
      </Card>
    </>
  )
}
