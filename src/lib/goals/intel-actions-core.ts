import type { GoalIntel } from "@/lib/goals/intelligence/metrics"
import type { GoalContextRow } from "@/lib/goals/proposals/context"
import type { AuditAction } from "@/lib/ai/audit"
import type { GoalQualityResult } from "@/lib/goals/proposals/quality"
import { proposeGoalQuality, type GoalQualityRequestOptions } from "@/lib/goals/proposals/quality"
import type { GoalUnderstandingResult } from "@/lib/goals/proposals/understanding"
import { proposeGoalUnderstanding, type GoalUnderstandingOptions } from "@/lib/goals/proposals/understanding"
import type { GoalDecompositionResult } from "@/lib/goals/proposals/decomposition"
import { proposeGoalDecomposition, type GoalDecompositionOptions } from "@/lib/goals/proposals/decomposition"
import type { AIProposalFailureReason, ProposalSource } from "@/lib/ai/types"
import { detectGoalConflicts, type GoalConflict, type GoalConflictGoal } from "@/lib/goals/intelligence/conflicts"

/**
 * P2.1 Stage 4 — server-action execution core for the four Goal Intelligence
 * proposal actions.
 *
 * This module is the TESTABLE heart of the actions: every dependency is
 * injected (`load`, `propose*`, `audit`), so the entire flow is exercised in
 * Vitest without touching a database or a live model. The actual
 * `actions-goal-intel.ts` `"use server"` exports are thin wrappers that build
 * the real Supabase-backed context and delegate here.
 *
 * Security / ownership rules enforced for EVERY proposal:
 *   - `load(goalId)` is the ONLY read path for a goal and is owner-scoped to
 *     `auth.uid()` (implemented by the action layer). A goal that isn't the
 *     caller's (or doesn't exist) returns `null` and surfaces as
 *     `goal_not_found` — leaking no existence or ownership information.
 *   - AI is PROPOSAL-ONLY: the pipeline functions below never write to
 *     goals/phases/milestones/quests. Persistence only happens later, after
 *     explicit user approval, via `applyGoalDecompositionAction` (Stage 3).
 *   - Every observable result is audited (fail-soft) unless the goal was not
 *     found (no audit churn for probing unknown ids).
 */

export interface GoalActionLoad {
  /** Owner-scoped deterministic goal + intelligence. Null when absent/not owned. */
  load: (goalId: string) => Promise<{ goal: GoalContextRow; intel: GoalIntel } | null>
  /** Owner-scoped list of all active goals for conflict detection. */
  loadAllActiveGoals: () => Promise<GoalConflictGoal[]>
}

export interface GoalActionContext {
  load: GoalActionLoad
  /** Fail-soft audit sink (never breaks the primary flow). */
  audit: (event: { action: AuditAction; proposal?: Record<string, unknown>; sourceRef?: Record<string, unknown> }) => Promise<void>
}

/**
 * Result envelope shared by the AI proposal actions. It adds the two
 * auth/ownership reasons that the raw pipeline result cannot express
 * (`not_authenticated`, `goal_not_found`) on top of the standard
 * `AIProposalFailureReason` set, so callers handle every non-ok case once.
 */
export type GoalProposalActionStatus = AIProposalFailureReason | "not_authenticated" | "goal_not_found"

export type GoalProposalActionResult<T> =
  | { ok: true; proposal: T; source: ProposalSource }
  | { ok: false; reason: GoalProposalActionStatus; detail?: string; issues?: string[]; unavailable?: boolean }

