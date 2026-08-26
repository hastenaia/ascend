"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createGoalSchema, goalJourneySchema, type CreateGoalInput, type GoalJourneyInput } from "@/lib/validations/goal"

function mustUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Not authenticated")
  return user.id
}

export async function createGoalAction(raw: CreateGoalInput): Promise<{ id: string }> {
  const parsed = createGoalSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid goal")
  const input = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { data: inserted, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      title: input.title,
      description: input.description || null,
      category: input.category,
      priority: input.priority,
      target_date: input.target_date || null,
      desired_outcome: input.desired_outcome || null,
      status: "active",
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  revalidatePath("/goals")
  return { id: inserted!.id }
}

export async function deleteGoalAction(goalId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  // Phases detach (goal_id -> null) rather than cascade — journey history is preserved.
  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("user_id", userId)
  if (error) throw new Error(error.message)

  revalidatePath("/goals")
}

/**
 * Instantiate a personalized phase journey under a goal — either from a
 * curated blueprint or a custom list of phase titles. Arbitrary length
 * supported; nothing is hard-coded to six.
 */
export async function createGoalJourneyAction(goalId: string, raw: GoalJourneyInput): Promise<{ created: number }> {
  const parsed = goalJourneySchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid journey")
  const input = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { data: goal } = await supabase.from("goals").select("id,title").eq("id", goalId).eq("user_id", userId).single()
  if (!goal) throw new Error("Goal not found")

  const { data: existing } = await supabase.from("phases").select("id").eq("goal_id", goalId).eq("user_id", userId).limit(1)
  if (existing && existing.length > 0) throw new Error("This goal already has a journey")

  let phaseDefs: { title: string; objective: string }[] = []
  if (input.mode === "blueprint") {
    const { data: bp } = await supabase.from("journey_blueprints").select("phases").eq("slug", input.blueprintSlug).single()
    if (!bp) throw new Error("Blueprint not found")
    phaseDefs = (bp.phases as { title: string; objective: string }[]) ?? []
  } else {
    phaseDefs = input.titles.map((t) => ({ title: t, objective: "" }))
  }
  if (phaseDefs.length === 0) throw new Error("A journey needs at least one phase")

  const today = new Date().toISOString().slice(0, 10)
  const phaseRows = phaseDefs.map((def, idx) => ({
    user_id: userId,
    goal_id: goalId,
    title: def.title,
    objective: def.objective || null,
    order_index: idx + 1,
    phase_number: idx + 1,
    status: idx === 0 ? ("active" as const) : ("locked" as const),
    start_date: idx === 0 ? today : null,
    reward_xp: 100,
    focus_areas: [],
    completion_requirements: [],
    final_challenge: null,
  }))

  const { data: insertedPhases, error: pErr } = await supabase.from("phases").insert(phaseRows).select("id,title")
  if (pErr) throw new Error(pErr.message)

  // Each phase gets one core-work milestone + a final challenge milestone,
  // mirroring the generic seeding pattern used by the default journey.
  const milestoneRows = (insertedPhases ?? []).flatMap((p, idx) => [
    {
      phase_id: p.id,
      title: `${p.title}: core work`,
      description: phaseDefs[idx].objective || null,
      sort_order: 0,
      status: "pending",
      xp_reward: 40,
      is_final_challenge: false,
    },
    {
      phase_id: p.id,
      title: `${p.title} Challenge`,
      description: `Prove mastery of ${p.title.toLowerCase()} before moving on.`,
      sort_order: 1,
      status: "pending",
      xp_reward: 150,
      is_final_challenge: true,
    },
  ])
  if (milestoneRows.length > 0) {
    const { error: mErr } = await supabase.from("milestones").insert(milestoneRows)
    if (mErr) console.error("[createGoalJourney] milestone insert failed", mErr.message)
  }

  revalidatePath("/goals")
  revalidatePath(`/goals/${goalId}`)
  return { created: insertedPhases?.length ?? 0 }
}
