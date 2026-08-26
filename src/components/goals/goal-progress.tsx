import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export function GoalProgress({
  progressPct,
  milestonesDone,
  milestonesTotal,
  phasesCompleted,
  phasesTotal,
  compact,
}: {
  progressPct: number
  milestonesDone: number
  milestonesTotal: number
  phasesCompleted: number
  phasesTotal: number
  compact?: boolean
}) {
  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      <Progress value={progressPct} className={cn(compact ? "h-1.5" : "h-2.5")} />
      {!compact && (
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>{milestonesDone}/{milestonesTotal} milestones</span>
          <span>{phasesCompleted}/{phasesTotal} phases</span>
          <span className="font-bold text-foreground">{progressPct}%</span>
        </div>
      )}
    </div>
  )
}
