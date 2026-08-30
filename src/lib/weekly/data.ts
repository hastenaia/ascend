import type { SupabaseClient } from "@supabase/supabase-js"
import { computeMomentumScore, type MomentumDayRow } from "@/lib/momentum/model"
import {
  computeWeeklyMetrics,
  isoWeekWindow,
  type WeekData,
  type WeekWindow,
  type WeeklyMetrics,
} from "@/lib/weekly/metrics"

type EventRow = { kind: string; occurred_at: string; meta: { days?: number } | null }

function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Compute deterministic weekly metrics for a user over [window.start, window.end].
 * All queries are server-side reads; nothing is mutated. No AI involved.
 */
export async function computeWeeklyMetricsForUser(
  supabase: SupabaseClient,
  userId: string,
  window: WeekWindow = isoWeekWindow(),
): Promise<WeeklyMetrics> {
  const start = window.start
  const end = window.end
  const startIso = start + "T00:00:00Z"
  const endIso = end + "T23:59:59.999Z"

  const [questsRes, completionsRes, eventsRes, xpRes, momRes, statRowsRes, skillRowsRes, phasesRes] = await Promise.all([
    supabase.from("quests").select("id,difficulty,category,recurrence,status,due_date").eq("user_id", userId),
    supabase.from("quest_completions").select("quest_id,completed_at").eq("user_id", userId).gte("completed_at", startIso).lte("completed_at", endIso),
    supabase.from("quest_behavior_events").select("kind,occurred_at,meta").eq("user_id", userId).gte("occurred_at", startIso).lte("occurred_at", endIso),
    supabase.from("xp_transactions").select("amount").eq("user_id", userId).gte("created_at", startIso).lte("created_at", endIso),
    supabase.from("momentum").select("date,score,recovery,streak").eq("user_id", userId).gte("date", start).lte("date", end),
    supabase.from("stat_history").select("stat_id,delta").eq("user_id", userId).gte("created_at", startIso).lte("created_at", endIso),
    supabase.from("skill_xp_log").select("skill_id,delta").eq("user_id", userId).gte("created_at", startIso).lte("created_at", endIso),
    supabase.from("phases").select("id,goal_id").eq("user_id", userId),
  ])

  const quests = (questsRes.data as { id: string; difficulty: string; category: string; recurrence: string; status: string; due_date: string | null }[] | null) ?? []
  const questById = new Map(quests.map((q) => [q.id, q]))

  const completionRows = (completionsRes.data as { quest_id: string; completed_at: string }[] | null) ?? []
  const completedIds = new Set(completionRows.map((c) => c.quest_id))
  const completions = completionRows.map((c) => {
    const q = questById.get(c.quest_id)
    return {
      questId: c.quest_id,
      difficulty: q?.difficulty ?? "medium",
      category: q?.category ?? "general",
      at: c.completed_at,
    }
  })

  // Planned = active recurring quests + one-time quests due this window + one-time quests completed this week
  const planned = new Map<string, { id: string; difficulty: string; recurrence: string }>()
  for (const q of quests) {
    const isPlanned =
      q.status === "active" && q.recurrence !== "none"
        ? true
        : q.recurrence === "none" && q.status === "active" && typeof q.due_date === "string" && q.due_date <= end
          ? true
          : q.recurrence === "none" && q.status === "completed" && completedIds.has(q.id)
            ? true
            : false
    if (isPlanned) planned.set(q.id, { id: q.id, difficulty: q.difficulty, recurrence: q.recurrence })
  }

  const events = (eventsRes.data as EventRow[] | null) ?? []
  const postponeDelays = events.filter((e) => e.kind === "postpone").map((e) => (typeof e.meta?.days === "number" ? e.meta.days : 0))
  const skipEvents = events.filter((e) => e.kind === "skip").length
  const adaptEvents = events.filter((e) => e.kind === "adapt").length

  const xpDelta = ((xpRes.data as { amount: number }[] | null) ?? []).reduce((s, r) => s + r.amount, 0)

  // Momentum via the shared decay model, evaluated at the week boundaries.
  const momRows = ((momRes.data as (MomentumDayRow & { streak?: number })[] | null) ?? []).map((r) => ({ date: r.date, score: r.score ?? 0, recovery: !!r.recovery }))
  const beforeStart = new Date(start + "T00:00:00Z")
  beforeStart.setUTCDate(beforeStart.getUTCDate() - 1)
  const asOfStart = beforeStart.toISOString().slice(0, 10)
  const momentumStart = computeMomentumScore(momRows, asOfStart)
  const asOfEnd = end <= todayIso() ? end : todayIso()
  const momentumNow = computeMomentumScore(momRows, asOfEnd)
  const bestStreak = ((momRes.data as { streak?: number }[] | null) ?? []).reduce((s, r) => Math.max(s, r.streak ?? 0), 0)

  // Stat + skill deltas (join names from catalog)
  const statDeltas = await namedDeltas(
    supabase,
    "stats",
    ((statRowsRes.data as { stat_id: string; delta: number }[] | null) ?? []).map((r) => ({ id: r.stat_id, delta: r.delta })),
  )
  const skillDeltas = await namedDeltas(
    supabase,
    "skills",
    ((skillRowsRes.data as { skill_id: string; delta: number }[] | null) ?? []).map((r) => ({ id: r.skill_id, delta: r.delta })),
  )

  // Milestones completed in the window (owned phases); goal-linked ones count as goal progress
  const phases = (phasesRes.data as { id: string; goal_id: string | null }[] | null) ?? []
  const phaseIds = phases.map((p) => p.id)
  let milestonesCompleted = 0
  let goalsAdvanced = 0
  if (phaseIds.length > 0) {
    const { data: ms } = await supabase
      .from("milestones")
      .select("phase_id,status")
      .in("phase_id", phaseIds)
      .eq("status", "completed")
      .gte("updated_at", startIso)
      .lte("updated_at", endIso)
    const rows = (ms as { phase_id: string }[] | null) ?? []
    milestonesCompleted = rows.length
    const goalPhaseIds = new Set(phases.filter((p) => p.goal_id).map((p) => p.id))
    goalsAdvanced = rows.filter((r) => goalPhaseIds.has(r.phase_id)).length
  }

  const data: WeekData = {
    window,
    completions,
    plannedQuests: Array.from(planned.values()),
    postponeDelays,
    skipEvents,
    adaptEvents,
    xpDelta,
    momentumStart,
    momentumNow,
    bestStreak,
    statDeltas,
    skillDeltas,
    milestonesCompleted,
    goalsAdvanced,
  }

  return computeWeeklyMetrics(data)
}

async function namedDeltas(
  supabase: SupabaseClient,
  table: "stats" | "skills",
  pairs: { id: string; delta: number }[],
): Promise<{ name: string; delta: number }[]> {
  const summed = new Map<string, number>()
  for (const p of pairs) summed.set(p.id, (summed.get(p.id) ?? 0) + p.delta)
  const ids = Array.from(summed.keys())
  const deltaOut: { name: string; delta: number }[] = []
  if (ids.length === 0) return deltaOut

  const { data } = await supabase.from(table).select("id,name").in("id", ids)
  const names = new Map<string, string>(((data as { id: string; name: string }[] | null) ?? []).map((r) => [r.id, r.name]))
  for (const id of ids) {
    const delta = summed.get(id) ?? 0
    if (delta !== 0) deltaOut.push({ name: names.get(id) ?? "?", delta })
  }
  return deltaOut.sort((a, b) => b.delta - a.delta)
}