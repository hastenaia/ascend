import Link from "next/link"
import { ArrowUpRight, Briefcase, Coins, Flag, GraduationCap, HeartPulse, Palette, Sprout, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import type { GoalWithProgress } from "@/lib/goals/queries"
import type { QualityRubricItem } from "@/lib/goals/intel-ui"
import { GoalQualityFooter } from "@/components/goals/goal-quality-footer"

export const GOAL_CATEGORY_ICONS: Record<string, LucideIcon> = {
  career: Briefcase,
  health: HeartPulse,
  skills: GraduationCap,
  personal: Sprout,
  finance: Coins,
  creative: Palette,
  other: Flag,
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
}

export function GoalCard({
  goal,
  quality,
}: {
  goal: GoalWithProgress
  quality?: { score: number; max: number; rubric: QualityRubricItem[] } | null
}) {
  const Icon = GOAL_CATEGORY_ICONS[goal.category] ?? Flag
  const done = goal.status === "completed"

  return (
    <div className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40", done && "opacity-80")}>
      <Link href={`/goals/${goal.id}`} className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25 text-primary">
            <Icon className="size-4.5" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", PRIORITY_STYLES[goal.priority] ?? PRIORITY_STYLES.low)}>
              {goal.priority}
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        <p className="mt-3 text-sm font-bold leading-snug tracking-tight">{goal.title}</p>
        {goal.activePhaseTitle && !done && (
          <p className="mt-1 truncate text-xs text-muted-foreground">Phase · {goal.activePhaseTitle}</p>
        )}

        <div className="mt-auto space-y-1.5 pt-4">
          <Progress value={goal.progressPct} className="h-1.5" />
          <div className="flex items-center justify-between font-mono text-[10.5px] text-muted-foreground">
            <span>
              {goal.phasesCompleted}/{goal.phasesTotal || "–"} phases
            </span>
            <span>{done ? "Completed" : `${goal.progressPct}%`}</span>
          </div>
          {goal.target_date && !done && (
            <p className="font-mono text-[10px] text-muted-foreground/70">
              Target {new Date(goal.target_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      </Link>

      <GoalQualityFooter goalId={goal.id} quality={quality ?? null} />
    </div>
  )
}
