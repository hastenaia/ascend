"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MomentumSummary } from "@/lib/momentum/queries"

const SEGMENTS = 20

export function MomentumGauge({ summary }: { summary: MomentumSummary }) {
  const reduced = useReducedMotion()
  const filled = Math.round((summary.score / 100) * SEGMENTS)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <motion.span
          key={summary.score}
          initial={reduced ? false : { scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="stat-num text-5xl font-bold leading-none tracking-tight"
        >
          {summary.score}
        </motion.span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <Activity className="size-3" /> Momentum · {summary.tier.label}
          </p>
          <p className="mt-0.5 text-xs italic text-muted-foreground">{summary.tier.message}</p>
        </div>
      </div>

      {/* Segmented bar — ████░░ style */}
      <div className="flex gap-[3px]" role="meter" aria-valuenow={summary.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Momentum ${summary.score} of 100`}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 flex-1 rounded-sm transition-colors",
              i < filled ? "bg-primary" : "bg-muted",
            )}
            style={!reduced && i < filled ? { transitionDelay: `${i * 18}ms` } : undefined}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>Last 7 days</span>
          {summary.last7.map((active, i) => (
            <span key={i} className={cn("inline-block size-1.5 rounded-full", active ? "bg-primary" : "bg-border")} />
          ))}
        </div>
        {!summary.todayActive ? (
          <span>Drifts to {summary.tomorrowIfIdle} tomorrow — one rest day changes little.</span>
        ) : (
          <span className="text-primary">Logged today ✓</span>
        )}
      </div>
    </div>
  )
}
