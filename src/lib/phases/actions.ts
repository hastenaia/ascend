/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { canCompletePhase, calcEarnedXp } from "@/lib/phases/queries"
import type { PhaseStatus } from "@/types/ascend"
import type { UnlockedAchievement } from "@/types/database"

function mustUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Not authenticated")
  return user.id
}

/**
 * Explicit, idempotent journey initialization.
 * Creates 6 user phases from phase_templates if user has zero phases.
 * Phase 1 → active, rest → locked
 */
export async function initializeJourney(): Promise<{ created: boolean; message: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user ?? null)

  const { data: existing, error: exErr } = await supabase.from("phases").select("id").eq("user_id", userId).limit(1)
  if (exErr) throw new Error(exErr.message)
  if (existing && existing.length > 0) return { created: false, message: "Journey already exists" }

  const { data: templates, error: tErr } = await supabase.from("phase_templates").select("*").order("order_index")
  if (tErr) throw new Error(tErr.message)
  if (!templates || templates.length === 0) throw new Error("No phase templates found")

  // Idempotency: re-check after fetching templates in case of race (unique partial index not present, so double-check)
  const { data: recheck } = await supabase.from("phases").select("id").eq("user_id", userId).limit(1)
  if (recheck && recheck.length > 0) return { created: false, message: "Journey already exists" }

  const rows = templates.map((t: any, idx: number) => ({
    user_id: userId,
    template_id: t.id,
    title: t.title,
    slug: t.slug,
    description: t.description,
    objective: t.objective,
    order_index: t.order_index,
    phase_number: t.order_index,
    status: idx === 0 ? ("active" as PhaseStatus) : ("locked" as PhaseStatus),
    difficulty: t.difficulty ?? "standard",
    focus_areas: t.focus_areas ?? [],
    completion_requirements: t.completion_requirements ?? [],
    final_challenge: t.final_challenge ?? null,
    reward_xp: t.reward_xp ?? 0,
    start_date: idx === 0 ? new Date().toISOString().slice(0, 10) : null,
  }))

  const { data: inserted, error: insErr } = await supabase.from("phases").insert(rows).select("id, order_index")
  if (insErr) {
    // If race inserted in meantime, treat as already exists
    if (insErr.code === "23505") return { created: false, message: "Journey already exists" }
    throw new Error(insErr.message)
  }

  // Create default milestones per phase if not already present
  // Foundation 01 gets the 6 spec milestones; other phases get at least completion_requirements as milestones
  const insertedPhases = (inserted as { id: string; order_index: number }[]) ?? []
  // Need to map template order to phase id
  const orderToId = new Map<number, string>()
  // We have rows order same as templates; use inserted result if returned in order, otherwise refetch
  let phasesForMilestones: { id: string; order_index: number; title: string }[] = []
  if (insertedPhases.length === rows.length) {
    // assume same order as templates
    for (let i = 0; i < templates.length; i++) {
      orderToId.set(templates[i].order_index, insertedPhases[i].id)
    }
    phasesForMilestones = templates.map((t: any) => ({ id: orderToId.get(t.order_index)!, order_index: t.order_index, title: t.title }))
  } else {
    const { data: fresh } = await supabase.from("phases").select("id, order_index, title").eq("user_id", userId).order("order_index")
    phasesForMilestones = (fresh as any[]) ?? []
  }

  const foundationMilestones = [
    { title: "Create a basic routine", description: "Define a simple daily routine and follow it.", xp_reward: 40 },
    { title: "Complete learning sessions", description: "Finish focused learning blocks for this phase.", xp_reward: 50 },
    { title: "Complete physical activities", description: "Move daily — walk, train, or stretch.", xp_reward: 50 },
    { title: "Build momentum", description: "Build a 5-day momentum streak.", xp_reward: 60 },
    { title: "Complete reflection", description: "Reflect on what you learned and what to improve.", xp_reward: 30 },
  ]

  const milestoneRows: any[] = []
  for (const p of phasesForMilestones) {
    const tmpl = templates.find((t: any) => t.order_index === p.order_index)
    if (p.order_index === 1) {
      foundationMilestones.forEach((m, idx) => {
        milestoneRows.push({ phase_id: p.id, title: m.title, description: m.description, sort_order: idx, status: "pending", xp_reward: m.xp_reward, is_final_challenge: false })
      })
      // Final challenge as milestone
      milestoneRows.push({
        phase_id: p.id,
        title: tmpl?.final_challenge?.title ?? "Foundation Challenge",
        description: tmpl?.final_challenge?.description ?? "Complete the final challenge.",
        sort_order: foundationMilestones.length,
        status: "pending",
        xp_reward: tmpl?.final_challenge?.xp_reward ?? 200,
        is_final_challenge: true,
      })
    } else {
      // Generic: use completion_requirements as milestone titles
      const reqs: string[] = Array.isArray(tmpl?.completion_requirements) ? tmpl.completion_requirements : []
      if (reqs.length === 0) {
        milestoneRows.push({ phase_id: p.id, title: `Complete ${tmpl?.title ?? p.title} milestones`, description: tmpl?.description ?? "", sort_order: 0, status: "pending", xp_reward: 40, is_final_challenge: false })
        milestoneRows.push({
          phase_id: p.id,
          title: tmpl?.final_challenge?.title ?? `${tmpl?.title ?? p.title} Challenge`,
          description: tmpl?.final_challenge?.description ?? "",
          sort_order: 1,
          status: "pending",
          xp_reward: tmpl?.final_challenge?.xp_reward ?? 250,
          is_final_challenge: true,
        })
      } else {
        reqs.forEach((title: string, idx: number) => {
          milestoneRows.push({ phase_id: p.id, title, description: "", sort_order: idx, status: "pending", xp_reward: 40, is_final_challenge: false })
        })
        milestoneRows.push({
          phase_id: p.id,
          title: tmpl?.final_challenge?.title ?? "Final Challenge",
          description: tmpl?.final_challenge?.description ?? "",
          sort_order: reqs.length,
          status: "pending",
          xp_reward: tmpl?.final_challenge?.xp_reward ?? 250,
          is_final_challenge: true,
        })
      }
    }
  }

  if (milestoneRows.length > 0) {
    const { data: insertedMilestones, error: mErr } = await supabase
      .from("milestones")
      .insert(milestoneRows)
      .select("id, title, phase_id")
    if (mErr) {
      // Non-fatal: phases already created. Log but don't revert.
      console.error("[initializeJourney] milestones insert failed", mErr.message)
    } else {
      // Seed Foundation starter quests linked to their milestones (only on fresh journey)
      const msRows = (insertedMilestones as { id: string; title: string; phase_id: string }[]) ?? []
      const foundationPhaseId = phasesForMilestones.find((p) => p.order_index === 1)?.id ?? null
      if (foundationPhaseId) {
        const byTitle = new Map(msRows.filter((m) => m.phase_id === foundationPhaseId).map((m) => [m.title, m.id]))
        const starterQuests = [
          { title: "Write tomorrow's top 3 priorities", category: "discipline", difficulty: "easy", xp_reward: 15, estimated_duration: 5, recurrence: "daily", milestone: "Create a basic routine" },
          { title: "Study programming for 30 minutes", category: "intellect", difficulty: "medium", xp_reward: 30, estimated_duration: 30, recurrence: "daily", milestone: "Complete learning sessions" },
          { title: "Read for 20 minutes", category: "intellect", difficulty: "easy", xp_reward: 15, estimated_duration: 20, recurrence: "daily", milestone: "Complete learning sessions" },
          { title: "Practice one programming problem", category: "craft", difficulty: "medium", xp_reward: 40, estimated_duration: 15, recurrence: "daily", milestone: "Complete learning sessions" },
          { title: "Complete a 20-minute workout", category: "physical", difficulty: "medium", xp_reward: 30, estimated_duration: 20, recurrence: "daily", milestone: "Complete physical activities" },
          { title: "Complete one difficult task", category: "discipline", difficulty: "hard", xp_reward: 75, estimated_duration: null as number | null, recurrence: "none", milestone: "Build momentum" },
          { title: "Evening reflection: what went well?", category: "reflection", difficulty: "easy", xp_reward: 10, estimated_duration: 5, recurrence: "daily", milestone: "Complete reflection" },
        ]
        const questInserts = starterQuests
          .map((q) => ({
            user_id: userId,
            phase_id: foundationPhaseId,
            milestone_id: byTitle.get(q.milestone) ?? null,
            title: q.title,
            description: null,
            category: q.category,
            difficulty: q.difficulty,
            xp_reward: q.xp_reward,
            estimated_duration: q.estimated_duration,
            recurrence: q.recurrence,
            is_recurring: q.recurrence !== "none",
            status: "active",
          }))
          .filter((q) => q.milestone_id !== null)
        if (questInserts.length > 0) {
          const { error: qErr } = await supabase.from("quests").insert(questInserts)
          if (qErr) console.error("[initializeJourney] starter quests insert failed", qErr.message)
        }
      }
    }
  }

  revalidatePath("/phase")
  revalidatePath("/journey")
  revalidatePath("/dashboard")
  return { created: true, message: "Journey created" }
}

