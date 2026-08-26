"use client"
import { StatCard } from "@/components/stats/stat-card"
import type { StatSummary } from "@/lib/stats/queries"

type Props = {
  stats: StatSummary[]
  onSelect?: (stat: StatSummary) => void
}

export function StatOverview({ stats, onSelect }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s, i) => (
        <StatCard key={s.slug} stat={s} index={i} onClick={onSelect} />
      ))}
    </div>
  )
}
