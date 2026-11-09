"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase/browser"

type Invite = {
  institution: { name: string; logoUrl: string | null; brandColor: string | null }; name: string; emailHint: string; expiresAt: string
  assigned: { admissionNumber: string; campus: string | null; department: string; programme: string | null; branch: string | null; batch: string; admissionYear: number | null; graduationYear: number }
}
type State = { kind: "loading" } | { kind: "ready"; invite: Invite } | { kind: "bad"; expired: boolean; message: string }

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => null)
    if (res.ok) return { ok: true, data: json.data as T }
    // Validation errors carry the specific reasons (for example "Include a number"); show those instead of a bare "Invalid input".
    const reasons: string[] = Array.isArray(json?.error?.details) ? json.error.details.map((d: { message?: string }) => d.message).filter(Boolean) : []
    return { ok: false, code: json?.error?.code ?? "ERROR", message: reasons.length ? reasons.join(". ") : (json?.error?.message ?? "Something went wrong. Try again") }
  } catch { return { ok: false, code: "NETWORK", message: "Could not reach the server. Check your connection" } }
}

/**
 * The page an invitation email links to. The token sits in the URL fragment, so it never reaches a server log. It is read once,
 * removed from the address bar, and kept in memory only.
 */
export function AcceptInvitation() {
  const router = useRouter()
  const token = React.useRef<string | null>(null)
  const [state, setState] = React.useState<State>({ kind: "loading" })
  const [busy, setBusy] = React.useState(false)
  const [email, setEmail] = React.useState("")

  React.useEffect(() => {
    // React may run this effect twice in development. The first run removes the token from the address bar, so a second run
    // sees nothing and must not throw away what the first one read.
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t")
    if (t) window.history.replaceState(null, "", window.location.pathname)
    if (t) token.current = t
    const current = token.current
    void (async () => {
      if (!current) return setState({ kind: "bad", expired: false, message: "This invitation link is incomplete. Open the link from your email again." })
      const r = await post<Invite>("/api/invitations/lookup", { token: current })
      setState(r.ok ? { kind: "ready", invite: r.data } : { kind: "bad", expired: r.code === "INVITATION_EXPIRED", message: r.message })
    })()
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get("password"))
    if (password !== String(form.get("confirm"))) return void toast.error("The two passwords do not match")
    if (password.length < 8) return void toast.error("Use at least 8 characters")
    if (!/[A-Za-z]/.test(password)) return void toast.error("Your password needs at least one letter")
    if (!/\d/.test(password)) return void toast.error("Your password needs at least one number")
    setBusy(true)
    if (!token.current) { setBusy(false); return void setState({ kind: "bad", expired: false, message: "This invitation link is incomplete. Open the link from your email again." }) }
    const r = await post("/api/invitations/accept", { token: token.current, email: email.trim(), password })
    if (!r.ok) {
      setBusy(false)
      if (r.code === "INVITATION_INVALID" || r.code === "INVITATION_EXPIRED" || r.code === "INVITATION_LOCKED") return void setState({ kind: "bad", expired: r.code === "INVITATION_EXPIRED", message: r.message })
      return void toast.error(r.message)
    }
    token.current = null
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setBusy(false); toast.success("Your account is ready. Sign in to continue."); return void router.replace("/login") }
    router.replace("/student/onboarding")
  }

  if (state.kind === "loading") return <Skeleton className="h-96 rounded-xl" />
  if (state.kind === "bad") {
    return (
      <Card>
        <CardHeader className="text-center"><CardTitle className="text-xl">{state.expired ? "This invitation has expired" : "This invitation cannot be used"}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" render={<Link href="/login" />}>Go to sign in</Button>
        </CardContent>
      </Card>
    )
  }
  const { invite } = state
  const a = invite.assigned
  const rows: [string, string | number | null][] = [["Admission number", a.admissionNumber], ["Campus", a.campus], ["Department", a.department], ["Programme", a.programme], ["Branch", a.branch], ["Batch", a.batch], ["Admission year", a.admissionYear], ["Expected graduation", a.graduationYear]]
  return (
    <Card>
      <CardHeader className="text-center">
        {invite.institution.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={invite.institution.logoUrl} alt="" className="mx-auto mb-2 h-12 w-auto" />
        )}
        <CardTitle className="text-xl" style={invite.institution.brandColor ? { color: invite.institution.brandColor } : undefined}>{invite.institution.name}</CardTitle>
        <CardDescription>Welcome, {invite.name}. Confirm your email and choose a password to activate your account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
          {rows.filter(([, v]) => v !== null && v !== "").map(([k, v]) => (<React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></React.Fragment>))}
        </dl>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Your invited email address</FieldLabel>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={invite.emailHint} required />
              <FieldDescription>Type the address this invitation was sent to ({invite.emailHint}).</FieldDescription>
            </Field>
            <Field><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /><FieldDescription>At least 8 characters, with a letter and a number.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="confirm">Confirm password</FieldLabel><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
            <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Activate account</Button></Field>
          </FieldGroup>
        </form>
        <Alert><AlertTitle>One-time link</AlertTitle><AlertDescription>This link works once and expires on {new Date(invite.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. If you did not expect it, contact your institution.</AlertDescription></Alert>
      </CardContent>
    </Card>
  )
}
