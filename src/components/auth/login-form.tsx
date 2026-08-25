"use client"
import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginValues } from "@/lib/validations/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GoogleButton } from "@/components/auth/google-button"

export function LoginForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const next = sp.get("next") || "/dashboard"
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
      if (error) throw error
      toast.success("Welcome back")
      router.push(next)
      router.refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign in failed"
      setServerError(msg)
      toast.error(msg)
    }
  }

  return (
    <Card className="w-full max-w-[440px] shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue your ascent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...register("email")} />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <a href="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot?
              </a>
            </div>
            <Input id="password" type="password" placeholder="••••••••" autoComplete="current-password" {...register("password")} />
            {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
          </div>
          {serverError ? <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{serverError}</div> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            Sign in
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <GoogleButton next={next} />
        <p className="text-center text-xs text-muted-foreground">
          No account yet?{" "}
          <a href="/auth/sign-up" className="font-medium text-foreground hover:underline">
            Create account
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
