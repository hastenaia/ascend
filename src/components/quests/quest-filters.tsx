"use client"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type QuestFilterState = {
  status: "active" | "completed"
  type: "all" | "daily" | "weekly" | "one-time"
  difficulty: "all" | "easy" | "medium" | "hard" | "challenge"
  query: string
}

export const defaultFilters: QuestFilterState = { status: "active", type: "all", difficulty: "all", query: "" }

type Props = {
  value: QuestFilterState
  onChange: (next: QuestFilterState) => void
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
        active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

export function QuestFilters({ value, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <Group>
        {(["active", "completed"] as const).map((s) => (
          <Chip key={s} active={value.status === s} onClick={() => onChange({ ...value, status: s })}>
            {s}
          </Chip>
        ))}
        <div className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <Chip active={value.type === "all"} onClick={() => onChange({ ...value, type: "all" })}>
          all types
        </Chip>
        {(["daily", "weekly", "one-time"] as const).map((t) => (
          <Chip key={t} active={value.type === t} onClick={() => onChange({ ...value, type: t })}>
            {t}
          </Chip>
        ))}
      </Group>
      <Group>
        <Chip active={value.difficulty === "all"} onClick={() => onChange({ ...value, difficulty: "all" })}>
          any difficulty
        </Chip>
        {(["easy", "medium", "hard", "challenge"] as const).map((d) => (
          <Chip key={d} active={value.difficulty === d} onClick={() => onChange({ ...value, difficulty: d })}>
            {d}
          </Chip>
        ))}
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search quests…"
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </Group>
    </div>
  )
}
