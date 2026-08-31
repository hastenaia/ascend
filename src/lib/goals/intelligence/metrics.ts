import { computeMomentumScore, FULL_DAY_SCORE, type MomentumDayRow } from "@/lib/momentum/model"
import { isoWeekWindow } from "@/lib/weekly/metrics"

/**
 * Deterministic goal-intelligence metrics.
 *
 * Every function here is PURE and DATABASE-INDEPENDENT: it takes plain row
 * shapes (mirroring the real `goals`/`phases`/`milestones`/`quests` columns)
 * and returns derived numbers. No Supabase calls, no RLS, no mutation.
 *
 * Definitions are REUSED from the existing codebase, never redefined:
 *   - progress        -> milestone-weighted, identical to `goals/queries.ts`
 *                        (`computePhaseStats` / `getGoalsOverview`) and
 *                        `phases/queries.ts::calcProgress`.
 *   - overdue (quest) -> `coach/behavior.ts`: active, one-time
 *                        (`recurrence === "none"`), `due_date < today`.
 *                        Recurring quests are never overdue.
 *   - momentum        -> `momentum/model.ts` `computeMomentumScore` (21-day
 *                        window, 0.82 decay) fed a GOAL-SCOPED activity
 *                        series. The model is reused; only the input daily
 *                        score series is scoped to a single goal.
 *   - week bucketing  -> `weekly/metrics.ts::isoWeekWindow` (Monday-start).
 *
 * All date comparisons are LOCAL-DATE YYYY-MM-DD string comparisons, matching
 * the established Ascend convention (see `coach/behavior.ts::todayIso`). See
 * the notes on `asLocalDate` / `todayLocal` below.
 */

// ---------------------------------------------------------------------------
// Date helpers (local-date convention)
// ---------------------------------------------------------------------------

/**
 * Local date key (YYYY-MM-DD) for "now". Mirrors `coach/behavior.ts::todayIso`
 * exactly so "today" means the same thing the rest of the app uses for overdue
 * and weekly logic. Dates past midnight in any timezone are bounded by the
 * machine's local calendar day, matching existing behaviour.
 */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/**
 * Reduce an ISO timestamp to a YYYY-MM-DD key.
 *
 * This uses the codebase's established slicing convention
 * (`completed_at` / `updated_at` timestamps are bucketed by
 * `iso.slice(0, 10)` in the momentum and journal code). It intentionally
 * returns the naive date of the timestamp, consistent with how the rest of the
 * app buckets completion timestamps. Returns null for empty input.
 */
export function asLocalDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

// ---------------------------------------------------------------------------
// Input row shapes (subset of real columns; database-independent)
// ---------------------------------------------------------------------------

export interface GoalIntelRow {
  id: string
  status: string
  category: string
  priority: string
  target_date: string | null
  created_at: string | null
  completed_at: string | null
}

export interface PhaseIntelRow {
  id: string
  goal_id: string | null
  status: string
  target_date: string | null
}

export interface MilestoneIntelRow {
  id: string
  phase_id: string
  status: string
}

export interface QuestIntelRow {
  id: string
  phase_id: string | null
  milestone_id: string | null
  status: string
  recurrence: string
  due_date: string | null
}

// ---------------------------------------------------------------------------
// Progress / completion
// ---------------------------------------------------------------------------

export interface GoalProgress {
  progressPct: number // 0-100, milestone-weighted
  milestonesDone: number
  milestonesTotal: number
}

/**
 * Milestone-weighted progress for a single goal — the SAME definition the app
 * already uses in `goals/queries.ts`. No goal phases / no milestones => 0%.
 */
export function computeGoalProgress(goalId: string, phases: PhaseIntelRow[], milestones: MilestoneIntelRow[]): GoalProgress {
  const phaseIds = new Set(phases.filter((p) => p.goal_id === goalId).map((p) => p.id))
  const total = milestones.filter((m) => phaseIds.has(m.phase_id)).length
  if (total === 0) return { progressPct: 0, milestonesDone: 0, milestonesTotal: 0 }
  const done = milestones.filter((m) => phaseIds.has(m.phase_id) && m.status === "completed").length
  return { progressPct: Math.round((done / total) * 100), milestonesDone: done, milestonesTotal: total }
}

