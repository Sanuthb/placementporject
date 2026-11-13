"use client"

import * as React from "react"
import Link from "next/link"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ArrowRightIcon, Building2Icon, BotIcon, GraduationCapIcon, HeartPulseIcon, LifeBuoyIcon, UsersIcon, BriefcaseBusinessIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { PageHeader } from "./_components/page-header"

type Summary = {
  institutions: { total: number; active: number; suspended: number; registeredLast30Days: number }
  users: { students: { total: number; active: number }; staff: { total: number; active: number }; recruiters: { total: number; active: number }; activeUsers: { distinctUsers: number; signIns: number } }
  placement: { drives: { total: number; published: number }; applications: { total: number; shortlisted: number }; offers: { made: number; accepted: number }; placedStudents: number; registeredForPlacement: number; placementRate: number | null }
  series: { unit: "day" | "month"; points: { period: string; institutionsRegistered: number; signIns: number; applications: number; offers: number }[] }
  recent: { registrations: { id: string; name: string; isActive: boolean; createdAt: string }[]; adminActivity: { id: string; action: string; at: string; outcome: "success" | "failure"; actor: { email: string | null } | null; institution: { name: string | null } | null }[] }
}
type Status = "healthy" | "degraded" | "unavailable" | "unknown" | "not_configured"
type Health = { checkedAt: string; overall: { status: Status; counts: Record<Status, number>; notes: string[] }; components: { key: string; label: string; status: Status; summary: string }[] }
type AiUsage = { totals: { calls: number; failures: number; blocked: number; rateLimited: number }; trend?: { day: string; calls: number; failures: number; blocked: number }[] }
type Adoption = { activeInstitutions: number; items: { module: string; enabled: number; total: number; share: number | null }[] }
type SupportPage = { items: { id: string; subject: string; status: string; category: string; createdAt: string; college: { id: string; name: string } }[]; total: number }

const STATUS: Record<Status, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  healthy: { label: "Healthy", variant: "default" }, degraded: { label: "Degraded", variant: "secondary" }, unavailable: { label: "Unavailable", variant: "destructive" },
  unknown: { label: "Not checked", variant: "outline" }, not_configured: { label: "Not configured", variant: "outline" },
}
const trendCfg = { signIns: { label: "Sign-ins", color: "var(--chart-2)" }, applications: { label: "Applications", color: "var(--chart-3)" }, offers: { label: "Offers", color: "var(--chart-1)" }, institutionsRegistered: { label: "Institutions registered", color: "var(--chart-4)" } } satisfies ChartConfig
const aiCfg = { calls: { label: "Calls", color: "var(--chart-2)" }, failures: { label: "Failed", color: "var(--chart-3)" }, blocked: { label: "Blocked", color: "var(--chart-5)" } } satisfies ChartConfig
const QUICK: { href: string; label: string }[] = [{ href: "/platform/institutions", label: "Add an institution" }, { href: "/platform/support", label: "Review support requests" }, { href: "/platform/monitoring", label: "Check system health" }, { href: "/platform/ai", label: "Manage AI settings" }, { href: "/platform/audit", label: "Open the audit log" }]
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString())

/** One summary number with a link to the page that manages it. `value` is always read from the API, never typed in. */
function Stat({ title, value, note, href, icon: Icon, loading, error }: { title: string; value: React.ReactNode; note?: React.ReactNode; href: string; icon: React.ComponentType<{ className?: string }>; loading: boolean; error: boolean }) {
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardHeader>
          <CardDescription className="flex items-center gap-2"><Icon className="size-4 text-primary" />{title}</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">{loading ? <Skeleton className="h-8 w-20" /> : error ? <span className="text-base font-normal text-muted-foreground">Unavailable</span> : value}</CardTitle>
        </CardHeader>
        {note && !loading && !error ? <CardContent className="text-xs text-muted-foreground">{note}</CardContent> : null}
      </Card>
    </Link>
  )
}

function SectionError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return <Alert variant="destructive"><AlertTitle>Could not load {what}</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">The rest of the dashboard is unaffected.<Button size="sm" variant="outline" onClick={onRetry}>Try again</Button></AlertDescription></Alert>
}

