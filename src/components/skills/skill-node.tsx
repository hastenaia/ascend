"use client"
import { motion } from "framer-motion"
import { Check, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DerivedSkillNode } from "@/lib/skills/tree"

type Props = {
  node: DerivedSkillNode
  onSelect?: (node: DerivedSkillNode) => void
}

const stateRing: Record<string, string> = {
  unlocked: "border-emerald-400/60 bg-emerald-500/15 text-emerald-500 shadow-[0_0_14px_-2px_hsl(160_84%_39%/0.5)]",
  in_progress: "border-primary/60 bg-primary/10 text-primary",
  available: "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
  locked: "border-dashed border-border/70 bg-muted/30 text-muted-foreground/50",
}

/** Circular skill node: progress ring while in progress, check when unlocked */
export function SkillNode({ node, onSelect }: Props) {
  const { state, progressPct } = node
  const R = 15
  const C = 2 * Math.PI * R

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(node)}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      title={`${node.skill.name} · ${state.replace("_", " ")}`}
      aria-label={node.skill.name}
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors",
        stateRing[state]
      )}
    >
      {state === "in_progress" ? (
        <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90">
          <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
          <motion.circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - progressPct / 100) }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      ) : null}
      {state === "unlocked" ? (
        <Check className="size-4" strokeWidth={2.75} />
      ) : state === "locked" ? (
        <Lock className="size-3.5" />
      ) : state === "available" ? (
        <span className="size-2 rounded-full bg-current opacity-60" />
      ) : null}
    </motion.button>
  )
}
