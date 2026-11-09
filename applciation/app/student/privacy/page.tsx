"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { SignInHistory } from "@/components/sign-in-history"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase/browser"
import { api, download, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

/** Everything the college keeps about me that I can read through the app, as one file. */
async function downloadMyData(modules: string[]) {
  const get = (path: string, on = true) => (on ? api(path).catch(() => null) : Promise.resolve(null))
  const [me, sections, applications, offers, blocks, tickets, participation] = await Promise.all([
    get("/api/student/me"), get("/api/student/sections", modules.includes("ONBOARDING")), get("/api/student/applications", modules.includes("DRIVES")),
    get("/api/student/offers", modules.includes("DRIVES")), get("/api/student/blocks", modules.includes("ATTENDANCE_BLOCKING")), get("/api/student/tickets"), get("/api/student/participation-requests", modules.includes("ONBOARDING")),
  ])
  const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), me, sections, applications, offers, blocks, tickets, participation }, null, 2)], { type: "application/json" }))
  const a = document.createElement("a"); a.href = url; a.download = "my-placement-data.json"; a.click(); URL.revokeObjectURL(url)
}

export default function PrivacyPage() {
  const { state } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const prefs = useApi<{ emailAnnouncements: boolean; emailReminders: boolean }>("/api/student/preferences")
  const log = useApi<{ profileViews: { at: string; by: string; role: string | null }[]; personalityViews: { at: string; by: string; reason: string }[] }>("/api/student/privacy/access-log")
  async function setPref(k: "emailAnnouncements" | "emailReminders", v: boolean) { try { await api("/api/student/preferences", { method: "PUT", body: { [k]: v } }); prefs.reload() } catch (e) { toastError(e) } }
  const modules = state.status === "ready" ? state.profile.modules : []
  async function run(k: string, f: () => Promise<void>) { setBusy(k); try { await f() } catch (e) { toastError(e) } finally { setBusy(null) } }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>What the college holds about you</CardTitle><CardDescription>Your profile, marks, documents, applications, offers, blocks and support requests. Only your college&apos;s placement staff can see it, and department coordinators only see students of their own department.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={busy === "data"} onClick={() => run("data", () => downloadMyData(modules))}>{busy === "data" && <Spinner />}Download my data</Button>
          {modules.includes("ONBOARDING") && <Button variant="outline" disabled={busy === "pdf"} onClick={() => run("pdf", () => download("/api/student/resume.pdf"))}>Download my resume (PDF)</Button>}
        </CardContent>
      </Card>
      {modules.includes("PSYCHOMETRICS") && (
        <Card>
          <CardHeader><CardTitle>Personality assessment</CardTitle><CardDescription>Your results are kept apart from your academic data and are never used to decide eligibility or block you. Staff can only open an individual result with a recorded reason.</CardDescription></CardHeader>
          <CardContent><Button variant="outline" onClick={() => router.push("/student/personality")}>Manage consent and results</Button></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Emails</CardTitle><CardDescription>Choose which optional emails you get. Account, offer and block emails are always sent, and everything still shows in the app.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3"><Switch id="pa" checked={prefs.data?.emailAnnouncements ?? true} disabled={!prefs.data} onCheckedChange={(v) => setPref("emailAnnouncements", v)} /><Label htmlFor="pa">Announcements and job alerts</Label></div>
          <div className="flex items-center gap-3"><Switch id="pr" checked={prefs.data?.emailReminders ?? true} disabled={!prefs.data} onCheckedChange={(v) => setPref("emailReminders", v)} /><Label htmlFor="pr">Reminders (drive deadlines, assessments)</Label></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Who has looked at my profile</CardTitle><CardDescription>Each time placement staff opened your profile (once an hour per person), and each time an admin opened your personality result with their reason.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>What</TableHead></TableRow></TableHeader>
            <TableBody>
              {log.data?.personalityViews.map((v, i) => <TableRow key={`p${i}`}><TableCell>{fmtDateTime(v.at)}</TableCell><TableCell>{v.by}</TableCell><TableCell>Personality result: {v.reason}</TableCell></TableRow>)}
              {log.data?.profileViews.map((v, i) => <TableRow key={`v${i}`}><TableCell>{fmtDateTime(v.at)}</TableCell><TableCell>{v.by}{v.role ? ` (${titleCase(v.role)})` : ""}</TableCell><TableCell>Profile</TableCell></TableRow>)}
              {log.data && log.data.profileViews.length + log.data.personalityViews.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">Nobody has opened your profile yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My recent sign-ins</CardTitle><CardDescription>If you see a sign-in you do not recognise, change your password and tell the placement office.</CardDescription></CardHeader>
        <CardContent><SignInHistory path="/api/me/logins" /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Correction or deletion</CardTitle><CardDescription>To correct verified data, or to ask for something to be deleted, send a request to the placement office.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => router.push("/student/support")}>Open a support request</Button></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Devices</CardTitle><CardDescription>Sign out everywhere if you used a shared computer or lost a phone.</CardDescription></CardHeader>
        <CardContent><Button variant="destructive" disabled={busy === "out"} onClick={() => run("out", async () => { await supabase().auth.signOut({ scope: "global" }); router.replace("/login") })}>{busy === "out" && <Spinner />}Sign out of all devices</Button></CardContent>
      </Card>
    </div>
  )
}
