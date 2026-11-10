"use client"

import * as React from "react"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { titleCase } from "@/lib/web/format"

export type ResourceValues = {
  title: string; description: string; category: string; type: string; url: string; subject: string; topic: string; skills: string; jobRoles: string
  companyName: string; difficulty: string; language: string; durationMin: string; expiresAt: string; visibility: string
}
export const BLANK: ResourceValues = { title: "", description: "", category: "OTHER", type: "WEBSITE", url: "", subject: "", topic: "", skills: "", jobRoles: "", companyName: "", difficulty: "", language: "English", durationMin: "", expiresAt: "", visibility: "ASSIGNED_ONLY" }

const opt = (xs: string[]) => xs.map((v) => ({ value: v, label: titleCase(v) }))
const CATS = opt(["APTITUDE", "CODING", "INTERVIEW", "SOFT_SKILLS", "OTHER"])
const TYPES = opt(["DOCUMENT", "IMAGE", "VIDEO", "AUDIO", "VIDEO_LINK", "WEBSITE", "QUESTION_BANK", "SAMPLE_TEST", "CODING_PRACTICE", "COMPANY_MATERIAL"])
const DIFF = [{ value: "", label: "Not set" }, ...opt(["EASY", "MEDIUM", "HARD"])]
const VIS = [{ value: "ASSIGNED_ONLY", label: "Only students it is assigned to" }, { value: "ALL_STUDENTS", label: "Every student (in the library)" }, { value: "STAFF_ONLY", label: "Staff only" }]
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)

/** The request body for create or update from the form values. Empty optional fields become null so they can be cleared. */
export function toBody(v: ResourceValues) {
  return {
    title: v.title, description: v.description || null, category: v.category, type: v.type, url: v.url.trim() || null, subject: v.subject || null, topic: v.topic || null,
    skills: list(v.skills), jobRoles: list(v.jobRoles), companyName: v.companyName || null, difficulty: v.difficulty || null, language: v.language || "English",
    durationMin: v.durationMin ? Number(v.durationMin) : null, expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null, visibility: v.visibility,
  }
}

/** The details of a resource: what it is, what it teaches, who it is for, and who may see it. AI can suggest the tags; staff decide. */
export function ResourceForm({ v, set, showFile, onFile }: { v: ResourceValues; set: (patch: Partial<ResourceValues>) => void; showFile?: boolean; onFile?: (f: File | null) => void }) {
  const [busy, setBusy] = React.useState(false)
  async function suggest() {
    setBusy(true)
    try {
      const r = await api<{ category: string | null; subject: string | null; topic: string | null; skills: string[]; jobRoles: string[]; difficulty: string | null }>("/api/resources/suggest-metadata", { method: "POST", body: { title: v.title, description: v.description || undefined } })
      set({ ...(r.category ? { category: r.category } : {}), ...(r.subject ? { subject: r.subject } : {}), ...(r.topic ? { topic: r.topic } : {}), ...(r.skills.length ? { skills: r.skills.join(", ") } : {}), ...(r.jobRoles.length ? { jobRoles: r.jobRoles.join(", ") } : {}), ...(r.difficulty ? { difficulty: r.difficulty } : {}) })
      toast.success("Suggestions filled in. Please check them")
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const t = (k: keyof ResourceValues, label: string, extra: Partial<React.ComponentProps<typeof Input>> = {}) => <Field><FieldLabel htmlFor={`r-${k}`}>{label}</FieldLabel><Input id={`r-${k}`} value={v[k]} onChange={(e) => set({ [k]: e.target.value })} {...extra} /></Field>
  return (
    <FieldGroup>
      {t("title", "Title", { required: true, minLength: 3 })}
      <Field><FieldLabel htmlFor="r-desc">Description</FieldLabel><Textarea id="r-desc" value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div><Button type="button" variant="outline" size="sm" disabled={busy || v.title.trim().length < 3} onClick={suggest}>{busy ? <Spinner /> : <SparklesIcon />}Suggest tags with AI</Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel>Type</FieldLabel><OptionSelect className="w-full" value={v.type} onChange={(x) => set({ type: x })} options={TYPES} placeholder="Type" /></Field>
        <Field><FieldLabel>Category</FieldLabel><OptionSelect className="w-full" value={v.category} onChange={(x) => set({ category: x })} options={CATS} placeholder="Category" /></Field>
      </div>
      {t("url", "Link (for websites, video links, practice sites)", { type: "url", placeholder: "https://" })}
      {showFile && <Field><FieldLabel htmlFor="r-file">Or upload a file (PDF, Word, PowerPoint, image, video up to 50 MB, audio)</FieldLabel><Input id="r-file" type="file" onChange={(e) => onFile?.(e.target.files?.[0] ?? null)} /></Field>}
      <div className="grid gap-3 sm:grid-cols-2">{t("subject", "Subject")}{t("topic", "Topic")}{t("skills", "Skills, separated by commas")}{t("jobRoles", "Job roles, separated by commas")}{t("companyName", "Company (if it is company material)")}{t("language", "Language")}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field><FieldLabel>Difficulty</FieldLabel><OptionSelect className="w-full" value={v.difficulty} onChange={(x) => set({ difficulty: x })} options={DIFF} placeholder="Not set" /></Field>
        {t("durationMin", "Time it takes (minutes)", { type: "number", min: 1 })}
        {t("expiresAt", "Expires on", { type: "date" })}
      </div>
      <Field><FieldLabel>Who can see it</FieldLabel><OptionSelect className="w-full" value={v.visibility} onChange={(x) => set({ visibility: x })} options={VIS} placeholder="Visibility" /></Field>
    </FieldGroup>
  )
}
