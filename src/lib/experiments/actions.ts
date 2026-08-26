"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createExperimentSchema, logEntrySchema, type CreateExperimentInput } from "@/lib/validations/experiment"

function mustUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Not authenticated")
  return user.id
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export async function createExperimentAction(raw: CreateExperimentInput): Promise<{ id: string }> {
  const parsed = createExperimentSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid experiment")
  const input = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { data: inserted, error } = await supabase
    .from("experiments")
    .insert({
      user_id: userId,
      title: input.title,
      hypothesis: input.hypothesis ?? null,
      duration_days: input.duration_days,
      track_sleep: input.track_sleep,
      status: "active",
      started_at: todayIso(),
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  revalidatePath("/experiments")
  return { id: inserted!.id }
}

/** Upserts today's (or a given day's) metrics snapshot. One row per experiment per day. */
export async function logExperimentEntryAction(
  experimentId: string,
  raw: {
    completed: boolean
    mood?: number | null
    energy?: number | null
    productivity?: number | null
    sleep_quality?: number | null
    body?: string | null
  },
  entryDate?: string
): Promise<void> {
  const parsed = logEntrySchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid entry")
  const input = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  // Ownership check
  const { data: exp } = await supabase.from("experiments").select("id").eq("id", experimentId).eq("user_id", userId).single()
  if (!exp) throw new Error("Experiment not found")

  const date = /^\d{4}-\d{2}-\d{2}$/.test(entryDate ?? "") ? entryDate! : todayIso()

  const payload = {
    completed: input.completed,
    mood: input.mood ?? null,
    energy: input.energy ?? null,
    productivity: input.productivity ?? null,
    sleep_quality: input.sleep_quality ?? null,
    body: input.body ?? null,
  }

  const { error } = await supabase.from("experiment_entries").upsert(
    { user_id: userId, experiment_id: experimentId, entry_date: date, ...payload },
    { onConflict: "experiment_id,entry_date" },
  )
  if (error) throw new Error(error.message)

  revalidatePath("/experiments")
}

export async function completeExperimentAction(experimentId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { error } = await supabase
    .from("experiments")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", experimentId)
    .eq("user_id", userId)
    .eq("status", "active")
  if (error) throw new Error(error.message)

  revalidatePath("/experiments")
}
