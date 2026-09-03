import type { SupabaseClient } from "@supabase/supabase-js"
import { computeMomentumScore, momentumTiers, type MomentumDayRow } from "@/lib/momentum/model"
import { gatherBehaviorFacts, type BehaviorFacts } from "@/lib/coach/behavior"
import { COACH_STYLES, type CoachStyle } from "@/lib/coach/style"
import { sanitizeForPrompt } from "@/lib/ai/context"
import {
  formatGoalIntelligence,
  type CoachGoalRow,
  type CoachPhaseRow,
  type CoachMilestoneRow,
  type CoachQuestRow,
} from "@/lib/coach/goal-intel"

export type CoachContext = {
  text: string
  activePhaseId: string | null
  activeGoalId: string | null
  behavior: BehaviorFacts
  coachStyle: CoachStyle | null
}

function clip(s: string | null | undefined, n = 160): string {
  if (!s) return ""
  const sanitized = sanitizeForPrompt(s)
  // sanitizeForPrompt returns "" for marker-containing strings — treat as redacted
  const raw = sanitized ? sanitized : s
  const t = raw.replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Pulls the user's REAL Ascend data into a compact brief for the model.
 * Every section is optional — missing data simply omits the line.
 * All DB reads here are owner-scoped (`user_id = auth.uid()`); no RLS changes.
 */
export async function gatherCoachContext(supabase: SupabaseClient, userId: string): Promise<CoachContext> {
  const today = new Date()
  const since21 = todayIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20))

  const [phasesRes, goalsRes, questsOpenRes, questDoneRes, userSkillsRes, statsRes, momRes, reflRes, journalRes, levelRes, profileRes] = await Promise.all([
    supabase.from("phases").select("id,title,objective,status,goal_id,target_date,completed_at").eq("user_id", userId).order("order_index"),
    supabase.from("goals").select("id,title,status,priority,category,target_date,created_at,completed_at").eq("user_id", userId).neq("status", "archived").limit(8),
    supabase.from("quests").select("title,difficulty,due_date,category").eq("user_id", userId).eq("status", "active").order("due_date", { ascending: true }).limit(10),
    supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase.from("user_skills").select("skill_id,xp").eq("user_id", userId).gt("xp", 0).order("xp", { ascending: false }).limit(5),
    supabase.from("user_stats").select("stat_id,value").eq("user_id", userId),
    supabase.from("momentum").select("date,score,recovery,recovery_kinds").eq("user_id", userId).gte("date", since21),
    supabase.from("reflections").select("body,entry_date,mood,tags").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("reflections").select("entry_date,mood,tags").eq("user_id", userId).not("entry_date", "is", null).order("entry_date", { ascending: false }).limit(7),
    supabase.from("user_levels").select("level,xp").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("experience_level, long_term_objectives, preferences").eq("id", userId).maybeSingle(),
  ])

  // Stats names + trends (character)
  let statLines = ""
  const statIds = ((statsRes.data as { stat_id: string; value: number }[] | null) ?? []).filter((s) => s.value > 0)
  if (statIds.length > 0) {
    const { data: catalog } = await supabase.from("stats").select("id,name").in("id", statIds.map((s) => s.stat_id))
    const names = new Map(((catalog as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]))
    statLines =
      "CHARACTER STATS: " +
      statIds
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
        .map((s) => `${names.get(s.stat_id) ?? "?"} ${Math.round(s.value)}`)
        .join(", ")
  }

  // Skills (fixed: query user_skills + join catalog)
  let skillsLine = ""
  const userSkills = (userSkillsRes.data as { skill_id: string; xp: number }[] | null) ?? []
  if (userSkills.length > 0) {
    const ids = userSkills.map((s) => s.skill_id)
    const { data: skillCatalog } = await supabase.from("skills").select("id,name").in("id", ids)
    const nameMap = new Map(((skillCatalog as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]))
    skillsLine = "TOP SKILLS: " + userSkills.map((s) => `${nameMap.get(s.skill_id) ?? "?"} (${Math.round(s.xp)} xp)`).join(", ")
  }

  // Level
  const levelRow = levelRes.data as { level: number; xp: number } | null
  const levelLine = levelRow ? `LEVEL: ${levelRow.level} (${Math.round(levelRow.xp)} XP total)` : ""

  // Journal last 7 (mood/tags)
  const journals = (journalRes.data as { entry_date: string | null; mood: string | null; tags: string[] | null }[] | null) ?? []
  let journalLine = ""
  if (journals.length > 0) {
    const dated = journals.filter((j) => j.entry_date).slice(0, 7)
    if (dated.length > 0) {
      const streak = (() => {
        let s = 0
        const set = new Set(dated.map((j) => j.entry_date!))
        const d = new Date()
        for (let i = 0; i < 7; i++) {
          const k = todayIso(d)
          if (set.has(k)) s++
          else break
          d.setDate(d.getDate() - 1)
        }
        return s
      })()
      journalLine = `JOURNAL: ${dated.length} entries last 7d (streak ${streak}d), moods [${dated.map((j) => j.mood ?? "—").join(", ")}], tags [${[...new Set(dated.flatMap((j) => j.tags ?? []))].slice(0, 8).join(", ") || "none"}]`
    }
  }

  // Goals (bounded, non-archived) + context from the P2.1 intel rows.
  const goals = (goalsRes.data as CoachGoalRow[] | null) ?? []

  // All phases for this user (owner-scoped). The P2.1 intel groups them by goal.
  const allPhases = (phasesRes.data as (CoachPhaseRow & { title: string; objective: string | null })[] | null) ?? []
  const activePhase = allPhases.find((p) => p.status === "active") ?? null

  // Batched (non-N+1) load of milestones + quests for THIS user's goals' phases.
  const goalIds = new Set(goals.map((g) => g.id))
  const goalPhases = allPhases.filter((p) => p.goal_id && goalIds.has(p.goal_id))
  const goalPhaseIds = goalPhases.map((p) => p.id)
  let allMilestones: CoachMilestoneRow[] = []
  let goalQuests: CoachQuestRow[] = []
  let milestoneLines = ""
  if (goalPhaseIds.length > 0) {
    const [msRes, qRes] = await Promise.all([
      supabase.from("milestones").select("id,phase_id,title,status,completed_at,is_final_challenge").eq("user_id", userId).in("phase_id", goalPhaseIds).order("sort_order"),
      supabase.from("quests").select("id,phase_id,milestone_id,status,recurrence,due_date,completed_at").eq("user_id", userId).in("phase_id", goalPhaseIds).limit(300),
    ])
    allMilestones = (msRes.data as CoachMilestoneRow[] | null) ?? []
    goalQuests = (qRes.data as CoachQuestRow[] | null) ?? []

    const msRows = (msRes.data as { id: string; phase_id: string; title: string; status: string; is_final_challenge: boolean }[] | null) ?? []
    const activeMs = msRows.filter((m) => m.phase_id === activePhase?.id)
    if (activePhase && activeMs.length > 0) {
      milestoneLines = "MILESTONES: " + activeMs.slice(0, 8).map((m) => `${m.status === "completed" ? "[x]" : "[ ]"} ${clip(m.title, 60)}${m.is_final_challenge ? " (final)" : ""}`).join(" · ")
    }
  }

  // User model (stated context — enables personalization without guessing)
  const profileRow = profileRes.data as { experience_level: string | null; long_term_objectives: string | null; preferences: { coachStyle?: string } | null } | null

  // Behavioral facts (finish rates, postpones, skips) — deterministic, feeds the FACTS block
  const behavior = await gatherBehaviorFacts(supabase, userId)

  // Momentum via shared model
  type Row = MomentumDayRow & { recovery_kinds?: string[] }
  const momRows = ((momRes.data as Row[] | null) ?? []).map((r) => ({ date: r.date, score: r.score ?? 0, recovery: !!r.recovery }))
  const momentumScore = computeMomentumScore(momRows)

  const lines: string[] = []
  if (activePhase) {
    lines.push(`CURRENT PHASE: ${clip(activePhase.title, 80)}${activePhase.goal_id ? " (goal journey)" : ""}`)
    if (activePhase.objective) lines.push(`PHASE OBJECTIVE: ${clip(activePhase.objective)}`)
  }
  if (milestoneLines) lines.push(milestoneLines)

  const openQuests = (questsOpenRes.data as { title: string; difficulty: string; due_date: string | null; category: string }[] | null) ?? []
  if (openQuests.length > 0) {
    lines.push(`OPEN QUESTS: ${openQuests.map((q) => `${clip(q.title, 50)} (${q.difficulty}/${q.category}${q.due_date ? `, due ${q.due_date}` : ""})`).join("; ")}`)
  }
  lines.push(`COMPLETED QUESTS TOTAL: ${(questDoneRes.count ?? 0)}`)
  if (behavior.text) lines.push(behavior.text)

  if (goals.length > 0) {
    lines.push(`GOALS: ${goals.map((g) => `${clip(g.title, 50)} [${g.status}/${g.priority}${g.target_date ? `, target ${g.target_date}` : ""}]`).join("; ")}`)
  }

  // P2.1 — compact deterministic Goal Intelligence signals (bounded to the same top goals).
  const goalIntelText = formatGoalIntelligence(goals, allPhases, allMilestones, goalQuests, todayIso())
  if (goalIntelText) lines.push(goalIntelText)

  if (profileRow) {
    const userBits: string[] = []
    if (profileRow.experience_level) userBits.push(`experience: ${profileRow.experience_level}`)
    if (profileRow.preferences?.coachStyle) userBits.push(`coach style: ${profileRow.preferences.coachStyle}`)
    if (userBits.length > 0) lines.push(`USER MODEL: ${userBits.join("; ")} (stated by the user)`)
    if (profileRow.long_term_objectives) lines.push(`LONG-TERM OBJECTIVES: ${clip(profileRow.long_term_objectives, 200)}`)
  }

  if (skillsLine) lines.push(skillsLine)
  if (statLines) lines.push(statLines)
  if (levelLine) lines.push(levelLine)
  if (journalLine) lines.push(journalLine)

  lines.push(`MOMENTUM: ${momentumScore}/100 (${momentumTiers(momentumScore).label}); best streak ever ${await bestStreak(supabase, userId)}d`)

  const reflections = (reflRes.data as { body: string; entry_date: string | null; mood: string | null; tags: string[] | null }[] | null) ?? []
  if (reflections.length > 0) {
    const fmt = reflections
      .map((r) => {
        const tag = r.entry_date ? `[${r.entry_date}${r.mood ? ` ${r.mood}` : ""}]` : r.mood ? `[${r.mood}]` : ""
        return `${tag} "${clip(r.body, 110)}"`
      })
      .join(" | ")
    lines.push(`RECENT REFLECTIONS/JOURNAL: ${fmt}`)
  }

  const refStyle = profileRow?.preferences?.coachStyle as CoachStyle | undefined
  const coachStyle: CoachStyle | null = COACH_STYLES.includes(refStyle as never) ? (refStyle as CoachStyle) : null

  return {
    text: lines.join("\n") || "New user — no activity yet.",
    activePhaseId: activePhase?.id ?? null,
    activeGoalId: goals.find((g) => g.status === "active")?.id ?? null,
    behavior: behavior.facts,
    coachStyle,
  }
}

async function bestStreak(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from("momentum").select("streak").eq("user_id", userId).order("streak", { ascending: false }).limit(1)
  return (data as { streak: number }[] | null)?.[0]?.streak ?? 0
}
