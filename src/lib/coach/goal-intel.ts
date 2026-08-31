import {
  computeGoalIntel,
  type GoalIntelRow,
  type GoalProgress,
  type GoalCompletion,
  type GoalOverdue,
  type PhaseIntelRow,
  type MilestoneIntelRow,
  type QuestIntelRow,
} from "@/lib/goals/intelligence/metrics"

/**
 * P2.1 Stage 5 — compact, deterministic Goal Intelligence for the Coach.
 *
 * This is a PURE, DATABASE-INDEPENDENT builder: it takes plain row shapes
 * (mirroring the real DB columns) and returns ONE compact "GOAL INTELLIGENCE"
 * paragraph the Coach model can read. It reuses the P2.1 metric
 * implementations (`computeGoalIntel`) verbatim — the Coach is told to treat
 * these as authoritative and NEVER recompute or second-guess them.
 *
 * Scope is deliberately compact and bounded: one line per goal, only the
 * signals listed (progress, completion state, active phase, overdue counts,
 * momentum, consistency, velocity, inactive). It never dumps the goal/phase/
 * quest database into the prompt, and it never invents facts.
 */

/** Goal row the Coach cares about (metrics row + display title). */
export interface CoachGoalRow extends GoalIntelRow {
  title: string
}

export interface CoachPhaseRow extends Partial<PhaseIntelRow> {
  id: string
  goal_id: string | null
  status: string
  title?: string
  target_date?: string | null
  completed_at?: string | null
}

export interface CoachMilestoneRow extends Partial<MilestoneIntelRow> {
  id: string
  phase_id: string
  status?: string
  completed_at?: string | null
}

export interface CoachQuestRow extends Partial<QuestIntelRow> {
  id: string
  phase_id?: string | null
  milestone_id?: string | null
  status?: string
  recurrence?: string
  due_date?: string | null
  completed_at?: string | null
}

