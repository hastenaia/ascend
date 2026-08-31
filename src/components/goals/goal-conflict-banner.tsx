"use client"
import * as React from "react"
import { AlertTriangle, GripVertical } from "lucide-react"
import { detectGoalConflictsAction } from "@/lib/goals/actions-goal-intel"
import type { GoalConflict } from "@/lib/goals/intelligence/conflicts"

function describeReason(r: GoalConflict["reasons"][number]): string {
  switch (r.type) {
    case "near_duplicate":
      return "These goals look like the same goal (near-duplicate titles). Consider merging or pausing one."
    case "category_time_overlap":
      return `Both are ${r.category.toLowerCase()}-focused and high/critical priority with overlapping time windows (${r.windowOverlapDays}d overlap).`
    case "priority_clash":
      return `Both compete for your top-priority space (${r.priorities.join(" and ")}).`
    default:
      return ""
  }
}

export function GoalConflictBanner() {
  const [conflicts, setConflicts] = React.useState<GoalConflict[] | null>(null)

  React.useEffect(() => {
    detectGoalConflictsAction()
      .then((res) => {
        if (!res.ok) return
        setConflicts(res.conflicts)
      })
      .catch(() => {
        /* deterministic probe — silent fail keeps the page clean */
      })
  }, [])

  if (conflicts === null) return null
  if (conflicts.length === 0) return null

  return (
    <div className="space-y-2 rounded-xl border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] px-4 py-3">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--gold))]">
        <AlertTriangle className="size-4" /> Goal conflicts detected
      </p>
      <div className="space-y-2">
        {conflicts.slice(0, 4).map((c, i) => (
          <div key={i} className="rounded-lg bg-card/60 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <GripVertical className="size-3.5 text-muted-foreground" />
              <span className="text-foreground">{c.goalATitle}</span>
              <span className="text-muted-foreground">↔</span>
              <span className="text-foreground">{c.goalBTitle}</span>
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {c.reasons.map((r, ri) => (
                <li key={ri}>{describeReason(r)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Detected automatically from your active goals. No changes are made — you decide what to do.</p>
    </div>
  )
}