"use client"
import * as React from "react"
import { createClient } from "@/lib/supabase/client"
import { mapAuthError } from "@/lib/supabase/auth-errors"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function GoogleButton({ next = "/dashboard", disabledReason }: { next?: string; disabledReason?: string }) {
  const [loading, setLoading] = React.useState(false)

  async function handle() {
    if (disabledReason) {
      toast.message("Google OAuth not configured yet", { description: disabledReason })
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      })
      if (error) throw error
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Google sign-in failed"
      toast.error(mapAuthError(raw))
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" className="w-full" onClick={handle} disabled={loading} type="button">
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.02 5.02 0 0 1-2.18 3.3v2.74h3.53c2.06-1.9 3.29-4.7 3.29-8.05Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-0.99 7.28-2.68l-3.53-2.74c-0.98 0.66-2.23 1.06-3.75 1.06-2.88 0-5.32-1.95-6.19-4.57H1.18v2.87C2.99 21.03 7.27 23 12 23Z" />
          <path fill="#FBBC05" d="M5.81 14.07A6.97 6.97 0 0 1 5.44 12c0-.71.12-1.4.37-2.07V7.06H1.18A11 11 0 0 0 0 12c0 1.78.43 3.45 1.18 4.94l4.63-2.87Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.27 1 2.99 2.97 1.18 7.06l4.63 2.87C6.68 7.31 9.12 5.38 12 5.38Z" />
        </svg>
      )}
      Continue with Google
    </Button>
  )
}
