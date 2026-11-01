"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase/browser"

/** Reached from an invitation or reset email: Supabase puts a session in the link, and the person chooses a password. */
export function SetPasswordForm() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [ready, setReady] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    const sb = supabase()
    void sb.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data } = sb.auth.onAuthStateChange((_e, session) => { if (session) setReady(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get("password"))
    if (password !== String(form.get("confirm"))) { toast.error("The two passwords do not match"); return }
    setBusy(true)
    const { error } = await supabase().auth.updateUser({ password })
    if (error) { setBusy(false); toast.error(error.message); return }
    toast.success("Password saved")
    router.replace("/")
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Choose a password</CardTitle>
        <CardDescription>{ready === false ? "This link is invalid or has expired. Ask your placement cell for a new invitation." : "You will be signed in once it is saved."}</CardDescription>
      </CardHeader>
      {ready && (
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
                <FieldDescription>At least 8 characters.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              </Field>
              <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Save password</Button></Field>
            </FieldGroup>
          </form>
        </CardContent>
      )}
    </Card>
  )
}
