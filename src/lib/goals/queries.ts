import type { SupabaseClient } from "@supabase/supabase-js"
import type { GoalPriority, GoalCategory } from "@/types/database"

export type GoalRow = {
  id: string
  title: string
  description: string | null
  status: string
  category: GoalCategory
  priority: GoalPriority
  target_date: string | null
  desired_outcome: string | null
  completed_at: string | null
  created_at: string
}

export type GoalPhaseProgress = {
  id: string
  title: string
  objective: string | null
  status: "locked" | "available" | "active" | "completed" | "archived"
  orderIndex: number
  milestonesDone: number
  milestonesTotal: number
  progressPct: number
}

export type GoalWithProgress = GoalRow & {
  phasesTotal: number
  phasesCompleted: number
  progressPct: number // milestone-weighted across the goal's phases
  activePhaseTitle: string | null
}

export type MilestoneLite = {
  id: string
  title: string
  description: string | null
  status: string
  xp_reward: number
  is_final_challenge: boolean
  sort_order: number
}

export type QuestLite = {
  id: string
  title: string
  category: string
  difficulty: string
  xp_reward: number
  recurrence: string
}

export type GoalDetailData = {
  goal: GoalRow
  phases: GoalPhaseProgress[]
  overallProgressPct: number
  milestonesTotal: number
  milestonesDone: number
  activePhase: (Omit<GoalPhaseProgress, never> & { milestones: MilestoneLite[]; nextMilestone: MilestoneLite | null }) | null
  recommendedQuests: QuestLite[]
  completedQuestCount: number
}

type PhaseLite = {
  id: string
  goal_id: string | null
  title: string
  objective: string | null
  status: string
  order_index: number
}

async function fetchGoalPhases(supabase: SupabaseClient, userId: string, goalIds: string[]) {
  if (goalIds.length === 0) return { phases: [] as PhaseLite[], milestones: [] as { id: string; phase_id: string; status: string }[] }
  const [phasesRes, milestonesRes] = await Promise.all([
    supabase.from("phases").select("id,goal_id,title,objective,status,order_index").eq("user_id", userId).in("goal_id", goalIds).order("order_index"),
    supabase.from("milestones").select("id,phase_id,status").in("phase_id",
      ((await supabase.from("phases").select("id").eq("user_id", userId).in("goal_id", goalIds)).data ?? []).map((p) => p.id)),
  ])
  return {
    phases: (phasesRes.data as PhaseLite[] | null) ?? [],
    milestones: (milestonesRes.data as { id: string; phase_id: string; status: string }[] | null) ?? [],
  }
}

function computePhaseStats(phases: PhaseLite[], milestones: { id: string; phase_id: string; status: string }[]) {
  const msByPhase = new Map<string, { done: number; total: number }>()
  for (const m of milestones) {
    const cur = msByPhase.get(m.phase_id) ?? { done: 0, total: 0 }
    cur.total += 1
    if (m.status === "completed") cur.done += 1
    msByPhase.set(m.phase_id, cur)
  }
  return phases.map((p) => {
    const ms = msByPhase.get(p.id) ?? { done: 0, total: 0 }
    const total = Math.max(ms.total, 1)
    return { ...p, milestonesDone: ms.done, milestonesTotal: ms.total, progressPct: Math.round((ms.done / total) * 100) }
  })
}

export async function getGoalsOverview(supabase: SupabaseClient, userId: string): Promise<GoalWithProgress[]> {
  const { data: goals } = await supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false })
  const rows = (goals as GoalRow[] | null) ?? []
  if (rows.length === 0) return []

  const { phases, milestones } = await fetchGoalPhases(supabase, userId, rows.map((g) => g.id))
  const enriched = computePhaseStats(phases, milestones)

  return rows.map((goal) => {
    const gp = enriched.filter((p) => p.goal_id === goal.id)
    const phasesCompleted = gp.filter((p) => p.status === "completed").length
    const msDone = gp.reduce((s, p) => s + p.milestonesDone, 0)
    const msTotal = gp.reduce((s, p) => s + p.milestonesTotal, 0)
    const active = gp.find((p) => p.status === "active")
    return {
      ...goal,
      phasesTotal: gp.length,
      phasesCompleted,
      progressPct: msTotal > 0 ? Math.round((msDone / msTotal) * 100) : 0,
      activePhaseTitle: active?.title ?? null,
    }
  })
}

