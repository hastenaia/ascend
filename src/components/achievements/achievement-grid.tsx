"use client"
import { motion, useReducedMotion } from "framer-motion"
import { Lock, ScrollText, Target, Route, Flame, Layers, Zap, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type AchievementSignals = {
  completedQuests: number
  completedMilestones: number
  completedPhases: number
  bestStreak: number
  level: number
  lifetimeXp: number
}

type CatalogEntry = {
  key: string
  title: string
  description: string
  icon: LucideIcon
  isUnlocked: (s: AchievementSignals) => boolean
  progressLabel?: (s: AchievementSignals) => string
}

export const ACHIEVEMENT_CATALOG: CatalogEntry[] = [
  {
    key: "first-quest",
    title: "First Step",
    description: "Complete your first quest.",
    icon: ScrollText,
    isUnlocked: (s) => s.completedQuests > 0,
    progressLabel: (s) => `${s.completedQuests}/1`,
  },
  {
    key: "first-milestone",
    title: "Milestone Reached",
    description: "Finish a phase milestone.",
    icon: Target,
    isUnlocked: (s) => s.completedMilestones > 0,
    progressLabel: (s) => `${Math.min(s.completedMilestones, 1)}/1`,
  },
  {
    key: "first-phase",
    title: "Phase Conqueror",
    description: "Complete a full phase and its Final Challenge.",
    icon: Route,
    isUnlocked: (s) => s.completedPhases > 0,
    progressLabel: (s) => `${Math.min(s.completedPhases, 1)}/1`,
  },
  {
    key: "week-momentum",
    title: "Seven Suns",
    description: "Reach a 7-day momentum streak.",
    icon: Flame,
    isUnlocked: (s) => s.bestStreak >= 7,
    progressLabel: (s) => `${Math.min(s.bestStreak, 7)}/7 days`,
  },
  {
    key: "level-five",
    title: "Ascending",
    description: "Reach Level 5.",
    icon: Layers,
    isUnlocked: (s) => s.level >= 5,
    progressLabel: (s) => `LVL ${Math.min(s.level, 5)}/5`,
  },
  {
    key: "century",
    title: "First Century",
    description: "Earn 500 lifetime XP.",
    icon: Zap,
    isUnlocked: (s) => s.lifetimeXp >= 500,
    progressLabel: (s) => `${Math.min(Math.round(s.lifetimeXp), 500)}/500 XP`,
  },
]

export function AchievementGrid({ signals }: { signals: AchievementSignals }) {
  const reduced = useReducedMotion()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ACHIEVEMENT_CATALOG.map((a, i) => {
        const unlocked = a.isUnlocked(signals)
        const Icon = a.icon
        return (
          <motion.div
            key={a.key}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : i * 0.05, duration: 0.35 }}
            whileHover={unlocked ? { y: -2 } : undefined}
          >
            <div
              className={cn(
                "relative h-full overflow-hidden rounded-2xl border p-4 transition-shadow",
                unlocked ? "gold-glow border-[hsl(var(--gold)/0.4)] bg-card" : "border-dashed bg-muted/20 opacity-70"
              )}
            >
              {unlocked && <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-[hsl(var(--gold)/0.15)] blur-xl" />}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl ring-1",
                    unlocked ? "bg-[hsl(var(--gold)/0.12)] ring-[hsl(var(--gold)/0.4)]" : "bg-muted ring-border text-muted-foreground"
                  )}
                  style={unlocked ? { color: "hsl(var(--gold))" } : undefined}
                >
                  {unlocked ? <Icon className="size-5" /> : <Lock className="size-4" />}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                    unlocked ? "bg-[hsl(var(--gold)/0.14)]" : "bg-muted text-muted-foreground"
                  )}
                  style={unlocked ? { color: "hsl(var(--gold))" } : undefined}
                >
                  {unlocked ? "Unlocked" : "Locked"}
                </span>
              </div>
              <p className={cn("mt-3 text-sm font-bold tracking-tight", !unlocked && "text-muted-foreground")}>{a.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
              {!unlocked && a.progressLabel ? <p className="stat-num mt-2 text-[11px] font-semibold text-muted-foreground">{a.progressLabel(signals)}</p> : null}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
