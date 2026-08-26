"use client"
import * as React from "react"
import { StatOverview } from "@/components/stats/stat-overview"
import { StatDetail } from "@/components/stats/stat-detail"
import { GAME_ATTRIBUTES_NOTE } from "@/lib/stats"
import type { StatSummary, StatHistoryEntry } from "@/lib/stats/queries"

type Props = {
  stats: StatSummary[]
  historyBySlug: Record<string, StatHistoryEntry[]>
}

export function StatsClient({ stats, historyBySlug }: Props) {
  const [selected, setSelected] = React.useState<StatSummary | null>(null)
  const [open, setOpen] = React.useState(false)

  return (
    <div className="space-y-5">
      <StatOverview
        stats={stats}
        onSelect={(s) => {
          setSelected(s)
          setOpen(true)
        }}
      />
      <p className="text-center text-xs leading-relaxed text-muted-foreground/70">{GAME_ATTRIBUTES_NOTE}</p>

      <StatDetail
        stat={selected}
        history={selected ? (historyBySlug[selected.slug] ?? []) : []}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  )
}
