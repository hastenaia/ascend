import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, CircleCheckBig, Lock, Target } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { GoalDetail } from "@/components/goals/goal-detail"
import { GoalProgress } from "@/components/goals/goal-progress"
import { GoalUnderstandPanel } from "@/components/goals/goal-understand-panel"
import { GoalDecomposePanel } from "@/components/goals/goal-decompose-panel"
import { getGoalDetail, getJourneyBlueprints } from "@/lib/goals/queries"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const PHASE_STATUS_DOT: Record<string, string> = {
  completed: "border-transparent bg-[hsl(var(--gold))]",
  active: "border-primary/40 bg-primary/20 ring-2 ring-primary/15",
  available: "border-primary/50 bg-background",
  locked: "border-border bg-muted",
}

function daysLeft(target: string): number | null {
  const ms = new Date(target + "T00:00:00").getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [detail, blueprints] = await Promise.all([
    getGoalDetail(supabase, user.id, id).catch(() => null),
    getJourneyBlueprints(supabase).catch(() => []),
  ])
  if (!detail) notFound()

  const { goal, phases } = detail
  const targetDays = goal.target_date ? daysLeft(goal.target_date) : null

  return (
    <PageTransition>
      <div className="space-y-6">
        <Link href="/goals" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All goals
        </Link>

        {/* GOAL */}
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">{goal.category}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", goal.priority === "critical" ? "bg-destructive/10 text-destructive" : goal.priority === "high" ? "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]" : "bg-muted text-muted-foreground")}>
              {goal.priority} priority
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", goal.status === "completed" ? "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]" : "bg-muted text-muted-foreground")}>
              {goal.status}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{goal.title}</h1>
          {goal.desired_outcome && <p className="max-w-2xl text-sm italic leading-relaxed text-muted-foreground">&ldquo;{goal.desired_outcome}&rdquo;</p>}
          {goal.description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{goal.description}</p>}
          <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {goal.target_date
              ? `Target ${new Date(goal.target_date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
              : "No target date"}
            {targetDays !== null && goal.status !== "completed" && (
              <span className={cn(targetDays < 0 ? "text-destructive" : targetDays <= 30 ? "text-[hsl(var(--gold))]" : "")}>
                · {targetDays < 0 ? `${Math.abs(targetDays)} days overdue` : `${targetDays} days left`}
              </span>
            )}
          </p>
        </header>

        {/* OVERALL PROGRESS */}
        <section className="rounded-xl border p-4">
          <GoalProgress
            progressPct={detail.overallProgressPct}
            milestonesDone={detail.milestonesDone}
            milestonesTotal={detail.milestonesTotal}
            phasesCompleted={phases.filter((p) => p.status === "completed").length}
            phasesTotal={phases.length}
          />
        </section>

        {/* Phase arc */}
        {phases.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Phase Arc</h2>
            <ol className="space-y-1.5">
              {phases.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border bg-card/60 px-3 py-2">
                  <span aria-hidden className={cn("flex size-4 items-center justify-center rounded-full border-2", PHASE_STATUS_DOT[p.status])}>
                    {p.status === "completed" && <CircleCheckBig className="hidden" />}
                    {p.status === "locked" && <Lock className="size-1.5 text-muted-foreground" />}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-sm", p.status === "locked" && "text-muted-foreground")}>
                    <span className="font-mono text-[10px] text-muted-foreground/60">{String(p.orderIndex).padStart(2, "0")} </span>
                    {p.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                    {p.status === "completed" ? <CircleCheckBig className="size-4 text-[hsl(var(--gold))]" /> : `${p.progressPct}%`}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* CURRENT PHASE / NEXT MILESTONE / RECOMMENDED QUESTS (interactive) */}
        <GoalDetail data={detail} blueprints={blueprints} />

        {/* P2.1 Goal Intelligence: Understand + Decompose (proposal-only, user-confirmed) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <GoalUnderstandPanel goalId={goal.id} />
          <GoalDecomposePanel goalId={goal.id} />
        </div>

        {!detail.activePhase && phases.length > 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="size-4" /> No active phase right now.
          </p>
        )}
      </div>
    </PageTransition>
  )
}
