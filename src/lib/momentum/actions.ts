"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type RecoveryKind = "rest" | "light" | "reflection" | "planning"

/**
 * Log a recovery/wellness day. Server-authoritative via log_recovery RPC —
 * clients cannot write the momentum ledger directly.
 */
export async function logRecoveryAction(kind: RecoveryKind): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase.rpc("log_recovery", { p_kind: kind })
  if (error) throw new Error(error.message)
  const res = data as { ok?: boolean; error?: string }
  if (!res?.ok) throw new Error(res?.error ?? "recovery_failed")

  revalidatePath("/dashboard")
  return { ok: true }
}
