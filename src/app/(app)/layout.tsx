import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ensureProfile } from "@/lib/supabase/get-profile"
import { AppShell } from "@/components/layout/app-shell"
import { AchievementUnlockOverlay } from "@/components/achievements/achievement-unlock-overlay"
import { getLevelSummary } from "@/lib/quests/queries"

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already guards, but server check prevents flash
  if (!user) redirect("/auth/login")

  // Application-level fallback: ensures profile exists (covers trigger race)
  let displayName: string | null = null
  try {
    const profile = await ensureProfile(supabase, user)
    displayName = profile?.display_name ?? null
  } catch {
    // non-fatal; individual pages handle gracefully
  }

  // Level identity for the chrome (RLS-scoped; safe to fail soft)
  let levelChip: { level: number; progressPct: number; xpToNext: number } | null = null
  try {
    const lvl = await getLevelSummary(supabase)
    levelChip = { level: lvl.level, progressPct: lvl.progressPct, xpToNext: lvl.xpToNext }
  } catch {}

  return (
    <AppShell userEmail={user.email} displayName={displayName} level={levelChip}>
      <AchievementUnlockOverlay />
      {children}
    </AppShell>
  )
}
