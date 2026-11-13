"use client"

import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiClientError } from "@/lib/web/api"

/** Shown instead of any data when the API refuses the caller (not signed in, not a platform administrator, or the second step is missing). The API does the enforcing. */
export function denied(error: unknown) {
  if (!(error instanceof ApiClientError) || ![401, 403].includes(error.status)) return null
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert>
      <Button render={<Link href="/platform" />}>Go to platform sign-in</Button>
    </div>
  )
}
