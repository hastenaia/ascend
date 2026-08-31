"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { RpcClient } from "@/lib/ai/rpc"
import { auditEvent } from "@/lib/ai/audit"
import { applyApprovedDecomposition, type ApplyDecompositionResult } from "./apply-decomposition"

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