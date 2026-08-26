import { cn } from "@/lib/utils"

/**
 * Day-dot grid for an experiment: one cell per day of the planned duration,
 * filled when a metrics entry exists for that day of the run.
 */
export function ExperimentProgress({
  durationDays,
  loggedDayIndexes,
  dayIndex,
  status,
}: {
  durationDays: number
  loggedDayIndexes: Set<number>
  dayIndex: number
  status: "active" | "completed" | "archived"
}) {
  return (
    <div className="flex flex-wrap gap-[3px]">
      {Array.from({ length: durationDays }, (_, i) => {
        const day = i + 1
        const logged = loggedDayIndexes.has(day)
        const isToday = status === "active" && day === Math.min(dayIndex, durationDays)
        return (
          <span
            key={day}
            title={`Day ${day}${logged ? " · logged" : ""}`}
            className={cn(
              "size-2 rounded-full",
              logged ? "bg-primary" : "bg-muted",
              isToday && !logged && "ring-2 ring-primary/40",
            )}
          />
        )
      })}
    </div>
  )
}
