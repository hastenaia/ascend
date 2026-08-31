import type { RpcResult } from "./types"

/**
 * Typed wrappers for the P2.0 SECURITY DEFINER RPCs.
 *
 * These are the ONLY write paths to `ai_events` and `ai_memory`. Client code
 * can read those tables via RLS but can never insert/update/delete directly —
 * every mutation goes through a security-definer function that re-validates
 * `auth.uid()` ownership. Never bypass these with a raw `.from(...).insert()`.
 */

/** Structural subset of the Supabase client we need (keeps deps decoupled). */
export interface RpcClient {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

function unwrap(data: unknown, error: { message: string } | null): RpcResult {
  if (error) return { ok: false, error: error.message }
  const r = data as { ok?: boolean; id?: string; error?: string } | null
  if (!r || r.ok !== true) return { ok: false, error: r?.error ?? "rpc_failed" }
  return { ok: true, id: r.id }
}

/** Append an audit-row for an AI proposal/action. */
export async function recordAiEvent(
  client: RpcClient,
  args: { kind: string; action: string; proposal?: Record<string, unknown>; sourceRef?: Record<string, unknown> },
): Promise<RpcResult> {
  const { data, error } = await client.rpc("record_ai_event", {
    p_kind: args.kind,
    p_action: args.action,
    p_proposal: args.proposal ?? {},
    p_source_ref: args.sourceRef ?? {},
  })
  return unwrap(data, error)
}

/** Insert/upsert a concise, user-approved memory note. */
export async function saveAiMemory(
  client: RpcClient,
  args: { kind: string; summary: string; importance?: number; sourceRef?: Record<string, unknown>; id?: string },
): Promise<RpcResult> {
  const { data, error } = await client.rpc("save_ai_memory", {
    p_kind: args.kind,
    p_summary: args.summary,
    p_importance: args.importance ?? 1,
    p_source_ref: args.sourceRef ?? {},
    p_id: args.id ?? null,
  })
  return unwrap(data, error)
}

/** Soft-delete (revoke) a memory note so it stops being used but stays audit-able. */
export async function revokeAiMemory(client: RpcClient, memoryId: string): Promise<RpcResult> {
  const { data, error } = await client.rpc("revoke_ai_memory", { p_id: memoryId })
  return unwrap(data, error)
}

/** Mark a note as user-approved so it may be served to the model. */
export async function markAiMemoryApproved(client: RpcClient, memoryId: string): Promise<RpcResult> {
  const { data, error } = await client.rpc("mark_ai_memory_approved", { p_id: memoryId })
  return unwrap(data, error)
}

/** Hard-delete a memory note (full erasure on user request). */
export async function deleteAiMemory(client: RpcClient, memoryId: string): Promise<RpcResult> {
  const { data, error } = await client.rpc("delete_ai_memory", { p_id: memoryId })
  return unwrap(data, error)
}

/** Apply a validated goal-decomposition payload (phases + quests). */
export interface ApplyGoalDecompositionResult extends RpcResult {
  phasesCreated?: number
  milestonesCreated?: number
  questsCreated?: number
}

export async function applyGoalDecomposition(
  client: RpcClient,
  args: { goalId: string; phases: unknown[]; quests: unknown[] },
): Promise<ApplyGoalDecompositionResult> {
  const { data, error } = await client.rpc("apply_decomposition_goal", {
    p_goal_id: args.goalId,
    p_phases: args.phases,
    p_quests: args.quests,
  })
  if (error) return { ok: false, error: error.message }
  const r = data as {
    ok?: boolean
    id?: string
    error?: string
    phases_created?: number
    milestones_created?: number
    quests_created?: number
  } | null
  if (!r || r.ok !== true) return { ok: false, error: r?.error ?? "rpc_failed" }
  return {
    ok: true,
    id: r.id,
    phasesCreated: r.phases_created,
    milestonesCreated: r.milestones_created,
    questsCreated: r.quests_created,
  }
}
