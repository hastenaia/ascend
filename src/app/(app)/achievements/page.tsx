import { PageTransition } from "@/components/feedback/page-transition"
import { createClient } from "@/lib/supabase/server"
import { getLevelSummary } from "@/lib/quests/queries"
import { AchievementGrid, type AchievementSignals } from "@/components/achievements/achievement-grid"

export const metadata = { title: "Achievements — Ascend" }

export default async function AchievementsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let signals: AchievementSignals = { completedQuests: 0, completedMilestones: 0, completedPhases: 0, bestStreak: 0, level: 1, lifetimeXp: 0 }

  if (user) {
    try {
      const [level, questsRes, milestonesRes, phasesRes, streakRes] = await Promise.all([
        getLevelSummary(supabase).catch(() => null),
        supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed"),
        supabase.from("milestones").select("id", { count: "exact", head: true }).eq("status", "completed").in("phase_id", (await supabase.from("phases").select("id").eq("user_id", user.id)).data?.map((p) => p.id) ?? []),
        supabase.from("phases").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed"),
        supabase.from("momentum").select("streak").order("streak", { ascending: false }).limit(1),
      ])
      signals = {
        completedQuests: questsRes.count ?? 0,
        completedMilestones: milestonesRes.count ?? 0,
        completedPhases: phasesRes.count ?? 0,
        bestStreak: (streakRes.data as { streak: number }[] | null)?.[0]?.streak ?? 0,
        level: level?.level ?? 1,
        lifetimeXp: level?.totalXp ?? 0,
      }
    } catch {}
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Achievements</h1>
          <p className="text-sm text-muted-foreground">Earned through real progress — never given. Locked ones show how close you are.</p>
        </div>
        <AchievementGrid signals={signals} />
      </div>
    </PageTransition>
  )
}
