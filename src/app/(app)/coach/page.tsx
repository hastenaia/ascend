import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { CoachChat } from "@/components/coach/coach-chat"
import { InsightCards } from "@/components/coach/insight-cards"
import { NextActionCard } from "@/components/coach/next-action-card"
import { PatternInsights } from "@/components/coach/pattern-insights"
import { WeeklyReviewCard } from "@/components/coach/weekly-review-card"
import { GeneratePhaseFlow } from "@/components/coach/generate-phase-flow"
import { GenerateQuestFlow } from "@/components/coach/generate-quest-flow"
import { WeeklyPlanFlow } from "@/components/coach/weekly-plan-flow"
import { getCurrentPhase } from "@/lib/phases/queries"
import { getMomentumSummary } from "@/lib/momentum/queries"
import { getGoalsOverview } from "@/lib/goals/queries"
import { loadHistory } from "@/lib/coach/history"
import { recommendNextActionForUser } from "@/lib/coach/next-action"
import { detectPatternsForUser } from "@/lib/patterns/gather"

export const metadata = { title: "AI Coach — Ascend" }
export const dynamic = "force-dynamic"

export default async function CoachPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <PageTransition>
        <div className="text-sm text-muted-foreground">Not authenticated.</div>
      </PageTransition>
    )
  }

  const [phase, momentum, goals, history, openRes, doneRes, nextAction, patterns] = await Promise.all([
    getCurrentPhase(supabase, user.id).catch(() => null),
    getMomentumSummary(supabase, user.id).catch(() => null),
    getGoalsOverview(supabase, user.id).catch(() => []),
    loadHistory(supabase, user.id, 12).catch(() => []),
    supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
    supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed"),
    recommendNextActionForUser(supabase, user.id).catch(() => ({ action: null, text: "" })),
    detectPatternsForUser(supabase, user.id).catch(() => ({ patterns: [], text: "" })),
  ])

  return (
    <PageTransition>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.22em]">AI Coach</h1>
            <p className="mt-1 text-sm text-muted-foreground">Guidance grounded in your real phases, quests, and momentum.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <GeneratePhaseFlow goals={goals.map((g) => ({ id: g.id, title: g.title }))} />
            <GenerateQuestFlow activePhaseId={phase?.id ?? null} />
            <WeeklyPlanFlow activePhaseId={phase?.id ?? null} />
          </div>
        </header>

        <InsightCards
          momentum={momentum ? { score: momentum.score, label: momentum.tier.label } : null}
          phaseProgressPct={phase?.progress ?? null}
          phaseTitle={phase ? phase.title.replace(/^PHASE \d+ — /, "") : null}
          openQuests={openRes.count ?? 0}
          completedQuests={doneRes.count ?? 0}
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <NextActionCard action={nextAction.action} questHref="/quests" />
          <PatternInsights patterns={patterns.patterns} />
          <WeeklyReviewCard />
        </div>

        <CoachChat initialHistory={history} />

        {!goals.length && (
          <p className="text-center text-xs text-muted-foreground">
            Tip: create a <Link href="/goals" className="underline hover:text-foreground">goal</Link> to unlock AI-generated phase journeys.
          </p>
        )}
        <p className="text-center text-[10px] text-muted-foreground">
          The coach supports healthy, sustainable growth — it will never give medical or mental-health advice.
        </p>
      </div>
    </PageTransition>
  )
}
