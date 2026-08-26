"use client"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Lock, Target, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressRing } from "@/components/progress-ring"

type Props = {
  phaseNumber: number
  title: string
  objective: string | null
  progressPct: number
  completedMilestones: number
  totalMilestones: number
  nextMilestoneTitle?: string | null
  rewardXp: number
  locked?: boolean
}

/** The visual centerpiece of the dashboard: current phase with depth, glow and a progress ring. */
export function PhaseHero({ phaseNumber, title, objective, progressPct, completedMilestones, totalMilestones, nextMilestoneTitle, rewardXp, locked }: Props) {
  const num = String(phaseNumber).padStart(2, "0")
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glow-primary sheen relative overflow-hidden rounded-3xl border border-primary/25 ascend-gradient-strong p-[1px]"
    >
      <div className="relative overflow-hidden rounded-[calc(1.5rem-1px)] bg-card">
        {/* watermark phase number */}
        <span aria-hidden className="stat-num pointer-events-none absolute -right-3 -top-9 select-none text-[10rem] font-black leading-none text-primary/[0.05]">
          {num}
        </span>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.07] to-transparent" />

        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Target className="size-3.5" /> Current Phase
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="text-gradient stat-num mr-2">{num}</span>
              {title}
            </h2>
            {objective ? <p className="mt-2 max-w-md text-sm italic leading-relaxed text-muted-foreground">&ldquo;{objective}&rdquo;</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>
                Milestones <span className="stat-num font-semibold text-foreground">{completedMilestones}/{totalMilestones}</span>
              </span>
              {nextMilestoneTitle && !locked ? (
                <span className="min-w-0">
                  Next <span className="font-medium text-foreground">{nextMilestoneTitle}</span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Zap className="size-3.5 text-gold" style={{ color: "hsl(var(--gold))" }} /> +{rewardXp} XP on completion
              </span>
            </div>

            <div className="mt-5 flex items-center gap-4">
              {!locked ? (
                <Button asChild size="sm" className="shadow-md shadow-primary/25">
                  <Link href="/phase">
                    Continue Phase <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href="/journey">
                    <Lock className="size-3.5" /> View Journey
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="shrink-0 self-center">
            <ProgressRing value={progressPct} size={132} strokeWidth={10}>
              <span className="stat-num text-3xl font-bold tracking-tight">{progressPct}%</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Complete</span>
            </ProgressRing>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
