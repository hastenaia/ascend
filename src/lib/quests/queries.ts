import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import type { MilestoneRow, PhaseWithProgress } from "@/lib/phases/queries"
import { getCurrentPhase } from "@/lib/phases/queries"
import { levelProgress, type LevelProgress } from "@/lib/levels"

export type QuestRow = Database["public"]["Tables"]["quests"]["Row"]

export function todayDateString(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function startOfTodayIso(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
}

export function getIsoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`
}

/** A quest is "due today" when: daily recurring (not done today), weekly recurring (not done this week), or one-time with due_date <= today */
export function questIsDueToday(
  quest: Pick<QuestRow, "recurrence" | "due_date" | "id">,
  ctx: { today?: string; completedQuestIdsToday?: Set<string>; weeklyCompletedQuestIds?: Set<string> }
): boolean {
  const today = ctx.today ?? todayDateString()
  if (quest.recurrence === "daily") return !(ctx.completedQuestIdsToday?.has(quest.id) ?? false)
  if (quest.recurrence === "weekly") return !(ctx.weeklyCompletedQuestIds?.has(quest.id) ?? false)
  return Boolean(quest.due_date && quest.due_date <= today)
}

export async function getActiveQuests(supabase: SupabaseClient, userId: string): Promise<QuestRow[]> {
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data as QuestRow[]) ?? []
}

export async function getRecentCompletedQuests(supabase: SupabaseClient, userId: string, limit = 30): Promise<QuestRow[]> {
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as QuestRow[]) ?? []
}

async function getCompletionsSince(supabase: SupabaseClient, userId: string, sinceIso: string) {
  const { data, error } = await supabase
    .from("quest_completions")
    .select("quest_id, completed_at")
    .eq("user_id", userId)
    .gte("completed_at", sinceIso)
  if (error) throw error
  return (data ?? []) as { quest_id: string; completed_at: string }[]
}

async function getXpSummaries(supabase: SupabaseClient) {
  // Lifetime total drives the level formula; recent window powers "today" stats.
  const [{ data: all }, { data: recent }] = await Promise.all([
    supabase.from("xp_transactions").select("amount"),
    supabase.from("xp_transactions").select("amount, created_at").gte("created_at", startOfTodayIso()),
  ])
  const total = ((all as { amount: number }[]) ?? []).reduce((s, r) => s + r.amount, 0)
  const today = ((recent as { amount: number }[]) ?? []).reduce((s, r) => s + r.amount, 0)
  return { total, today }
}

async function getMomentumRow(supabase: SupabaseClient, userId: string, today: string) {
  const { data } = await supabase.from("momentum").select("score, streak").eq("user_id", userId).eq("date", today).maybeSingle()
  return (data as { score: number; streak: number } | null) ?? { score: 0, streak: 0 }
}

export async function getLevelSummary(supabase: SupabaseClient): Promise<LevelProgress & { xpToday: number }> {
  const { total, today } = await getXpSummaries(supabase)
  return { ...levelProgress(total), xpToday: today }
}

export async function getRecentCompletedMilestones(supabase: SupabaseClient, userId: string, limit = 3): Promise<MilestoneRow[]> {
  const { data: ownedPhases } = await supabase.from("phases").select("id").eq("user_id", userId)
  const ids = ((ownedPhases as { id: string }[]) ?? []).map((p) => p.id)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from("milestones")
    .select("*")
    .in("phase_id", ids)
    .eq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as MilestoneRow[]) ?? []
}

export async function getTodaysQuests(supabase: SupabaseClient, userId: string) {
  const today = todayDateString()
  const [quests, completions48h] = await Promise.all([getActiveQuests(supabase, userId), getCompletionsSince(supabase, userId, startOfTodayIso())])

  const completedToday = completions48h.filter((c) => new Date(c.completed_at).toDateString() === new Date().toDateString())
  const completedTodayIds = new Set(completedToday.map((c) => c.quest_id))

  // Weekly dedupe needs a wider window: fetch this ISO week's completions per quest via source_key on xp_transactions
  const weekKey = getIsoWeekKey()
  const { data: weekXp } = await supabase
    .from("xp_transactions")
    .select("source_key")
    .eq("user_id", userId)
    .like("source_key", `quest:%:${weekKey}`)
  const weeklyDoneIds = new Set(
    ((weekXp as { source_key: string | null }[]) ?? [])
      .filter((r): r is { source_key: string } => Boolean(r.source_key))
      .map((r) => r.source_key.split(":")[1])
  )

  const todays = quests.filter((q) => questIsDueToday(q, { today, completedQuestIdsToday: completedTodayIds, weeklyCompletedQuestIds: weeklyDoneIds }))
  return { todays, completedTodayCount: completedToday.length }
}

export async function getQuestsPageData(supabase: SupabaseClient, userId: string) {
  const [active, recentCompleted, level, todays] = await Promise.all([
    getActiveQuests(supabase, userId),
    getRecentCompletedQuests(supabase, userId),
    getLevelSummary(supabase),
    getTodaysQuests(supabase, userId),
  ])

  let current: PhaseWithProgress | null = null
  try {
    current = await getCurrentPhase(supabase, userId)
  } catch {}

  return { active, recentCompleted, level, todays, current }
}

export async function getDashboardData(supabase: SupabaseClient, userId: string) {
  const today = todayDateString()
  const [todays, level, momentum, recentMilestones, trend] = await Promise.all([
    getTodaysQuests(supabase, userId),
    getLevelSummary(supabase),
    getMomentumRow(supabase, userId, today),
    getRecentCompletedMilestones(supabase, userId, 3),
    getMomentumTrend(supabase),
  ])

  let current: PhaseWithProgress | null = null
  try {
    current = await getCurrentPhase(supabase, userId)
  } catch {}

  return {
    current,
    todaysQuests: todays.todays,
    completedTodayCount: todays.completedTodayCount,
    xpToday: level.xpToday,
    level,
    momentum,
    trend,
    recentMilestones,
  }
}

/** Momentum score: current week-to-date vs previous full week */
export async function getMomentumTrend(supabase: SupabaseClient): Promise<{ thisWeek: number; prevWeek: number }> {
  const since = new Date()
  since.setDate(since.getDate() - 13)
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`
  const { data } = await supabase.from("momentum").select("date, score").gte("date", sinceStr)
  const rows = ((data as { date: string; score: number }[]) ?? []).sort((a, b) => a.date.localeCompare(b.date))
  const now = new Date()
  let thisWeek = 0
  let prevWeek = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    thisWeek += rows.find((r) => r.date === key)?.score ?? 0
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    prevWeek += rows.find((r) => r.date === key)?.score ?? 0
  }
  return { thisWeek, prevWeek }
}
