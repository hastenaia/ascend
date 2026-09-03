import type { SupabaseClient } from "@supabase/supabase-js"

export type AchievementDef = {
  id: string
  slug: string
  name: string
  description: string
  flavor: string
  icon_key: string
  xp_reward: number
}

export type AchievementSignals = {
  quests: number
  intellectQuests: number
  focusSessions: number
  bestStreak: number
  completedPhases: number
}

export type AchievementState = "locked" | "progress" | "unlocked"

export type AchievementView = {
  def: AchievementDef
  state: AchievementState
  current: number
  target: number
  unlockedAt: string | null
}

/** Mirrors the thresholds in evaluate_user_achievements (migration 0006) */
const ACHIEVEMENT_TARGETS: Record<string, number> = {
  "first-step": 1,
  "knowledge-seeker": 10,
  "deep-thinker": 20,
  consistency: 7,
  "phase-complete": 1,
  ascending: 3,
}

const KNOWN_SLUGS = Object.keys(ACHIEVEMENT_TARGETS)

function signalFor(slug: string, s: AchievementSignals): number {
  switch (slug) {
    case "first-step":
      return s.quests
    case "knowledge-seeker":
      return s.intellectQuests
    case "deep-thinker":
      return s.focusSessions
    case "consistency":
      return s.bestStreak
    case "phase-complete":
      return s.completedPhases
    case "ascending":
      return s.completedPhases
    default:
      return 0
  }
}

async function fetchSignals(supabase: SupabaseClient, userId: string): Promise<AchievementSignals> {
  const [completionsRes, questsRes, streakRes, phasesRes] = await Promise.all([
    supabase.from("quest_completions").select("quest_id").eq("user_id", userId),
    supabase.from("quests").select("id,category,estimated_duration").eq("user_id", userId),
    supabase.from("momentum").select("streak").eq("user_id", userId).order("streak", { ascending: false }).limit(1),
    supabase.from("phases").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
  ])

  const completions = (completionsRes.data as { quest_id: string }[] | null) ?? []
  const questsById = new Map(((questsRes.data as { id: string; category: string; estimated_duration: number | null }[] | null) ?? []).map((q) => [q.id, q]))

  let intellect = 0
  let focus = 0
  for (const c of completions) {
    const q = questsById.get(c.quest_id)
    if (!q) continue
    if (q.category === "intellect") intellect += 1
    if ((q.estimated_duration ?? 0) >= 25) focus += 1
  }

  return {
    quests: completions.length,
    intellectQuests: intellect,
    focusSessions: focus,
    bestStreak: (streakRes.data as { streak: number }[] | null)?.[0]?.streak ?? 0,
    completedPhases: phasesRes.count ?? 0,
  }
}

export async function getAchievementsOverview(
  supabase: SupabaseClient,
  userId: string
): Promise<{ views: AchievementView[]; signals: AchievementSignals }> {
  const [defsRes, unlocksRes, signals] = await Promise.all([
    supabase.from("achievements").select("*").in("slug", KNOWN_SLUGS).order("sort_order"),
    supabase.from("user_achievements").select("achievement_id,unlocked_at").eq("user_id", userId),
    fetchSignals(supabase, userId),
  ])

  const defs = (defsRes.data as AchievementDef[] | null) ?? []
  const unlockMap = new Map(((unlocksRes.data as { achievement_id: string; unlocked_at: string }[] | null) ?? []).map((u) => [u.achievement_id, u.unlocked_at]))

  const views: AchievementView[] = defs.map((def) => {
    const unlockedAt = unlockMap.get(def.id) ?? null
    const target = ACHIEVEMENT_TARGETS[def.slug] ?? 1
    const current = Math.min(signalFor(def.slug, signals), target)
    const state: AchievementState = unlockedAt ? "unlocked" : current > 0 ? "progress" : "locked"
    return { def, state, current, target, unlockedAt }
  })

  return { views, signals }
}
