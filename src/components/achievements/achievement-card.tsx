"use client"
import { Lock } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { BookOpen, Brain, Flame, Flag, ScrollText, Trophy, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AchievementView } from "@/lib/achievements/queries"

export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  "scroll-text": ScrollText,
  "book-open": BookOpen,
  brain: Brain,
  flame: Flame,
  flag: Flag,
  "trending-up": TrendingUp,
  trophy: Trophy,
}

export function AchievementCard({ view, onSelect }: { view: AchievementView; onSelect: () => void }) {
  const { def, state, current, target, unlockedAt } = view
  const Icon = ACHIEVEMENT_ICONS[def.icon_key] ?? Trophy
  const unlocked = state === "unlocked"

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-2xl border p-4 text-left transition-all",
        unlocked
          ? "gold-glow border-[hsl(var(--gold)/0.4)] bg-card hover:-translate-y-0.5"
          : state === "progress"
            ? "border-primary/25 bg-card hover:border-primary/40 hover:-translate-y-0.5"
            : "border-dashed bg-muted/20 opacity-70 hover:opacity-90",
      )}
    >
      {unlocked && (
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-[hsl(var(--gold)/0.15)] blur-xl" />
      )}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl ring-1",
            unlocked
              ? "bg-[hsl(var(--gold)/0.12)] ring-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold))]"
              : state === "progress"
                ? "bg-primary/10 ring-primary/30 text-primary"
                : "bg-muted ring-border text-muted-foreground",
          )}
        >
          {unlocked || state === "progress" ? <Icon className="size-5" /> : <Lock className="size-4" />}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
            unlocked
              ? "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]"
              : state === "progress"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
          )}
        >
          {unlocked ? "Unlocked" : state === "progress" ? `${Math.round((current / target) * 100)}%` : "Locked"}
        </span>
      </div>
      <p className={cn("mt-3 text-sm font-bold tracking-tight", !unlocked && "text-muted-foreground")}>{def.name}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{def.description}</p>
      {unlocked ? (
        <p className="stat-num mt-2 text-[11px] font-semibold text-[hsl(var(--gold))]">
          {unlockedAt ? new Date(unlockedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""}
        </p>
      ) : state === "progress" ? (
        <div className="mt-2 space-y-1">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(current / target) * 100}%` }} />
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {current}/{target}
          </p>
        </div>
      ) : null}
      <span className="sr-only">View details</span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
