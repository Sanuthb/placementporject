"use client"

import { MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Prog = { id: string; title: string; goal: string; delivery: string; status: string; journey: { name: string } | null; _count: { members: number } }
type Journey = { id: string; name: string; description: string | null; steps: unknown[] }
const STEP_TYPES = ["COURSE", "RESOURCE", "ASSIGNMENT", "ASSESSMENT"]

/** "Title | TYPE | https://link | hours" per line, link and hours optional. */
function parseSteps(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [title, type, url, hours] = l.split("|").map((x) => x.trim())
    return { title, type: STEP_TYPES.includes((type ?? "").toUpperCase()) ? type.toUpperCase() : "RESOURCE", ...(url ? { url } : {}), ...(hours ? { hours: Number(hours) } : {}) }
  })
}

export default function LearningPage() {
  const lk = useLookups()
  const journeys = useApi<Journey[]>("/api/learning/journeys")
  return (
    <Tabs defaultValue="programmes">
      <TabsList><TabsTrigger value="programmes">Programmes</TabsTrigger><TabsTrigger value="journeys">Learning journeys</TabsTrigger></TabsList>
      <TabsContent value="programmes">
        <MasterTab<Prog> endpoint="/api/learning/programmes" addLabel="Create programme"
          fields={[{ name: "title", label: "Title" }, { name: "goal", label: "Goal (for example Aptitude prep)" }, { name: "delivery", label: "Delivery", type: "select", required: true, options: [{ value: "IN_HOUSE", label: "In-house" }, { value: "PARTNER", label: "Training partner" }] }, { name: "partnerName", label: "Partner name", required: false }, { name: "journeyId", label: "Learning journey", type: "select", required: false, options: (journeys.data ?? []).map((j) => ({ value: j.id, label: j.name })) }, { name: "departmentId", label: "Enrol a department", type: "select", required: false, options: lk.departments }, { name: "batchId", label: "Enrol a batch", type: "select", required: false, options: lk.batches }]}
          toBody={(v) => Object.fromEntries(Object.entries({ title: v.title, goal: v.goal, delivery: v.delivery, partnerName: v.partnerName, journeyId: v.journeyId, departmentId: v.departmentId, batchId: v.batchId }).filter(([, x]) => x))}
          columns={[{ label: "Programme", cell: (r) => <>{r.title}<div className="text-xs text-muted-foreground">{r.goal}</div></> }, { label: "Delivery", cell: (r) => titleCase(r.delivery) }, { label: "Journey", cell: (r) => r.journey?.name ?? "—" }, { label: "Members", cell: (r) => r._count.members }, { label: "Status", cell: (r) => <Badge variant="outline">{titleCase(r.status)}</Badge> }]} />
      </TabsContent>
      <TabsContent value="journeys">
        <MasterTab<Journey> endpoint="/api/learning/journeys" addLabel="Create journey"
          fields={[{ name: "name", label: "Name" }, { name: "description", label: "Description", required: false }, { name: "steps", label: "Steps, one per line: Title | COURSE, RESOURCE, ASSIGNMENT or ASSESSMENT | link | hours", type: "textarea" }]}
          toBody={(v) => ({ name: v.name, ...(v.description ? { description: v.description } : {}), steps: parseSteps(String(v.steps)) })}
          columns={[{ label: "Journey", cell: (r) => <>{r.name}<div className="text-xs text-muted-foreground">{r.description}</div></> }, { label: "Steps", cell: (r) => r.steps.length }]} />
      </TabsContent>
    </Tabs>
  )
}
