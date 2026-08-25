import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { QuestsClient } from "@/components/quests/quests-client"
import { getQuestsPageData } from "@/lib/quests/queries"

export const metadata = { title: "Quests — Ascend" }

export default async function QuestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <PageTransition>
        <div className="text-sm text-muted-foreground">Not authenticated.</div>
      </PageTransition>
    )
  }

  const [{ data: skills }, data] = await Promise.all([
    supabase.from("skills").select("id, name").order("name"),
    getQuestsPageData(supabase, user.id),
  ])

  return (
    <PageTransition>
      <QuestsClient
        activeQuests={data.active}
        completedQuests={data.recentCompleted}
        level={data.level}
        todaysCount={data.todays.todays.length}
        completedTodayCount={data.todays.completedTodayCount}
        milestones={(data.current?.milestones ?? []).map((m) => ({ id: m.id, title: m.title }))}
        skills={(skills as { id: string; name: string }[]) ?? []}
      />
    </PageTransition>
  )
}
