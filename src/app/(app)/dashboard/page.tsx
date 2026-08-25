import { PageTransition } from "@/components/feedback/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/feedback/empty-state"
import { Target, Zap, Layers, Trophy, ScrollText, Sparkles, Bot, ArrowUpRight, Crown, Activity } from "lucide-react"
import Link from "next/link"

export const metadata = { title: "Dashboard — Ascend" }

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

export default function DashboardPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Become better, one phase at a time — your ascent at a glance.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="soft" className="rounded-full px-3 py-1">
              <Crown className="mr-1 size-3" /> Phase 1 · Foundation
            </Badge>
          </div>
        </div>

        {/* Top stats — placeholders clearly marked */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Current Phase" value="—" sub="No active phase yet" icon={Target} accent />
          <StatCard label="Level" value="1" sub="0 XP to next level" icon={Layers} />
          <StatCard label="Momentum" value="—" sub="Complete quests to build" icon={Activity} />
          <StatCard label="XP" value="0" sub="Earned this phase" icon={Zap} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: Phase + Stats */}
          <div className="space-y-6 lg:col-span-2">
            {/* Current Phase */}
            <Card className="overflow-hidden">
              <div className="h-1 w-full ascend-gradient-strong" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="size-4 text-primary" /> Current Phase
                  </CardTitle>
                  <Badge variant="outline" className="rounded-full">
                    Placeholder
                  </Badge>
                </div>
                <CardDescription>Goal → Phase → Milestones → Quests → XP → Skills → Stats → Final Challenge</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <EmptyState
                  icon={Target}
                  title="No active phase yet"
                  description="Choose a goal to begin your first phase. You will see milestones, progress, and your Final Challenge here."
                  action={
                    <Button asChild>
                      <Link href="/phase">
                        Go to Current Phase <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  }
                  className="border-0 bg-muted/30 shadow-none"
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Phase progress</span>
                    <span className="font-medium">— / —</span>
                  </div>
                  <Progress value={0} />
                </div>
              </CardContent>
            </Card>

            {/* Character Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" /> Character Stats
                </CardTitle>
                <CardDescription>Stats rise as skills level up. All placeholder until you earn XP.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {[
                  { name: "Focus", detail: "Deep work & clarity" },
                  { name: "Discipline", detail: "Consistency & follow-through" },
                  { name: "Resilience", detail: "Recovery & grit" },
                ].map((s) => (
                  <div key={s.name} className="rounded-2xl border bg-card p-4">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-lg font-bold tracking-tight">—</span>
                      <span className="text-xs text-muted-foreground">Placeholder</span>
                    </div>
                    <Progress value={0} className="mt-3 h-1.5" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Quests, Achievements, Coach */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScrollText className="size-4 text-primary" /> Today&apos;s Quests
                </CardTitle>
                <CardDescription>Daily actions tied to your phase milestones.</CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={ScrollText}
                  title="No quests for today"
                  description="Quests will appear when a phase is active. Each quest grants XP."
                  className="border-0 bg-muted/30 shadow-none"
                />
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
                <EmptyState
                  icon={Trophy}
                  title="No achievements yet"
                  description="Your first achievement is waiting — complete a quest to unlock it."
                  className="border-0 bg-muted/30 shadow-none"
                />
                <Button variant="ghost" className="mt-2 w-full" asChild>
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
                <p className="text-xs text-muted-foreground">&ldquo;Your AI Coach will become available once your journey begins.&rdquo;</p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/coach">Meet your coach</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Placeholders are visually distinct from real data. Nothing here is fabricated — it activates after you set a goal and create a phase.
        </p>
      </div>
    </PageTransition>
  )
}
