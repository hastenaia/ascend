import { applyGoalDecomposition, type ApplyGoalDecompositionResult, type RpcClient } from "@/lib/ai/rpc"
import { goalDecompositionSchema, validateGoalDecomposition } from "./proposals/schemas"

/**
 * P2.1 Stage 3 — the ONLY path that turns an approved goal-decomposition
 * proposal into persisted phases/milestones/quests.
 *
 * The server action authenticates + loads the goal owner-scoped; this pure
 * module re-runs the full validation chain so nothing from the client is ever
 * trusted as-is:
 *
 *   zod schema (bounds, enums, sizes, unknown-key strip)
 *     → deterministic `validateGoalDecomposition` (non-empty scope)
 *     → ownership + eligibility against the CURRENT goal row
 *     → SECURITY DEFINER RPC (which re-enforces every invariant atomically)
 *     → fail-soft audit event
 *
 * Note: the payload forwarded to the RPC is the zod-parsed/cleaned data, so
 * caller-supplied extra fields (ids, user_id, xp_reward, ownership, flags) can
 * never cross the boundary — they are stripped. Server-derived goalId is still
 * re-checked for existence and ownership before and inside the RPC.
 */

export interface DecompositionGoalRecord {
  id: string
  user_id: string
  status: string
}

export interface ApplyDecompositionContext {
  /** Loads the goal row independently of the proposal (owner-scoped lookup). */
  loadGoal: (goalId: string) => Promise<DecompositionGoalRecord | null>
  rpc: RpcClient
  /** Fail-soft: an audit failure must never break an otherwise-successful apply. */
  audit?: (message: string) => Promise<void> | void
}

export type ApplyDecompositionFailureReason =
  | "invalid_proposal"
  | "invalid_decomposition"
  | "goal_not_found"
  | "not_owner"
  | "goal_not_eligible"
  | "goal_already_decomposed"
  | "not_authenticated"
  | "rpc_failed"

export type ApplyDecompositionResult =
  | { ok: true; phasesCreated: number; milestonesCreated: number; questsCreated: number }
  | { ok: false; reason: ApplyDecompositionFailureReason; detail?: string }

export function mapRpcFailure(res: ApplyGoalDecompositionResult): ApplyDecompositionResult {
  switch (res.error) {
    case "not_authenticated":
      return { ok: false, reason: "not_authenticated" }
    case "goal_not_found":
      return { ok: false, reason: "goal_not_found" }
    case "goal_not_eligible":
      return { ok: false, reason: "goal_not_eligible" }
    case "goal_already_decomposed":
      return { ok: false, reason: "goal_already_decomposed" }
    default:
      return { ok: false, reason: "rpc_failed", detail: res.error }
  }
}

export async function applyApprovedDecomposition(
  ctx: ApplyDecompositionContext,
  input: { userId: string; goalId: string; proposal: unknown },
): Promise<ApplyDecompositionResult> {
  const { userId, goalId, proposal } = input

  if (!userId) return { ok: false, reason: "not_authenticated" }
  if (!goalId) return { ok: false, reason: "invalid_proposal", detail: "goalId is required" }

  // 1) Re-validate the proposal through the same strict schema the pipeline used.
  const parsed = goalDecompositionSchema.safeParse(proposal)
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_proposal",
      detail: parsed.error.issues[0]?.message ?? "proposal failed schema validation",
    }
  }

  // 2) Deterministic gate: reject empty scope / malformed-but-shaped proposals.
  const deterministic = validateGoalDecomposition(parsed.data)
  if (!deterministic.ok) {
    return { ok: false, reason: "invalid_decomposition", detail: deterministic.error }
  }

  // 3) Verify the goal still exists and belongs to the caller (fresh read,
  //    never trusts any goalId embedded in the proposal).
  const goal = await ctx.loadGoal(goalId)
  if (!goal) return { ok: false, reason: "goal_not_found" }
  if (goal.user_id !== userId) return { ok: false, reason: "not_owner" }
  if (goal.status !== "active") return { ok: false, reason: "goal_not_eligible" }

  // 4) Atomic, owned, duplicate-guarded server-side write. Only the cleaned
  //    zod output is forwarded — injected ids/xp/ownership fields are stripped.
  const res = await applyGoalDecomposition(ctx.rpc, {
    goalId,
    phases: parsed.data.phases,
    quests: parsed.data.quests,
  })
  if (!res.ok) {
    return mapRpcFailure(res)
  }

  // 5) Fail-soft audit — never turns a success into a failure.
  try {
    await ctx.audit?.("applied approved goal decomposition")
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    phasesCreated: res.phasesCreated ?? 0,
    milestonesCreated: res.milestonesCreated ?? 0,
    questsCreated: res.questsCreated ?? 0,
  }
}