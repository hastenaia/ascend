"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { RpcClient } from "@/lib/ai/rpc"
import { auditEvent } from "@/lib/ai/audit"
import { applyApprovedDecomposition, type ApplyDecompositionResult } from "./apply-decomposition"
import { computeGoalIntel, type GoalIntelRow, type PhaseIntelRow, type MilestoneIntelRow, type QuestIntelRow } from "@/lib/goals/intelligence/metrics"
import type { GoalContextRow } from "@/lib/goals/proposals/context"
import type { GoalConflict, GoalConflictGoal } from "@/lib/goals/intelligence/conflicts"
import {
  runGoalQualityAction,
  runGoalUnderstandingAction,
  runGoalDecompositionAction,
  runGoalConflictsAction,
  type GoalActionContext,
  type GoalProposalActionResult,
} from "./intel-actions-core"
import type { GoalQualityActionResult } from "./intel-actions-core"
import type { GoalUnderstanding } from "@/lib/goals/proposals/schemas"
import type { GoalDecomposition } from "@/lib/goals/proposals/schemas"

/**
 * P2.1 Stage 4 — Goal Intelligence server actions.
 *
 * These connect the existing (Stage-2) proposal modules to secure server
 * actions for the UI. No UI is built here. AI is strictly PROPOSAL-ONLY — it
 * never mutates goals/phases/milestones/quests. Deterministic metrics remain
 * the source of truth and every goal read is owner-scoped to `auth.uid()`.
 *
 *   proposeGoalQualityAction        — AI explains a deterministic score
 *   proposeGoalUnderstandingAction  — synthesis grounded only in GoalIntel facts
 *   proposeGoalDecompositionAction  — proposes phases/milestones/quests (no write)
 *   detectGoalConflictsAction       — deterministic only, no AI, no auto-action
 *
 * Requests without a session are rejected up front. Anything not owned by the
 * caller reads as "not found" (no existence/ownership leak).
 */

// ---------------------------------------------------------------------------
// Shared context: real Supabase-backed loader + fail-soft audit
// ---------------------------------------------------------------------------

function makeRpcClient(supabase: Awaited<ReturnType<typeof createClient>>): RpcClient {
  return {
    rpc: async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args ?? {})
      return { data, error }
    },
  }
}

async function loadOwnedIntel(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, goalId: string): Promise<{ goal: GoalContextRow; intel: ReturnType<typeof computeGoalIntel> } | null> {
  const { data: goal } = await supabase
    .from("goals")
    .select("id,title,description,desired_outcome,status,category,priority,target_date,created_at,completed_at")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!goal) return null

  const goalRow: GoalIntelRow = {
    id: goal.id,
    status: goal.status,
    category: goal.category,
    priority: goal.priority,
    target_date: goal.target_date,
    created_at: goal.created_at,
    completed_at: goal.completed_at,
  }

  const { data: phaseRows } = await supabase
    .from("phases")
    .select("id,goal_id,status,target_date,completed_at")
    .eq("goal_id", goal.id)
    .eq("user_id", userId)
  const phases: PhaseIntelRow[] = (phaseRows ?? []).map((p) => ({
    id: p.id,
    goal_id: p.goal_id,
    status: p.status,
    target_date: p.target_date,
    completed_at: p.completed_at ?? null,
  }))

  const phaseIds = phases.map((p) => p.id)
  let milestones: MilestoneIntelRow[] = []
  let quests: QuestIntelRow[] = []

  if (phaseIds.length > 0) {
    const { data: msRows } = await supabase
      .from("milestones")
      .select("id,phase_id,status,completed_at")
      .in("phase_id", phaseIds)
    milestones = (msRows ?? []).map((m) => ({
      id: m.id,
      phase_id: m.phase_id,
      status: m.status,
      completed_at: m.completed_at ?? null,
    }))

    const msIds = milestones.map((m) => m.id)
    let qQuery = supabase.from("quests").select("id,phase_id,milestone_id,status,recurrence,due_date,completed_at").eq("user_id", userId)
    if (msIds.length > 0) qQuery = qQuery.or(`phase_id.in.(${phaseIds.join(",")}),milestone_id.in.(${msIds.join(",")})`)
    else qQuery = qQuery.in("phase_id", phaseIds)
    const { data: qRows } = await qQuery
    quests = (qRows ?? []).map((q) => ({
      id: q.id,
      phase_id: q.phase_id,
      milestone_id: q.milestone_id,
      status: q.status,
      recurrence: q.recurrence,
      due_date: q.due_date,
      completed_at: q.completed_at ?? null,
    }))
  }

  const completionDates = collectCompletionDates(goalRow, phases, milestones, quests)
  const progressCompletionDates = collectProgressCompletionDates(phases, milestones, quests)

  const intel = computeGoalIntel({
    goal: goalRow,
    phases,
    milestones,
    quests,
    completionDates,
    progressCompletionDates,
  })

  return { goal: goal as GoalContextRow, intel }
}

