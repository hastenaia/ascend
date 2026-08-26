import type { SupabaseClient } from "@supabase/supabase-js"
import { computeMomentumScore, type MomentumDayRow } from "@/lib/momentum/model"
import { levelFromXp, xpForLevel } from "@/lib/levels"

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}
function weekMonday(d: Date): Date {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const m = new Date(d)
  m.setDate(m.getDate() - day)
  return m
}

export type XpPoint = { date: string; xp: number; gained: number }
export type WeekPoint = { week: string; label: string; completions: number }
export type MonthPoint = { month: string; label: string; completions: number }
export type CategorySlice = { category: string; count: number }
export type StatPoint = { stat: string; value: number }
export type SkillPoint = { skill: string; xp: number }
export type MomentumPoint = { date: string; score: number }
export type PhaseBar = { title: string; progressPct: number; status: string; milestonesDone: number; milestonesTotal: number }
export type GoalBar = { title: string; progressPct: number; phasesCompleted: number; phasesTotal: number }

export type AnalyticsBundle = {
  totalXp: number
  level: number
  xpToNext: number
  xpPerDay14: number
  estimatedDaysToNextLevel: number | null
  xpSeries: XpPoint[]
  weekly: WeekPoint[]
  monthly: MonthPoint[]
  categories: CategorySlice[]
  stats: StatPoint[]
  skills: SkillPoint[]
  momentum: MomentumPoint[]
  currentMomentum: number
  phases: PhaseBar[]
  milestonesDone: number
  milestonesTotal: number
  questsCompletedTotal: number
  completionsThisWeek: number
  completionsLastWeek: number
  goals: GoalBar[]
  achievementsUnlocked: { name: string; date: string }[]
  achievementsTotal: number
}

const CATEGORIES = ["intellect", "physical", "discipline", "reflection", "craft", "work", "general"] as const

