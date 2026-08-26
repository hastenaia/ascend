"use client"
import { motion, useReducedMotion } from "framer-motion"
import { Layers, Zap } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { useAnimatedNumber } from "@/hooks/use-animated-number"
import type { LevelProgress as LevelProgressType } from "@/lib/levels"

export function LevelCard({ level }: { level: LevelProgressType }) {
  const reduced = useReducedMotion()
  const animatedXp = useAnimatedNumber(level.totalXp)

  return (
    <div className="lift sheen relative overflow-hidden rounded-2xl border bg-card p-5">
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-primary/[0.08] blur-2xl" />
      <div className="relative flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Level</p>
        <span className="flex size-8 items-center justify-center rounded-xl ascend-gradient text-primary ring-1 ring-primary/20">
          <Layers className="size-4" />
        </span>
      </div>

      <div className="relative mt-2 flex items-baseline gap-3">
        <motion.p
          initial={reduced ? false : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 20 }}
          className="stat-num glow-text text-gradient text-[2rem] font-black leading-none tracking-tight"
        >
          LEVEL {level.level}
        </motion.p>
      </div>

      <p className="stat-num mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Zap className="size-3.5" style={{ color: "hsl(var(--gold))" }} />
        {animatedXp.toLocaleString()} XP
      </p>

      <div className="relative mt-4">
        <Progress value={level.progressPct} className="h-2 bg-secondary shimmer" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">
          {level.xpToNext > 0 ? (
            <>
              <span className="stat-num font-bold text-foreground">{level.xpToNext.toLocaleString()}</span> XP to Level {level.level + 1}
            </>
          ) : (
            "Max level reached"
          )}
        </span>
        <span className="stat-num text-muted-foreground">{level.progressPct}%</span>
      </div>
    </div>
  )
}
