import type { SupabaseClient } from "@supabase/supabase-js"
import { computeBehaviorFacts, type BehaviorQuestRow } from "@/lib/coach/behavior"
import { detectPatterns, formatPatterns, type DetectedPattern, type PatternInput } from "@/lib/patterns/engine"
import { getIsoWeekKey } from "@/lib/quests/queries"

export type PatternSummary = { patterns: DetectedPattern[]; text: string }

function startOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - (day - 1))
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function weekKeyOf(d: Date): string {
  return getIsoWeekKey(d)
}

/** Last N ISO week keys, oldest → newest (newest = current week). */
export function recentWeekKeys(n: number, now = new Date()): string[] {
  const currentStart = startOfWeek(now)
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const weekStart = new Date(currentStart)
    weekStart.setUTCDate(currentStart.getUTCDate() - i * 7)
    keys.push(weekKeyOf(weekStart))
  }
  return keys
}

export function bucketCompletionsPerWeek(completedAt: string[], keys: string[]): number[] {
  const map = new Map(keys.map((k) => [k, 0]))
  for (const iso of completedAt) {
    const key = weekKeyOf(new Date(iso))
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1)
  }
  return keys.map((k) => map.get(k) ?? 0)
}

async function buildPatternInput(supabase: SupabaseClient, userId: string, weeks = 5): Promise<PatternInput> {
  const oldestStart = new Date(startOfWeek(new Date()))
  oldestStart.setUTCDate(oldestStart.getUTCDate() - (weeks - 1) * 7)
  const sinceIso = oldestStart.toISOString()

  const [questsRes, goalsRes, completionsRes] = await Promise.all([
    supabase
      .from("quests")
      .select("id,title,difficulty,category,recurrence,status,due_date,completed_at,postponed_count,skipped_count")
      .eq("user_id", userId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    supabase.from("quest_completions").select("completed_at").eq("user_id", userId).gte("completed_at", sinceIso),
  ])

  const rows = ((questsRes.data as BehaviorQuestRow[] | null) ?? []).map((r) => ({
    ...r,
    postponed_count: r.postponed_count ?? 0,
    skipped_count: r.skipped_count ?? 0,
  }))
  const facts = computeBehaviorFacts(rows)

  const categories = new Map<string, { active: number; closed: number; completed: number }>()
  for (const r of rows) {
    const cat = r.category || "general"
    const cur = categories.get(cat) ?? { active: 0, closed: 0, completed: 0 }
    if (r.status === "active") cur.active += 1
    if (r.status === "completed" || r.status === "archived") {
      cur.closed += 1
      if (r.status === "completed") cur.completed += 1
    }
    categories.set(cat, cur)
  }

  const keys = recentWeekKeys(weeks)
  const completionsPerWeek = bucketCompletionsPerWeek(((completionsRes.data as { completed_at: string }[] | null) ?? []).map((c) => c.completed_at), keys)

  return {
    facts,
    categories: Array.from(categories.entries()).map(([category, v]) => ({ category, ...v })),
    activeGoalCount: goalsRes.count ?? 0,
    completionsPerWeek,
  }
}

/** Fetch real data → deterministic facts → detected patterns (no AI involved). */
export async function detectPatternsForUser(supabase: SupabaseClient, userId: string): Promise<PatternSummary> {
  const input = await buildPatternInput(supabase, userId)
  const patterns = detectPatterns(input)
  return { patterns, text: formatPatterns(patterns) }
}

export type { PatternInput }