function collectCompletionDates(
  goal: GoalIntelRow,
  phases: PhaseIntelRow[],
  milestones: MilestoneIntelRow[],
  quests: QuestIntelRow[],
): string[] {
  const dates: string[] = []
  const push = (iso?: string | null) => {
    const d = iso?.slice(0, 10)
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d)
  }
  push(goal.completed_at)
  for (const p of phases) push((p as unknown as { completed_at?: string | null }).completed_at)
  for (const m of milestones) push((m as unknown as { completed_at?: string | null }).completed_at)
  for (const q of quests) push((q as unknown as { completed_at?: string | null }).completed_at)
  return dates
}

function collectProgressCompletionDates(
  phases: PhaseIntelRow[],
  milestones: MilestoneIntelRow[],
  quests: QuestIntelRow[],
): string[] {
  const dates: string[] = []
  const push = (iso?: string | null) => {
    const d = iso?.slice(0, 10)
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d)
  }
  for (const p of phases) push((p as unknown as { completed_at?: string | null }).completed_at)
  for (const m of milestones) push((m as unknown as { completed_at?: string | null }).completed_at)
  for (const q of quests) {
    const isProgress = (q as unknown as { recurrence?: string }).recurrence === "none"
    if (isProgress) push((q as unknown as { completed_at?: string | null }).completed_at)
  }
  return dates
}

async function loadAllActiveGoals(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<GoalConflictGoal[]> {
  const { data } = await supabase
    .from("goals")
    .select("id,title,status,category,priority,target_date,created_at,completed_at")
    .eq("user_id", userId)
    .eq("status", "active")
  return ((data ?? []) as GoalConflictGoal[]).map((g) => ({
    ...g,
    completed_at: g.completed_at ?? null,
  }))
}

function buildContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: "quality" | "understanding" | "decomposition" | "conflicts",
): GoalActionContext {
  const rpc = makeRpcClient(supabase)
  return {
    load: {
      load: (goalId) => loadOwnedIntel(supabase, userId, goalId),
      loadAllActiveGoals: () => loadAllActiveGoals(supabase, userId),
    },
    audit: async (event) => {
      await auditEvent(rpc, {
        kind: "goal",
        action: event.action,
        proposal: event.proposal ?? {},
        sourceRef: { ...(event.sourceRef ?? {}), action },
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function proposeGoalQualityAction(goalId: string): Promise<GoalQualityActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, data: { score: 0, max: 100, rubric: [], explanation: null, source: "none" }, reason: "not_authenticated" }
  return runGoalQualityAction(buildContext(supabase, user.id, "quality"), goalId)
}

export async function proposeGoalUnderstandingAction(goalId: string): Promise<GoalProposalActionResult<GoalUnderstanding> | { ok: false; reason: "not_authenticated" | "goal_not_found" }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: "not_authenticated" }
  return runGoalUnderstandingAction(buildContext(supabase, user.id, "understanding"), goalId)
}

export async function proposeGoalDecompositionAction(goalId: string): Promise<GoalProposalActionResult<GoalDecomposition> | { ok: false; reason: "not_authenticated" | "goal_not_found" }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: "not_authenticated" }
  return runGoalDecompositionAction(buildContext(supabase, user.id, "decomposition"), goalId)
}

export async function detectGoalConflictsAction(): Promise<{ ok: boolean; conflicts: GoalConflict[] }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, conflicts: [] }
  return runGoalConflictsAction(buildContext(supabase, user.id, "conflicts"))
}

/**
 * P2.1 Stage 3 — apply an approved goal-decomposition proposal.
 *
 * Thin wrapper: authenticates via the server client (requests without a session
 * are rejected here), then delegates every validation + the atomic write to the
 * pure `applyApprovedDecomposition` module, which re-runs the zod schema,
 * deterministic gates, ownership, and eligibility before calling the
 * SECURITY DEFINER RPC `apply_decomposition_goal`.
 *
 * Nothing from the client is trusted as-is: `goalId` is verified against the
 * authenticated user's own goals, and `proposal` is re-parsed (unknown fields
 * stripped) before any data leaves the server.
 */
export async function applyGoalDecompositionAction(
  goalId: string,
  proposal: unknown,
): Promise<ApplyDecompositionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: "not_authenticated" }

  // Structural RPC adapter: Supabase's `.rpc()` returns a thenable query
  // builder, not a native Promise, so we adapt it to the codebase's
  // decoupled `RpcClient` contract (same pattern as the AI memory layer).
  const rpcClient: RpcClient = {
    rpc: async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args ?? {})
      return { data, error }
    },
  }

  const result = await applyApprovedDecomposition(
    {
      rpc: rpcClient,
      // Owner-scoped read: a goal that isn't the caller's reads as "not found",
      // matching the rest of the actions and leaking no existence info.
      loadGoal: async (id) => {
        const { data } = await supabase
          .from("goals")
          .select("id,user_id,status")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle()
        return data ?? null
      },
      audit: async () => {
        await auditEvent(rpcClient, {
          kind: "goal",
          action: "applied",
          proposal: {},
          sourceRef: { goalId },
        })
      },
    },
    { userId: user.id, goalId, proposal },
  )

  if (result.ok) revalidatePath("/goals")
  return result
}
