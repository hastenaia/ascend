"use client"
import { CalendarDays, Quote, Trophy, Zap } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ACHIEVEMENT_ICONS } from "@/components/achievements/achievement-card"
import type { AchievementView } from "@/lib/achievements/queries"

export function AchievementDetail({
  view,
  open,
  onOpenChange,
}: {
  view: AchievementView | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const def = view?.def ?? null
  const Icon = def ? (ACHIEVEMENT_ICONS[def.icon_key] ?? Trophy) : Trophy
  const unlocked = view?.state === "unlocked"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border/60 sm:max-w-md">
        {view && def && (
          <>
            <SheetHeader className="gap-4 pb-4 pr-6 text-left">
              <span
                className={cn(
                  "flex size-14 items-center justify-center rounded-2xl ring-1",
                  unlocked
                    ? "bg-[hsl(var(--gold)/0.12)] ring-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold))]"
                    : view.state === "progress"
                      ? "bg-primary/10 ring-primary/30 text-primary"
                      : "bg-muted ring-border text-muted-foreground",
                )}
              >
                <Icon className="size-7" />
              </span>
              <SheetTitle className="text-xl font-bold tracking-tight">{def.name}</SheetTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">{def.description}</p>
              {def.flavor && (
                <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs italic leading-relaxed text-muted-foreground">
                  <Quote className="mt-0.5 size-3 shrink-0 opacity-60" />
                  {def.flavor}
                </p>
              )}
            </SheetHeader>

            <div className="space-y-5 px-4 pb-8">
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <span>{unlocked ? "Unlocked" : "Progress"}</span>
                  <span className="flex items-center gap-1 text-[hsl(var(--gold))]">
                    <Zap className="size-3" />+{def.xp_reward} XP
                  </span>
                </div>
                {unlocked ? (
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    {view.unlockedAt
                      ? new Date(view.unlockedAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                      : "Unlocked"}
                  </p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    <Progress value={(view.current / view.target) * 100} className="h-1.5" />
                    <p className="font-mono text-xs text-muted-foreground">
                      {view.current}/{view.target}
                    </p>
                  </div>
                )}
              </div>

              {!unlocked && (
                <p className="text-center text-xs text-muted-foreground">
                  Earned only through real activity — quests, streaks, and phases you actually complete.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
