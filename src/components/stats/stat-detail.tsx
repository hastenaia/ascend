"use client"
import * as React from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { StatHistory } from "@/components/stats/stat-history"
import { STAT_META, statTier, nextTier, GAME_ATTRIBUTES_NOTE } from "@/lib/stats"
import type { StatSummary, StatHistoryEntry } from "@/lib/stats/queries"

type Props = {
  stat: StatSummary | null
  history: StatHistoryEntry[]
  open: boolean
  onOpenChange: (v: boolean) => void
}

/** Deep dive for one stat: value, tier, month delta + real contribution history */
export function StatDetail({ stat, history, open, onOpenChange }: Props) {
  if (!stat) return null
  const meta = STAT_META[stat.slug]
  const Icon = meta.icon
  const tier = statTier(stat.value)
  const next = nextTier(stat.value)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg ascend-gradient text-primary ring-1 ring-primary/20">
              <Icon className="size-4" />
            </span>
            {meta.label}
          </DialogTitle>
          <DialogDescription>{meta.blurb}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="stat-num text-5xl font-bold leading-none">{stat.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {tier.name}
                {next ? ` · ${next.min - stat.value} to ${next.name}` : " · max tier"}
              </p>
            </div>
            {stat.deltaMonth !== 0 && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
              >
                {stat.deltaMonth > 0 ? "+" : ""}
                {stat.deltaMonth} this month
              </motion.span>
            )}
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full ascend-gradient-strong" style={{ width: `${Math.max(stat.points > 0 ? 4 : 0, stat.value)}%` }} />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contributions</p>
            <StatHistory entries={history} />
          </div>

          <p className="border-t pt-3 text-[10.5px] leading-relaxed text-muted-foreground/70">{GAME_ATTRIBUTES_NOTE}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
