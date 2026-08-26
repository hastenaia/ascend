"use client"
import * as React from "react"
import { Award, BookOpen, Brain, CalendarDays, CircleCheckBig, Flag, ListChecks, NotebookPen, Quote, Target, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { CompletedPhaseDetail } from "@/lib/journey/queries"
import { ReflectionCard } from "@/components/reflections/reflection-card"
import { ReflectionModal } from "@/components/reflections/reflection-modal"

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function JourneyPhaseDetails({
  detail,
  open,
  onOpenChange,
}: {
  detail: CompletedPhaseDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [editReflection, setEditReflection] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border/60 sm:max-w-md">
        {detail && (
          <>
            <SheetHeader className="gap-2 pb-4 pr-6 text-left">
              <SheetTitle className="text-xl font-bold uppercase tracking-[0.12em]">{detail.title}</SheetTitle>
              {detail.completedAt && (
                <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  Completed{" "}
                  {new Date(detail.completedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                  {detail.startedAt &&
                    ` · ${Math.max(1, Math.round((new Date(detail.completedAt).getTime() - new Date(detail.startedAt).getTime()) / 86_400_000))} days`}
                </p>
              )}
              {detail.xpEarned > 0 && (
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[hsl(var(--gold)/0.14)] px-2.5 py-1 font-mono text-xs font-bold text-[hsl(var(--gold))]">
                  <Zap className="size-3" />+{detail.xpEarned} XP
                </span>
              )}
            </SheetHeader>

            <div className="space-y-6 px-4 pb-10">
              {detail.milestones.length > 0 && (
                <Section icon={ListChecks} title={`Milestones · ${detail.milestones.filter((m) => m.status === "completed").length}/${detail.milestones.length}`}>
                  <ul className="space-y-1.5">
                    {detail.milestones.map((m) => (
                      <li key={m.title} className="flex items-start gap-2 text-sm">
                        <CircleCheckBig
                          className={cn("mt-0.5 size-4 shrink-0", m.status === "completed" ? "text-primary" : "text-muted-foreground/40")}
                        />
                        <span className={cn(m.status === "completed" ? "text-foreground" : "text-muted-foreground")}>
                          {m.title}
                          {m.isFinalChallenge && <span className="ml-1.5 rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wider">Final</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {detail.questTotal > 0 && (
                <Section icon={Target} title={`Quests · ${detail.quests.filter((q) => q.done).length}/${detail.questTotal}`}>
                  <ul className="space-y-1.5">
                    {detail.quests.slice(0, 8).map((q) => (
                      <li key={q.title} className="flex items-center justify-between gap-2 text-sm">
                        <span className={cn("truncate", q.done ? "text-foreground" : "text-muted-foreground")}>{q.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {q.done ? `+${q.xpReward}` : "—"}
                        </span>
                      </li>
                    ))}
                    {detail.questTotal > 8 && (
                      <li className="text-xs italic text-muted-foreground">+{detail.questTotal - 8} more quests</li>
                    )}
                  </ul>
                </Section>
              )}

              {detail.reflection && (
                <Section icon={Quote} title="Reflection">
                  <ReflectionCard reflection={detail.reflection} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setEditReflection(true)}
                  >
                    <NotebookPen className="mr-1 size-3" /> {detail.reflection.learnings || detail.reflection.worked ? "Edit reflection" : "Expand into full reflection"}
                  </Button>
                </Section>
              )}

              {detail.achievements.length > 0 && (
                <Section icon={Award} title="Achievements earned">
                  <div className="flex flex-wrap gap-1.5">
                    {detail.achievements.map((a) => (
                      <span key={a.slug} className="rounded-full bg-[hsl(var(--gold)/0.14)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--gold))]">
                        {a.name}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {detail.statChanges.length > 0 && (
                <Section icon={Brain} title="Stat changes">
                  <div className="grid grid-cols-2 gap-1.5">
                    {detail.statChanges.map((s) => (
                      <div key={s.name} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                        <span className="capitalize text-muted-foreground">{s.name}</span>
                        <span className="font-mono font-semibold text-primary">+{s.delta}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {detail.skillChanges.length > 0 && (
                <Section icon={BookOpen} title="Skill changes">
                  <div className="grid grid-cols-2 gap-1.5">
                    {detail.skillChanges.slice(0, 8).map((s) => (
                      <div key={s.name} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                        <span className="truncate capitalize text-muted-foreground">{s.name.replace(/-/g, " ")}</span>
                        <span className="font-mono font-semibold text-primary">+{s.xp}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {detail.milestones.length === 0 && detail.questTotal === 0 && !detail.reflection && detail.statChanges.length === 0 && detail.skillChanges.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Flag className="size-4" /> No recorded activity in this chapter.
                </p>
              )}
            </div>
          </>
        )}

        {detail && (
          <ReflectionModal
            phaseId={detail.phaseId}
            phaseTitle={detail.title}
            initial={
              detail.reflection
                ? {
                    learnings: detail.reflection.learnings ?? "",
                    worked: detail.reflection.worked ?? "",
                    didntWork: detail.reflection.didnt_work ?? "",
                    changePlan: detail.reflection.change_plan ?? "",
                  }
                : undefined
            }
            open={editReflection}
            onOpenChange={setEditReflection}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