export function mapProposalResult<T>(res: GoalUnderstandingResult | GoalDecompositionResult): GoalProposalActionResult<T> {
  if (res.ok) {
    return { ok: true, proposal: res.proposal as T, source: res.source }
  }
  const out: GoalProposalActionResult<T> & { reason: GoalProposalActionStatus } = {
    ok: false,
    reason: res.reason,
    ...(res.detail ? { detail: res.detail } : {}),
    ...(res.issues ? { issues: res.issues } : {}),
    ...(res.unavailable ? { unavailable: res.unavailable } : {}),
  }
  return out
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadOwnedOrNotFound(
  load: GoalActionLoad,
  goalId: string,
): Promise<{ goal: GoalContextRow; intel: GoalIntel } | null> {
  if (!goalId) return null
  return load.load(goalId)
}

async function safeAudit(ctx: GoalActionContext, event: Parameters<GoalActionContext["audit"]>[0]): Promise<void> {
  try {
    await ctx.audit(event)
  } catch {
    /* fail-soft: auditing must never break the primary flow */
  }
}

// ---------------------------------------------------------------------------
// Goal Quality (deterministic score authoritative; AI explains only)
// ---------------------------------------------------------------------------

export interface GoalQualityActionResult {
  ok: boolean
  /** deterministic score, always present even when the model is unavailable */
  data: GoalQualityResult["data"]
  reason?: string
}

export async function runGoalQualityAction(
  ctx: GoalActionContext,
  goalId: string,
  opts?: Pick<GoalQualityRequestOptions, "modelCall" | "costKey">,
): Promise<GoalQualityActionResult> {
  const owned = await loadOwnedOrNotFound(ctx.load, goalId)
  if (!owned) return { ok: false, data: scoreOnlyEmpty(), reason: "goal_not_found" }

  const { goal, intel } = owned
  const res = await proposeGoalQuality(goal, intel, {
    userId: "remote",
    ...(opts?.costKey ? { costKey: opts.costKey } : {}),
    ...(opts?.modelCall ? { modelCall: opts.modelCall } : {}),
  })

  await safeAudit(ctx, {
    action: res.ok ? "proposed" : "rejected",
    proposal: res.ok ? (res.data.explanation as unknown as Record<string, unknown>) : undefined,
    sourceRef: { goalId: goal.id },
  })

  return res.ok
    ? { ok: true, data: res.data }
    : { ok: false, data: res.data, reason: res.reason }
}

function scoreOnlyEmpty(): GoalQualityResult["data"] {
  return { score: 0, max: 100, rubric: [], explanation: null, source: "none" }
}

// ---------------------------------------------------------------------------
// Goal Understanding (grounded only in deterministic GoalIntel facts)
// ---------------------------------------------------------------------------

export async function runGoalUnderstandingAction(
  ctx: GoalActionContext,
  goalId: string,
  opts?: Pick<GoalUnderstandingOptions, "modelCall" | "costKey">,
): Promise<GoalProposalActionResult<import("@/lib/goals/proposals/schemas").GoalUnderstanding> | { ok: false; reason: "not_authenticated" | "goal_not_found" }> {
  const owned = await loadOwnedOrNotFound(ctx.load, goalId)
  if (!owned) return { ok: false, reason: "goal_not_found" }

  const { goal, intel } = owned
  const res = await proposeGoalUnderstanding(goal, intel, {
    userId: "remote",
    ...(opts?.costKey ? { costKey: opts.costKey } : {}),
    ...(opts?.modelCall ? { modelCall: opts.modelCall } : {}),
  })

  await safeAudit(ctx, {
    action: res.ok ? "proposed" : "rejected",
    proposal: res.ok ? (res.proposal as unknown as Record<string, unknown>) : undefined,
    sourceRef: { goalId: goal.id },
  })

  return mapProposalResult<import("@/lib/goals/proposals/schemas").GoalUnderstanding>(res)
}

// ---------------------------------------------------------------------------
// Goal Decomposition (proposal only — applied later after explicit approval)
// ---------------------------------------------------------------------------

export async function runGoalDecompositionAction(
  ctx: GoalActionContext,
  goalId: string,
  opts?: Pick<GoalDecompositionOptions, "modelCall" | "costKey">,
): Promise<GoalProposalActionResult<import("@/lib/goals/proposals/schemas").GoalDecomposition> | { ok: false; reason: "not_authenticated" | "goal_not_found" }> {
  const owned = await loadOwnedOrNotFound(ctx.load, goalId)
  if (!owned) return { ok: false, reason: "goal_not_found" }

  const { goal, intel } = owned
  const res = await proposeGoalDecomposition(goal, intel, {
    userId: "remote",
    ...(opts?.costKey ? { costKey: opts.costKey } : {}),
    ...(opts?.modelCall ? { modelCall: opts.modelCall } : {}),
  })

  await safeAudit(ctx, {
    action: res.ok ? "proposed" : "rejected",
    proposal: res.ok ? (res.proposal as unknown as Record<string, unknown>) : undefined,
    sourceRef: { goalId: goal.id },
  })

  return mapProposalResult<import("@/lib/goals/proposals/schemas").GoalDecomposition>(res)
}

// ---------------------------------------------------------------------------
// Goal Conflicts (DETERMINISTIC only — no AI, no mutation, no auto-action)
// ---------------------------------------------------------------------------

export interface GoalConflictsResult {
  ok: boolean
  conflicts: GoalConflict[]
}

export async function runGoalConflictsAction(ctx: GoalActionContext): Promise<GoalConflictsResult> {
  const goals = await ctx.load.loadAllActiveGoals()
  const conflicts = detectGoalConflicts(goals).map((c) => ({
    goalAId: c.goalAId,
    goalBId: c.goalBId,
    goalATitle: c.goalATitle,
    goalBTitle: c.goalBTitle,
    reasons: c.reasons,
  }))

  await safeAudit(ctx, {
    action: "proposed",
    proposal: { conflictCount: conflicts.length },
  })

  return { ok: true, conflicts }
}
