import { PageTransition } from "@/components/feedback/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/feedback/empty-state"
import { Target, Zap, Trophy, ScrollText, Sparkles, Bot, ArrowUpRight, Check, Flame } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getDashboardData } from "@/lib/quests/queries"
import { LevelCard } from "@/components/level-card"
import { DashboardQuests } from "@/components/dashboard/dashboard-quests"

export const metadata = { title: "Dashboard — Ascend" }
export const dynamic = "force-dynamic"

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  accent?: boolean
}) {
  return (
    <Card className={accent ? "border-primary/20 bg-gradient-to-br from-primary/[0.08] to-violet-500/[0.06]" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-primary">
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
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

  const data = await getDashboardData(supabase, user.id).catch(() => null)
  const current = data?.current ?? null
  const phaseTitle = current ? current.title.replace(/^PHASE \d+ — /, "") : null

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Become better, one phase at a time — your ascent at a glance.</p>
          </div>
          {phaseTitle ? (
            <Badge variant="soft" className="w-fit rounded-full px-3 py-1 capitalize">
              <Target className="mr-1 size-3" /> {phaseTitle}
            </Badge>
          ) : (
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
              No active phase
            </Badge>
          )}
        </div>

        {!data ? (
          <EmptyState icon={Sparkles} title="Could not load your dashboard" description="Your progress could not be fetched. Try refreshing." />
        ) : (
          <>
            {/* Top stats — all real */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Current Phase"
                value={phaseTitle ?? "—"}
                sub={current ? `${current.completedMilestones}/${current.totalMilestones} milestones · ${current.progress}%` : "Start your journey"}
                icon={Target}
                accent
              />
              <StatCard label="XP Today" value={`+${data.xpToday}`} sub={`${data.level.totalXp.toLocaleString()} XP lifetime`} icon={Zap} />
              <StatCard label="Momentum" value={data.momentum.streak > 0 ? `${data.momentum.streak}d` : "—"} sub={data.momentum.streak > 0 ? `Streak alive · ${data.momentum.score} today` : "Complete a quest to ignite"} icon={Flame} />
              <StatCard label="Completed Today" value={`${data.completedTodayCount}`} sub={data.todaysQuests.length > 0 ? `${data.todaysQuests.length} quests due` : "All clear"} icon={Check} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left column */}
              <div className="space-y-6 lg:col-span-2">
                {/* Current Phase */}
                <Card className="overflow-hidden">
                  <div className="h-1 w-full ascend-gradient-strong" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="size-4 text-primary" /> Current Phase
                      </CardTitle>
                      {current && (
                        <Badge variant="outline" className="rounded-full capitalize">
                          {current.status}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>{current?.objective ?? "Goal → Phase → Milestones → Quests → XP → Skills → Stats → Final Challenge"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {current ? (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{current.title.replace(/^PHASE \d+ — /, "")}</span>
                          <span className="font-semibold">{current.progress}%</span>
                        </div>
                        <Progress value={current.progress} />
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Milestones: <span className="font-medium text-foreground">{current.completedMilestones} / {current.totalMilestones}</span>
                          </span>
                          <span>
                            Next milestone: <span className="font-medium text-foreground">{current.nextMilestone?.title ?? "All done"}</span>
                          </span>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/phase">
                            Open phase <ArrowUpRight className="size-4" />
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <EmptyState
                        icon={Target}
                        title="No active phase yet"
                        description="Start your journey to unlock phases, milestones, quests, and XP."
                        action={
                          <Button asChild>
                            <Link href="/phase">
                              Go to Current Phase <ArrowUpRight className="size-4" />
                            </Link>
                          </Button>
                        }
                        className="border-0 bg-muted/30 shadow-none"
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Level */}
                <LevelCard level={data.level} />

                {/* Character Stats — stat engine arrives in a later progression phase */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="size-4 text-primary" /> Character Stats
                    </CardTitle>
                    <CardDescription>Stats rise once the stat engine ships — coming in a later progression phase.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-3">
                    {[
                      { name: "Focus", detail: "Deep work & clarity" },
                      { name: "Discipline", detail: "Consistency & follow-through" },
                      { name: "Resilience", detail: "Recovery & grit" },
                    ].map((s) => (
                      <div key={s.name} className="rounded-2xl border bg-card p-4 opacity-75">
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.detail}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-lg font-bold tracking-tight">—</span>
                          <span className="text-xs text-muted-foreground">Coming soon</span>
                        </div>
                        <Progress value={0} className="mt-3 h-1.5" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Right column */}
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ScrollText className="size-4 text-primary" /> Today&apos;s Quests
                    </CardTitle>
                    <CardDescription>Due today — complete to earn XP and build momentum.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DashboardQuests quests={data.todaysQuests} />
                    <Button variant="outline" className="mt-4 w-full" asChild>
                      <Link href="/quests">Open Quests</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="size-4 text-primary" /> Recent Achievements
                    </CardTitle>
                    <CardDescription>Milestones worth remembering.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.recentMilestones.length === 0 ? (
                      <EmptyState
                        icon={Trophy}
                        title="No achievements yet"
                        description="Complete milestone-linked quests and finished milestones will appear here."
                        className="border-0 bg-muted/30 shadow-none"
                      />
                    ) : (
                      <div className="space-y-2">
                        {data.recentMilestones.map((m) => (
                          <div key={m.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                              <Check className="size-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{m.title}</p>
                              <p className="text-[11px] text-muted-foreground">Milestone completed</p>
                            </div>
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
                        Once your journey begins, the coach will reflect on your phase, momentum, and quests — no generic advice, no fake history.
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

            <p className="text-center text-xs text-muted-foreground">
              Every number on this page comes from your real quest, XP, and phase data.
            </p>
          </>
        )}
      </div>
    </PageTransition>
  )
}
