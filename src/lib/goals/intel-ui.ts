import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeGoalIntel,
  todayLocal,
  type GoalIntelRow,
  type PhaseIntelRow,
  type MilestoneIntelRow,
  type QuestIntelRow,
} from "@/lib/goals/intelligence/metrics"
import { computeGoalQuality, type GoalQuality, type QualityRubricItem } from "@/lib/goals/proposals/quality"
import type { GoalWithProgress } from "@/lib/goals/queries"

/**
 * P2.1 Stage 6 — Goal Intelligence UI data layer.
 *
 * The deterministic quality score for a goal card is computed HERE (server-side)
 * from the SAME authoritative Stage-1 metric engine (`computeGoalIntel`) and the
 * Stage-2 deterministic `computeGoalQuality`. No AI is involved in the chip:
 * the model only ever ADDS a human explanation via the dedicated proposal
 * action, never the score. Every query is owner-scoped via `user_id`.
 *
 * `buildGoalQualityScore` is a PURE, DATABASE-INDEPENDENT builder (unit-tested);
 * `getGoalsQuality` is a thin batched loader (3 queries, no N+1).
 */

/** Goal row the UI quality chip needs (metrics row + display/context fields). */
export interface UIGoalQualityRow extends GoalIntelRow {
  title: string
  description?: string | null
  desired_outcome?: string | null
}

/** Optional row-shape overrides so callers can pass `GoalWithProgress` directly. */
function asGoalIntelRow(goal: UIGoalQualityRow): GoalIntelRow {
  return {
    id: goal.id,
    status: goal.status,
    category: goal.category,
    priority: goal.priority,
    target_date: goal.target_date,
    created_at: goal.created_at,
    completed_at: goal.completed_at,
  }
}

function asContextRow(goal: UIGoalQualityRow) {
  return {
    ...asGoalIntelRow(goal),
    title: goal.title,
    description: goal.description ?? null,
    desired_outcome: goal.desired_outcome ?? null,
  }
}

