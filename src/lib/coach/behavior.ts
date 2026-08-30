import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Deterministic behavioral metrics for the AI Coach and pattern engine.
 *
 * This module computes OBJECTIVE FACTS about how a user actually behaves with
 * quests (finish rates by difficulty, postpones, skips, overdue work). The model
 * receives only these derived numbers — never guesses. Pure functions are
 * unit-tested in behavior.test.ts.
 */

export const BEHAVIOR_DIFFICULTIES = ["easy", "medium", "hard", "challenge"] as const

export type BehaviorQuestRow = {
  id: string
  title: string
  difficulty: "easy" | "medium" | "hard" | "challenge" | string
  category: string
  recurrence: "none" | "daily" | "weekly" | string
  status: string
  due_date: string | null
  completed_at: string | null
  postponed_count: number | null
  skipped_count: number | null
}

export type DifficultyStats = {
  difficulty: string
  closed: number
  completed: number
  rate: number
}

export type BehaviorFacts = {
  activeCount: number
  activeOneTime: number
  activeRecurring: number
  overdueActive: number
  closedTotal: number
  completedTotal: number
  overallCompletionRate: number
  closedByDifficulty: DifficultyStats[]
  avgPostponedPerActive: number
  mostPostponed: { id: string; title: string; difficulty: string; count: number }[]
  mostSkipped: { id: string; title: string; difficulty: string; count: number }[]
}

function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const CLOSED_STATUSES = new Set(["completed", "archived"])

export function computeBehaviorFacts(rows: BehaviorQuestRow[], today = todayIso()): BehaviorFacts {
  const active = rows.filter((r) => r.status === "active")
  const closed = rows.filter((r) => CLOSED_STATUSES.has(r.status))
  const completed = rows.filter((r) => r.status === "completed")

  const closedByDifficulty: DifficultyStats[] = BEHAVIOR_DIFFICULTIES.map((difficulty) => {
    const closedD = closed.filter((r) => r.difficulty === difficulty)
    const completedD = completed.filter((r) => r.difficulty === difficulty)
    return {
      difficulty,
      closed: closedD.length,
      completed: completedD.length,
      rate: closedD.length > 0 ? Math.round((completedD.length / closedD.length) * 100) : 0,
    }
  }).filter((d) => d.closed > 0)

  const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 0)

  const postponeTotal = rows.reduce((s, r) => s + (r.postponed_count ?? 0), 0)
  const top = (key: "postponed_count" | "skipped_count"): BehaviorFacts["mostPostponed"] =>
    rows
      .filter((r) => (r[key] ?? 0) > 0)
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
      .slice(0, 3)
      .map((r) => ({ id: r.id, title: r.title, difficulty: r.difficulty, count: r[key] ?? 0 }))

  return {
    activeCount: active.length,
    activeOneTime: active.filter((r) => r.recurrence === "none").length,
    activeRecurring: active.filter((r) => r.recurrence !== "none").length,
    overdueActive: active.filter((r) => r.recurrence === "none" && !!r.due_date && r.due_date < today).length,
    closedTotal: closed.length,
    completedTotal: completed.length,
    overallCompletionRate: pct(completed.length, closed.length),
    closedByDifficulty,
    avgPostponedPerActive: active.length > 0 ? Math.round((postponeTotal / active.length) * 10) / 10 : 0,
    mostPostponed: top("postponed_count"),
    mostSkipped: top("skipped_count"),
  }
}

export function formatBehaviorFacts(f: BehaviorFacts): string {
  const parts: string[] = []

  const activeBits = [`${f.activeCount} active`]
  if (f.activeOneTime > 0) activeBits.push(`${f.activeOneTime} one-time`)
  if (f.activeRecurring > 0) activeBits.push(`${f.activeRecurring} recurring`)
  let head = `BEHAVIOR: ${activeBits.join(", ") + " quest" + (f.activeCount === 1 ? "" : "s")}`
  if (f.overdueActive > 0) head += `; ${f.overdueActive} overdue`
  parts.push(head)

  if (f.closedTotal > 0) {
    const diffBits: string[] = []
    for (const d of f.closedByDifficulty) {
      diffBits.push(`${d.difficulty} ${d.completed}/${d.closed} (${d.rate}%)`)
    }
    const diffLine = diffBits.length > 0 ? `; by difficulty: ${diffBits.join(", ")}` : ""
    parts.push(`CLOSED QUESTS: ${f.completedTotal}/${f.closedTotal} finished (${f.overallCompletionRate}% follow-through)${diffLine}`)
  }

  if (f.avgPostponedPerActive > 0) parts.push(`POSTPONES: avg ${f.avgPostponedPerActive} per active quest`)
  if (f.mostPostponed.length > 0) {
    parts.push(`MOST POSTPONED: ${f.mostPostponed.map((q) => `"${q.title}" (${q.difficulty} ×${q.count})`).join(", ")}`)
  }
  if (f.mostSkipped.length > 0) {
    parts.push(`MOST SKIPPED: ${f.mostSkipped.map((q) => `"${q.title}" (${q.difficulty} ×${q.count})`).join(", ")}`)
  }

  return parts.join("\n")
}

export type BehaviorSummary = { facts: BehaviorFacts; text: string }

/** Fetch the user's quest history and derive behavioral facts. */
export async function gatherBehaviorFacts(supabase: SupabaseClient, userId: string): Promise<BehaviorSummary> {
  const { data } = await supabase
    .from("quests")
    .select("id,title,difficulty,category,recurrence,status,due_date,completed_at,postponed_count,skipped_count")
    .eq("user_id", userId)

  const rows = ((data as BehaviorQuestRow[] | null) ?? []).map((r) => ({
    ...r,
    postponed_count: r.postponed_count ?? 0,
    skipped_count: r.skipped_count ?? 0,
  }))

  const facts = computeBehaviorFacts(rows)
  return { facts, text: formatBehaviorFacts(facts) }
}