"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase/browser"

export function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get("next")
  const [busy, setBusy] = React.useState(false)
  const [mode, setMode] = React.useState<"password" | "code">("password")
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [code, setCode] = React.useState("")
  const go = () => router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/")

  /** Sends a one-time code and sign-in link to the address. Only existing accounts can use it; nobody is created. */
  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setSent(true); toast.success("Check your email for a code and a sign-in link")
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })
    if (error) { setBusy(false); toast.error(error.message); return }
    go()
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    const { error } = await supabase().auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) })
    if (error) { setBusy(false); toast.error(error.message); return }
    // Only follow same-site paths, never an external address.
    go()
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in with your college email</CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "code" ? (
          <form onSubmit={sent ? verify : sendCode}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="otp-email">Email</FieldLabel>
                <Input id="otp-email" type="email" autoComplete="email" placeholder="name@college.edu" required disabled={sent} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              {sent && (
                <Field>
                  <FieldLabel htmlFor="otp-code">Code from the email</FieldLabel>
                  <Input id="otp-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
                  <FieldDescription>You can also just open the link in the same email.</FieldDescription>
                </Field>
              )}
              <Field>
                <Button type="submit" disabled={busy}>{busy && <Spinner />}{sent ? "Sign in" : "Email me a code"}</Button>
                <Button type="button" variant="ghost" onClick={() => { setMode("password"); setSent(false); setCode("") }}>Use my password instead</Button>
              </Field>
            </FieldGroup>
          </form>
        ) : (
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="name@college.edu" required />
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link href="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">Forgot your password?</Link>
              </div>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Field>
              <Button type="submit" disabled={busy}>{busy && <Spinner />}Sign in</Button>
              <Button type="button" variant="ghost" onClick={() => setMode("code")}>Email me a one-time code instead</Button>
              <FieldDescription className="text-center">Accounts are created by invitation from your placement cell.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
        )}
      </CardContent>
    </Card>
  )
}