export async function getAnalyticsBundle(supabase: SupabaseClient, userId: string): Promise<AnalyticsBundle> {
  const [xpRes, completionsRes, questsRes, phasesRes, msRes, statsValRes, statsCatRes, skillsRes, momRes, goalsRes, achRes, doneCountRes] =
    await Promise.all([
      supabase.from("xp_transactions").select("amount,created_at").eq("user_id", userId).order("created_at").limit(2000),
      supabase.from("quest_completions").select("quest_id,created_at").eq("user_id", userId).gte("created_at", daysAgoIso(210)),
      supabase.from("quests").select("id,category").eq("user_id", userId),
      supabase.from("phases").select("id,title,status").eq("user_id", userId).is("goal_id", null).order("order_index"),
      supabase.from("milestones").select("id,phase_id,status"),
      supabase.from("user_stats").select("stat_id,value").eq("user_id", userId),
      supabase.from("stats").select("id,name"),
      supabase.from("skills").select("name,xp_current").eq("user_id", userId).gt("xp_current", 0).order("xp_current", { ascending: false }).limit(8),
      supabase.from("momentum").select("date,score,recovery,recovery_kinds").eq("user_id", userId).gte("date", daysAgoIso(20)),
      supabase.from("goals").select("id,title,status").eq("user_id", userId).neq("status", "archived"),
      supabase.from("user_achievements").select("unlocked_at,achievements(name)").eq("user_id", userId).order("unlocked_at", { ascending: false }),
      supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    ])

  // --- XP series: cumulative over last 30 days ---
  const txs = (xpRes.data as { amount: number; created_at: string }[] | null) ?? []
  const totalXp = txs.reduce((s, t) => s + t.amount, 0)
  const byDay = new Map<string, number>()
  for (const t of txs) byDay.set(t.created_at.slice(0, 10), (byDay.get(t.created_at.slice(0, 10)) ?? 0) + t.amount)
  let running = 0
  for (const v of byDay.values()) running += v // total after all history
  // Walk backwards from today building daily cumulative with pre-window baseline
  let baseline = running
  for (let i = 0; i < 30; i++) baseline -= byDay.get(daysAgoIso(29 - i)) ?? 0
  const xpSeries: XpPoint[] = []
  let cum = Math.max(0, baseline)
  for (let i = 29; i >= 0; i--) {
    const d = daysAgoIso(i)
    cum += byDay.get(d) ?? 0
    xpSeries.push({ date: d.slice(5), xp: cum, gained: byDay.get(d) ?? 0 })
  }

  // Level + velocity from last 14 days
  const level = levelFromXp(totalXp)
  const xpToNext = Math.max(0, xpForLevel(level + 1) - totalXp)
  let xpLast14 = 0
  for (let i = 0; i < 14; i++) xpLast14 += byDay.get(daysAgoIso(i)) ?? 0
  const xpPerDay14 = Math.round((xpLast14 / 14) * 10) / 10
  const estimatedDaysToNextLevel = xpPerDay14 > 0 ? Math.ceil(xpToNext / xpPerDay14) : null

  // --- Completions per week (last 8 weeks) and month (6 months), categories overall ---
  const completions = (completionsRes.data as { quest_id: string; created_at: string }[] | null) ?? []
  const questCats = new Map(((questsRes.data as { id: string; category: string }[] | null) ?? []).map((q) => [q.id, q.category]))

  const weekBuckets = new Map<string, number>()
  for (let w = 7; w >= 0; w--) {
    const monday = weekMonday(new Date(Date.now() - w * 7 * 86_400_000))
    weekBuckets.set(iso(monday), 0)
  }
  const monthBuckets = new Map<string, number>()
  const now = new Date()
  for (let m = 5; m >= 0; m--) {
    const first = new Date(now.getFullYear(), now.getMonth() - m, 1)
    monthBuckets.set(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`, 0)
  }
  const catCounts = new Map<string, number>(CATEGORIES.map((c) => [c, 0]))
  const mondayOfThisWeek = iso(weekMonday(now))
  const lastWeekMonday = iso(weekMonday(new Date(Date.now() - 7 * 86_400_000)))
  let thisWeekCount = 0
  let lastWeekCount = 0

  for (const c of completions) {
    const created = c.created_at.slice(0, 10)
    const cat = questCats.get(c.quest_id)
    if (cat && catCounts.has(cat)) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1)

    const cm = iso(weekMonday(new Date(created + "T00:00:00")))
    if (weekBuckets.has(cm)) weekBuckets.set(cm, (weekBuckets.get(cm) ?? 0) + 1)
    const mk = created.slice(0, 7)
    if (monthBuckets.has(mk)) monthBuckets.set(mk, (monthBuckets.get(mk) ?? 0) + 1)

    if (cm === mondayOfThisWeek) thisWeekCount += 1
    else if (cm === lastWeekMonday) lastWeekCount += 1
  }

  const fmtDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  const monthly: MonthPoint[] = [...monthBuckets.entries()].map(([month, count]) => ({
    month,
    label: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: "short" }),
    completions: count,
  }))
  const weekly: WeekPoint[] = [...weekBuckets.entries()].map(([week, count]) => ({
    week,
    label: fmtDay(new Date(week + "T00:00:00")),
    completions: count,
  }))

  const categories: CategorySlice[] = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)

  // --- Stats ---
  const statNames = new Map(((statsCatRes.data as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]))
  const stats: StatPoint[] = ((statsValRes.data as { stat_id: string; value: number }[] | null) ?? [])
    .map((s) => ({ stat: statNames.get(s.stat_id) ?? s.stat_id.slice(0, 4), value: Math.round(s.value) }))
    .sort((a, b) => b.value - a.value)

  const skills: SkillPoint[] = ((skillsRes.data as { name: string; xp_current: number }[] | null) ?? []).map((s) => ({
    skill: s.name.replace(/-/g, " "),
    xp: Math.round(s.xp_current),
  }))

  // --- Momentum daily series via shared decay model ---
  const momRowsRaw = (momRes.data as (MomentumDayRow & { recovery_kinds?: string[] })[] | null) ?? []
  const momRows: MomentumDayRow[] = momRowsRaw.map((r) => ({ date: r.date, score: r.score ?? 0, recovery: !!r.recovery }))
  const momentum: MomentumPoint[] = []
  for (let i = 13; i >= 0; i--) {
    const asOf = daysAgoIso(i)
    momentum.push({ date: asOf.slice(5), score: computeMomentumScore(momRows, asOf) })
  }
  const currentMomentum = momentum.length > 0 ? momentum[momentum.length - 1].score : 0

  // --- Phases + milestones (global journey) ---
  const phaseList = (phasesRes.data as { id: string; title: string; status: string }[] | null) ?? []
  const allMs = (msRes.data as { id: string; phase_id: string; status: string }[] | null) ?? []
  const phases: PhaseBar[] = phaseList.map((p) => {
    const ms = allMs.filter((m) => m.phase_id === p.id)
    const done = ms.filter((m) => m.status === "completed").length
    return {
      title: p.title.replace(/^PHASE \d+ — /, ""),
      progressPct: ms.length ? Math.round((done / ms.length) * 100) : 0,
      status: p.status,
      milestonesDone: done,
      milestonesTotal: ms.length,
    }
  })
  const milestonesTotal = allMs.length
  const milestonesDone = allMs.filter((m) => m.status === "completed").length

  // --- Goals ---
  const goalRows = (goalsRes.data as { id: string; title: string }[] | null) ?? []
  const goalPhases = phaseList.length >= 0 ? await supabase.from("phases").select("id,goal_id,title,status").eq("user_id", userId).not("goal_id", "is", null) : null
  const goalPhaseRows = (goalPhases?.data as { id: string; goal_id: string; status: string }[] | null) ?? []
  const goals: GoalBar[] = goalRows.map((g) => {
    const gp = goalPhaseRows.filter((p) => p.goal_id === g.id)
    return {
      title: g.title,
      progressPct: gp.length ? Math.round((gp.filter((p) => p.status === "completed").length / gp.length) * 100) : 0,
      phasesCompleted: gp.filter((p) => p.status === "completed").length,
      phasesTotal: gp.length,
    }
  })

  // --- Achievements ---
  const achRaw = (achRes.data as { unlocked_at: string; achievements: { name: string } | { name: string }[] | null }[] | null) ?? []
  const achievementsUnlocked = achRaw
    .map((a) => ({ name: (Array.isArray(a.achievements) ? a.achievements[0]?.name : a.achievements?.name) ?? "?", date: a.unlocked_at.slice(0, 10) }))
    .slice(0, 12)

  return {
    totalXp,
    level,
    xpToNext,
    xpPerDay14,
    estimatedDaysToNextLevel,
    xpSeries,
    weekly,
    monthly,
    categories,
    stats,
    skills,
    momentum,
    currentMomentum,
    phases,
    milestonesDone,
    milestonesTotal,
    questsCompletedTotal: doneCountRes.count ?? 0,
    completionsThisWeek: thisWeekCount,
    completionsLastWeek: lastWeekCount,
    goals,
    achievementsUnlocked,
    achievementsTotal: achRaw.length,
  }
}
