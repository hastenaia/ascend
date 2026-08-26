"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, ListChecks, Target, Wand2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { toggleMilestone } from "@/lib/phases/actions"
import { completeQuestAction } from "@/lib/quests/actions"
import { announceUnlockedAchievements } from "@/lib/achievements/events"
import type { JourneyBlueprint } from "@/lib/goals/queries"
import type { GoalDetailData } from "@/lib/goals/queries"
import { GoalJourneyDialog } from "@/components/goals/goal-journey-dialog"

export function GoalDetail({
  data,
  blueprints,
}: {
  data: GoalDetailData
  blueprints: JourneyBlueprint[]
}) {
  const router = useRouter()
  const [busyMs, setBusyMs] = React.useState<string | null>(null)
  const [busyQ, setBusyQ] = React.useState<string | null>(null)
  const [journeyOpen, setJourneyOpen] = React.useState(false)

  const active = data.activePhase

  async function handleToggle(milestoneId: string) {
    if (busyMs) return
    setBusyMs(milestoneId)
    try {
      await toggleMilestone(milestoneId)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update milestone")
    } finally {
      setBusyMs(null)
    }
  }

  async function handleCompleteQuest(questId: string) {
    if (busyQ) return
    setBusyQ(questId)
    try {
      const res = await completeQuestAction(questId)
      announceUnlockedAchievements(res.unlocked_achievements)
      toast.success(`+${res.xp_awarded} XP earned`)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not complete quest")
    } finally {
      setBusyQ(null)
    }
  }

  if (!active && data.phases.length === 0) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Wand2 className="size-6 text-primary" />
            <p className="text-sm text-muted-foreground">This goal has no journey yet. Generate a personalized arc of phases to start climbing.</p>
            <Button size="sm" onClick={() => setJourneyOpen(true)}>
              <Wand2 className="mr-1 size-4" /> Create Journey
            </Button>
          </CardContent>
        </Card>
        <GoalJourneyDialog goalId={data.goal.id} blueprints={blueprints} open={journeyOpen} onOpenChange={setJourneyOpen} />
      </>
    )
  }

  return (
    <>
      {/* Next milestone callout */}
      {active?.nextMilestone && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <Target className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Next Milestone</p>
            <p className="truncate text-sm font-semibold">{active.nextMilestone.title}</p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">+{active.nextMilestone.xp_reward} XP</span>
        </div>
      )}

      {/* Current phase with milestone toggles — progress flows upward live */}
      {active && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" /> Current Phase · {active.title}
              </span>
              <span className="font-mono text-xs font-normal text-muted-foreground">{active.progressPct}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {active.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones in this phase yet.</p>
            ) : (
              <ul className="space-y-1">
                {active.milestones.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => handleToggle(m.id)}
                      disabled={busyMs === m.id}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                    >
                      <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", m.status === "completed" ? "text-primary" : "text-muted-foreground/40")} />
                      <span className={cn("flex-1 text-sm", m.status === "completed" && "text-muted-foreground line-through")}>
                        {m.title}
                        {m.is_final_challenge && (
                          <span className="ml-1.5 rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wider">Final</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommended quests: real active quests attached to the current phase */}
      {active && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recommended Quests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.recommendedQuests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active quests in this phase — create some on the Quests page and link them to this phase&apos;s milestones.</p>
            ) : (
              data.recommendedQuests.map((q) => (
                <div key={q.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <Zap className="size-3.5 shrink-0 text-[hsl(var(--gold))]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{q.title}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{q.difficulty}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busyQ === q.id} onClick={() => handleCompleteQuest(q.id)}>
                    Complete
                  </Button>
                </div>
              ))
            )}
            {data.completedQuestCount > 0 && (
              <p className="pt-1 font-mono text-[10px] text-muted-foreground">
                {data.completedQuestCount} quest{data.completedQuestCount === 1 ? "" : "s"} already completed this phase
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!active && data.phases.some((p) => p.status === "available") && (
        <p className="text-sm text-muted-foreground">A phase is ready — begin it from your Current Phase page.</p>
      )}

      <GoalJourneyDialog goalId={data.goal.id} blueprints={blueprints} open={journeyOpen} onOpenChange={setJourneyOpen} />
    </>
  )
}
