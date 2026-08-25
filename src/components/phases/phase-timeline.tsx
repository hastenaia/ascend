"use client"
import { motion } from "framer-motion"
import { Lock, Check, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PhaseStatus } from "@/types/ascend"

type Item = {
  id: string
  title: string
  order_index: number
  status: PhaseStatus
  progress?: number
  subtitle?: string | null
}

export function PhaseTimeline({ items, onSelect }: { items: Item[]; onSelect?: (id: string) => void }) {
  return (
    <div className="relative">
      {/* vertical line */}
      <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border hidden sm:block" aria-hidden />
      <div className="space-y-3">
        {items.map((it, idx) => {
          const isLocked = it.status === "locked"
          const isActive = it.status === "active"
          const isCompleted = it.status === "completed"
          const isAvailable = it.status === "available"
          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.06 }}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl border bg-card p-3 sm:p-4 transition-colors",
                isActive && "border-primary/30 bg-gradient-to-br from-primary/[0.06] to-violet-500/[0.04] shadow-sm",
                isLocked && "opacity-60 bg-muted/30 border-dashed",
                isCompleted && "border-emerald-200/50",
                onSelect && !isLocked && "cursor-pointer hover:border-primary/20"
              )}
              onClick={() => onSelect && !isLocked && onSelect(it.id)}
            >
              <span
                className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  isCompleted && "bg-emerald-500 text-white border-emerald-500",
                  isActive && "bg-primary text-primary-foreground border-primary",
                  isAvailable && "bg-card text-primary border-primary/30",
                  isLocked && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="size-4" /> : isLocked ? <Lock className="size-3.5" /> : isActive ? <Target className="size-4" /> : <Sparkles className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Phase {String(it.order_index).padStart(2, "0")}</p>
                <p className={cn("text-sm font-semibold truncate", isLocked && "text-muted-foreground")}>{it.title.replace(/^PHASE \d+ — /, "")}</p>
                {it.subtitle && <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>}
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", isActive && "bg-primary text-primary-foreground", isAvailable && "bg-primary/10 text-primary", isCompleted && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", isLocked && "bg-muted text-muted-foreground")}>
                  {it.status}
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
