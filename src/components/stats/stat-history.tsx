"use client"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2 } from "lucide-react"
import type { StatHistoryEntry } from "@/lib/stats/queries"

export function StatHistory({ entries }: { entries: StatHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 shrink-0" />
        No contributions yet — complete relevant quests and they will appear here.
      </div>
    )
  }
  return (
    <ol className="relative space-y-2 pl-4 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
      <AnimatePresence initial={false}>
        {entries.map((e, i) => (
          <motion.li
            key={e.id}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.2) }}
            className="relative"
          >
            <span className="absolute -left-4 top-3 size-[9px] rounded-full border-2 border-primary/70 bg-background" />
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{e.description ?? "Quest completed"}</p>
                <p className="text-[10.5px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</p>
              </div>
              <span className="shrink-0 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">+{e.delta}</span>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
