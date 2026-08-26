"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Info } from "lucide-react"
import { STAT_META, GAME_ATTRIBUTES_NOTE, type StatSlug } from "@/lib/stats"
import type { StatSummary } from "@/lib/stats/queries"
import { cn } from "@/lib/utils"

type Props = {
  stats: StatSummary[]
}

/**
 * Character Progress — Ascend's game-style progression attributes,
 * backed by the persisted user_stats ledger (real completed-quest XP).
 * Explicitly NOT validated psychological or fitness measurements.
 */
export function CharacterProgress({ stats }: Props) {
  const reduced = useReducedMotion()

  return (
    <div className="sheen relative overflow-hidden rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Character Progress</p>
        <span title={GAME_ATTRIBUTES_NOTE} className="inline-flex cursor-help items-center gap-1 text-[10.5px] text-muted-foreground/80">
          <Info className="size-3" /> Game attributes
        </span>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        {stats.map((stat, i) => {
          const meta = STAT_META[stat.slug as StatSlug]
          if (!meta) return null
          const Icon = meta.icon
          const value = stat.value
          return (
            <div key={stat.slug} className="group relative" title={meta.blurb}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 truncate text-xs font-medium capitalize text-foreground/90">
                  <Icon className="size-3.5 shrink-0 text-primary/80" />
                  <span className="truncate">{meta.label}</span>
                </span>
                <span className={cn("stat-num shrink-0 text-sm font-bold", value > 0 ? "text-foreground" : "text-muted-foreground/60")}>{value}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary/70 via-primary to-violet-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(value > 0 ? 4 : 0, value)}%` }}
                  transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 border-t pt-3 text-[10.5px] leading-relaxed text-muted-foreground/70">{GAME_ATTRIBUTES_NOTE}</p>
    </div>
  )
}
