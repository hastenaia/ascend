import { CalendarDays, NotebookPen } from "lucide-react"
import { ReflectionCard } from "@/components/reflections/reflection-card"
import type { ReflectionEntry } from "@/lib/reflections/queries"

export function ReflectionHistory({ entries }: { entries: ReflectionEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reflections yet — they&apos;re collected when you complete a phase.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-xl border bg-card/60 p-4">
          <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
              <NotebookPen className="size-3.5 text-primary" />
              {entry.phaseTitle ?? "General reflection"}
            </span>
            <span className="ml-auto flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
              <CalendarDays className="size-3" />
              {(entry.phaseCompletedAt ?? entry.createdAt).slice(0, 10)}
            </span>
          </header>
          <ReflectionCard reflection={entry.reflection} />
        </article>
      ))}
    </div>
  )
}
