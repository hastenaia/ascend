import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ensureProfile } from "@/lib/supabase/get-profile"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  if (error) {
    const msg = errorDescription || error
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(msg)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(exchangeError.message)}`)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      try {
        await ensureProfile(supabase, user)
      } catch {
        // non-fatal: dashboard will retry ensureProfile
      }
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  // Handle hash fragment flow or missing code: check if session already established
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await ensureProfile(supabase, user)
      return NextResponse.redirect(`${origin}${next}`)
    }
  } catch {}

  return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent("callback_failed")}`)
}
