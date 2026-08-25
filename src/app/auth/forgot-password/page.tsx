"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email) {
      setError("Enter your email")
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })
      if (error) throw error
      setSent(true)
      toast.success("Reset link sent", { description: "Check your inbox" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reset link"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-[440px]">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>{sent ? "We sent a reset link to your email." : "Enter your email to receive a reset link."}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <Button variant="outline" className="w-full" onClick={() => router.push("/auth/login")}>
            Back to sign in
          </Button>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
              Send reset link
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
