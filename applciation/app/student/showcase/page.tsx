"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type S = { enabled: boolean; link: string | null; headline?: string | null; showCgpa?: boolean; showContact?: boolean; views?: number }

export default function ShowcasePage() {
  const { data, reload } = useApi<S>("/api/student/showcase")
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [cgpa, setCgpa] = React.useState<boolean | null>(null)
  const [contact, setContact] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api("/api/student/showcase", { method: "PUT", body: { enabled: enabled ?? data!.enabled, headline: String(f.get("headline") ?? ""), showCgpa: cgpa ?? !!data!.showCgpa, showContact: contact ?? !!data!.showContact } }); toast.success("Saved"); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  async function rotate() { try { await api("/api/student/showcase/rotate", { method: "POST" }); toast.success("New link created. The old one no longer works."); reload() } catch (e) { toastError(e) } }
  const link = data.link ? `${window.location.origin}${data.link}` : null
  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Shareable profile</CardTitle><CardDescription>A link you can send to employers. It shows your verified details and you choose what is visible.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <label className="flex items-center gap-2 text-sm"><Switch checked={enabled ?? data.enabled} onCheckedChange={setEnabled} />Turn on my shareable profile</label>
            <Field><FieldLabel htmlFor="headline">Headline</FieldLabel><Input id="headline" name="headline" defaultValue={data.headline ?? ""} maxLength={160} /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={cgpa ?? !!data.showCgpa} onCheckedChange={setCgpa} />Show my CGPA</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={contact ?? !!data.showContact} onCheckedChange={setContact} />Show my email and phone</label>
            {link && <Field><FieldLabel>Your link</FieldLabel><Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /><FieldDescription>{data.views ?? 0} views</FieldDescription></Field>}
            <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button>{data.enabled && <Button type="button" variant="outline" onClick={rotate}>Make a new link</Button>}</div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
