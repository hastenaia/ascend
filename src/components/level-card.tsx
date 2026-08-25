import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Layers, Zap, TrendingUp } from "lucide-react"
import type { LevelProgress as LevelProgressType } from "@/lib/levels"

export function LevelCard({ level }: { level: LevelProgressType }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full ascend-gradient-strong" />
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Level</p>
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-primary">
            <Layers className="size-4" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-3xl font-bold tracking-tight ascend-gradient-strong bg-clip-text text-transparent">LEVEL {level.level}</p>
          <p className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <Zap className="size-3.5" />
            {level.totalXp.toLocaleString()} XP
          </p>
        </div>
        <Progress value={level.progressPct} className="mt-4 h-2" />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="size-3" />
            {level.xpToNext > 0 ? `${level.xpToNext.toLocaleString()} XP to Level ${level.level + 1}` : "Max level reached"}
          </span>
          <span className="text-muted-foreground">{level.progressPct}%</span>
        </div>
      </CardContent>
    </Card>
  )
}
