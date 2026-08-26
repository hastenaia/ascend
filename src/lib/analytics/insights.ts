export type Insight = { icon: "trend-up" | "trend-down" | "target" | "flame" | "trophy" | "compass" | "check"; text: string }

/**
 * Minimal shape needed to compute insights. The full AnalyticsBundle satisfies
 * this structurally, but a dashboard can supply a much cheaper subset.
 */
export type InsightInput = {
  completionsThisWeek: number
  completionsLastWeek: number
  level: number
  phases: { status: string; progressPct: number; milestonesDone: number; milestonesTotal: number }[]
  estimatedDaysToNextLevel: number | null
  xpPerDay14: number
  momentum: { date: string; score: number }[]
  currentMomentum: number
  categories: { category: string; count: number }[]
  goals: { title: string; progressPct: number; phasesTotal: number }[]
  achievementsUnlocked: { name: string; date: string }[]
}

/**
 * Personal insights derived ONLY from real computed numbers. Every statement
 * is a verifiable fact about the user's data — no personality analysis, no
 * psychological or medical framing.
 */
export function buildInsights(b: InsightInput): Insight[] {
  const out: Insight[] = []

  // Activity direction (week over week)
  if (b.completionsLastWeek > 0 || b.completionsThisWeek > 0) {
    if (b.completionsThisWeek > b.completionsLastWeek) {
      out.push({ icon: "trend-up", text: `You completed ${b.completionsThisWeek} quest${b.completionsThisWeek === 1 ? "" : "s"} this week — up from ${b.completionsLastWeek} last week.` })
    } else if (b.completionsThisWeek < b.completionsLastWeek && b.completionsThisWeek > 0) {
      out.push({ icon: "trend-down", text: `${b.completionsThisWeek} quest${b.completionsThisWeek === 1 ? "" : "s"} this week vs ${b.completionsLastWeek} last week.` })
    } else if (b.completionsThisWeek === 0) {
      out.push({ icon: "trend-down", text: `No quests completed this week yet — last week had ${b.completionsLastWeek}.` })
    }
  }

  // Phase progress
  const activePhase = b.phases.find((p) => p.status === "active")
  if (activePhase) {
    out.push({ icon: "target", text: `Your current phase is ${activePhase.progressPct}% complete (${activePhase.milestonesDone}/${activePhase.milestonesTotal} milestones).` })
  }

  // Level velocity estimate — clearly labeled as an estimate
  if (b.estimatedDaysToNextLevel !== null) {
    out.push({
      icon: "flame",
      text: `At your last-14-day pace (+${b.xpPerDay14} XP/day), level ${b.level + 1} is ~${b.estimatedDaysToNextLevel} day${b.estimatedDaysToNextLevel === 1 ? "" : "s"} away.`,
    })
  }

  // Momentum movement (same model evaluated a week back)
  const weekAgo = b.momentum.find((m) => m.date === daysAgoLabel(7))?.score ?? null
  if (weekAgo !== null && weekAgo !== b.currentMomentum) {
    const diff = b.currentMomentum - weekAgo
    out.push({
      icon: diff > 0 ? "trend-up" : "trend-down",
      text: `Momentum is ${Math.abs(diff)} point${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "higher" : "lower"} than seven days ago (${b.currentMomentum}/100).`,
    })
  }

  // Top area of work
  if (b.categories.length > 0) {
    const top = b.categories[0]
    const share = Math.round((top.count / b.categories.reduce((s, c) => s + c.count, 0)) * 100)
    out.push({ icon: "compass", text: `Most of your completed work has been in "${top.category}" — ${share}% of logged completions.` })
  }

  // Closest goal
  const openGoals = b.goals.filter((g) => g.phasesTotal > 0 && g.progressPct < 100).sort((a, c) => c.progressPct - a.progressPct)
  if (openGoals.length > 0) {
    const g = openGoals[0]
    out.push({ icon: "check", text: `"${truncate(g.title)}" is your closest goal — ${g.progressPct}% through its phases.` })
  }

  // Recent achievement
  if (b.achievementsUnlocked.length > 0) {
    const latest = b.achievementsUnlocked[0]
    out.push({ icon: "trophy", text: `Latest achievement unlocked: ${latest.name} (${latest.date}).` })
  }

  return out.slice(0, 6)
}

function truncate(s: string, n = 48): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

function daysAgoLabel(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
