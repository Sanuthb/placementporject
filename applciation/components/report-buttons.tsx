"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { download, toastError } from "@/lib/web/api"

/** Download a report as PDF or Word. `path` is the report endpoint; the format is added here. */
export function ReportButtons({ path, query, label = "Download report", size = "sm" }: { path: string; query?: Record<string, string>; label?: string; size?: "sm" | "default" }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  async function get(format: "pdf" | "docx") {
    setBusy(format)
    try { await download(path, { query: { ...query, format } }) } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size={size} variant="outline" disabled={!!busy} onClick={() => get("pdf")}>{busy === "pdf" && <Spinner />}{label} (PDF)</Button>
      <Button size={size} variant="outline" disabled={!!busy} onClick={() => get("docx")}>{busy === "docx" && <Spinner />}Word</Button>
    </span>
  )
}
