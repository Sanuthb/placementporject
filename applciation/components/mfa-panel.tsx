"use client"

import * as React from "react"
import { ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase/browser"

type Factor = { id: string; status: string; friendly_name?: string | null }
const clean = (v: string) => v.replace(/\s+/g, "")

/** The person's authenticator apps, read from Supabase. */
export function useFactors() {
  const [factors, setFactors] = React.useState<Factor[] | null>(null)
  const reload = React.useCallback(async () => {
    const { data } = await supabase().auth.mfa.listFactors()
    setFactors((data?.all ?? []) as Factor[])
  }, [])
  React.useEffect(() => { void Promise.resolve().then(reload) }, [reload])
  return { factors, verified: (factors ?? []).filter((f) => f.status === "verified"), reload }
}

/** Asks for the 6-digit code from the authenticator app and lifts the session to two-step. */
export function MfaChallenge({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: clean(code) })
    setBusy(false)
    if (error) return void toast.error(/invalid|expired/i.test(error.message) ? "That code is not right. Check the app and try the newest code" : error.message)
    onDone()
  }
  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="mfa-code">Code from your authenticator app</FieldLabel>
          <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} required />
          <FieldDescription>Open the app you set up for this account and type the current 6-digit code.</FieldDescription>
        </Field>
        <Field><Button type="submit" disabled={busy || clean(code).length < 6}>{busy && <Spinner />}Confirm</Button></Field>
      </FieldGroup>
    </form>
  )
}

/** Sets up a new authenticator app: shows a QR code and a typed key, then confirms with a first code. */
export function MfaSetup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = React.useState<{ id: string; qr: string; secret: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [code, setCode] = React.useState("")

  async function begin() {
    setBusy(true)
    const sb = supabase()
    // A half-finished earlier attempt would block a new one, so clear those first.
    const { data: list } = await sb.auth.mfa.listFactors()
    for (const f of (list?.all ?? []).filter((x) => x.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toLocaleDateString()}` })
    setBusy(false)
    if (error || !data) return void toast.error(error?.message ?? "Could not start setup. Two-step sign-in may not be switched on for this project")
    setStep({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (!step) return
    setBusy(true)
    const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId: step.id, code: clean(code) })
    setBusy(false)
    if (error) return void toast.error("That code is not right. Wait for the next code and try again")
    toast.success("Two-step sign-in is on")
    onDone()
  }

  if (!step) return <Button onClick={begin} disabled={busy}>{busy ? <Spinner /> : <ShieldCheckIcon />}Set up authenticator app</Button>
  return (
    <form onSubmit={confirm} className="flex max-w-sm flex-col gap-3">
      <p className="text-sm">1. Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) and scan this code.</p>
      <div role="img" aria-label="QR code for your authenticator app" className="w-fit rounded-lg border bg-white p-3"><QRCodeSVG value={`otpauth://totp/${encodeURIComponent("Placement Portal")}?secret=${step.secret}&issuer=${encodeURIComponent("Placement Portal")}`} size={168} /></div>
      <p className="text-xs text-muted-foreground">Cannot scan? Type this key into the app: <code className="break-all select-all">{step.secret}</code></p>
      <Field><FieldLabel htmlFor="setup-code">2. Enter the 6-digit code the app shows</FieldLabel><Input id="setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
      <div><Button type="submit" disabled={busy || clean(code).length < 6}>{busy && <Spinner />}Turn on</Button></div>
    </form>
  )
}

/** The security card: current state, set up, or remove (removing needs a fresh code, which Supabase enforces). */
export function MfaCard({ onChanged }: { onChanged?: () => void }) {
  const { factors, verified, reload } = useFactors()
  const [removing, setRemoving] = React.useState(false)
  if (!factors) return <Skeleton className="h-24" />
  const done = () => { void reload(); onChanged?.() }
  if (!verified.length) return <MfaSetup onDone={done} />
  return (
    <div className="flex flex-col gap-3">
      <Alert><ShieldCheckIcon /><AlertTitle>Two-step sign-in is on</AlertTitle><AlertDescription>You are asked for a code from your authenticator app each time you sign in.</AlertDescription></Alert>
      {removing ? (
        <div className="max-w-sm"><p className="pb-2 text-sm text-muted-foreground">Enter a current code to confirm you want to turn it off.</p>
          <MfaChallenge factorId={verified[0].id} onDone={async () => { const { error } = await supabase().auth.mfa.unenroll({ factorId: verified[0].id }); if (error) toast.error(error.message); else { toast.success("Two-step sign-in is off"); setRemoving(false); done() } }} /></div>
      ) : <div><Button variant="outline" onClick={() => setRemoving(true)}>Turn off two-step sign-in</Button></div>}
    </div>
  )
}