export interface GoalCompletion {
  goalCompleted: boolean
  phasesCompleted: number
  phasesTotal: number
  milestonesCompleted: number
  milestonesTotal: number
  questsCompleted: number
}

/**
 * Completion tallies for a goal. Phases/milestones are matched through the
 * goal's phases; quests are matched through their phase OR their phase via
 * the milestone->phase link (quests carry no direct goal_id).
 *
 * `goalCompleted` is the AUTHORITATIVE goal-row status (the `goals` table sets
 * `status = 'completed'` / `completed_at` via `award_phase_xp` when the LAST
 * incomplete phase closes) — it is NOT inferred from any single phase.
 */
export function computeGoalCompletion(
  goalStatus: string,
  goalId: string,
  phases: PhaseIntelRow[],
  milestones: MilestoneIntelRow[],
  quests: QuestIntelRow[],
): GoalCompletion {
  const goalPhases = phases.filter((p) => p.goal_id === goalId)
  const phaseIds = new Set(goalPhases.map((p) => p.id))

  const goalMilestones = milestones.filter((m) => phaseIds.has(m.phase_id))
  const milestonesCompleted = goalMilestones.filter((m) => m.status === "completed").length

  const phaseIdByMilestone = new Map(milestones.map((m) => [m.id, m.phase_id]))
  const goalQuests = quests.filter((q) => {
    if (q.phase_id && phaseIds.has(q.phase_id)) return true
    if (q.milestone_id) {
      const pid = phaseIdByMilestone.get(q.milestone_id)
      return !!pid && phaseIds.has(pid)
    }
    return false
  })
  const questsCompleted = goalQuests.filter((q) => q.status === "completed").length

  return {
    goalCompleted: goalStatus === "completed",
    phasesCompleted: goalPhases.filter((p) => p.status === "completed").length,
    phasesTotal: goalPhases.length,
    milestonesCompleted,
    milestonesTotal: goalMilestones.length,
    questsCompleted,
  }
}

// ---------------------------------------------------------------------------
// Overdue items
// ---------------------------------------------------------------------------

export interface OverdueMilestone {
  milestoneId: string
  phaseId: string
  phaseTitle?: string
  status: string
  phaseTargetDate: string | null
}

export interface OverdueQuest {
  questId: string
  status: string
  dueDate: string | null
}

export interface GoalOverdue {
  overdueQuests: OverdueQuest[]
  overdueMilestones: OverdueMilestone[]
  overdueQuestCount: number
  overdueMilestoneCount: number
}

/**
 * Overdue items for a goal.
 *
 * QUEST overdue reuses the exact `coach/behavior.ts` rule: an ACTIVE quest is
 * overdue iff `recurrence === "none"` AND `due_date` is set AND
 * `due_date < today`. Recurring quests are never overdue.
 *
 * MILESTONE overdue: a milestone that is not yet completed while its phase has
 * a `target_date` earlier than today. (Milestones carry no own due date; the
 * phase deadline is the authoritative schedule.) Only phases/gual quests that
 * belong to the goal are considered.
 */
export function computeGoalOverdue(
  goalId: string,
  phases: PhaseIntelRow[],
  milestones: MilestoneIntelRow[],
  quests: QuestIntelRow[],
  today: string = todayLocal(),
): GoalOverdue {
  const goalPhases = phases.filter((p) => p.goal_id === goalId)
  const phaseIds = new Set(goalPhases.map((p) => p.id))
  const phaseTarget = new Map(goalPhases.map((p) => [p.id, p.target_date]))

  const overdueQuests: OverdueQuest[] = []
  const phaseIdByMilestone = new Map(milestones.map((m) => [m.id, m.phase_id]))
  for (const q of quests) {
    if (q.status !== "active") continue
    if (q.recurrence !== "none") continue
    const inGoal = q.phase_id
      ? phaseIds.has(q.phase_id)
      : q.milestone_id
        ? phaseIds.has(phaseIdByMilestone.get(q.milestone_id) ?? "")
        : false
    if (!inGoal) continue
    if (q.due_date && q.due_date < today) overdueQuests.push({ questId: q.id, status: q.status, dueDate: q.due_date })
  }

  const overdueMilestones: OverdueMilestone[] = []
  for (const m of milestones) {
    if (m.status === "completed") continue
    if (!phaseIds.has(m.phase_id)) continue
    const target = phaseTarget.get(m.phase_id) ?? null
    if (target && target < today) {
      overdueMilestones.push({
        milestoneId: m.id,
        phaseId: m.phase_id,
        status: m.status,
        phaseTargetDate: target,
      })
    }
  }

  return {
    overdueQuests,
    overdueMilestones,
    overdueQuestCount: overdueQuests.length,
    overdueMilestoneCount: overdueMilestones.length,
  }
}

