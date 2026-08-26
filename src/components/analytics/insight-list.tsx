import { CheckCircle2, Compass, Flame, Target, TrendingDown, TrendingUp, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Insight } from "@/lib/analytics/insights"

const ICONS = {
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  target: Target,
  flame: Flame,
  trophy: Trophy,
  compass: Compass,
  check: CheckCircle2,
} as const

export function InsightList({ insights, className }: { insights: Insight[]; className?: string }) {
  if (insights.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>Complete a few quests to unlock personal insights.</p>
    )
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {insights.map((ins, i) => {
        const Icon = ICONS[ins.icon]
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                ins.icon === "trend-up" || ins.icon === "check" ? "text-emerald-500" : ins.icon === "trend-down" ? "text-muted-foreground" : "text-primary",
              )}
            />
            <span>{ins.text}</span>
          </li>
        )
      })}
    </ul>
  )
}
