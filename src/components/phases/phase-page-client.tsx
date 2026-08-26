/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { Target, Trophy, Sparkles, Check, Lock, Route as RouteIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/feedback/empty-state"
import { PhaseTimeline } from "@/components/phases/phase-timeline"
import { PhaseCompleteDialog } from "@/components/phases/phase-complete-dialog"
import { initializeJourney, completePhase, beginNextPhase, toggleMilestone } from "@/lib/phases/actions"
import type { PhaseWithProgress } from "@/lib/phases/queries"

type Props = {
  hasJourney: boolean
  current: PhaseWithProgress | null
  timeline: { id: string; title: string; order_index: number; status: string; subtitle?: string | null }[]
  nextPhaseTitle?: string | null
  nextPhaseId?: string | null
}

export function PhasePageClient({ hasJourney, current, timeline, nextPhaseTitle, nextPhaseId }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [completeOpen, setCompleteOpen] = React.useState(false)
  const [earnedXp, setEarnedXp] = React.useState(0)

  async function handleStart() {
    setBusy(true)
    try {
      const res = await initializeJourney()
      toast.success(res.created ? "Journey started" : "Journey already exists")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start journey")
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(id: string) {
    try {
      await toggleMilestone(id)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update milestone")
    }
  }

  async function handleComplete() {
    if (!current) return
    setBusy(true)
    try {
      const { xp } = await completePhase(current.id)
      setEarnedXp(xp)
      setCompleteOpen(true)
      toast.success(`Phase completed +${xp} XP`)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cannot complete yet")
    } finally {
      setBusy(false)
    }
  }

  async function handleBeginNext() {
    if (!nextPhaseId) return
    await beginNextPhase(nextPhaseId)
    router.refresh()
  }

  if (!hasJourney) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Current Phase</h1>
          <p className="text-sm text-muted-foreground">A phase is a focused chapter of growth with milestones, quests, and a final challenge.</p>
        </div>
        <EmptyState
          icon={Target}
          title="Your journey hasn't started yet."
          description="Start with Foundation to unlock your first phase, milestones, and Final Challenge. You can personalize later."
          action={
            <Button onClick={handleStart} disabled={busy}>
              {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
              Start Journey
            </Button>
          }
        />
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">What you will get</p>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <li>• 6 phases from Foundation to Legacy (templates, not yet your journey)</li>
            <li>• Milestones per phase · Quests → XP · Final Challenge</li>
            <li>• Progress is real: completed milestones / total</li>
          </ul>
        </div>
      </div>
    )
  }

  if (!current) {
    // Has journey but no active/available (all completed?)
    return (
      <div className="space-y-6">
        <EmptyState icon={Trophy} title="All phases completed" description="You have finished your current journey. New personalized journeys will be available soon." />
        <PhaseTimeline items={timeline.map((t) => ({ id: t.id, title: t.title, order_index: t.order_index, status: t.status as any, subtitle: t.subtitle }))} />
      </div>
    )
  }

  const fc = current.final_challenge as { title?: string; status?: string } | null
  const fcLabel = fc ? (fc.status === "completed" ? "Completed" : current.milestones.some((m) => m.is_final_challenge && m.status === "completed") ? "Completed" : "Locked") : "Locked"
  const fcLocked = fcLabel !== "Completed"

  // Display-only completion lines for default journey slugs; personalized phases fall back gracefully
  const COMPLETION_TAGLINES: Record<string, string> = {
    foundation: "You built the foundation.",
    discipline: "You forged your discipline.",
    growth: "You grew beyond your limits.",
    mastery: "You sharpened your craft.",
    expansion: "You expanded what's possible.",
    legacy: "Your legacy has begun.",
  }
  const tagline = (current.slug ? COMPLETION_TAGLINES[current.slug] : undefined) ?? current.objective ?? "A chapter closed."

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Current Phase</p>
        <h1 className="text-2xl font-bold tracking-tight">{current.title.replace(/^PHASE \d+ — /, "")}</h1>
        {current.objective ? <p className="text-sm text-muted-foreground">&ldquo;{current.objective}&rdquo;</p> : null}
      </div>

      {/* Hero card */}
      <Card className="sheen glow-primary relative overflow-hidden border-primary/25">
        <div className="h-1 w-full ascend-gradient-strong" />
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 select-none text-[9rem] font-black leading-none text-primary/[0.05] stat-num">
          {String(current.phase_number ?? current.order_index ?? 1).padStart(2, "0")}
        </div>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" /> {current.title}
            </CardTitle>
            <Badge variant={current.status === "active" ? "default" : "outline"} className="capitalize rounded-full">
              {current.status}
            </Badge>
          </div>
          <CardDescription>{current.objective ?? current.description ?? ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="stat-num text-lg font-bold text-gradient">{current.progress}%</p>
              <Progress value={current.progress} className="mt-2 h-1.5 shimmer" />
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Milestones</p>
              <p className="stat-num text-lg font-bold">
                {current.completedMilestones} / {current.totalMilestones}
              </p>
              <p className="text-xs text-muted-foreground">completed</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Final Challenge</p>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                {fcLocked ? <Lock className="size-3.5 text-muted-foreground" /> : <Check className="size-3.5 text-emerald-500" />}
                {fcLabel}
              </p>
              <p className="text-xs text-muted-foreground truncate">{fc?.title ?? "Complete all milestones"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Next milestone:</span>
            <span className="font-medium">{current.nextMilestone?.title ?? "All done"}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Next Phase:</span>
            <span className="font-medium">{nextPhaseTitle ? nextPhaseTitle.replace(/^PHASE \d+ — /, "") : "—"}</span>
          </div>

          {current.canComplete ? (
            <Button className="w-full" onClick={handleComplete} disabled={busy}>
              {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
              Complete Phase <Trophy className="size-4" />
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">Complete all milestones and the final challenge to finish this phase.</p>
          )}
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Milestones
          </CardTitle>
          <CardDescription>Progress is milestones completed / total. Tap to toggle demo progress.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {current.milestones.map((m) => {
            const done = m.status === "completed"
            return (
              <motion.div key={m.id} whileHover={{ scale: 1.01 }} className={`flex items-center justify-between rounded-xl border p-3 ${done ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50" : "bg-card"}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-medium flex items-center gap-2 ${done ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                    {done ? <Check className="size-4 text-emerald-500" /> : <span className="size-2 rounded-full bg-primary" />}
                    {m.title}
                    {m.is_final_challenge && <Badge variant="soft" className="ml-1">Final</Badge>}
                  </p>
                  {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                  <p className="text-xs text-muted-foreground">+{m.xp_reward} XP</p>
                </div>
                <Button size="sm" variant={done ? "outline" : "default"} onClick={() => handleToggle(m.id)}>
                  {done ? "Undo" : "Complete"}
                </Button>
              </motion.div>
            )
          })}
          <Separator className="my-2" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Earned XP if completed now</span>
            <span className="font-semibold">+{current.earnedXp} XP</span>
          </div>
        </CardContent>
      </Card>

      {/* Timeline preview */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <RouteIcon className="size-4 text-primary" /> Journey
        </h2>
        <PhaseTimeline items={timeline.map((t) => ({ id: t.id, title: t.title, order_index: t.order_index, status: t.status as any, subtitle: t.subtitle }))} />
      </div>

      <PhaseCompleteDialog
        key={current.id}
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        phaseId={current.id}
        phaseTitle={current.title}
        tagline={tagline}
        xp={earnedXp || current.earnedXp}
        done={current.completedMilestones}
        total={current.totalMilestones}
        finalChallenge={fcLabel}
        nextPhaseTitle={nextPhaseTitle}
        onBeginNext={nextPhaseId ? handleBeginNext : undefined}
      />
    </div>
  )
}
