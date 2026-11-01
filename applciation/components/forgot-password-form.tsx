"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase/browser"

export function ForgotPasswordForm() {
  const [busy, setBusy] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const email = String(new FormData(e.currentTarget).get("email"))
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/accept-invite` })
    setBusy(false)
    if (error) toast.error(error.message)
    else setSent(true)
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>{sent ? "If that email has an account, a reset link is on its way." : "We will email you a link to choose a new password."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {!sent && (
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
            )}
            <Field>
              {!sent && <Button type="submit" disabled={busy}>{busy && <Spinner />}Send reset link</Button>}
              <FieldDescription className="text-center"><Link href="/login">Back to sign in</Link></FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