// ---------------------------------------------------------------------------
// Inactive goals
// ---------------------------------------------------------------------------

const INACTIVITY_WINDOW_DAYS = 21

/**
 * A goal is INACTIVE based ONLY on actual goal-related activity — never on how
 * far away its target date is. An active (non-completed, non-archived) goal
 * with zero completion events in the trailing `INACTIVITY_WINDOW_DAYS` days is
 * flagged. The window reuses `MOMENTUM_WINDOW_DAYS` (21), the codebase's
 * established activity/decay window — the same span used to judge momentum.
 */
export function computeGoalInactive(
  goalId: string,
  goalStatus: string,
  completionDates: string[],
  today: string = todayLocal(),
  windowDays: number = INACTIVITY_WINDOW_DAYS,
): { inactive: boolean; lastActivityDate: string | null; windowDays: number } {
  if (goalStatus !== "active") return { inactive: false, lastActivityDate: null, windowDays }
  const recent = completionDates.filter((d) => d >= subDays(today, windowDays))
  const last = completionDates.length > 0 ? maxDate(completionDates) : null
  return { inactive: recent.length === 0, lastActivityDate: last, windowDays }
}

function subDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function maxDate(dates: string[]): string {
  let m = dates[0]
  for (const d of dates) if (d > m) m = d
  return m
}

// ---------------------------------------------------------------------------
// Goal-scoped momentum (REUSES the shared momentum model)
// ---------------------------------------------------------------------------

/**
 * Goal momentum (0-100) — sustained RECENT activity toward one goal.
 *
 * Reuses `computeMomentumScore` and its window/decay constants unchanged. The
 * only difference from the global momentum ledger is the INPUT series: we
 * build a per-day goal-scoped `MomentumDayRow` where any day with >=1
 * completion toward the goal counts as a "full" activity day for that goal
 * (`score = FULL_DAY_SCORE`), days with none are `0`. A single completion is
 * treated as a full active day for the goal because the global `momentum`
 * table's daily `score` (an aggregate intensity) has no per-goal analogue here.
 * The result reads as: "recent consistent activity toward this goal," with the
 * same decay the app uses globally (0.82/day over 21 days).
 */
export function computeGoalMomentum(
  completionDates: string[],
  today: string = todayLocal(),
): number {
  const counts = new Map<string, number>()
  for (const d of completionDates) counts.set(d, (counts.get(d) ?? 0) + 1)

  const rows: MomentumDayRow[] = []
  for (const [date, count] of counts) {
    if (count > 0) rows.push({ date, score: FULL_DAY_SCORE, recovery: false })
  }
  return computeMomentumScore(rows, today)
}

// ---------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------

export interface GoalConsistency {
  /** percentage (0-100) of active weeks that had >=1 goal completion */
  consistencyPct: number
  weeksTotal: number
  weeksActive: number
}

/**
 * Consistency = fraction of ACTIVE weeks (Monday-start, reusing
 * `isoWeekWindow`) since the goal was created — up to completion, if
 * completed — during which the user produced at least one goal completion.
 *
 * Robust for both short and long lifetimes:
 *   - A goal created today occupies a single week bucket, so `weeksTotal >= 1`
 *     always (no division by zero / undefined-week cases).
 *   - If the goal is completed, the analysed window ends at the completion
 *     date, so post-completion weeks are not penalized.
 */
export function computeGoalConsistency(
  goalCreatedAt: string,
  goalCompletedAt: string | null,
  completionDates: string[],
  today: string = todayLocal(),
): GoalConsistency {
  const startDate = asLocalDate(goalCreatedAt)
  const created = startDate ?? today

  let endDate = today
  const completed = asLocalDate(goalCompletedAt)
  if (completed && completed > created && completed < today) endDate = completed

  // Bucket each completion into its Monday-start week.
  const activeWeeks = new Set<string>()
  for (const d of completionDates) {
    if (d < created || d > endDate) continue
    activeWeeks.add(isoWeekWindow(parseLocalDate(d)).start)
  }

  const weeksTotal = countWeekStarts(created, endDate)
  return {
    consistencyPct: weeksTotal > 0 ? Math.round((activeWeeks.size / weeksTotal) * 100) : 0,
    weeksTotal,
    weeksActive: activeWeeks.size,
  }
}

