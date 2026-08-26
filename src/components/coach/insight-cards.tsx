import { Activity, Flame, ScrollText, Target } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Real-data insight strip on the Coach page. These are computed facts, NOT
 * AI output — the coach chat itself provides the narrative.
 */
export function InsightCards({
  momentum,
  phaseProgressPct,
  phaseTitle,
  openQuests,
  completedQuests,
}: {
  momentum: { score: number; label: string } | null
  phaseProgressPct: number | null
  phaseTitle: string | null
  openQuests: number
  completedQuests: number
}) {
  const cards = [
    {
      icon: Activity,
      label: "Momentum",
      value: momentum ? String(momentum.score) : "—",
      sub: momentum?.label ?? "No data yet",
    },
    {
      icon: Target,
      label: "Current phase",
      value: phaseProgressPct !== null ? `${phaseProgressPct}%` : "—",
      sub: phaseTitle ?? "No active phase",
    },
    {
      icon: ScrollText,
      label: "Open quests",
      value: String(openQuests),
      sub: "ready when you are",
    },
    {
      icon: Flame,
      label: "Completed quests",
      value: String(completedQuests),
      sub: "lifetime total",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-border/60">
          <CardContent className="flex items-center gap-3 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <c.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">{c.label}</p>
              <p className="stat-num truncate text-lg font-bold leading-tight">{c.value}</p>
              <p className="truncate text-[10px] text-muted-foreground">{c.sub}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
