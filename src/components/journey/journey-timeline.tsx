"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Check, ChevronRight, Lock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CompletedPhaseDetail, JourneyNode } from "@/lib/journey/queries"
import { JourneyPhaseDetails } from "@/components/journey/journey-phase-details"

const STATUS_META: Record<JourneyNode["status"], { label: string; dot: string; text: string; chip: string }> = {
  completed: {
    label: "Completed",
    dot: "border-transparent bg-[hsl(var(--gold))] shadow-[0_0_12px_hsl(var(--gold)/0.5)]",
    text: "text-foreground",
    chip: "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]",
  },
  active: {
    label: "Active",
    dot: "border-primary/40 bg-primary/20 ring-4 ring-primary/15",
    text: "text-foreground",
    chip: "bg-primary/10 text-primary",
  },
  available: {
    label: "Ready",
    dot: "border-primary/50 bg-background",
    text: "text-foreground",
    chip: "bg-primary/10 text-primary",
  },
  locked: {
    label: "Locked",
    dot: "border-border bg-muted",
    text: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
}

export function JourneyTimeline({
  nodes,
  details,
}: {
  nodes: JourneyNode[]
  details: Record<string, CompletedPhaseDetail>
}) {
  const reduced = useReducedMotion()
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const detail = detailId ? details[detailId] ?? null : null

  return (
    <>
      <ol className="relative ml-3 space-y-2 border-l border-border/70 pl-6">
        {nodes.map((node, i) => {
          const meta = STATUS_META[node.status]
          const isDone = node.status === "completed"
          const clickable = isDone && !!details[node.id]
          return (
            <motion.li
              key={node.id}
              initial={reduced ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduced ? 0 : i * 0.06, duration: 0.35 }}
              className="relative py-3"
            >
              {/* Node dot on the rail */}
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[31px] top-5 flex size-[18px] items-center justify-center rounded-full border-2",
                  meta.dot,
                  node.status === "active" && !reduced && "animate-pulse",
                )}
              >
                {isDone && <Check className="size-2.5 text-background" strokeWidth={3.5} />}
                {node.status === "locked" && <Lock className="size-2 text-muted-foreground" />}
              </span>

              <div
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => { setDetailId(node.id); setOpen(true) } : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(node.id); setOpen(true) } } : undefined}
                className={cn(
                  "group rounded-xl border p-4 transition-colors",
                  clickable ? "cursor-pointer hover:border-[hsl(var(--gold)/0.45)] hover:bg-muted/30" : "bg-card/60",
                  node.status === "locked" && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className={cn("text-sm font-bold uppercase tracking-[0.14em]", meta.text)}>{node.title}</h3>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", meta.chip)}>
                    {meta.label}
                  </span>
                  {clickable && <ChevronRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  {node.completedAt && (
                    <span>{new Date(node.completedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
                  )}
                  {isDone && node.rewardXp > 0 && <span className="text-[hsl(var(--gold))]">+{node.rewardXp} XP</span>}
                  {node.status === "active" && node.totalMilestones > 0 && <span>{node.progressPct}%</span>}
                </div>

                {node.status === "active" && node.totalMilestones > 0 && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${node.progressPct}%` }} />
                  </div>
                )}

                {clickable && (
                  <p className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    <Sparkles className="size-3" /> View chapter summary
                  </p>
                )}
              </div>
            </motion.li>
          )
        })}
      </ol>

      <JourneyPhaseDetails detail={detail} open={open} onOpenChange={setOpen} />
    </>
  )
}
