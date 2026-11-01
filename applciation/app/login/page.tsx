import { Suspense } from "react"

import { AuthPage } from "@/components/auth-page"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <AuthPage>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthPage>
  )
}
