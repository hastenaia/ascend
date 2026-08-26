import Link from "next/link"
import type { ReactNode } from "react"
import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAnalyticsBundle } from "@/lib/analytics/queries"
import { buildInsights } from "@/lib/analytics/insights"
import { InsightList } from "@/components/analytics/insight-list"
import {
  CategoryChart,
  MomentumTrendChart,
  MonthlyActivityChart,
  SkillsChart,
  StatsRadar,
  WeeklyActivityChart,
  XpHistoryChart,
} from "@/components/analytics/charts-lazy"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export const metadata = { title: "Analytics — Ascend" }
export const dynamic = "force-dynamic"

function ChartCard({ question, sub, children }: { question: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{question}</CardTitle>
        {sub && <CardDescription className="text-xs">{sub}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default async function AnalyticsPage() {
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

  const b = await getAnalyticsBundle(supabase, user.id).catch(() => null)
  if (!b) {
    return (
      <PageTransition>
        <EmptyState icon={BarChart3} title="Could not load analytics" description="Your data could not be fetched. Try refreshing." />
      </PageTransition>
    )
  }

  const insights = buildInsights(b)
  const hasAny = b.totalXp > 0 || b.questsCompletedTotal > 0

  return (
    <PageTransition>
      <div className="space-y-6">
        <header>
          <h1 className="text-sm font-bold uppercase tracking-[0.22em]">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every chart answers a real question about your data.</p>
        </header>

        {!hasAny ? (
          <EmptyState
            icon={BarChart3}
            title="Analytics unlock with your first quest"
            description="Complete quests and phases — charts here build exclusively from your real activity."
            action={
              <Button asChild variant="outline">
                <Link href="/quests">Go to quests</Link>
              </Button>
            }
          />
        ) : (
          <>
            {/* Personal insights — factual only */}
            <Card className="border-primary/20 bg-primary/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Personal Insights</CardTitle>
                <CardDescription className="text-xs">Computed from your actual data — facts, not flattery.</CardDescription>
              </CardHeader>
              <CardContent>
                <InsightList insights={insights} />
              </CardContent>
            </Card>

            {/* PROGRESSION */}
            <section className="grid gap-3 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ChartCard question="How much XP have I gained?" sub={`Lifetime ${b.totalXp} XP · Level ${b.level}`}>
                  <XpHistoryChart data={b.xpSeries} />
                </ChartCard>
              </div>
              <ChartCard
                question="How fast am I leveling?"
                sub={`Level ${b.level} → ${b.level + 1}`}
              >
                <div className="space-y-2 pt-1">
                  <p className="stat-num text-4xl font-bold">{b.xpToNext}<span className="ml-1 text-sm font-medium text-muted-foreground">XP to next level</span></p>
                  <Progress value={Math.min(100, Math.round(((b.totalXp - 0) / Math.max(1, b.xpToNext + 1)) * 100))} className="h-2" />
                  <p className="font-mono text-[10.5px] text-muted-foreground">
                    {b.estimatedDaysToNextLevel !== null
                      ? `≈ ${b.estimatedDaysToNextLevel} days at your +${b.xpPerDay14}/day pace (last 14 days)`
                      : `+${b.xpPerDay14} XP/day over the last 14 days`}
                  </p>
                </div>
              </ChartCard>
            </section>

            {/* ACTIVITY */}
            <section className="grid gap-3 lg:grid-cols-3">
              <ChartCard question="Is my weekly activity increasing?" sub={`${b.completionsThisWeek} this week vs ${b.completionsLastWeek} last week`}>
                <WeeklyActivityChart data={b.weekly} />
              </ChartCard>
              <ChartCard question="Monthly long view" sub="Completions per month">
                <MonthlyActivityChart data={b.monthly} />
              </ChartCard>
              <ChartCard question="How is my momentum moving?" sub={`Currently ${b.currentMomentum}/100`}>
                <MomentumTrendChart data={b.momentum} />
              </ChartCard>
            </section>

            {/* DISTRIBUTION */}
            <section className="grid gap-3 lg:grid-cols-3">
              <ChartCard question="Which areas do I work on most?" sub="Completed quests by category">
                {b.categories.length > 0 ? <CategoryChart data={b.categories} /> : <p className="py-8 text-center text-xs text-muted-foreground">No completions yet.</p>}
              </ChartCard>
              <ChartCard question="Where are my stats strongest?" sub={`${b.stats.length} attributes tracked`}>
                {b.stats.length > 0 ? <StatsRadar data={b.stats} /> : <p className="py-8 text-center text-xs text-muted-foreground">Complete quests to grow stats.</p>}
              </ChartCard>
              <ChartCard question="Which skills have I invested in most?" sub="Top skills by XP">
                {b.skills.length > 0 ? <SkillsChart data={b.skills} /> : <p className="py-8 text-center text-xs text-muted-foreground">Link quests to skills to see this.</p>}
              </ChartCard>
            </section>

            {/* COMPLETION: PHASES / MILESTONES / GOALS / ACHIEVEMENTS */}
            <section className="grid gap-3 lg:grid-cols-3">
              <ChartCard question="How far through my journey am I?" sub={`${b.milestonesDone}/${b.milestonesTotal} milestones overall`}>
                <ul className="space-y-2.5 pt-1">
                  {b.phases.map((p) => (
                    <li key={p.title}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("truncate pr-2", p.status === "locked" && "text-muted-foreground")}>{p.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{p.status === "completed" ? "✓" : `${p.progressPct}%`}</span>
                      </div>
                      <Progress value={p.progressPct} className="mt-1 h-1.5" />
                    </li>
                  ))}
                  {b.phases.length === 0 && <li className="text-xs text-muted-foreground">Initialize your journey to see phase progress.</li>}
                </ul>
              </ChartCard>

              <ChartCard question="Which goals am I closing in on?" sub="Phase completion per goal">
                <ul className="space-y-2.5 pt-1">
                  {b.goals.map((g) => (
                    <li key={g.title}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate pr-2">{g.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{g.phasesCompleted}/{g.phasesTotal || "–"}</span>
                      </div>
                      <Progress value={g.progressPct} className="mt-1 h-1.5" />
                    </li>
                  ))}
                  {b.goals.length === 0 && (
                    <li className="text-xs text-muted-foreground">
                      No goals yet — <Link href="/goals" className="underline hover:text-foreground">create one</Link>.
                    </li>
                  )}
                </ul>
              </ChartCard>

              <ChartCard question="What have I unlocked?" sub={`${b.achievementsUnlocked.length} achievements earned`}>
                <ul className="space-y-1.5 pt-1">
                  {b.achievementsUnlocked.map((a) => (
                    <li key={a.name + a.date} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                      <span className="truncate font-semibold">{a.name}</span>
                      <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">{a.date}</span>
                    </li>
                  ))}
                  {b.achievementsUnlocked.length === 0 && <li className="text-xs text-muted-foreground">Complete a quest to earn your first achievement.</li>}
                </ul>
              </ChartCard>
            </section>
          </>
        )}
      </div>
    </PageTransition>
  )
}
