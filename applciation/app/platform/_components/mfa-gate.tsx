"use client"

import * as React from "react"
import { ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { supabase } from "@/lib/supabase/browser"

export type Me = { email: string; name: string; mfa: "setup_required" | "challenge" | "ok" }
const digits = (v: string) => v.replace(/\s+/g, "")

/** Hands the upgraded (two-step) session the server returned to the browser's Supabase client. */
async function adopt(t: { access_token: string; refresh_token: string }) {
  const { error } = await supabase().auth.setSession(t)
  if (error) throw error
}

function CodeForm({ label, onSubmit, busy }: { label: string; onSubmit: (code: string) => void; busy: boolean }) {
  const [code, setCode] = React.useState("")
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(digits(code)) }} className="flex max-w-sm flex-col gap-3">
      <Field><FieldLabel htmlFor="p-code">{label}</FieldLabel><Input id="p-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <div><Button type="submit" disabled={busy || digits(code).length < 6}>{busy && <Spinner />}Confirm</Button></div>
    </form>
  )
}

/** Mandatory two-step sign-in. The server refuses every platform call until this is complete; this screen only walks the person through it. */
export function MfaGate({ me, onDone }: { me: Me; onDone: () => void }) {
  const [step, setStep] = React.useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [factorId, setFactorId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (me.mfa !== "challenge") return
    void (async () => { const { data } = await supabase().auth.mfa.listFactors(); setFactorId(data?.totp?.[0]?.id ?? null) })()
  }, [me.mfa])

  async function begin() {
    setBusy(true)
    try { setStep(await api<{ factorId: string; qr: string; secret: string }>("/api/platform/mfa/enroll", { method: "POST" })) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function verify(id: string, code: string) {
    setBusy(true)
    try { await adopt(await api<{ access_token: string; refresh_token: string }>("/api/platform/mfa/verify", { method: "POST", body: { factorId: id, code } })); onDone() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <Alert><ShieldCheckIcon /><AlertTitle>{me.mfa === "challenge" ? "Confirm it is you" : "Set up two-step sign-in"}</AlertTitle><AlertDescription>{me.mfa === "challenge" ? "Enter the code from your authenticator app to continue." : "Platform administrators must use an authenticator app. You cannot continue until it is set up."}</AlertDescription></Alert>
      {me.mfa === "challenge" ? (factorId ? <CodeForm label="Code from your authenticator app" busy={busy} onSubmit={(c) => verify(factorId, c)} /> : <Skeleton className="h-20" />) : !step ? (
        <div><Button onClick={begin} disabled={busy}>{busy ? <Spinner /> : <ShieldCheckIcon />}Set up authenticator app</Button></div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Scan this code with an authenticator app, then enter the 6-digit code it shows.</p>
          {/* Drawn here from the setup key: the image the Auth server returns is not reliably shown by every browser. */}
          <div role="img" aria-label="QR code for your authenticator app" className="w-fit rounded-lg border bg-white p-3"><QRCodeSVG value={`otpauth://totp/${encodeURIComponent(`Placement Platform:${me.email}`)}?secret=${step.secret}&issuer=${encodeURIComponent("Placement Platform")}`} size={168} /></div>
          <p className="text-xs text-muted-foreground">Cannot scan? Type this key: <code className="break-all select-all">{step.secret}</code></p>
          <CodeForm label="Code from the app" busy={busy} onSubmit={(c) => verify(step.factorId, c)} />
        </div>
      )}
    </div>
  )
}

export function RemoveMfa({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  async function remove(code: string) {
    setBusy(true)
    try { await api("/api/platform/mfa", { method: "DELETE", body: { code } }); toast.success("Authenticator removed. Set up a new one to continue."); onDone() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return open ? (
    <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">Removing it locks platform access until you set up a new authenticator. Enter a current code to confirm.</p><CodeForm label="Current code" busy={busy} onSubmit={remove} /></div>
  ) : <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Remove authenticator</Button>
}

