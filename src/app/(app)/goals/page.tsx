import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Flag } from "lucide-react"
import { GoalCard } from "@/components/goals/goal-card"
import { GoalCreateDialog } from "@/components/goals/goal-create-dialog"
import { getGoalsOverview } from "@/lib/goals/queries"

export const metadata = { title: "Goals — Ascend" }
export const dynamic = "force-dynamic"

export default async function GoalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const goals = user ? await getGoalsOverview(supabase, user.id).catch(() => []) : []
  const activeCount = goals.filter((g) => g.status === "active").length

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.22em]">Goals</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              North stars with their own phase journeys.
              {goals.length > 0 && ` ${activeCount} active of ${goals.length}.`}
            </p>
          </div>
          <GoalCreateDialog />
        </div>

        {goals.length === 0 ? (
          <EmptyState
            icon={Flag}
            title="Your north star awaits"
            description="Set a meaningful goal, then give it a personalized journey of phases. Quests feed milestones, milestones complete phases, phases close the goal."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
