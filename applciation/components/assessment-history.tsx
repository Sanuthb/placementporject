"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { categoryLabel } from "@/lib/reassessment"

type Point = { attemptNumber: number; at: string; percent: number; status: string }
type Test = { scheduleId: string; title: string; category: string; isPractice: boolean; isBaseline: boolean; attempts: Point[]; latest: number | null; sinceFirst: number | null; sincePrevious: number | null; direction: "up" | "down" | "same" | null }
type OwnPersonality = { attempts: { attemptNumber: number; at: string; isCurrent: boolean; aptitude: number; traits: Record<string, number> }[]; aptitudeTrend: { sinceFirst: number | null } }
type History = { tests: Test[]; personality: OwnPersonality | { attempts: number; lastAt: string | null } | null }

const signed = (n: number) => `${n > 0 ? "+" : ""}${n} pts`

function Change({ t }: { t: Test }) {
  if (t.sincePrevious == null) return <span className="text-muted-foreground">—</span>
  return <Badge variant={t.direction === "down" ? "destructive" : t.direction === "up" ? "default" : "secondary"}>{signed(t.sincePrevious)}</Badge>
}

/** Results over time: each test with every attempt and the change since the previous one. Staff get test results only (personality stays private). */
export function AssessmentHistory({ endpoint, title = "Your results over time" }: { endpoint: string; title?: string }) {
  const { data, loading } = useApi<History>(endpoint)
  if (loading && !data) return <Skeleton className="h-40 rounded-xl" />
  if (!data) return null
  const own = data.personality && "aptitudeTrend" in data.personality ? data.personality : null
  const staffPsych = data.personality && !("aptitudeTrend" in data.personality) ? data.personality : null
  const categories = [...new Set(data.tests.map((t) => t.category))]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Every attempt is kept. Where a test can be retaken, the newest attempt is the one that counts.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.tests.length === 0 && !own?.attempts.length && <p className="text-sm text-muted-foreground">No finished assessments yet.</p>}
        {categories.map((c) => (
          <div key={c} className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{categoryLabel(c)}</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Test</TableHead><TableHead>Attempts</TableHead><TableHead className="text-right">Latest</TableHead><TableHead className="text-right">Change</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.tests.filter((t) => t.category === c).map((t) => (
                  <TableRow key={t.scheduleId}>
                    <TableCell>{t.title} {t.isPractice && <Badge variant="outline">Practice</Badge>} {t.isBaseline && <Badge variant="secondary">Baseline</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.attempts.map((a) => `${a.percent}% (${fmtDate(a.at)})`).join(" → ")}</TableCell>
                    <TableCell className="text-right font-medium">{t.latest != null ? `${t.latest}%` : "—"}</TableCell>
                    <TableCell className="text-right"><Change t={t} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
        {own && own.attempts.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Personality and aptitude (only you can see this)</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Taken</TableHead><TableHead className="text-right">Aptitude</TableHead>{Object.keys(own.attempts[0].traits).map((k) => <TableHead key={k} className="text-right">{titleCase(k)}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {own.attempts.map((a) => (
                  <TableRow key={a.attemptNumber}>
                    <TableCell>{fmtDate(a.at)} {a.isCurrent && <Badge variant="secondary">Current</Badge>}</TableCell>
                    <TableCell className="text-right">{a.aptitude}%</TableCell>
                    {Object.values(a.traits).map((v, i) => <TableCell key={i} className="text-right">{v}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">Personality scores describe preferences; they are not better or worse, and they never decide eligibility.</p>
          </div>
        )}
        {staffPsych && <p className="text-sm text-muted-foreground">Personality assessment: {staffPsych.attempts ? `taken ${staffPsych.attempts} time${staffPsych.attempts > 1 ? "s" : ""}, last on ${fmtDate(staffPsych.lastAt)}. Individual results open only through Personality tests, if the student shares them (each view is logged).` : "not taken yet."}</p>}
      </CardContent>
    </Card>
  )
}