/**
 * Mark phase completed server-side only if all milestones + final challenge done
 */
export async function completePhase(phaseId: string): Promise<{ xp: number; unlocked_achievements: UnlockedAchievement[] }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user ?? null)

  const { data: phase, error: pErr } = await supabase.from("phases").select("*").eq("id", phaseId).eq("user_id", userId).single()
  if (pErr || !phase) throw new Error("Phase not found")

  if ((phase as any).status === "completed") {
    // Already completed — return existing xp, prevent duplicate transactions
    const { data: existingTx } = await supabase.from("xp_transactions").select("amount").eq("user_id", userId).eq("source", `phase_complete:${phaseId}`).limit(1)
    const xp = existingTx?.[0]?.amount ?? ((phase as any).reward_xp ?? 0)
    return { xp: typeof xp === "number" ? xp : 0, unlocked_achievements: [] }
  }

  if ((phase as any).status !== "active") throw new Error("Only active phases can be completed")

  const { data: milestones, error: mErr } = await supabase.from("milestones").select("*").eq("phase_id", phaseId).order("sort_order")
  if (mErr) throw new Error(mErr.message)
  const ms = (milestones as any[]) ?? []

  if (!canCompletePhase(phase as any, ms as any)) {
    throw new Error("Complete all milestones and the final challenge first")
  }

  const earnedXp = calcEarnedXp(phase as any, ms as any)

  const now = new Date().toISOString()

  // Update phase to completed
  const nextFinalChallenge = phase.final_challenge ? { ...(phase.final_challenge as object), status: "completed" } : phase.final_challenge
  const { error: updErr } = await supabase
    .from("phases")
    .update({ status: "completed" as PhaseStatus, completed_at: now, final_challenge: nextFinalChallenge as any })
    .eq("id", phaseId)
    .eq("user_id", userId)
  if (updErr) throw new Error(updErr.message)

  // XP payout via secure RPC (server-side only; idempotent per phase).
  // Falls back to the legacy client insert if 0004 migration hasn't been applied yet.
  let awardedXp = earnedXp
  let unlockedAchievements: UnlockedAchievement[] = []
  const { data: awardData, error: awardErr } = await supabase.rpc("award_phase_xp", { p_phase_id: phaseId })
  const missingRpc =
    awardErr?.code === "PGRST202" || /function public\.award_phase_xp|Could not find the function/i.test(awardErr?.message ?? "")
  if (!awardErr && awardData) {
    const res = awardData as { ok?: boolean; xp_awarded?: number; unlocked_achievements?: UnlockedAchievement[] | null; error?: string }
    if (res.ok) {
      awardedXp = res.xp_awarded ?? 0
      unlockedAchievements = res.unlocked_achievements ?? []
    } else console.error("[completePhase] award_phase_xp rejected:", res.error)
  } else if (missingRpc) {
    const { data: existingXp } = await supabase.from("xp_transactions").select("id").eq("user_id", userId).eq("source", `phase_complete:${phaseId}`).limit(1)
    const alreadyRewarded = existingXp && existingXp.length > 0
    if (!alreadyRewarded && earnedXp > 0) {
      const { error: xpErr } = await supabase.from("xp_transactions").insert({
        user_id: userId,
        amount: earnedXp,
        source: `phase_complete:${phaseId}`,
        description: `Completed ${(phase as any).title}`,
      })
      if (xpErr && xpErr.code !== "23505") {
        console.error("[completePhase] xp insert failed", xpErr.message)
      }
    }
  } else if (awardErr) {
    console.error("[completePhase] award_phase_xp failed", awardErr.message)
  }

  // Unlock next phase in the SAME journey lineage (global vs goal-scoped):
  // strict sequential within that lineage, never crossing journeys.
  const { data: allPhases } = await supabase.from("phases").select("id, order_index, status, goal_id").eq("user_id", userId)
  const sameLineage = ((allPhases as { id: string; order_index: number; status: string; goal_id: string | null }[]) ?? [])
    .filter((p) => p.goal_id === ((phase as any).goal_id ?? null) || (p.goal_id === null && (phase as any).goal_id === null))
    .sort((a, b) => a.order_index - b.order_index)
  const currentIdx = sameLineage.findIndex((p) => p.id === phaseId)
  const next = sameLineage.slice(currentIdx + 1).find((p) => p.status === "locked")
  if (next) {
    await supabase.from("phases").update({ status: "available" as PhaseStatus }).eq("id", next.id).eq("user_id", userId)
  }

  revalidatePath("/phase")
  revalidatePath("/journey")
  revalidatePath("/dashboard")
  revalidatePath("/goals")
  if ((phase as any).goal_id) revalidatePath(`/goals/${(phase as any).goal_id}`)
  return { xp: awardedXp, unlocked_achievements: unlockedAchievements }
}

