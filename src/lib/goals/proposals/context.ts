import type { GoalIntel, GoalIntelRow } from "@/lib/goals/intelligence/metrics"
import type { GatherFactsResult } from "@/lib/ai/types"

/**
 * Deterministic goal context for the AI proposals.
 *
 * The model receives ONLY these pre-computed facts — never the raw database.
 * `formatGoalIntel` renders the Stage-1 deterministic metrics into a compact
 * prompt block, and every AI claim must be grounded in it (the prompts in the
 * proposal modules enforce that). Nothing here invents progress, dates,
 * milestones, behavior, or achievements.
 */

/** Full goal row the proposals need (extends the metrics row with display fields). */
export interface GoalContextRow extends GoalIntelRow {
  title: string
  description?: string | null
  desired_outcome?: string | null
}

function clip(s: string | null | undefined, n = 80): string {
  if (!s) return ""
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

/** Render a goal + its deterministic intelligence into a compact fact block. */
export function formatGoalIntel(goal: GoalContextRow, intel: GoalIntel): string {
  const lines: string[] = []
  lines.push(`GOAL: "${clip(goal.title, 80)}" [${goal.status}]`)
  if (goal.description) lines.push(`DESCRIPTION: ${clip(goal.description, 160)}`)
  if (goal.desired_outcome) lines.push(`DESIRED OUTCOME: ${clip(goal.desired_outcome, 160)}`)
  lines.push(
    `META: category=${goal.category} priority=${goal.priority}` +
      (goal.target_date ? ` target=${goal.target_date}` : " target=none"),
  )
  lines.push(
    `PROGRESS: ${intel.progress.progressPct}% (${intel.progress.milestonesDone}/${intel.progress.milestonesTotal} milestones)`,
  )
  lines.push(`COMPLETION: ${intel.completion.phasesCompleted}/${intel.completion.phasesTotal} phases, ${intel.completion.questsCompleted} quests completed`)
  if (intel.completion.goalCompleted) lines.push("GOAL COMPLETED: true")
  lines.push(`OVERDUE: ${intel.overdue.overdueQuestCount} quests, ${intel.overdue.overdueMilestoneCount} milestones`)
  if (intel.inactive.inactive) lines.push(`INACTIVE: yes (no goal activity in last ${intel.inactive.windowDays} days, last activity ${intel.inactive.lastActivityDate ?? "never"})`)
  lines.push(`MOMENTUM: ${intel.momentum}/100`)
  lines.push(`CONSISTENCY: ${intel.consistency.consistencyPct}% (${intel.consistency.weeksActive}/${intel.consistency.weeksTotal} weeks)`)
  lines.push(`VELOCITY: ${intel.velocity.value} ${intel.velocity.unit}`)
  return lines.join("\n")
}

/**
 * Deterministic facts feeding any goal proposal. `signals` carries the machine
 * checkable numbers (source of truth); `text` is what the model reads.
 */
export function buildGoalFacts(goal: GoalContextRow, intel: GoalIntel): GatherFactsResult {
  return {
    text: formatGoalIntel(goal, intel),
    signals: {
      progressPct: intel.progress.progressPct,
      milestonesDone: intel.progress.milestonesDone,
      milestonesTotal: intel.progress.milestonesTotal,
      momentum: intel.momentum,
      consistency: intel.consistency.consistencyPct,
      velocity: intel.velocity.value,
      overdueQuestCount: intel.overdue.overdueQuestCount,
      overdueMilestoneCount: intel.overdue.overdueMilestoneCount,
      inactive: intel.inactive.inactive,
      goalCompleted: intel.completion.goalCompleted,
    },
    resolved: false,
  }
}
