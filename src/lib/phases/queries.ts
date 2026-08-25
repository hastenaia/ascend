import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, FinalChallengeJson } from "@/types/database"

export type PhaseRow = Database["public"]["Tables"]["phases"]["Row"]
export type PhaseTemplateRow = Database["public"]["Tables"]["phase_templates"]["Row"]
export type MilestoneRow = Database["public"]["Tables"]["milestones"]["Row"]

export type PhaseWithProgress = PhaseRow & {
  milestones: MilestoneRow[]
  totalMilestones: number
  completedMilestones: number
  progress: number // 0-100
  nextMilestone: MilestoneRow | null
  canComplete: boolean
  earnedXp: number // reward_xp + sum completed milestone xp
}

export function calcProgress(milestones: MilestoneRow[]): { progress: number; completed: number; total: number } {
  const total = milestones.length
  if (total === 0) return { progress: 0, completed: 0, total: 0 }
  const completed = milestones.filter((m) => m.status === "completed").length
  return { progress: Math.round((completed / total) * 100), completed, total }
}

export function canCompletePhase(phase: PhaseRow, milestones: MilestoneRow[]): boolean {
  if (milestones.length === 0) return false
  const nonFinal = milestones.filter((m) => !m.is_final_challenge)
  const final = milestones.filter((m) => m.is_final_challenge)
  const nonFinalDone = nonFinal.length === 0 || nonFinal.every((m) => m.status === "completed")
  const finalDone = final.length === 0 ? finalChallengeCompleted(phase.final_challenge) : final.every((m) => m.status === "completed")
  // If no explicit final challenge milestone, require JSON final_challenge completed OR all milestones completed
  if (final.length === 0 && phase.final_challenge) {
    return nonFinalDone && finalChallengeCompleted(phase.final_challenge)
  }
  if (final.length === 0) return nonFinalDone
  return nonFinalDone && finalDone
}

function finalChallengeCompleted(fc: FinalChallengeJson): boolean {
  if (!fc) return true // no final challenge configured => not blocking
  return fc.status === "completed"
}

export function calcEarnedXp(phase: PhaseRow, milestones: MilestoneRow[]): number {
  const milestoneXp = milestones.filter((m) => m.status === "completed").reduce((s, m) => s + (m.xp_reward ?? 0), 0)
  const base = phase.reward_xp ?? 0
  const fcXp = phase.final_challenge?.status === "completed" ? (phase.final_challenge?.xp_reward ?? 0) : 0
  // Avoid double-counting if final challenge is also a milestone with xp_reward; we sum both intentionally per spec (phase reward + milestones)
  // If final challenge XP is already in a milestone, it will be counted via milestoneXp, we add phase base only once
  return base + milestoneXp + (phase.final_challenge && milestones.some((m) => m.is_final_challenge) ? 0 : fcXp)
}

export async function getUserPhases(supabase: SupabaseClient, userId: string): Promise<PhaseRow[]> {
  const { data, error } = await supabase
    .from("phases")
    .select("*")
    .eq("user_id", userId)
    .order("order_index", { ascending: true })
    .order("phase_number", { ascending: true })
  if (error) throw error
  return (data as PhaseRow[]) ?? []
}

export async function getPhaseTemplates(supabase: SupabaseClient): Promise<PhaseTemplateRow[]> {
  const { data, error } = await supabase.from("phase_templates").select("*").order("order_index", { ascending: true })
  if (error) throw error
  return (data as PhaseTemplateRow[]) ?? []
}

export async function getMilestonesForPhase(supabase: SupabaseClient, phaseId: string): Promise<MilestoneRow[]> {
  const { data, error } = await supabase.from("milestones").select("*").eq("phase_id", phaseId).order("sort_order", { ascending: true })
  if (error) throw error
  return (data as MilestoneRow[]) ?? []
}

export async function getCurrentPhase(supabase: SupabaseClient, userId: string): Promise<PhaseWithProgress | null> {
  const phases = await getUserPhases(supabase, userId)
  const active = phases.find((p) => p.status === "active") ?? phases.find((p) => p.status === "available") ?? null
  if (!active) return null
  const milestones = await getMilestonesForPhase(supabase, active.id)
  const { progress, completed, total } = calcProgress(milestones)
  const nextMilestone = milestones.find((m) => m.status !== "completed") ?? null
  return {
    ...active,
    milestones,
    totalMilestones: total,
    completedMilestones: completed,
    progress,
    nextMilestone,
    canComplete: canCompletePhase(active, milestones),
    earnedXp: calcEarnedXp(active, milestones),
  }
}

export async function getJourney(supabase: SupabaseClient, userId: string) {
  const [templates, phases] = await Promise.all([getPhaseTemplates(supabase), getUserPhases(supabase, userId)])
  // If user has phases, render them; otherwise show templates as locked preview (no fake user phases)
  // Fetch milestones for all user phases in one query if many
  let milestonesByPhase = new Map<string, MilestoneRow[]>()
  if (phases.length > 0) {
    const { data: allM } = await supabase.from("milestones").select("*").in("phase_id", phases.map((p) => p.id)).order("sort_order")
    const grouped = new Map<string, MilestoneRow[]>()
    for (const m of (allM as MilestoneRow[]) ?? []) {
      const arr = grouped.get(m.phase_id) ?? []
      arr.push(m)
      grouped.set(m.phase_id, arr)
    }
    milestonesByPhase = grouped
  }
  const enriched = phases.map((p) => {
    const ms = milestonesByPhase.get(p.id) ?? []
    const { progress, completed, total } = calcProgress(ms)
    return {
      ...p,
      milestones: ms,
      progress,
      completed,
      total,
      canComplete: canCompletePhase(p, ms),
      earnedXp: calcEarnedXp(p, ms),
    }
  })
  return { templates, phases: enriched, hasJourney: phases.length > 0 }
}

export async function getPhaseById(supabase: SupabaseClient, userId: string, phaseId: string): Promise<PhaseWithProgress | null> {
  const { data, error } = await supabase.from("phases").select("*").eq("id", phaseId).eq("user_id", userId).single()
  if (error) return null
  const phase = data as PhaseRow
  const milestones = await getMilestonesForPhase(supabase, phase.id)
  const { progress, completed, total } = calcProgress(milestones)
  return {
    ...phase,
    milestones,
    totalMilestones: total,
    completedMilestones: completed,
    progress,
    nextMilestone: milestones.find((m) => m.status !== "completed") ?? null,
    canComplete: canCompletePhase(phase, milestones),
    earnedXp: calcEarnedXp(phase, milestones),
  }
}
