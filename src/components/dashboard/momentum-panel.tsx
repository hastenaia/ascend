"use client"
import { motion, useReducedMotion } from "framer-motion"
import { Flame, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useAnimatedNumber } from "@/hooks/use-animated-number"
import { momentumMessage } from "@/lib/character"

type Props = {
  score: number
  streak: number
  thisWeek: number
  prevWeek: number
}

export function MomentumPanel({ score, streak, thisWeek, prevWeek }: Props) {
  const reduced = useReducedMotion()
  const animated = useAnimatedNumber(score)
  const delta = prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : thisWeek > 0 ? 100 : 0
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus

  return (
    <div className="lift sheen relative overflow-hidden rounded-2xl border bg-card p-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/10 blur-2xl" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Momentum</p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="relative">
          {/* soft glow behind the value */}
          <span aria-hidden className="absolute -inset-2 -z-10 rounded-full bg-primary/15 blur-xl" />
          <motion.p key="score" initial={reduced ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="stat-num glow-text text-gradient text-5xl font-black leading-none">
            {animated}
          </motion.p>
        </div>
        <span className="mb-1 inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold" style={{ color: delta > 0 ? "hsl(152 65% 38%)" : delta < 0 ? "hsl(0 60% 50%)" : undefined }}>
          <TrendIcon className="size-3" />
          {delta > 0 ? "+" : ""}
          {delta}%
        </span>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full ascend-gradient-strong"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(score > 0 ? 12 : 2, Math.log2(1 + score) * 18))}%` }}
          transition={{ duration: reduced ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="italic">{momentumMessage(streak, score)}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground">
          <Flame className="size-3.5" style={{ color: "hsl(var(--gold))" }} />
          {streak}d streak · +{thisWeek} wk
        </span>
      </div>
    </div>
  )
}
