import { z } from "zod"
import { boundedString, cleanString, cleanArray } from "@/lib/ai/schemas"

/**
 * Shared Zod schemas + bounds for the three Stage-2 Goal proposals.
 *
 * These are the AUTHORITATIVE validation contracts for untrusted model JSON.
 * Bounds mirror the real DB schema enums/limits (see `0001`/`0002`/`0007` and
 * `src/types/database.ts`):
 *   - phase title        ≤ 120  (goals/phases `char_length(title) between 1 and 120`)
 *   - phase objective    ≤ 300  (goal journey objective convention, 0007)
 *   - milestone title    ≤ 120  (milestones `char_length(title) between 1 and 120`)
 *   - quest title        ≤ 150  (quests `char_length(title) between 1 and 150`)
 *   - quest category     = intellect|physical|discipline|reflection|craft|work|general
 *   - quest difficulty   = easy|medium|hard|challenge
 *
 * Strict schemas REJECT malformed/oversized/invalid output (the pipeline maps
 * rejection to `invalid`), so the model can never smuggle an out-of-bounds
 * value into a proposal.
 */

// --- Goal Quality (AI explains a deterministic score; comment only) -------

export const goalQualityExplanationSchema = z.object({
  summary: boundedString(1, 400),
  strengths: z.array(boundedString(1, 200)).max(5),
  improvements: z.array(boundedString(1, 200)).max(5),
  suggested_next_step: boundedString(1, 200),
})

export type GoalQualityExplanation = z.infer<typeof goalQualityExplanationSchema>

// --- Goal Understanding (synthesis grounded in deterministic context) -----

export const goalUnderstandingSchema = z.object({
  state: boundedString(1, 600),
  trajectory: boundedString(1, 600),
  risks: z.array(boundedString(1, 300)).max(5),
  opportunities: z.array(boundedString(1, 300)).max(5),
  open_questions: z.array(boundedString(1, 300)).max(5),
})

export type GoalUnderstanding = z.infer<typeof goalUnderstandingSchema>

// --- Goal Decomposition (proposal only — phases/milestones/quests) --------

export const QUEST_CATEGORIES = ["intellect", "physical", "discipline", "reflection", "craft", "work", "general"] as const
export const QUEST_DIFFICULTIES = ["easy", "medium", "hard", "challenge"] as const

/** Cap phases so the proposal stays small and actionable (schema below allows 12). */
export const MAX_DECOMPOSITION_PHASES = 5
/** Cap milestones per phase. */
export const MAX_DECOMPOSITION_MILESTONES_PER_PHASE = 4
/** Cap flat quest suggestions. */
export const MAX_DECOMPOSITION_QUESTS = 10

export const goalDecompositionPhaseSchema = z.object({
  title: boundedString(1, 120),
  objective: cleanString(300),
  milestones: z.array(z.object({ title: boundedString(1, 120) })).max(MAX_DECOMPOSITION_MILESTONES_PER_PHASE).optional(),
})

export const goalDecompositionQuestSchema = z.object({
  title: boundedString(1, 150),
  category: z.enum(QUEST_CATEGORIES),
  difficulty: z.enum(QUEST_DIFFICULTIES),
  description: cleanString(500).optional(),
})

export const goalDecompositionSchema = z.object({
  phases: z.array(goalDecompositionPhaseSchema).min(1).max(MAX_DECOMPOSITION_PHASES),
  quests: z.array(goalDecompositionQuestSchema).max(MAX_DECOMPOSITION_QUESTS),
})

export type GoalDecompositionPhase = z.infer<typeof goalDecompositionPhaseSchema>
export type GoalDecompositionQuest = z.infer<typeof goalDecompositionQuestSchema>
export type GoalDecomposition = z.infer<typeof goalDecompositionSchema>

/**
 * Deterministic post-Zod gate for a decomposition: rejects proposals whose
 * combined scope is empty or that omit any milestone objectives that the app
 * would create (both core + final-challenge milestones implied). Ensures the
 * plan is non-trivial without demanding the model fill every slot.
 */
export function validateGoalDecomposition(d: GoalDecomposition): { ok: boolean; error?: string } {
  if (d.phases.length === 0) return { ok: false, error: "decomposition must propose at least one phase" }
  const questTotal = d.quests.length
  const milestoneTotal = d.phases.reduce((s, p) => s + (p.milestones?.length ?? 0), 0)
  if (milestoneTotal === 0 && questTotal === 0) {
    return { ok: false, error: "decomposition must propose milestones or quests" }
  }
  return { ok: true }
}

// Re-exported helpers for tests / convenience.
export const proposalArrayLimit = cleanArray