export default function PlatformDashboard() {
  const s = useApi<Summary>("/api/platform/analytics")
  const h = useApi<Health>("/api/platform/monitoring")
  const ai = useApi<AiUsage>("/api/platform/ai/usage", { days: 7 })
  const open = useApi<SupportPage>("/api/platform/support", { status: "OPEN", pageSize: 5 })
  const prog = useApi<SupportPage>("/api/platform/support", { status: "IN_PROGRESS", pageSize: 1 })
  const adoption = useApi<Adoption>("/api/platform/analytics/modules")
  const sd = s.data
  const pending = (open.data?.total ?? 0) + (prog.data?.total ?? 0)

  return (
    <>
      <PageHeader title="Platform dashboard" description="A live summary of every institution on the platform. Every number comes from the platform's own data; select a card to open the page that manages it." actions={<Button variant="outline" size="sm" render={<Link href="/platform/institutions" />}>Manage institutions</Button>} />

      {s.error ? <SectionError what="the platform summary" onRetry={s.reload} /> : null}
      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Institutions" icon={Building2Icon} href="/platform/institutions" loading={s.loading && !sd} error={!!s.error} value={n(sd?.institutions.total)} note={sd ? `${n(sd.institutions.active)} active · ${n(sd.institutions.suspended)} suspended · ${n(sd.institutions.registeredLast30Days)} new in 30 days` : undefined} />
        <Stat title="Students" icon={GraduationCapIcon} href="/platform/analytics" loading={s.loading && !sd} error={!!s.error} value={n(sd?.users.students.total)} note={sd ? `${n(sd.users.students.active)} active` : undefined} />
        <Stat title="Staff and employers" icon={UsersIcon} href="/platform/analytics" loading={s.loading && !sd} error={!!s.error} value={n(sd ? sd.users.staff.total + sd.users.recruiters.total : undefined)} note={sd ? `${n(sd.users.staff.total)} staff · ${n(sd.users.recruiters.total)} employer contacts` : undefined} />
        <Stat title="Applications" icon={BriefcaseBusinessIcon} href="/platform/analytics" loading={s.loading && !sd} error={!!s.error} value={n(sd?.placement.applications.total)} note={sd ? `${n(sd.placement.drives.published)} published drives · ${n(sd.placement.offers.made)} ${sd.placement.offers.made === 1 ? "offer" : "offers"} · ${sd.placement.placementRate === null ? "no placement rate yet" : `${sd.placement.placementRate}% placed`}` : undefined} />
        <Stat title="System health" icon={HeartPulseIcon} href="/platform/monitoring" loading={h.loading && !h.data} error={!!h.error} value={h.data ? STATUS[h.data.overall.status].label : "—"} note={h.data ? `${h.data.overall.counts.healthy ?? 0} of ${h.data.components.length} checks healthy` : undefined} />
        <Stat title="AI calls, last 7 days" icon={BotIcon} href="/platform/ai" loading={ai.loading && !ai.data} error={!!ai.error} value={n(ai.data?.totals.calls)} note={ai.data ? `${n(ai.data.totals.blocked)} blocked · ${n(ai.data.totals.failures)} failed · ${n(ai.data.totals.rateLimited)} rate limited` : undefined} />
        <Stat title="Open support requests" icon={LifeBuoyIcon} href="/platform/support" loading={(open.loading && !open.data) || (prog.loading && !prog.data)} error={!!open.error || !!prog.error} value={n(open.data?.total)} note={prog.data ? `${n(prog.data.total)} in progress · ${n(pending)} need attention` : undefined} />
        <Stat title="Active users" icon={UsersIcon} href="/platform/analytics" loading={s.loading && !sd} error={!!s.error} value={n(sd?.users.activeUsers.distinctUsers)} note={sd ? `${n(sd.users.activeUsers.signIns)} sign-ins in the selected window` : undefined} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Platform activity</CardTitle><CardDescription>Sign-ins, applications, offers and new institutions over time, from recorded activity.</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/analytics" />}>Full analytics<ArrowRightIcon /></Button></CardAction></CardHeader>
          <CardContent>
            {s.error ? <SectionError what="the activity trend" onRetry={s.reload} /> : !sd ? <Skeleton className="h-56 w-full" /> : !sd.series.points.some((p) => p.signIns || p.applications || p.offers || p.institutionsRegistered) ? <p className="py-16 text-center text-sm text-muted-foreground">No activity recorded in this period yet.</p> : (
              <ChartContainer config={trendCfg} className="h-56 w-full">
                <LineChart data={sd.series.points}><CartesianGrid vertical={false} /><XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} width={32} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />
                  {(["signIns", "applications", "offers", "institutionsRegistered"] as const).map((k) => <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle><CardDescription>Common tasks</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">{QUICK.map((q) => <Button key={q.href} variant="outline" className="justify-between" render={<Link href={q.href} />}>{q.label}<ArrowRightIcon /></Button>)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>System health</CardTitle><CardDescription>{h.data ? `Checked ${fmtDateTime(h.data.checkedAt)}` : "Live checks"}</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/monitoring" />}>Details<ArrowRightIcon /></Button></CardAction></CardHeader>
          <CardContent>
            {h.error ? <SectionError what="system health" onRetry={h.reload} /> : !h.data ? <Skeleton className="h-28 w-full" /> : (
              <ul className="flex flex-col divide-y">
                {h.data.components.map((c) => <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{c.label}</span><Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge></li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent support requests</CardTitle><CardDescription>Newest open requests from institution administrators</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/support" />}>All requests<ArrowRightIcon /></Button></CardAction></CardHeader>
          <CardContent>
            {open.error ? <SectionError what="support requests" onRetry={open.reload} /> : !open.data ? <Skeleton className="h-28 w-full" /> : open.data.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No open requests.</p> : (
              <ul className="flex flex-col divide-y">
                {open.data.items.map((r) => <li key={r.id} className="flex flex-col gap-0.5 py-2 text-sm"><span className="truncate font-medium">{r.subject}</span><span className="text-xs text-muted-foreground">{r.college.name} · {titleCase(r.category)} · {fmtDateTime(r.createdAt)}</span></li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent administrator activity</CardTitle><CardDescription>Latest platform and institution administrative actions</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/audit" />}>Audit log<ArrowRightIcon /></Button></CardAction></CardHeader>
          <CardContent>
            {s.error ? <SectionError what="recent activity" onRetry={s.reload} /> : !sd ? <Skeleton className="h-28 w-full" /> : sd.recent.adminActivity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p> : (
              <ul className="flex flex-col divide-y">
                {sd.recent.adminActivity.slice(0, 6).map((a) => <li key={a.id} className="flex items-start justify-between gap-3 py-2 text-sm"><div className="min-w-0"><div className="truncate font-mono text-xs">{a.action}</div><div className="truncate text-xs text-muted-foreground">{a.actor?.email ?? "System"}{a.institution?.name ? ` · ${a.institution.name}` : ""} · {fmtDateTime(a.at)}</div></div><Badge variant={a.outcome === "success" ? "secondary" : "destructive"}>{titleCase(a.outcome)}</Badge></li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Newest institutions</CardTitle><CardDescription>Most recently registered</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/institutions" />}>All institutions<ArrowRightIcon /></Button></CardAction></CardHeader>
          <CardContent>
            {s.error ? <SectionError what="institutions" onRetry={s.reload} /> : !sd ? <Skeleton className="h-28 w-full" /> : sd.recent.registrations.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No institutions yet.</p> : (
              <ul className="flex flex-col divide-y">
                {sd.recent.registrations.slice(0, 6).map((i) => <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm"><Link href={`/platform/institutions/${i.id}`} className="min-w-0 truncate font-medium text-primary underline-offset-4 hover:underline">{i.name}</Link><span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{fmtDateTime(i.createdAt)}<Badge variant={i.isActive ? "default" : "secondary"}>{i.isActive ? "Active" : "Inactive"}</Badge></span></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>AI usage</CardTitle><CardDescription>Calls, failures and blocked requests per day over the last 7 days. Counts only: no prompts or answers are recorded here.</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/ai" />}>AI Centre<ArrowRightIcon /></Button></CardAction></CardHeader>
        <CardContent>
          {ai.error ? <SectionError what="AI usage" onRetry={ai.reload} /> : !ai.data ? <Skeleton className="h-48 w-full" /> : !ai.data.trend?.some((t) => t.calls || t.failures || t.blocked) ? <p className="py-12 text-center text-sm text-muted-foreground">No AI calls have been recorded in this period.</p> : (
            <ChartContainer config={aiCfg} className="h-48 w-full">
              <LineChart data={ai.data.trend}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} width={32} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />
                {(["calls", "failures", "blocked"] as const).map((k) => <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Module adoption</CardTitle><CardDescription>How many active institutions have each module switched on. Switching a module on is a choice, so a low number is not a fault.</CardDescription><CardAction><Button variant="ghost" size="sm" render={<Link href="/platform/institutions" />}>Manage in an institution<ArrowRightIcon /></Button></CardAction></CardHeader>
        <CardContent>
          {adoption.error ? <SectionError what="module adoption" onRetry={adoption.reload} /> : !adoption.data ? <Skeleton className="h-40 w-full" /> : adoption.data.activeInstitutions === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No active institutions yet.</p> : (
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {adoption.data.items.map((m) => (
                <li key={m.module} className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{titleCase(m.module).replace("Crm", "CRM")}</span><span className="text-xs tabular-nums text-muted-foreground">{m.enabled} of {m.total} institution{m.total === 1 ? "" : "s"}</span></div>
                  <Progress value={m.share ?? 0} aria-label={`${titleCase(m.module).replace("Crm", "CRM")} adoption`} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