export async function getGoalDetail(supabase: SupabaseClient, userId: string, goalId: string): Promise<GoalDetailData | null> {
  const { data: goal } = await supabase.from("goals").select("*").eq("id", goalId).eq("user_id", userId).single()
  if (!goal) return null

  const { phases, milestones } = await fetchGoalPhases(supabase, userId, [goalId])
  const enriched = computePhaseStats(phases, milestones).sort((a, b) => a.order_index - b.order_index)

  const activeRaw = enriched.find((p) => p.status === "active") ?? null

  let activePhase: GoalDetailData["activePhase"] = null
  let recommendedQuests: QuestLite[] = []
  let completedQuestCount = 0

  if (activeRaw) {
    const { data: ms } = await supabase.from("milestones").select("*").eq("phase_id", activeRaw.id).order("sort_order")
    const milestoneRows = (ms as (MilestoneLite & { phase_id: string })[] | null) ?? []
    const nextMilestone = milestoneRows.find((m) => m.status !== "completed") ?? null

    const msIds = milestoneRows.map((m) => m.id)
    let quests: ({ id: string; title: string; category: string; difficulty: string; xp_reward: number; recurrence: string; status: string; milestone_id: string | null }[]) = []
    if (msIds.length > 0 || true) {
      const orFilter = msIds.length > 0 ? `milestone_id.in.(${msIds.join(",")}),phase_id.eq.${activeRaw.id}` : `phase_id.eq.${activeRaw.id}`
      const { data: qs } = await supabase.from("quests").select("id,title,category,difficulty,xp_reward,recurrence,status,milestone_id").eq("user_id", userId).or(orFilter)
      quests = (qs as typeof quests | null) ?? []
    }

    completedQuestCount = quests.filter((q) => q.status === "completed").length
    recommendedQuests = quests.filter((q) => q.status === "active").slice(0, 6)

    activePhase = {
      id: activeRaw.id,
      title: activeRaw.title,
      objective: activeRaw.objective,
      status: activeRaw.status as GoalPhaseProgress["status"],
      orderIndex: activeRaw.order_index,
      milestonesDone: activeRaw.milestonesDone,
      milestonesTotal: activeRaw.milestonesTotal,
      progressPct: activeRaw.progressPct,
      milestones: milestoneRows.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        status: m.status,
        xp_reward: m.xp_reward,
        is_final_challenge: m.is_final_challenge,
        sort_order: m.sort_order,
      })),
      nextMilestone,
    }
  }

  const milestonesTotal = enriched.reduce((s, p) => s + p.milestonesTotal, 0)
  const milestonesDone = enriched.reduce((s, p) => s + p.milestonesDone, 0)

  return {
    goal: goal as GoalRow,
    phases: enriched.map(({ id, title, objective, status, order_index, milestonesDone: md, milestonesTotal: mt, progressPct }) => ({
      id, title, objective, status: status as GoalPhaseProgress["status"], orderIndex: order_index, milestonesDone: md, milestonesTotal: mt, progressPct,
    })),
    overallProgressPct: milestonesTotal > 0 ? Math.round((milestonesDone / milestonesTotal) * 100) : 0,
    milestonesTotal,
    milestonesDone,
    activePhase,
    recommendedQuests,
    completedQuestCount,
  }
}

export type JourneyBlueprint = {
  id: string
  slug: string
  name: string
  category: string | null
  description: string
  phases: { title: string; objective: string }[]
}

export async function getJourneyBlueprints(supabase: SupabaseClient): Promise<JourneyBlueprint[]> {
  const { data } = await supabase.from("journey_blueprints").select("*").order("name")
  return ((data as JourneyBlueprint[] | null) ?? []).map((b) => ({
    ...b,
    phases: Array.isArray(b.phases) ? b.phases : [],
  }))
}
