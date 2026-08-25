"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { signUpSchema, type SignUpValues } from "@/lib/validations/auth"
import { mapAuthError } from "@/lib/supabase/auth-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GoogleButton } from "@/components/auth/google-button"

export function SignUpForm() {
  const router = useRouter()
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", displayName: "" },
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form

  async function onSubmit(values: SignUpValues) {
    setServerError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { display_name: values.displayName ?? "" },
        },
      })
      if (error) throw error
      if (data.user && !data.session) {
        setSuccess(true)
        toast.success("Check your email", { description: "We sent a confirmation link to " + values.email })
        return
      }
      toast.success("Account created")
      router.push("/dashboard")
      router.refresh()
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Sign up failed"
      const msg = mapAuthError(raw)
      setServerError(msg)
      toast.error(msg)
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-[440px]">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>We sent a confirmation link. Click it to finish creating your account, then sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => router.push("/auth/login")}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-[440px] shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Start your first phase today.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="displayName" placeholder="Ralph" autoComplete="name" {...register("displayName")} />
            {errors.displayName ? <p className="text-xs text-destructive">{errors.displayName.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...register("email")} />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" {...register("password")} />
            {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" placeholder="Repeat password" autoComplete="new-password" {...register("confirmPassword")} />
            {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword.message}</p> : null}
          </div>
          {serverError ? <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{serverError}</div> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            Create account
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
        <GoogleButton next="/dashboard" />
        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/auth/login" className="font-medium text-foreground hover:underline">
            Sign in
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