/** Begin next phase: available -> active, server-verified (lineage-scoped) */
export async function beginNextPhase(phaseId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user ?? null)

  const { data: target, error } = await supabase
    .from("phases")
    .select("id, status, order_index, user_id, goal_id")
    .eq("id", phaseId)
    .eq("user_id", userId)
    .single()
  if (error || !target) throw new Error("Phase not found")
  if ((target as any).status !== "available") throw new Error("Phase is not available")

  // Strictly sequential within the same journey lineage: previous must be completed
  const { data: all } = await supabase.from("phases").select("order_index, status, goal_id").eq("user_id", userId)
  const lineage = ((all as { order_index: number; status: string; goal_id: string | null }[]) ?? []).filter(
    (p) => (p.goal_id ?? null) === ((target as any).goal_id ?? null),
  )
  const prev = lineage.find((p) => p.order_index === (target as any).order_index - 1)
  if (prev && prev.status !== "completed") throw new Error("Complete the previous phase first")

  // Only one active per lineage
  const actives = lineage.filter((p) => p.status === "active" && p.order_index !== (target as any).order_index)
  if (actives.length > 0) throw new Error("Another phase is already active")

  const { error: updErr } = await supabase
    .from("phases")
    .update({ status: "active" as PhaseStatus, start_date: new Date().toISOString().slice(0, 10) })
    .eq("id", phaseId)
    .eq("user_id", userId)
    .eq("status", "available")
  if (updErr) throw new Error(updErr.message)

  revalidatePath("/phase")
  revalidatePath("/journey")
  revalidatePath("/dashboard")
  revalidatePath("/goals")
  if ((target as any).goal_id) revalidatePath(`/goals/${(target as any).goal_id}`)
}

