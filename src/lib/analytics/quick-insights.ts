import type { SupabaseClient } from "@supabase/supabase-js"
import { computeMomentumScore, type MomentumDayRow } from "@/lib/momentum/model"
import { levelFromXp, xpForLevel } from "@/lib/levels"
import { buildInsights, type Insight } from "@/lib/analytics/insights"

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}
function weekMonday(d: Date): Date {
  const day = (d.getDay() + 6) % 7
  const m = new Date(d)
  m.setDate(m.getDate() - day)
  return m
}

/**
 * Dashboard-grade insights: ~6 narrow queries instead of the full analytics
 * bundle. Returns only what buildInsights consumes.
 */
export async function getQuickInsights(supabase: SupabaseClient, userId: string): Promise<Insight[]> {
  const [completionsRes, xpRes, snapRes, phaseRes, momRes, goalRes, gPhaseRes, achRes] = await Promise.all([
    supabase.from("quest_completions").select("created_at").eq("user_id", userId).gte("created_at", daysAgoIso(13)),
    supabase.from("xp_transactions").select("amount,created_at").eq("user_id", userId).gte("created_at", daysAgoIso(13)),
    supabase.from("user_levels").select("xp").eq("user_id", userId).maybeSingle(),
    supabase.from("phases").select("id,title,status").eq("user_id", userId).is("goal_id", null).eq("status", "active").limit(1),
    supabase.from("momentum").select("date,score,recovery,recovery_kinds").eq("user_id", userId).gte("date", daysAgoIso(20)),
    supabase.from("goals").select("id,title").eq("user_id", userId).neq("status", "archived"),
    supabase.from("phases").select("goal_id,status").eq("user_id", userId).not("goal_id", "is", null),
    supabase.from("user_achievements").select("unlocked_at,achievements(name)").eq("user_id", userId).order("unlocked_at", { ascending: false }).limit(1),
  ])

  // Week-over-week completion counts
  const mondayNow = iso(weekMonday(new Date()))
  const mondayPrev = iso(weekMonday(new Date(Date.now() - 7 * 86_400_000)))
  let thisWeek = 0
  let lastWeek = 0
  for (const c of (completionsRes.data as { created_at: string }[] | null) ?? []) {
    const cm = iso(weekMonday(new Date(c.created_at.slice(0, 10) + "T00:00:00")))
    if (cm === mondayNow) thisWeek += 1
    else if (cm === mondayPrev) lastWeek += 1
  }

  // Level velocity from the snapshot + last-14-day XP
  const txs = (xpRes.data as { amount: number; created_at: string }[] | null) ?? []
  const totalXp = (snapRes.data as { xp: number } | null)?.xp ?? null
  const currentLevel = typeof totalXp === "number" ? levelFromXp(totalXp) : 1
  let xpToNext = 0
  if (typeof totalXp === "number") xpToNext = Math.max(0, xpForLevel(currentLevel + 1) - totalXp)
  const xpPerDay14 = Math.round((txs.reduce((s, t) => s + t.amount, 0) / 14) * 10) / 10
  const estimatedDaysToNextLevel = xpPerDay14 > 0 && xpToNext > 0 ? Math.ceil(xpToNext / xpPerDay14) : null

  // Active phase progress (milestones of that one phase)
  const active = (phaseRes.data as { id: string; title: string; status: string }[] | null) ?? []
  let phases: { status: string; progressPct: number; milestonesDone: number; milestonesTotal: number }[] = []
  if (active.length > 0) {
    const { data: ms } = await supabase.from("milestones").select("status").eq("phase_id", active[0].id)
    const rows = (ms as { status: string }[] | null) ?? []
    const done = rows.filter((m) => m.status === "completed").length
    phases = [
      {
        status: "active",
        progressPct: rows.length ? Math.round((done / rows.length) * 100) : 0,
        milestonesDone: done,
        milestonesTotal: rows.length,
      },
    ]
  }

  // Momentum: today + seven-days-ago via the shared decay model
  const momRows: MomentumDayRow[] = ((momRes.data as (MomentumDayRow & { recovery_kinds?: string[] })[] | null) ?? []).map((r) => ({
    date: r.date,
    score: r.score ?? 0,
    recovery: !!r.recovery,
  }))
  const currentMomentum = computeMomentumScore(momRows)
  const weekAgoScore = computeMomentumScore(momRows, daysAgoIso(7))
  const momentum = Array.from({ length: 8 }, (_, i) => {
    const d = daysAgoIso(7 - i)
    return { date: d.slice(5), score: i === 7 ? currentMomentum : d === daysAgoIso(7) ? weekAgoScore : computeMomentumScore(momRows, d) }
  })

  // Goal progress by phase completion
  const goals = (goalRes.data as { id: string; title: string }[] | null) ?? []
  const gPhases = (gPhaseRes.data as { goal_id: string; status: string }[] | null) ?? []
  const goalBars = goals.map((g) => {
    const gp = gPhases.filter((p) => p.goal_id === g.id)
    return {
      title: g.title,
      progressPct: gp.length ? Math.round((gp.filter((p) => p.status === "completed").length / gp.length) * 100) : 0,
      phasesTotal: gp.length,
    }
  })

  const achRaw = (achRes.data as { unlocked_at: string; achievements: { name: string } | { name: string }[] | null }[] | null) ?? []

  return buildInsights({
    completionsThisWeek: thisWeek,
    completionsLastWeek: lastWeek,
    level: currentLevel,
    phases,
    estimatedDaysToNextLevel,
    xpPerDay14,
    momentum,
    currentMomentum,
    categories: [],
    goals: goalBars,
    achievementsUnlocked: achRaw.map((a) => ({
      name: (Array.isArray(a.achievements) ? a.achievements[0]?.name : a.achievements?.name) ?? "?",
      date: a.unlocked_at.slice(0, 10),
    })),
  })
}
