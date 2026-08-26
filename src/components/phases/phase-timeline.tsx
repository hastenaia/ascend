"use client"
import { motion, useReducedMotion } from "framer-motion"
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
  const reduced = useReducedMotion()
  return (
    <div className="relative">
      {/* connecting spine */}
      <div aria-hidden className="absolute bottom-4 left-[19px] top-4 w-px bg-gradient-to-b from-emerald-400/40 via-primary/30 to-border" />
      <ol className="space-y-2">
        {items.map((it, idx) => {
          const isLocked = it.status === "locked"
          const isActive = it.status === "active"
          const isCompleted = it.status === "completed"
          const isAvailable = it.status === "available"
          return (
            <motion.li
              key={it.id}
              initial={reduced ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduced ? 0 : Math.min(idx * 0.06, 0.5), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl border p-3 transition-colors sm:p-3.5",
                isActive && "glow-primary border-primary/30 bg-card",
                !isActive && "bg-card",
                isLocked && "border-dashed opacity-55",
                isCompleted && "border-emerald-200/60 dark:border-emerald-900/40",
                onSelect && !isLocked && "cursor-pointer hover:border-primary/30"
              )}
              onClick={() => onSelect && !isLocked && onSelect(it.id)}
            >
              <span
                className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold stat-num",
                  isActive && "ascend-gradient-strong border-primary text-white shadow-md shadow-primary/30",
                  isCompleted && "border-emerald-500 bg-emerald-500 text-white",
                  isAvailable && "border-primary/40 bg-card text-primary",
                  isLocked && "border-border bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="size-4" /> : isLocked ? <Lock className="size-3.5" /> : isActive ? <Target className="size-4" /> : <Sparkles className="size-3.5" />}
                {isActive && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-primary/50"
                    animate={reduced ? undefined : { scale: [1, 1.28], opacity: [0.8, 0] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
                  />
                )}
              </span>
              <span aria-hidden className={cn("stat-num w-6 shrink-0 text-[11px] font-bold", isActive ? "text-primary" : "text-muted-foreground/60")}>
                {String(it.order_index).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-semibold tracking-tight", isLocked && "text-muted-foreground")}>{it.title.replace(/^PHASE \d+ — /, "")}</p>
                {it.subtitle && <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>}
                {isActive && typeof it.progress === "number" && (
                  <div className="mt-1.5 h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-secondary">
                    <div className="h-full ascend-gradient-strong shimmer rounded-full" style={{ width: `${Math.max(3, it.progress)}%` }} />
                  </div>
                )}
              </div>
              <div className="hidden shrink-0 sm:block">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                    isActive && "ascend-gradient-strong text-white shadow-sm",
                    isAvailable && "bg-primary/10 text-primary",
                    isCompleted && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    isLocked && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? "Completed" : isActive ? "Current" : isLocked ? "Locked" : it.status}
                </span>
              </div>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
