"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { journalSchema, hasContent, type JournalInput } from "@/lib/validations/journal"

function mustUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Not authenticated")
  return user.id
}

export async function saveJournalEntry(raw: JournalInput): Promise<{ id: string; is_new: boolean; xp_awarded: number; xp_total: number; level: number }> {
  const parsed = journalSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid entry")
  const input = parsed.data
  if (!hasContent(input)) throw new Error("Write at least one answer")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  mustUserId(user)

  const today = new Date().toISOString().slice(0, 10)
  const entryDate = input.entry_date || today

  // Call secure RPC that upserts + awards XP/stats/momentum atomically
  const { data, error } = await supabase.rpc("log_journal_entry", {
    p_entry_date: entryDate,
    p_body: input.body ?? null,
    p_learnings: input.learnings ?? null,
    p_worked: input.worked ?? null,
    p_didnt_work: input.didnt_work ?? null,
    p_change_plan: input.change_plan ?? null,
    p_mood: input.mood ?? null,
    p_tags: input.tags ?? null,
    p_phase_id: input.phase_id ?? null,
    p_quest_id: input.quest_id ?? null,
  })

  if (error) throw new Error(error.message)
  const res = data as { ok?: boolean; error?: string; id?: string; is_new?: boolean; xp_awarded?: number; xp_total?: number; level?: number }
  if (!res?.ok) throw new Error(res?.error ?? "journal_failed")

  revalidatePath("/journal")
  revalidatePath("/(app)/journal")
  revalidatePath("/dashboard")
  revalidatePath("/(app)/dashboard")
  revalidatePath("/stats")
  revalidatePath("/(app)/stats")
  revalidatePath("/quests")

  return { id: res.id!, is_new: !!res.is_new, xp_awarded: res.xp_awarded ?? 0, xp_total: res.xp_total ?? 0, level: res.level ?? 1 }
}

export async function createQuestFromJournal(changePlan: string, questTitle?: string): Promise<{ id: string }> {
  const { createQuestAction } = await import("@/lib/quests/actions")
  const title = (questTitle ?? changePlan).trim().slice(0, 120) || changePlan.trim().slice(0, 120)
  if (!title) throw new Error("Provide a quest title")
  // Journal-derived quest: reflection category, easy, small xp
  return createQuestAction({
    title,
    description: changePlan.slice(0, 500),
    category: "reflection",
    difficulty: "easy",
    xp_reward: 15,
    estimated_duration: null,
    due_date: null,
    recurrence: "none",
    phase_id: null,
    milestone_id: null,
    linked_skill: null,
  })
}
