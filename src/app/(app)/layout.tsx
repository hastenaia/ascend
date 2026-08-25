import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ensureProfile } from "@/lib/supabase/get-profile"
import { AppShell } from "@/components/layout/app-shell"

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already guards, but server check prevents flash
  if (!user) redirect("/auth/login")

  // Application-level fallback: ensures profile exists (covers trigger race)
  try {
    await ensureProfile(supabase, user)
  } catch {
    // non-fatal; individual pages handle gracefully
  }

  return <AppShell userEmail={user.email}>{children}</AppShell>
}
