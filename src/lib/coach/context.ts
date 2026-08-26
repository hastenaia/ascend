import type { SupabaseClient } from "@supabase/supabase-js"
import { computeMomentumScore, momentumTiers, type MomentumDayRow } from "@/lib/momentum/model"

export type CoachContext = {
  text: string
  activePhaseId: string | null
  activeGoalId: string | null
}

function clip(s: string | null | undefined, n = 160): string {
  if (!s) return ""
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

/**
 * Pulls the user's REAL Ascend data into a compact brief for the model.
 * Every section is optional — missing data simply omits the line.
 */
export async function gatherCoachContext(supabase: SupabaseClient, userId: string): Promise<CoachContext> {
  const today = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const since21 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20))

  const [phasesRes, goalsRes, questsOpenRes, questDoneRes, skillsRes, statsRes, momRes, reflRes] = await Promise.all([
    supabase.from("phases").select("id,title,objective,status,goal_id").eq("user_id", userId).order("order_index"),
    supabase.from("goals").select("id,title,status,priority,target_date").eq("user_id", userId).neq("status", "archived").limit(8),
    supabase.from("quests").select("title,difficulty,due_date").eq("user_id", userId).eq("status", "active").order("due_date", { ascending: true }).limit(10),
    supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase.from("skills").select("name,xp_current").eq("user_id", userId).gt("xp_current", 0).order("xp_current", { ascending: false }).limit(5),
    supabase.from("user_stats").select("stat_id,value").eq("user_id", userId),
    supabase.from("momentum").select("date,score,recovery,recovery_kinds").eq("user_id", userId).gte("date", since21),
    supabase.from("reflections").select("body").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
  ])

  // Stats names
  let statLines = ""
  const statIds = ((statsRes.data as { stat_id: string; value: number }[] | null) ?? []).filter((s) => s.value > 0)
  if (statIds.length > 0) {
    const { data: catalog } = await supabase.from("stats").select("id,name").in("id", statIds.map((s) => s.stat_id))
    const names = new Map(((catalog as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]))
    statLines =
      "STATS: " +
      statIds
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
        .map((s) => `${names.get(s.stat_id) ?? "?"} ${Math.round(s.value)}`)
        .join(", ")
  }

  const phases = (phasesRes.data as { id: string; title: string; objective: string | null; status: string; goal_id: string | null }[] | null) ?? []
  const activePhase = phases.find((p) => p.status === "active")

  // Milestones of active phase
  let milestoneLines = ""
  if (activePhase) {
    const { data: ms } = await supabase.from("milestones").select("title,status,is_final_challenge").eq("phase_id", activePhase.id).order("sort_order")
    const rows = (ms as { title: string; status: string; is_final_challenge: boolean }[] | null) ?? []
    if (rows.length > 0) {
      milestoneLines =
        "MILESTONES: " +
        rows.slice(0, 8).map((m) => `${m.status === "completed" ? "[x]" : "[ ]"} ${clip(m.title, 60)}${m.is_final_challenge ? " (final)" : ""}`).join(" · ")
    }
  }

  const goals = (goalsRes.data as { id: string; title: string; status: string; priority: string; target_date: string | null }[] | null) ?? []

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

  const openQuests = (questsOpenRes.data as { title: string; difficulty: string; due_date: string | null }[] | null) ?? []
  if (openQuests.length > 0) {
    lines.push(`OPEN QUESTS: ${openQuests.map((q) => `${clip(q.title, 50)} (${q.difficulty}${q.due_date ? `, due ${q.due_date}` : ""})`).join("; ")}`)
  }
  lines.push(`COMPLETED QUESTS TOTAL: ${(questDoneRes.count ?? 0)}`)

  if (goals.length > 0) {
    lines.push(`GOALS: ${goals.map((g) => `${clip(g.title, 50)} [${g.status}/${g.priority}${g.target_date ? `, target ${g.target_date}` : ""}]`).join("; ")}`)
  }

  const skills = (skillsRes.data as { name: string; xp_current: number }[] | null) ?? []
  if (skills.length > 0) lines.push(`TOP SKILLS: ${skills.map((s) => `${s.name} (${Math.round(s.xp_current)} xp)`).join(", ")}`)
  if (statLines) lines.push(statLines)

  lines.push(`MOMENTUM: ${momentumScore}/100 (${momentumTiers(momentumScore).label}); best streak ever ${await bestStreak(supabase, userId)}d`)

  const reflections = (reflRes.data as { body: string }[] | null) ?? []
  if (reflections.length > 0) {
    lines.push(`RECENT REFLECTIONS: ${reflections.map((r) => `"${clip(r.body, 110)}"`).join(" | ")}`)
  }

  return {
    text: lines.join("\n") || "New user — no activity yet.",
    activePhaseId: activePhase?.id ?? null,
    activeGoalId: goals.find((g) => g.status === "active")?.id ?? null,
  }
}

async function bestStreak(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from("momentum").select("streak").eq("user_id", userId).order("streak", { ascending: false }).limit(1)
  return (data as { streak: number }[] | null)?.[0]?.streak ?? 0
}
