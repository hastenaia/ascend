/**
 * Deterministic weekly metrics for the Weekly Review.
 *
 * The app COMPUTES every number; the AI only writes the narrative around them.
 * Pure functions here are unit-tested in metrics.test.ts.
 */

export type WeekWindow = { start: string; end: string } // YYYY-MM-DD, Monday→Sunday

export type WeekCompletion = { questId: string; difficulty: string; category: string; at: string }

export type WeekData = {
  window: WeekWindow
  completions: WeekCompletion[]
  /** Quests expected this week: one-time due within the window (or carried overdue) + active recurring quests */
  plannedQuests: { id: string; difficulty: string; recurrence: string }[]
  /** postpone delay in days, one entry per postponement event in the window */
  postponeDelays: number[]
  skipEvents: number
  adaptEvents: number
  xpDelta: number
  momentumStart: number
  momentumNow: number
  bestStreak: number
  statDeltas: { name: string; delta: number }[]
  skillDeltas: { name: string; delta: number }[]
  milestonesCompleted: number
  goalsAdvanced: number
}

export type DifficultyPerformance = { difficulty: string; completed: number; planned: number; rate: number }

export type WeeklyMetrics = {
  window: WeekWindow
  questsCompleted: number
  questsPlanned: number
  completionRate: number
  skipped: number
  postponed: number
  avgDelayDays: number
  adapts: number
  xpEarned: number
  momentumStart: number
  momentumNow: number
  momentumDeltaPct: number | null
  momentumDeltaPts: number
  bestStreak: number
  statProgress: { name: string; delta: number }[]
  skillProgress: { name: string; delta: number }[]
  milestonesCompleted: number
  goalsAdvanced: number
  difficultyPerformance: DifficultyPerformance[]
  isPartialWeek: boolean
}

export const WEEKLY_DIFFICULTIES = ["easy", "medium", "hard", "challenge"] as const

function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** ISO (Monday-start) week window containing the given date. */
export function isoWeekWindow(d = new Date()): WeekWindow {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = date.getDay() || 7
  date.setDate(date.getDate() - (day - 1))
  const start = todayIso(date)
  date.setDate(date.getDate() + 6)
  const end = todayIso(date)
  return { start, end }
}

export function previousWeekWindow(window: WeekWindow): WeekWindow {
  const start = new Date(window.start + "T00:00:00Z")
  start.setUTCDate(start.getUTCDate() - 7)
  const end = new Date(window.end + "T00:00:00Z")
  end.setUTCDate(end.getUTCDate() - 7)
  return { start: todayIso(start), end: todayIso(end) }
}

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 0)

export function computeWeeklyMetrics(week: WeekData, now = todayIso()): WeeklyMetrics {
  const completedByDifficulty = new Map<string, number>()
  for (const c of week.completions) {
    completedByDifficulty.set(c.difficulty, (completedByDifficulty.get(c.difficulty) ?? 0) + 1)
  }

  const plannedByDifficulty = new Map<string, number>()
  for (const p of week.plannedQuests) {
    plannedByDifficulty.set(p.difficulty, (plannedByDifficulty.get(p.difficulty) ?? 0) + 1)
  }

  const difficultyPerformance: DifficultyPerformance[] = WEEKLY_DIFFICULTIES.map((difficulty) => {
    const completed = completedByDifficulty.get(difficulty) ?? 0
    const planned = plannedByDifficulty.get(difficulty) ?? 0
    return { difficulty, completed, planned, rate: pct(completed, planned) }
  }).filter((d) => d.planned > 0 || d.completed > 0)

  const avgDelay = week.postponeDelays.length > 0 ? Math.round((week.postponeDelays.reduce((s, v) => s + v, 0) / week.postponeDelays.length) * 10) / 10 : 0

  const momentumDeltaPct = week.momentumStart > 0 ? Math.round(((week.momentumNow - week.momentumStart) / week.momentumStart) * 100) : null

  const isPartial = now <= week.window.end && now >= week.window.start

  return {
    window: week.window,
    questsCompleted: week.completions.length,
    questsPlanned: week.plannedQuests.length,
    completionRate: pct(week.completions.length, week.plannedQuests.length),
    skipped: week.skipEvents,
    postponed: week.postponeDelays.length,
    avgDelayDays: avgDelay,
    adapts: week.adaptEvents,
    xpEarned: week.xpDelta,
    momentumStart: week.momentumStart,
    momentumNow: week.momentumNow,
    momentumDeltaPct,
    momentumDeltaPts: Math.round(week.momentumNow - week.momentumStart),
    bestStreak: week.bestStreak,
    statProgress: week.statDeltas,
    skillProgress: week.skillDeltas,
    milestonesCompleted: week.milestonesCompleted,
    goalsAdvanced: week.goalsAdvanced,
    difficultyPerformance,
    isPartialWeek: isPartial,
  }
}

export function formatWeeklyMetrics(m: WeeklyMetrics): string {
  const parts: string[] = []

  parts.push(
    `WEEKLY REVIEW — ${m.window.start} → ${m.window.end}${m.isPartialWeek ? " (in progress)" : ""}: ${m.questsCompleted} quests completed, ${m.questsPlanned} planned (${m.completionRate}% completion rate)`,
  )
  if (m.xpEarned !== 0) parts.push(`XP THIS WEEK: ${m.xpEarned > 0 ? "+" : ""}${m.xpEarned}`)
  parts.push(`MOMENTUM: ${m.momentumNow}/100 now (was ${m.momentumStart} at week start)` + (m.momentumDeltaPct !== null ? ` (${m.momentumDeltaPct >= 0 ? "+" : ""}${m.momentumDeltaPct}%)` : ""))
  if (m.bestStreak > 0) parts.push(`BEST STREAK: ${m.bestStreak}d`)
  if (m.postponed > 0) parts.push(`POSTPONED: ${m.postponed} (avg ${m.avgDelayDays}d each)`)
  if (m.skipped > 0) parts.push(`SKIPPED: ${m.skipped}`)
  if (m.adapts > 0) parts.push(`RESCALED QUESTS: ${m.adapts}`)
  if (m.statProgress.length > 0) parts.push(`STAT GROWTH: ${m.statProgress.map((s) => `${s.name} +${s.delta}`).join(", ")}`)
  if (m.skillProgress.length > 0) parts.push(`SKILL GROWTH: ${m.skillProgress.map((s) => `${s.name} +${s.delta} xp`).join(", ")}`)
  if (m.milestonesCompleted > 0) parts.push(`MILESTONES COMPLETED: ${m.milestonesCompleted}${m.goalsAdvanced > 0 ? ` (${m.goalsAdvanced} toward goal journeys)` : ""}`)
  if (m.difficultyPerformance.length > 0) {
    parts.push(`DIFFICULTY: ${m.difficultyPerformance.map((d) => `${d.difficulty} ${d.completed}/${d.planned} (${d.rate}%)`).join(", ")}`)
  }

  return parts.join("\n")
}