function asDate(iso?: string | null): string | null {
  const d = iso?.slice(0, 10)
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

function completionDates(
  goal: GoalIntelRow,
  phases: PhaseIntelRow[],
  milestones: MilestoneIntelRow[],
  quests: QuestIntelRow[],
): string[] {
  const out: string[] = []
  const push = (iso?: string | null) => {
    const d = asDate(iso)
    if (d) out.push(d)
  }
  push(goal.completed_at)
  for (const p of phases) push((p as unknown as { completed_at?: string | null }).completed_at)
  for (const m of milestones) push((m as unknown as { completed_at?: string | null }).completed_at)
  for (const q of quests) push((q as unknown as { completed_at?: string | null }).completed_at)
  return out
}

function progressCompletionDates(phases: PhaseIntelRow[], milestones: MilestoneIntelRow[], quests: QuestIntelRow[]): string[] {
  const out: string[] = []
  const push = (iso?: string | null) => {
    const d = asDate(iso)
    if (d) out.push(d)
  }
  for (const p of phases) push((p as unknown as { completed_at?: string | null }).completed_at)
  for (const m of milestones) push((m as unknown as { completed_at?: string | null }).completed_at)
  for (const q of quests) {
    if ((q as unknown as { recurrence?: string }).recurrence === "none") push((q as unknown as { completed_at?: string | null }).completed_at)
  }
  return out
}

/** Pure deterministic quality score for one goal from its raw rows. */
export function buildGoalQualityScore(
  goal: UIGoalQualityRow,
  phases: PhaseIntelRow[],
  milestones: MilestoneIntelRow[],
  quests: QuestIntelRow[],
  today: string = todayLocal(),
): GoalQuality {
  const goalRow = asGoalIntelRow(goal)
  const intel = computeGoalIntel({
    goal: goalRow,
    phases,
    milestones,
    quests,
    completionDates: completionDates(goalRow, phases, milestones, quests),
    progressCompletionDates: progressCompletionDates(phases, milestones, quests),
    today,
  })
  const { score, max, rubric } = computeGoalQuality(asContextRow(goal), intel)
  return { score, max, rubric, explanation: null, source: "none" }
}

/**
 * Batch-load the deterministic quality score for a set of goals (already
 * owner-scoped by the caller). 3 batched queries — no N+1.
 */
export async function getGoalsQuality(
  supabase: SupabaseClient,
  userId: string,
  goals: GoalWithProgress[],
): Promise<Map<string, GoalQuality>> {
  const out = new Map<string, GoalQuality>()
  if (goals.length === 0) return out

  const goalIds = goals.map((g) => g.id)
  const today = todayLocal()

  const { data: phaseRows } = await supabase
    .from("phases")
    .select("id,goal_id,status,target_date,completed_at")
    .eq("user_id", userId)
    .in("goal_id", goalIds)
  const phases = (phaseRows as (PhaseIntelRow & { completed_at?: string | null })[] | null) ?? []

  let milestones: (MilestoneIntelRow & { completed_at?: string | null })[] = []
  let quests: (QuestIntelRow & { completed_at?: string | null })[] = []
  const phaseIds = phases.map((p) => p.id)
  if (phaseIds.length > 0) {
    const { data: msRows } = await supabase.from("milestones").select("id,phase_id,status,completed_at").in("phase_id", phaseIds)
    milestones = (msRows as (MilestoneIntelRow & { completed_at?: string | null })[] | null) ?? []

    const msIds = milestones.map((m) => m.id)
    let qQuery = supabase.from("quests").select("id,phase_id,milestone_id,status,recurrence,due_date,completed_at").eq("user_id", userId)
    qQuery = msIds.length > 0 ? qQuery.or(`phase_id.in.(${phaseIds.join(",")}),milestone_id.in.(${msIds.join(",")})`) : qQuery.in("phase_id", phaseIds)
    const { data: qRows } = await qQuery
    quests = (qRows as (QuestIntelRow & { completed_at?: string | null })[] | null) ?? []
  }

  for (const goal of goals) {
    out.set(goal.id, buildGoalQualityScore(goal, phases.filter((p) => p.goal_id === goal.id), milestones, quests, today))
  }
  return out
}

export type { QualityRubricItem }

/** Deterministic human label + tone for a quality score (pure, unit-tested). */
export function qualityGrade(score: number, max = 100): { label: string; tone: "good" | "warn" | "bad" } {
  const pct = max > 0 ? (score / max) * 100 : 0
  if (pct >= 70) return { label: "Strong", tone: "good" }
  if (pct >= 45) return { label: "Developing", tone: "warn" }
  return { label: "Needs work", tone: "bad" }
}

/**
 * Normalize the two failure-result shapes a Goal proposal action can return
 * (the generic `GoalProposalActionResult` envelope and the plain
 * `{ok:false, reason}` not_authenticated/goal_not_found branch) into one
 * display state. Pure + unit-tested; the client components just render it.
 */
export type ProposalErrorState =
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "none" }

type AnyFailureResult =
  | { ok: false; reason: string; detail?: string; unavailable?: boolean }
  | { ok: true }

export function proposalErrorState(res: AnyFailureResult): ProposalErrorState {
  if (res.ok) return { kind: "none" }
  if (res.unavailable || res.reason === "unavailable" || res.reason === "no_key" || res.reason === "rate_limited" || res.reason === "upstream_error") {
    return { kind: "unavailable" }
  }
  const message =
    res.reason === "goal_not_found"
      ? "This goal no longer exists."
      : res.reason === "not_authenticated"
        ? "You need to be signed in."
        : res.reason === "parse_failed"
          ? "The coach returned something unusable. Try again."
          : res.reason === "invalid" || res.reason === "domain_invalid"
            ? "The plan didn't pass validation. Try again."
            : res.detail ?? "Couldn't complete that right now."
  return { kind: "error", message }
}
