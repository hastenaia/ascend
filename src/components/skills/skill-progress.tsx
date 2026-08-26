"use client"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { LEAF_UNLOCK_XP } from "@/lib/skills/tree"

type Props = {
  xp: number
  unlockXp?: number
  className?: string
}

export function SkillProgress({ xp, unlockXp = LEAF_UNLOCK_XP, className }: Props) {
  const reduced = useReducedMotion()
  const pct = Math.min(100, Math.round((xp / Math.max(1, unlockXp)) * 100))
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">{xp.toLocaleString()} XP</span>
        <span>unlocks at {unlockXp}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "ascend-gradient-strong")}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(xp > 0 ? 4 : 0, pct)}%` }}
          transition={{ duration: reduced ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}