/** Number of distinct Monday-start week buckets (>=1) from start to end inclusive. */
function countWeekStarts(start: string, end: string): number {
  if (end < start) return 1
  const startBucket = isoWeekWindow(parseLocalDate(start)).start
  const endBucket = isoWeekWindow(parseLocalDate(end)).start
  if (endBucket < startBucket) return 1
  const ms = (parseLocalDate(endBucket).getTime() - parseLocalDate(startBucket).getTime()) / 86_400_000
  return Math.floor(ms / 7) + 1
}

function parseLocalDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z")
}

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

export interface GoalVelocity {
  /** Interpreted as the number of goal-progress completions per full week. */
  value: number
  unit: "completions/week"
  weeksElapsed: number
  /** false when the goal is younger than one full week (value is a partial-rate). */
  sufficientData: boolean
}

/**
 * Velocity = goal PROGRESS completions per elapsed week.
 *
 * "Progress completions" = milestone + phase + one-time quest completions
 * (recurring quest completions are excluded: they are maintenance, not
 * progress toward the goal). Unit is explicitly `completions/week`.
 *
 * Robust for fresh goals: `weeksElapsed` is at least 1 (no division by zero),
 * and `sufficientData` is false when the goal is younger than a full week so
 * callers can avoid quoting a premature rate.
 */
export function computeGoalVelocity(
  goalCreatedAt: string,
  progressCompletionDates: string[],
  today: string = todayLocal(),
): GoalVelocity {
  const created = asLocalDate(goalCreatedAt)
  const start = created ?? today

  const elapsedMs = parseLocalDate(today).getTime() - parseLocalDate(start).getTime()
  const elapsedDays = Math.max(0, Math.round(elapsedMs / 86_400_000))
  const weeksElapsed = Math.max(1, elapsedDays / 7)

  const value = weeksElapsed > 0 ? progressCompletionDates.length / weeksElapsed : 0

  return {
    value: round2(value),
    unit: "completions/week",
    weeksElapsed: round2(weeksElapsed),
    sufficientData: elapsedDays >= 7,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Composite per-goal intelligence
// ---------------------------------------------------------------------------

export interface GoalIntel {
  goalId: string
  progress: GoalProgress
  completion: GoalCompletion
  overdue: GoalOverdue
  inactive: { inactive: boolean; lastActivityDate: string | null; windowDays: number }
  momentum: number
  consistency: GoalConsistency
  velocity: GoalVelocity
}

export interface GoalIntelInput {
  goal: GoalIntelRow
  phases: PhaseIntelRow[]
  milestones: MilestoneIntelRow[]
  quests: QuestIntelRow[]
  /** goal-attributed completion dates (YYYY-MM-DD) for inactivity/momentum/consistency/velocity */
  completionDates: string[]
  /** subset of completionDates that count as progress (milestone/phase/one-time quest) */
  progressCompletionDates: string[]
  today?: string
}

/**
 * Aggregates all deterministic metrics for a single goal in one call. Pure.
 */
export function computeGoalIntel(input: GoalIntelInput): GoalIntel {
  const today = input.today ?? todayLocal()
  const progress = computeGoalProgress(input.goal.id, input.phases, input.milestones)
  return {
    goalId: input.goal.id,
    progress,
    completion: computeGoalCompletion(input.goal.status, input.goal.id, input.phases, input.milestones, input.quests),
    overdue: computeGoalOverdue(input.goal.id, input.phases, input.milestones, input.quests, today),
    inactive: computeGoalInactive(input.goal.id, input.goal.status, input.completionDates, today),
    momentum: computeGoalMomentum(input.completionDates, today),
    consistency: computeGoalConsistency(input.goal.created_at ?? today, input.goal.completed_at, input.completionDates, today),
    velocity: computeGoalVelocity(input.goal.created_at ?? today, input.progressCompletionDates, today),
  }
}
