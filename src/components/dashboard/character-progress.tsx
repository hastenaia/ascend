"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Info } from "lucide-react"
import { ATTRIBUTE_META, type CharacterAttribute } from "@/lib/icons"
import { cn } from "@/lib/utils"

type Props = {
  attributes: Record<CharacterAttribute, number>
}

/**
 * Character Progress — Ascend's game-style progression attributes.
 * Derived from real completed-quest XP; explicitly NOT validated measurements.
 */
export function CharacterProgress({ attributes }: Props) {
  const reduced = useReducedMotion()
  const entries = Object.keys(ATTRIBUTE_META) as CharacterAttribute[]

  return (
    <div className="sheen relative overflow-hidden rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Character Progress</p>
        <span title="Game-style progression attributes based on the XP you actually earned. Not scientifically validated measurements." className="inline-flex cursor-help items-center gap-1 text-[10.5px] text-muted-foreground/80">
          <Info className="size-3" /> Game attributes
        </span>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        {entries.map((attr, i) => {
          const meta = ATTRIBUTE_META[attr]
          const Icon = meta.icon
          const value = attributes[attr] ?? 0
          return (
            <div key={attr} className="group relative" title={meta.blurb}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-medium capitalize text-foreground/90">
                  <Icon className="size-3.5 text-primary/80" />
                  {meta.label}
                  <span className="pointer-events-none absolute -top-8 left-5 z-10 hidden whitespace-nowrap rounded-lg border bg-popover px-2 py-1 text-[10.5px] font-normal normal-case text-popover-foreground shadow-md group-hover:block">
                    {meta.blurb}
                  </span>
                </span>
                <span className={cn("stat-num text-sm font-bold", value > 0 ? "text-foreground" : "text-muted-foreground/60")}>{value}</span>
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

      <p className="mt-4 border-t pt-3 text-[10.5px] leading-relaxed text-muted-foreground/70">
        These are Ascend game-style progress attributes derived from quests you complete — not IQ/EQ or any scientifically validated measurement.
      </p>
    </div>
  )
}