function asDate(iso?: string | null): string | null {
  const d = iso?.slice(0, 10)
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/** All goal-attributed completion dates (YYYY-MM-DD) — drives inactivity/momentum/consistency/velocity. */
function completionDates(
  goal: GoalIntelRow,
  phases: CoachPhaseRow[],
  milestones: CoachMilestoneRow[],
  quests: CoachQuestRow[],
): string[] {
  const out: string[] = []
  const push = (iso?: string | null) => {
    const d = asDate(iso)
    if (d) out.push(d)
  }
  push(goal.completed_at)
  for (const p of phases) push(p.completed_at)
  for (const m of milestones) push(m.completed_at)
  for (const q of quests) push(q.completed_at)
  return out
}

/** Progress subset (milestone/phase/one-time quest) — drives the velocity rate. */
function progressDates(phases: CoachPhaseRow[], milestones: CoachMilestoneRow[], quests: CoachQuestRow[]): string[] {
  const out: string[] = []
  const push = (iso?: string | null) => {
    const d = asDate(iso)
    if (d) out.push(d)
  }
  for (const p of phases) push(p.completed_at)
  for (const m of milestones) push(m.completed_at)
  for (const q of quests) if (q.recurrence === "none") push(q.completed_at)
  return out
}

/**
 * Compute deterministic intelligence for ONE owned goal from its raw rows.
 * Rows are already scoped to the caller by the caller (no cross-user leakage).
 */
export function buildGoalIntel(
  goal: CoachGoalRow,
  phases: CoachPhaseRow[],
  milestones: CoachMilestoneRow[],
  quests: CoachQuestRow[],
  today = todayLocal(),
): ReturnType<typeof computeGoalIntel> {
  const goalRow: GoalIntelRow = {
    id: goal.id,
    status: goal.status,
    category: goal.category,
    priority: goal.priority,
    target_date: goal.target_date,
    created_at: goal.created_at,
    completed_at: goal.completed_at,
  }
  const phaseRows: PhaseIntelRow[] = phases.map((p) => ({
    id: p.id,
    goal_id: p.goal_id ?? null,
    status: p.status,
    target_date: p.target_date ?? null,
  }))
  const milestoneRows: MilestoneIntelRow[] = milestones.map((m) => ({
    id: m.id,
    phase_id: m.phase_id,
    status: m.status ?? "pending",
  }))
  const questRows: QuestIntelRow[] = quests.map((q) => ({
    id: q.id,
    phase_id: q.phase_id ?? null,
    milestone_id: q.milestone_id ?? null,
    status: q.status ?? "active",
    recurrence: q.recurrence ?? "none",
    due_date: q.due_date ?? null,
  }))

  return computeGoalIntel({
    goal: goalRow,
    phases: phaseRows,
    milestones: milestoneRows,
    quests: questRows,
    completionDates: completionDates(goalRow, phases, milestones, quests),
    progressCompletionDates: progressDates(phases, milestones, quests),
    today,
  })
}

function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function clip(s: string | null | undefined, n = 40): string {
  if (!s) return ""
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

interface GoalIntelSummary {
  goalId: string
  title: string
  status: string
  priority: string
  progressPct: number
  completion: Pick<GoalCompletion, "goalCompleted" | "phasesCompleted" | "phasesTotal">
  activePhase: string | null
  overdue: Pick<GoalOverdue, "overdueQuestCount" | "overdueMilestoneCount">
  momentum: number
  consistency: number
  velocity: number
  inactive: boolean
  targetDate: string | null
}

/** Compute the compact per-goal summary signals. Pure + deterministic. */
export function summarizeGoalIntel(
  goal: CoachGoalRow,
  intel: { progress: GoalProgress; completion: GoalCompletion; overdue: GoalOverdue; momentum: number; consistency: { consistencyPct: number }; velocity: { value: number }; inactive: { inactive: boolean } },
  phases: CoachPhaseRow[],
): GoalIntelSummary {
  const activePhase = phases.find((p) => p.status === "active") ?? null
  return {
    goalId: goal.id,
    title: goal.title,
    status: goal.status,
    priority: goal.priority,
    progressPct: intel.progress.progressPct,
    completion: {
      goalCompleted: intel.completion.goalCompleted,
      phasesCompleted: intel.completion.phasesCompleted,
      phasesTotal: intel.completion.phasesTotal,
    },
    activePhase: activePhase?.title ?? null,
    overdue: {
      overdueQuestCount: intel.overdue.overdueQuestCount,
      overdueMilestoneCount: intel.overdue.overdueMilestoneCount,
    },
    momentum: intel.momentum,
    consistency: intel.consistency.consistencyPct,
    velocity: intel.velocity.value,
    inactive: intel.inactive.inactive,
    targetDate: goal.target_date,
  }
}

/** Render one goal's summary to a single compact line. */
export function formatGoalIntelLine(s: GoalIntelSummary): string {
  const completionState = s.completion.goalCompleted ? "complete" : s.status === "active" ? "in_progress" : s.status
  const phase = s.activePhase ? `active phase: "${clip(s.activePhase, 30)}"` : "active phase: none"
  const overdue = `${s.overdue.overdueQuestCount}q/${s.overdue.overdueMilestoneCount}m overdue`
  const inactive = s.inactive ? "inactive" : "active"
  return (
    `- "${clip(s.title, 45)}" [${s.status}/${s.priority}] progress ${s.progressPct}% | ${phase} | completion: ${completionState}` +
    ` | ${overdue} | momentum ${s.momentum} | consistency ${s.consistency}% | velocity ${s.velocity}/wk | ${inactive}`
  )
}

/**
 * Build a bounded "GOAL INTELLIGENCE" section from the user's goals and their
 * raw rows. `goals` may be limited upstream (the caller keeps the existing
 * cap); only non-archived goals are formatted. Grouping happens here so the
 * caller passes flat, batched (non-N+1) data.
 */
export function formatGoalIntelligence(
  goals: CoachGoalRow[],
  allPhases: CoachPhaseRow[],
  allMilestones: CoachMilestoneRow[],
  allQuests: CoachQuestRow[],
  today = todayLocal(),
): string {
  const visible = goals.filter((g) => g.status !== "archived")
  if (visible.length === 0) return ""

  const lines: string[] = []
  for (const goal of visible) {
    const phases = allPhases.filter((p) => p.goal_id === goal.id)
    const phaseIds = new Set(phases.map((p) => p.id))
    const milestones = allMilestones.filter((m) => phaseIds.has(m.phase_id))
    const milestoneIds = new Set(milestones.map((m) => m.id))
    const quests = allQuests.filter((q) => (q.phase_id && phaseIds.has(q.phase_id)) || (q.milestone_id && milestoneIds.has(q.milestone_id)))

    const intel = buildGoalIntel(goal, phases, milestones, quests, today)
    const summary = summarizeGoalIntel(goal, intel, phases)
    lines.push(formatGoalIntelLine(summary))
  }
  if (lines.length === 0) return ""
  return `GOAL INTELLIGENCE:\n${lines.join("\n")}`
}

export type { GoalIntelSummary }
