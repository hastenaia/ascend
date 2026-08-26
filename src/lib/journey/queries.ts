import type { SupabaseClient } from "@supabase/supabase-js"

export type JourneyNode = {
  id: string
  title: string
  objective: string | null
  status: "locked" | "available" | "active" | "completed"
  orderIndex: number
  startedAt: string | null
  completedAt: string | null
  rewardXp: number // phase payout from the XP ledger (source_type = 'phase')
  progressPct: number
  completedMilestones: number
  totalMilestones: number
}

export type CompletedPhaseDetail = {
  phaseId: string
  title: string
  completedAt: string | null
  startedAt: string | null
  xpEarned: number
  milestones: { title: string; status: string; isFinalChallenge: boolean }[]
  quests: { title: string; category: string; xpReward: number; done: boolean }[]
  questTotal: number
  reflection: string | null
  achievements: { slug: string; name: string; unlockedAt: string }[]
  statChanges: { name: string; delta: number }[]
  skillChanges: { name: string; xp: number }[]
}

type PhaseLite = {
  id: string
  title: string
  objective: string | null
  status: string
  order_index: number
  start_date: string | null
  created_at: string
  completed_at: string | null
}

export async function getJourneyTimeline(supabase: SupabaseClient, userId: string): Promise<JourneyNode[]> {
  const [phasesRes, milestonesRes, payoutsRes] = await Promise.all([
    supabase.from("phases").select("id,title,objective,status,order_index,start_date,created_at,completed_at").eq("user_id", userId).order("order_index"),
    supabase.from("milestones").select("id,phase_id,status").in("phase_id", (await supabase.from("phases").select("id").eq("user_id", userId)).data?.map((p) => p.id) ?? ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("xp_transactions").select("amount,source_id").eq("user_id", userId).eq("source_type", "phase"),
  ])

  const phases = (phasesRes.data as PhaseLite[] | null) ?? []
  const milestones = (milestonesRes.data as { id: string; phase_id: string; status: string }[] | null) ?? []
  const payouts = new Map(((payoutsRes.data as { amount: number; source_id: string | null }[] | null) ?? []).filter((p) => p.source_id).map((p) => [p.source_id as string, p.amount]))

  return phases.map((p) => {
    const ms = milestones.filter((m) => m.phase_id === p.id)
    const done = ms.filter((m) => m.status === "completed").length
    return {
      id: p.id,
      title: p.title,
      objective: p.objective,
      status: p.status as JourneyNode["status"],
      orderIndex: p.order_index,
      startedAt: p.start_date,
      completedAt: p.completed_at,
      rewardXp: payouts.get(p.id) ?? 0,
      progressPct: ms.length > 0 ? Math.round((done / ms.length) * 100) : 0,
      completedMilestones: done,
      totalMilestones: ms.length,
    }
  })
}

/**
 * Aggregate "what actually happened" for completed phases.
 * Only sections backed by real rows are populated — the UI hides the rest.
 */
export async function getCompletedPhaseDetails(
  supabase: SupabaseClient,
  userId: string,
  phases: JourneyNode[]
): Promise<Record<string, CompletedPhaseDetail>> {
  const done = phases.filter((p) => p.status === "completed")
  if (done.length === 0) return {}

  const phaseIds = done.map((p) => p.id)

  const [milestonesRes, questsRes, reflectionsRes, unlocksRes] = await Promise.all([
    supabase.from("milestones").select("id,phase_id,title,status,is_final_challenge").in("phase_id", phaseIds).order("sort_order"),
    supabase.from("quests").select("id,phase_id,milestone_id,title,category,xp_reward,status,completed_at").eq("user_id", userId),
    supabase.from("reflections").select("phase_id,body").eq("user_id", userId).in("phase_id", phaseIds),
    supabase
      .from("user_achievements")
      .select("achievement_id,unlocked_at,achievements(slug,name)")
      .eq("user_id", userId),
  ])

  const milestones = (milestonesRes.data as { id: string; phase_id: string; title: string; status: string; is_final_challenge: boolean }[] | null) ?? []
  const allQuests = (questsRes.data as { id: string; phase_id: string | null; milestone_id: string | null; title: string; category: string; xp_reward: number; status: string; completed_at: string | null }[] | null) ?? []
  const reflections = new Map(((reflectionsRes.data as { phase_id: string; body: string }[] | null) ?? []).map((r) => [r.phase_id, r.body]))
  const unlocks = ((unlocksRes.data as { achievement_id: string; unlocked_at: string; achievements: { slug: string; name: string } | { slug: string; name: string }[] }[] | null) ?? []).map((u) => ({
    ...u,
    ach: Array.isArray(u.achievements) ? u.achievements[0] : u.achievements,
  }))

  // Quest→phase mapping: direct phase_id OR via milestone membership
  const msPhase = new Map(milestones.map((m) => [m.id, m.phase_id]))
  const questsByPhase = new Map<string, typeof allQuests>()
  for (const q of allQuests) {
    const pid = q.phase_id ?? (q.milestone_id ? msPhase.get(q.milestone_id) : undefined)
    if (!pid || !phaseIds.includes(pid)) continue
    const arr = questsByPhase.get(pid) ?? []
    arr.push(q)
    questsByPhase.set(pid, arr)
  }

  // Stat + skill ledgers within each phase window
  const earliestStart = done.reduce(
    (min, p) => Math.min(min, new Date(p.startedAt ?? p.completedAt ?? new Date().toISOString()).getTime()),
    Date.now(),
  )
  const latestEnd = done.reduce((max, p) => Math.max(max, new Date(p.completedAt ?? Date.now()).getTime()), 0)

  const [statHistRes, statsRes, skillLogRes, skillsRes] = await Promise.all([
    supabase.from("stat_history").select("stat_id,delta,created_at").gte("created_at", new Date(earliestStart).toISOString()).lte("created_at", new Date(latestEnd + 86_400_000).toISOString()),
    supabase.from("stats").select("id,name"),
    supabase.from("skill_xp_log").select("skill_id,delta,created_at").gte("created_at", new Date(earliestStart).toISOString()).lte("created_at", new Date(latestEnd + 86_400_000).toISOString()),
    supabase.from("skills").select("id,name"),
  ])

  const statNames = new Map(((statsRes.data as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]))
  const skillNames = new Map(((skillsRes.data as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]))
  const statHist = (statHistRes.data as { stat_id: string; delta: number; created_at: string }[] | null) ?? []
  const skillLog = (skillLogRes.data as { skill_id: string; delta: number; created_at: string }[] | null) ?? []

  const result: Record<string, CompletedPhaseDetail> = {}
  for (const p of done) {
    const startMs = new Date(p.startedAt ?? p.completedAt ?? new Date().toISOString()).getTime()
    const endMs = new Date(p.completedAt ?? Date.now()).getTime() + 86_399_000

    const statDeltas = new Map<string, number>()
    for (const h of statHist) {
      const t = new Date(h.created_at).getTime()
      if (t < startMs || t > endMs) continue
      statDeltas.set(h.stat_id, (statDeltas.get(h.stat_id) ?? 0) + h.delta)
    }
    const skillDeltas = new Map<string, number>()
    for (const h of skillLog) {
      const t = new Date(h.created_at).getTime()
      if (t < startMs || t > endMs) continue
      skillDeltas.set(h.skill_id, (skillDeltas.get(h.skill_id) ?? 0) + h.delta)
    }

    const phaseAchievements = unlocks
      .filter((u) => {
        const t = new Date(u.unlocked_at).getTime()
        return t >= startMs && t <= endMs && u.ach
      })
      .map((u) => ({ slug: u.ach!.slug, name: u.ach!.name, unlockedAt: u.unlocked_at }))

    const qs = (questsByPhase.get(p.id) ?? []).sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""))

    result[p.id] = {
      phaseId: p.id,
      title: p.title,
      completedAt: p.completedAt,
      startedAt: p.startedAt,
      xpEarned: p.rewardXp,
      milestones: milestones.filter((m) => m.phase_id === p.id).map((m) => ({ title: m.title, status: m.status, isFinalChallenge: m.is_final_challenge })),
      quests: qs.map((q) => ({ title: q.title, category: q.category, xpReward: q.xp_reward, done: q.status === "completed" })),
      questTotal: qs.length,
      reflection: reflections.get(p.id) ?? null,
      achievements: phaseAchievements,
      statChanges: [...statDeltas.entries()].filter(([, d]) => d !== 0).map(([id, delta]) => ({ name: statNames.get(id) ?? "Unknown", delta })).sort((a, b) => b.delta - a.delta),
      skillChanges: [...skillDeltas.entries()].filter(([, d]) => d !== 0).map(([id, xp]) => ({ name: skillNames.get(id) ?? "Unknown", xp })).sort((a, b) => b.xp - a.xp),
    }
  }
  return result
}
