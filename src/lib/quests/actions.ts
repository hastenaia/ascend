"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createQuestSchema, clampXpForDifficulty, type CreateQuestInput } from "@/lib/validations/quest"
import type { CompleteQuestResult } from "@/types/database"

function mustUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Not authenticated")
  return user.id
}

/** Create a quest. XP is clamped server-side per difficulty band; client values are never trusted. */
export async function createQuestAction(raw: CreateQuestInput & { xp_reward: number }): Promise<{ id: string }> {
  const parsed = createQuestSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid quest")
  }
  const input = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  // Verify milestone belongs to one of the user's phases (prevents cross-account links)
  // Per Ascend decisions: do NOT silently auto-attach standalone quests. Show error if link invalid.
  const milestoneId = input.milestone_id ?? null
  if (milestoneId) {
    const { data: owned } = await supabase
      .from("milestones")
      .select("id, phase_id")
      .eq("id", milestoneId)
      .in("phase_id", (await supabase.from("phases").select("id").eq("user_id", userId)).data?.map((p) => p.id) ?? [])
      .limit(1)
    if (!owned || owned.length === 0) {
      throw new Error("Selected milestone not found or not yours.")
    }
  }

  // Verify phase ownership
  const phaseId = input.phase_id ?? null
  if (phaseId && !milestoneId) {
    const { data: ownedPhase } = await supabase.from("phases").select("id").eq("id", phaseId).eq("user_id", userId).limit(1)
    if (!ownedPhase || ownedPhase.length === 0) {
      throw new Error("Selected phase not found or not yours.")
    }
  }

  // Standalone quests are allowed (0013). Do NOT auto-attach.
  // If user provided no parent, keep both null — deliberate standalone per decisions.

  // Validate linked_skill exists (skills are global, but check prevents orphan UUIDs)
  if (input.linked_skill) {
    const { data: skillExists } = await supabase.from("skills").select("id").eq("id", input.linked_skill).limit(1).maybeSingle()
    if (!skillExists) {
      // Don't hard-fail — just drop the link for smoothness, but log via description
      // We'll null it so the quest still creates
      input.linked_skill = null
    }
  }

  const { data: inserted, error } = await supabase
    .from("quests")
    .insert({
      user_id: userId,
      title: input.title,
      description: input.description || null,
      category: input.category,
      difficulty: input.difficulty,
      xp_reward: clampXpForDifficulty(input.difficulty, input.xp_reward),
      estimated_duration: input.estimated_duration ?? null,
      due_date: input.due_date || null,
      recurrence: input.recurrence,
      is_recurring: input.recurrence !== "none",
      phase_id: milestoneId ? null : phaseId,
      milestone_id: milestoneId,
      linked_skill: input.linked_skill || null,
      status: "active",
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  revalidatePath("/quests")
  revalidatePath("/dashboard")
  revalidatePath("/phase")
  revalidatePath("/stats")
  revalidatePath("/skills")
  revalidatePath("/journal")
  return { id: inserted!.id }
}

/**
 * Complete a quest via the atomic secure RPC:
 * validates user + quest + duplicates, awards XP, updates milestone/momentum/level in one transaction.
 */
export async function completeQuestAction(questId: string): Promise<CompleteQuestResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  mustUserId(user)

  const { data, error } = await supabase.rpc("complete_quest", { p_quest_id: questId })
  if (error) throw new Error(error.message)
  const result = data as CompleteQuestResult
  if (!result?.ok) throw new Error(result?.error ?? "completion_failed")

  revalidatePath("/quests")
  revalidatePath("/dashboard")
  revalidatePath("/phase")
  revalidatePath("/stats")
  revalidatePath("/skills")
  revalidatePath("/journal")
  return result
}

/** Delete an active quest (history-preserving: completed quests stay). */
export async function deleteQuestAction(questId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { error } = await supabase.from("quests").delete().eq("id", questId).eq("user_id", userId).eq("status", "active")
  if (error) throw new Error(error.message)

  revalidatePath("/quests")
  revalidatePath("/dashboard")
  revalidatePath("/stats")
  revalidatePath("/journal")
}

function revalidateQuestPaths(): void {
  for (const p of ["/quests", "/dashboard", "/phase", "/stats", "/skills", "/journal"]) revalidatePath(p)
}

/**
 * Postpone a quest: records the postpone honestly (count + timestamp) and, for
 * one-time quests, pushes the due date forward by `days`. Recurring quests are
 * still governed by their recurrence window, so only the behavior marker is set.
 */
export async function postponeQuestAction(questId: string, days = 1): Promise<{ ok: true; postponed_count: number }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user)
  const d = Math.min(90, Math.max(1, Math.round(days)))

  const { data: quest } = await supabase
    .from("quests")
    .select("id, recurrence, due_date, postponed_count")
    .eq("id", questId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()
  if (!quest) throw new Error("Quest not found or not active")

  let due_date: string | null = quest.due_date
  if (quest.recurrence === "none") {
    const base = quest.due_date ?? new Date().toISOString().slice(0, 10)
    const shifted = new Date(base + "T00:00:00Z")
    shifted.setUTCDate(shifted.getUTCDate() + d)
    due_date = shifted.toISOString().slice(0, 10)
  }

  const { data: updated, error } = await supabase
    .from("quests")
    .update({ postponed_count: (quest.postponed_count ?? 0) + 1, last_postponed_at: new Date().toISOString(), due_date })
    .eq("id", questId)
    .eq("user_id", userId)
    .select("postponed_count")
    .single()
  if (error) throw new Error(error.message)

  revalidateQuestPaths()
  return { ok: true, postponed_count: updated?.postponed_count ?? 0 }
}

/**
 * Skip a quest: records the skip honestly (count + timestamp) without awarding
 * XP or altering recurring due logic. The pattern engine reads these markers to
 * detect avoidance (e.g. repeatedly postponing the same difficulty).
 */
export async function skipQuestAction(questId: string): Promise<{ ok: true; skipped_count: number }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { data: quest } = await supabase
    .from("quests")
    .select("id, skipped_count")
    .eq("id", questId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()
  if (!quest) throw new Error("Quest not found or not active")

  const { data: updated, error } = await supabase
    .from("quests")
    .update({ skipped_count: (quest.skipped_count ?? 0) + 1, last_skipped_at: new Date().toISOString() })
    .eq("id", questId)
    .eq("user_id", userId)
    .select("skipped_count")
    .single()
  if (error) throw new Error(error.message)

  revalidateQuestPaths()
  return { ok: true, skipped_count: updated?.skipped_count ?? 0 }
}

/** Record evidence of growth on a quest you own (active or completed). */
export async function setQuestEvidenceAction(questId: string, evidence: string): Promise<{ ok: true }> {
  const trimmed = evidence.trim()
  if (trimmed.length > 2000) throw new Error("Evidence must be 2000 characters or fewer")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { error } = await supabase
    .from("quests")
    .update({ evidence: trimmed === "" ? null : trimmed })
    .eq("id", questId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)

  revalidateQuestPaths()
  return { ok: true }
}