/**
 * Save a reflection for a completed phase.
 * One reflection per user per phase (upsert semantics via app-level check).
 */
export async function savePhaseReflection(phaseId: string, body: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user ?? null)

  const text = body.trim()
  if (text.length < 1 || text.length > 5000) throw new Error("Reflection must be between 1 and 5000 characters")

  // Verify ownership of the phase
  const { data: phase } = await supabase.from("phases").select("id").eq("id", phaseId).eq("user_id", userId).single()
  if (!phase) throw new Error("Phase not found")

  // Idempotent: replace existing reflection for this phase
  const { data: existing } = await supabase.from("reflections").select("id").eq("user_id", userId).eq("phase_id", phaseId).limit(1)
  if (existing && existing.length > 0) {
    const { error: updErr } = await supabase.from("reflections").update({ body: text }).eq("id", existing[0].id).eq("user_id", userId)
    if (updErr) throw new Error(updErr.message)
  } else {
    const { error: insErr } = await supabase.from("reflections").insert({ user_id: userId, phase_id: phaseId, body: text })
    if (insErr) throw new Error(insErr.message)
  }
}

/** Toggle milestone completed/pending (for demo/progression), enforces ownership via phase */
export async function toggleMilestone(milestoneId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = mustUserId(user ?? null)

  const { data: ms, error } = await supabase.from("milestones").select("id, phase_id, status").eq("id", milestoneId).single()
  if (error || !ms) throw new Error("Milestone not found")

  const { data: phase } = await supabase.from("phases").select("id, user_id, status").eq("id", (ms as any).phase_id).eq("user_id", userId).single()
  if (!phase) throw new Error("Not your milestone")
  if ((phase as any).status !== "active") throw new Error("Milestone can only be updated in active phase")

  const nextStatus = (ms as any).status === "completed" ? "pending" : "completed"
  const { error: updErr } = await supabase.from("milestones").update({ status: nextStatus }).eq("id", milestoneId)
  if (updErr) throw new Error(updErr.message)

  // If completing a final challenge milestone, also mark final_challenge json completed when all final milestones done
  if (nextStatus === "completed" && (ms as any).is_final_challenge) {
    const { data: allM } = await supabase.from("milestones").select("id, is_final_challenge, status").eq("phase_id", (ms as any).phase_id)
    const finals = (allM as any[])?.filter((m) => m.is_final_challenge) ?? []
    if (finals.every((m) => m.status === "completed" || m.id === milestoneId)) {
      const { data: ph } = await supabase.from("phases").select("final_challenge").eq("id", (ms as any).phase_id).single()
      if (ph && (ph as any).final_challenge) {
        await supabase
          .from("phases")
          .update({ final_challenge: { ...(ph as any).final_challenge, status: "completed" } })
          .eq("id", (ms as any).phase_id)
      }
    }
  }

  revalidatePath("/phase")
  revalidatePath("/journey")
}
