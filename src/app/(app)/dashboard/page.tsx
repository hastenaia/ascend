import { PageTransition } from "@/components/feedback/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/feedback/empty-state"
import { Trophy, ScrollText, Bot, ArrowUpRight, Check, Target } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getDashboardData } from "@/lib/quests/queries"
import { getStatsOverview } from "@/lib/stats/queries"
import { LevelCard } from "@/components/level-card"
import { DashboardQuests } from "@/components/dashboard/dashboard-quests"
import { PhaseHero } from "@/components/dashboard/phase-hero"
import { MomentumGauge } from "@/components/momentum/momentum-gauge"
import { WellnessCard, WellnessFooter } from "@/components/dashboard/wellness-card"
import { getMomentumSummary } from "@/lib/momentum/queries"
import { CharacterProgress } from "@/components/dashboard/character-progress"

export const metadata = { title: "Dashboard — Ascend" }
export const dynamic = "force-dynamic"

function greetingFor(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return "Up late"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export default async function DashboardPage() {
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

  const [data, profileRes, statSummaries, momentumSummary] = await Promise.all([
    getDashboardData(supabase, user.id).catch(() => null),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    getStatsOverview(supabase).catch(() => []),
    getMomentumSummary(supabase, user.id).catch(() => null),
  ])

  const name = ((profileRes.data as { display_name: string | null } | null)?.display_name ?? "").trim() || null
  const current = data?.current ?? null
  const phaseTitle = current ? current.title.replace(/^PHASE \d+ — /, "") : null

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight sm:text-3xl">
            {greetingFor()}{name ? `, ${name}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Ready to continue your ascent?</p>
        </div>

        {!data ? (
          <EmptyState icon={Target} title="Could not load your dashboard" description="Your progress could not be fetched. Try refreshing." />
        ) : (
          <>
            {/* PRIMARY — Current Phase centerpiece */}
            {current ? (
              <PhaseHero
                phaseNumber={current.phase_number ?? current.order_index ?? 1}
                title={phaseTitle ?? ""}
                objective={current.objective}
                progressPct={current.progress}
                completedMilestones={current.completedMilestones}
                totalMilestones={current.totalMilestones}
                nextMilestoneTitle={current.nextMilestone?.title}
                rewardXp={current.reward_xp}
              />
            ) : (
              <Card className="sheen overflow-hidden">
                <div className="h-1 w-full ascend-gradient-strong" />
                <CardContent className="p-8">
                  <EmptyState
                    icon={Target}
                    title="Your journey hasn't begun"
                    description="Start your journey to unlock phases, milestones, quests, and XP — your ascent begins with one step."
                    action={
                      <Button asChild>
                        <Link href="/phase">
                          Begin your journey <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    }
                    className="border-0 bg-transparent shadow-none"
                  />
                </CardContent>
              </Card>
            )}

            {/* Mobile-first stacking; desktop splits into command columns.
                Order: Phase → XP/Level → Quests → Momentum → Stats → Achievements */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="order-2 space-y-6 lg:order-1 lg:col-span-2">
                {/* PRIMARY — Today's quests */}
                <Card className="sheen">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ScrollText className="size-4 text-primary" /> Today&apos;s Quests
                    </CardTitle>
                    <CardDescription>
                      {data.todaysQuests.length > 0
                        ? `${data.todaysQuests.length} quest${data.todaysQuests.length === 1 ? "" : "s"} due · ${data.completedTodayCount} completed today`
                        : "Nothing due right now"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DashboardQuests quests={data.todaysQuests} />
                    <Button variant="outline" className="mt-4 w-full" asChild>
                      <Link href="/quests">Open Quests</Link>
                    </Button>
                  </CardContent>
                </Card>

                {/* SECONDARY — Character Progress (persisted user_stats) */}
                <CharacterProgress stats={statSummaries} />

                {/* TERTIARY — Recent achievements */}
                <Card className="sheen">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="size-4" style={{ color: "hsl(var(--gold))" }} /> Recent Achievements
                    </CardTitle>
                    <CardDescription>Milestones worth remembering.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.recentMilestones.length === 0 ? (
                      <p className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                        Complete milestone-linked quests — finished milestones appear here as collectibles.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {data.recentMilestones.map((m) => (
                          <div key={m.id} className="gold-glow flex items-center gap-3 rounded-xl border border-dashed border-[hsl(var(--gold)/0.35)] bg-card p-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--gold)/0.12)] ring-1 ring-[hsl(var(--gold)/0.35)]" style={{ color: "hsl(var(--gold))" }}>
                              <Trophy className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{m.title}</p>
                              <p className="text-[11px] text-muted-foreground">Unlocked · Milestone complete</p>
                            </div>
                            <Check className="size-4 shrink-0 text-emerald-500" />
                          </div>
                        ))}
                      </div>
                    )}
                    <Separator className="my-3" />
                    <Button variant="ghost" className="w-full" asChild>
                      <Link href="/achievements">View all</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="order-1 space-y-6 lg:order-2">
                {/* SECONDARY — XP / Level */}
                <LevelCard level={data.level} />

                {/* SECONDARY — Momentum (sustainable consistency) + Recovery */}
                {momentumSummary && (
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">Momentum</CardTitle>
                      <CardDescription>Consistency over intensity — rest included.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <MomentumGauge summary={momentumSummary} />
                      <Separator />
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Recovery</p>
                        <WellnessCard recoveryKindsToday={momentumSummary.recoveryKindsToday} />
                      </div>
                      <WellnessFooter />
                    </CardContent>
                  </Card>
                )}

                {/* TERTIARY — Coach teaser */}
                <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.06] via-violet-500/[0.05] to-transparent">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="size-4 text-primary" /> AI Insight
                    </CardTitle>
                    <CardDescription>Guidance grounded in your actual progress.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-sm font-medium">Your AI Coach is warming up</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        The coach will reflect on your phase, momentum, and quests — no generic advice.
                      </p>
                    </div>
                    <Separator />
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href="/coach">Meet your coach</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">Every number here comes from your real quest, XP, and phase data.</p>
          </>
        )}
      </div>
    </PageTransition>
  )
}
