import { PageTransition } from "@/components/feedback/page-transition"
import { createClient } from "@/lib/supabase/server"
import { AchievementGrid } from "@/components/achievements/achievement-grid"
import { getAchievementsOverview } from "@/lib/achievements/queries"

export const metadata = { title: "Achievements — Ascend" }

export default async function AchievementsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const views = user ? await getAchievementsOverview(supabase, user.id).then((r) => r.views).catch(() => []) : []
  const unlockedCount = views.filter((v) => v.state === "unlocked").length

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-[0.22em]">Achievements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Earned through real progress — never given.
            {views.length > 0 && ` ${unlockedCount} of ${views.length} unlocked.`}
          </p>
        </div>
        <AchievementGrid views={views} />
      </div>
    </PageTransition>
  )
}
