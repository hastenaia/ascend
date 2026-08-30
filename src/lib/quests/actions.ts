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
  let milestoneId = input.milestone_id ?? null
  if (milestoneId) {
    const { data: owned } = await supabase
      .from("milestones")
      .select("id, phase_id")
      .eq("id", milestoneId)
      .in("phase_id", (await supabase.from("phases").select("id").eq("user_id", userId)).data?.map((p) => p.id) ?? [])
      .limit(1)
    if (!owned || owned.length === 0) milestoneId = null
  }

  // Verify phase ownership
  let phaseId = input.phase_id ?? null
  if (phaseId && !milestoneId) {
    const { data: ownedPhase } = await supabase.from("phases").select("id").eq("id", phaseId).eq("user_id", userId).limit(1)
    if (!ownedPhase || ownedPhase.length === 0) phaseId = null
  }

  // Smooth fallback: if no parent at all, auto-attach to active/available phase
  // After 0013 standalone is allowed, but attaching keeps character->phase link.
  if (!milestoneId && !phaseId) {
    // Fix H4 ordering: text sort "available" > "active", so query active first explicitly
    const { data: activePhase } = await supabase
      .from("phases")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (activePhase?.id) phaseId = activePhase.id as string
    else {
      const { data: availablePhase } = await supabase
        .from("phases")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "available")
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (availablePhase?.id) phaseId = availablePhase.id as string
      // else: standalone is now permitted (0013) — keep phaseId null so creation still succeeds
    }
  }

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

  if (error) {
    if (error.message.includes("quests_parent") || error.message.includes("check constraint")) {
      throw new Error("Quest needs a phase or milestone — select one or start your journey.")
    }
    throw new Error(error.message)
  }

  // Revalidate grouped routes correctly for Next 16 (app)/(app) grouping
  revalidatePath("/quests")
  revalidatePath("/(app)/quests")
  revalidatePath("/dashboard")
  revalidatePath("/(app)/dashboard")
  revalidatePath("/phase")
  revalidatePath("/stats")
  revalidatePath("/skills")
  revalidatePath("/")
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
  revalidatePath("/(app)/quests")
  revalidatePath("/dashboard")
  revalidatePath("/(app)/dashboard")
  revalidatePath("/phase")
  revalidatePath("/stats")
  revalidatePath("/skills")
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
  revalidatePath("/(app)/quests")
  revalidatePath("/dashboard")
  revalidatePath("/(app)/dashboard")
  revalidatePath("/stats")
}
