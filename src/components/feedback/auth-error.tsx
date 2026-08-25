"use client"
import { useSearchParams } from "next/navigation"
import { mapAuthError } from "@/lib/supabase/auth-errors"

export function AuthErrorBanner() {
  const sp = useSearchParams()
  const raw = sp.get("error_description") || sp.get("error") || sp.get("message")
  if (!raw) return null
  const msg = mapAuthError(raw)
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
      {msg}
    </div>
  )
}
