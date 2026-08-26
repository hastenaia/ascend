"use client"
import { motion, useReducedMotion } from "framer-motion"
import { Info } from "lucide-react"
import { STAT_META, statTier } from "@/lib/stats"
import type { StatSummary } from "@/lib/stats/queries"
import { cn } from "@/lib/utils"

type Props = {
  stat: StatSummary
  index?: number
  onClick?: (stat: StatSummary) => void
}

/** INTELLECT / 81 / ████████░░ / +4 this month — real data only */
export function StatCard({ stat, index = 0, onClick }: Props) {
  const reduced = useReducedMotion()
  const meta = STAT_META[stat.slug]
  const Icon = meta.icon
  const tier = statTier(stat.value)
  const hasActivity = stat.points > 0

  return (
    <motion.button
      type="button"
      onClick={() => onClick?.(stat)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.28) }}
      whileHover={onClick ? { y: -2 } : undefined}
      className="group relative w-full overflow-hidden rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/25 hover:shadow-[0_10px_30px_-16px_hsl(252_60%_50%/0.35)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg ascend-gradient text-primary ring-1 ring-primary/20">
          <Icon className="size-4" />
        </span>
        {stat.deltaMonth !== 0 && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", stat.deltaMonth > 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
            {stat.deltaMonth > 0 ? "+" : ""}
            {stat.deltaMonth} this month
          </span>
        )}
      </div>

      <p className="mt-3 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{meta.label}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={cn("stat-num text-3xl font-bold tabular-nums", hasActivity ? "text-foreground" : "text-muted-foreground/50")}>{stat.value}</span>
        {hasActivity && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{tier.name}</span>}
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 via-primary to-violet-400"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(hasActivity ? 4 : 0, stat.value)}%` }}
          transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : index * 0.05, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* 8-week real trend */}
      <div className="mt-3 flex h-6 items-end gap-[3px]" title="Point gains per week (last 8 weeks)">
        {stat.trend.map((v, i) => (
          <motion.span
            key={i}
            className={cn("flex-1 rounded-sm", v > 0 ? "bg-primary/60" : "bg-secondary")}
            initial={{ height: 2 }}
            animate={{ height: Math.max(2, Math.min(24, v)) }}
            transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.15 + i * 0.03 }}
          />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <Info className="size-3" /> {stat.points.toLocaleString()} pts · game attribute
      </p>
    </motion.button>
  )
}
