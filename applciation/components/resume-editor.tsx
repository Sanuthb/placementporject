"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { ResumePreview } from "@/components/resume-preview"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { TEMPLATE_LABEL, TEMPLATES, type ResumeDoc } from "@/lib/resumeEngine"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Detail = {
  id: string; number: number; title: string; kind: string; template: string; targetCompany: string | null; targetRole: string | null; targetText: string | null
  edits: { summary?: string; headline?: string; hide?: string[]; text?: Record<string, string> }; verifiedOnly: boolean; markEvidence: boolean; status: string; isPrimary: boolean; approvedAt: string | null
  document: ResumeDoc; warnings: string[]; changes: { added: { key: string; label: string }[]; removed: number }; match: { matched: string[]; missing: string[] } | null
  items: { projects: { key: string; label: string }[]; internships: { key: string; label: string }[]; achievements: { key: string; label: string }[]; skills: { key: string; label: string; level: string }[]; assessments: { key: string; label: string }[] } | null
}
type Suggestion = { text?: string; bullets?: string[]; added: string[] }

/** The resume editor: choose what goes in, reword it, get AI help that cannot add facts, see the result live, then approve and download. */
export function ResumeEditor({ id }: { id: string }) {
  const { data: d, reload } = useApi<Detail>(`/api/student/resumes/${id}`)
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [f, setF] = React.useState<{ title: string; template: string; company: string; role: string; jd: string; verifiedOnly: boolean; mark: boolean; summary: string; headline: string } | null>(null)
  const [hide, setHide] = React.useState<Set<string>>(new Set())
  const [texts, setTexts] = React.useState<Record<string, string>>({})
  const [sug, setSug] = React.useState<{ key: string; s: Suggestion } | null>(null)
  const filled = React.useRef(false)
  React.useEffect(() => {
    if (d && (!filled.current || d.status !== "DRAFT")) { filled.current = true; setF({ title: d.title, template: d.template, company: d.targetCompany ?? "", role: d.targetRole ?? "", jd: d.targetText ?? "", verifiedOnly: d.verifiedOnly, mark: d.markEvidence, summary: d.edits.summary ?? "", headline: d.edits.headline ?? "" }); setHide(new Set(d.edits.hide ?? [])); setTexts(d.edits.text ?? {}) }
  }, [d])
  if (!d || !f) return <Skeleton className="h-96" />
  const draft = d.status === "DRAFT"
  async function run(key: string, fn: () => Promise<unknown>, ok?: string) { setBusy(key); try { await fn(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const payload = () => ({ title: f!.title, template: f!.template, targetCompany: f!.company || null, targetRole: f!.role || null, targetText: f!.jd || null, verifiedOnly: f!.verifiedOnly, markEvidence: f!.mark, edits: { summary: f!.summary || undefined, headline: f!.headline || undefined, hide: [...hide], text: Object.fromEntries(Object.entries(texts).filter(([, v]) => v.trim())) } })
  const persist = () => api(`/api/student/resumes/${id}`, { method: "PATCH", body: payload() })
  const save = () => run("save", persist, "Saved")
  const toggle = (k: string) => setHide((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  async function ask(mode: "summary" | "bullets", itemKey?: string) {
    setBusy(`ai-${itemKey ?? mode}`)
    try { await persist(); const s = await api<Suggestion & { text?: string }>(`/api/student/resumes/${id}/suggest`, { method: "POST", body: { mode, itemKey } }); setSug({ key: itemKey ?? "summary", s }) } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  const dl = (fmt: string) => download(`/api/student/resumes/${id}/export`, { query: { format: fmt } }).catch(toastError)

  const checkRow = (key: string, label: string, extra?: React.ReactNode) => <label key={key} className="flex items-center gap-2"><Checkbox checked={!hide.has(key)} disabled={!draft} onCheckedChange={() => toggle(key)} /><span className="flex-1">{label}</span>{extra}</label>
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold">{d.title}</h1><Badge variant={draft ? "outline" : "default"}>{titleCase(d.status)}</Badge>{d.isPrimary && <Badge variant="secondary">Main resume</Badge>}<Badge variant="outline">{titleCase(d.kind)}</Badge></div>
        {d.changes.added.length > 0 && <Alert><AlertTitle>{d.changes.added.length} new item{d.changes.added.length === 1 ? "" : "s"} in your profile since this was approved</AlertTitle><AlertDescription>{d.changes.added.slice(0, 6).map((x) => x.label).join("; ")}. Make a copy to include them.</AlertDescription></Alert>}
        {!draft && <Alert><AlertTitle>Approved on {fmtDate(d.approvedAt)}</AlertTitle><AlertDescription>It cannot change. Make a copy to edit it.</AlertDescription></Alert>}

        {draft && (
          <Card size="sm"><CardHeader><CardTitle>Settings</CardTitle></CardHeader><CardContent>
            <FieldGroup>
              <Field><FieldLabel htmlFor="r-title">Name of this resume</FieldLabel><Input id="r-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
              <Field><FieldLabel>Template</FieldLabel><OptionSelect className="w-full" value={f.template} onChange={(v) => setF({ ...f, template: v })} options={TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_LABEL[t] }))} placeholder="Template" /></Field>
              {(d.kind === "COMPANY_SPECIFIC" || d.targetText || d.targetRole) && <>
                <Field><FieldLabel htmlFor="r-co">Company</FieldLabel><Input id="r-co" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="r-ro">Role</FieldLabel><Input id="r-ro" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="r-jd">Job description or the skills wanted</FieldLabel><Textarea id="r-jd" className="min-h-24" value={f.jd} onChange={(e) => setF({ ...f, jd: e.target.value })} /></Field>
              </>}
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.verifiedOnly} onCheckedChange={(v) => setF({ ...f, verifiedOnly: v })} />Only what staff checked or college records back</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.mark} onCheckedChange={(v) => setF({ ...f, mark: v })} />Mark skills backed by college records with *</label>
            </FieldGroup></CardContent></Card>
        )}

        {draft && (
          <Card size="sm"><CardHeader><CardTitle>Summary</CardTitle><CardDescription>Leave empty for a plain summary made from your records, or write your own.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">
            <Textarea aria-label="Summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder={d.document.sections.find((s) => s.id === "summary")?.text ?? ""} />
            <div><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => ask("summary")}>{busy === "ai-summary" ? <Spinner /> : <SparklesIcon />}Suggest a summary</Button></div>
            {sug?.key === "summary" && <Suggest s={sug.s} onUse={() => { setF({ ...f, summary: sug.s.text ?? "" }); setSug(null) }} onClose={() => setSug(null)} />}
          </CardContent></Card>
        )}

        {draft && d.items && (
          <Card size="sm"><CardHeader><CardTitle>What goes in</CardTitle><CardDescription>Untick anything to leave it out of this resume only.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 text-sm">
            {d.items.projects.length > 0 && <div className="flex flex-col gap-2"><span className="font-medium">Projects</span>{d.items.projects.map((p) => <div key={p.key} className="flex flex-col gap-1">{checkRow(p.key, p.label, <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => ask("bullets", p.key)}>{busy === `ai-${p.key}` ? <Spinner /> : <SparklesIcon />}Reword</Button>)}<Textarea aria-label={`Your wording for ${p.label}`} className="min-h-14" placeholder="Reword this project in your own words (optional)" value={texts[p.key] ?? ""} onChange={(e) => setTexts((t) => ({ ...t, [p.key]: e.target.value }))} />{sug?.key === p.key && <Suggest s={sug.s} onUse={() => { setTexts((t) => ({ ...t, [p.key]: (sug.s.bullets ?? []).join("\n") })); setSug(null) }} onClose={() => setSug(null)} />}</div>)}</div>}
            {d.items.internships.length > 0 && <div className="flex flex-col gap-2"><span className="font-medium">Internships</span>{d.items.internships.map((p) => <div key={p.key} className="flex flex-col gap-1">{checkRow(p.key, p.label, <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => ask("bullets", p.key)}>{busy === `ai-${p.key}` ? <Spinner /> : <SparklesIcon />}Reword</Button>)}{sug?.key === p.key && <Suggest s={sug.s} onUse={() => { setTexts((t) => ({ ...t, [p.key]: (sug.s.bullets ?? []).join("\n") })); setSug(null) }} onClose={() => setSug(null)} />}</div>)}</div>}
            {d.items.achievements.length > 0 && <div className="flex flex-col gap-1"><span className="font-medium">Achievements</span>{d.items.achievements.map((p) => checkRow(p.key, p.label))}</div>}
            {d.items.assessments.length > 0 && <div className="flex flex-col gap-1"><span className="font-medium">Assessments</span>{d.items.assessments.map((p) => checkRow(p.key, p.label))}</div>}
            {d.items.skills.length > 0 && <div className="flex flex-col gap-1"><span className="font-medium">Skills</span><div className="flex flex-wrap gap-x-4 gap-y-1">{d.items.skills.map((p) => checkRow(p.key, p.label, <Badge variant={p.level === "CLAIMED" ? "outline" : "secondary"}>{p.level === "VERIFIED" ? "verified" : p.level === "EVIDENCED" ? "backed" : "claimed"}</Badge>))}</div></div>}
          </CardContent></Card>
        )}

        {d.match && <Card size="sm"><CardHeader><CardTitle>Match with the job</CardTitle><CardDescription>Words from the job description. Only add skills you really have: the resume leaves out what your records do not support.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 text-sm"><div className="flex flex-wrap gap-1">{d.match.matched.map((k) => <Badge key={k}>{k}</Badge>)}</div><div className="flex flex-wrap gap-1">{d.match.missing.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}</div></CardContent></Card>}
        {d.warnings.length > 0 && <Card size="sm"><CardHeader><CardTitle>Before you send it</CardTitle></CardHeader><CardContent><ul className="list-disc pl-5 text-sm text-muted-foreground">{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul></CardContent></Card>}

        <div className="flex flex-wrap gap-2">
          {draft && <Button disabled={!!busy} onClick={save}>{busy === "save" && <Spinner />}Save</Button>}
          {draft && <Button variant="outline" disabled={!!busy} onClick={() => run("approve", async () => { await persist(); await api(`/api/student/resumes/${id}/approve`, { method: "POST" }) }, "Approved. This version is now frozen")}>Approve this version</Button>}
          <Button variant="outline" onClick={() => dl("pdf")}>Download PDF</Button><Button variant="outline" onClick={() => dl("docx")}>Download Word</Button>
          {!draft && <Button onClick={() => run("copy", async () => { const r = await api<{ id: string }>(`/api/student/resumes/${id}/duplicate`, { method: "POST" }); router.push(`/student/resume/${r.id}`) })}>Make a copy to edit</Button>}
          {!draft && !d.isPrimary && d.status === "APPROVED" && <Button variant="outline" onClick={() => run("primary", () => api(`/api/student/resumes/${id}/primary`, { method: "POST" }), "This is now your main resume")}>Make it my main resume</Button>}
        </div>
      </div>
      <div className="flex flex-col gap-2"><p className="text-xs text-muted-foreground">Preview of {draft ? "your draft (save to refresh it)" : "the approved resume"}. {d.document.sections.length} sections.</p><ResumePreview doc={d.document} mark={d.markEvidence && d.template !== "ATS"} /></div>
    </div>
  )
}

function Suggest({ s, onUse, onClose }: { s: Suggestion; onUse: () => void; onClose: () => void }) {
  return (
    <Alert><AlertTitle>Suggestion</AlertTitle><AlertDescription className="flex flex-col gap-2">
      {s.text ? <p>{s.text}</p> : <ul className="list-disc pl-4">{(s.bullets ?? []).map((b, i) => <li key={i}>{b}</li>)}</ul>}
      {s.added.length > 0 && <p className="text-destructive">It mentions things your records do not contain: {s.added.join(", ")}. Check them, or do not use this.</p>}
      <div className="flex gap-2"><Button type="button" size="sm" onClick={onUse}>Use it</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Dismiss</Button></div>
    </AlertDescription></Alert>
  )
}
