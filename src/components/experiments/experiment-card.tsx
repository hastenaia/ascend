import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import type { ExperimentWithStats } from "@/lib/experiments/queries"
import { ExperimentProgress } from "@/components/experiments/experiment-progress"

const STATUS_STYLES = {
  active: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground",
} as const

export function ExperimentCard({
  data,
  onSelect,
}: {
  data: ExperimentWithStats
  onSelect: () => void
}) {
  const { experiment: e, progressPct, loggedDays, completionRate } = data
  const done = e.status === "completed"

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25 text-primary">
          <FlaskConical className="size-4" />
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", STATUS_STYLES[e.status])}>
          {e.status}
        </span>
      </div>

      <p className={cn("mt-3 text-sm font-bold leading-snug tracking-tight", done && "text-muted-foreground")}>{e.title}</p>
      {e.hypothesis && <p className="mt-1 line-clamp-2 text-xs italic leading-relaxed text-muted-foreground">{e.hypothesis}</p>}

      <div className="mt-auto space-y-1.5 pt-4">
        <ExperimentProgress
          durationDays={e.duration_days}
          loggedDayIndexes={new Set(data.entries.map((en) => dayIndexOf(e.started_at, en.entry_date)).filter((d): d is number => d !== null))}
          dayIndex={data.dayIndex}
          status={e.status}
        />
        <Progress value={progressPct} className="h-1" />
        <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>{done ? `Ran ${loggedDays} day${loggedDays === 1 ? "" : "s"}` : `Day ${Math.min(data.dayIndex, e.duration_days)} of ${e.duration_days}`}</span>
          <span>{completionRate !== null ? `${completionRate}% done` : `${loggedDays} logged`}</span>
        </div>
      </div>
    </button>
  )
}

export function dayIndexOf(startedAt: string | null, entryDate: string | null): number | null {
  if (!startedAt || !entryDate) return null
  const diff = Math.floor(
    (new Date(entryDate + "T00:00:00Z").getTime() - new Date(startedAt + "T00:00:00Z").getTime()) / 86_400_000,
  )
  return diff + 1
}
