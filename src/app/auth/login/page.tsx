import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"
import { InlineSpinner } from "@/components/feedback/loading-state"

export const metadata = { title: "Sign in — Ascend" }

export default function LoginPage() {
  return (
    <Suspense fallback={<InlineSpinner label="Loading sign in..." />}>
      <LoginForm />
    </Suspense>
  )
}
