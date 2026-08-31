import type { GoalIntel } from "@/lib/goals/intelligence/metrics"
import { runAIProposal, type ModelCall, type RunnableAIProposalRequest } from "@/lib/ai/pipeline"
import type { AIProposalFailureReason, ProposalSource } from "@/lib/ai/types"
import type { ChatMessage } from "@/lib/coach/provider"
import { goalQualityExplanationSchema, type GoalQualityExplanation } from "./schemas"
import { buildGoalFacts, type GoalContextRow } from "./context"

/**
 * Goal Quality — a DETERMINISTIC score with an AI explanation layer.
 *
 * The score and its rubric breakdown are computed by `computeGoalQuality`
 * (pure, from Stage-1 `GoalIntel`). Gemini produces ONLY the human explanation
 * (`summary` / `strengths` / `improvements` / `suggested_next_step`); the
 * schema has NO score field, so the model can never set or alter the
 * authoritative number. The deterministic score always comes back even when
 * the model is unavailable (mirrors the Weekly Review contract).
 */

export interface QualityRubricItem {
  key: string
  label: string
  score: number
  max: number
}

export interface GoalQuality {
  score: number
  max: number
  rubric: QualityRubricItem[]
  explanation: GoalQualityExplanation | null
  source: ProposalSource | "none"
}

// --- Deterministic score ---------------------------------------------------

function outcomeScore(desired: string | null | undefined): number {
  const d = (desired ?? "").trim()
  if (d.length >= 10) return 20
  if (d.length > 0) return 10
  return 0
}

function decompositionScore(intel: GoalIntel): number {
  if (intel.completion.phasesTotal === 0) return 0
  let v = 10
  if (intel.progress.progressPct > 0) v += 10
  return v
}

/**
 * Deterministic quality score (0-100) for a single goal. Rubric weights are
 * named constants so the breakdown is auditable. NEVER authored by the model.
 */
export function computeGoalQuality(goal: GoalContextRow, intel: GoalIntel): { score: number; max: number; rubric: QualityRubricItem[] } {
  const rubric: QualityRubricItem[] = [
    { key: "desired_outcome", label: "Desired outcome specified", max: 20, score: outcomeScore(goal.desired_outcome) },
    { key: "target_date", label: "Target date set", max: 15, score: goal.target_date ? 15 : 0 },
    { key: "decomposition", label: "Journey decomposed into phases", max: 20, score: decompositionScore(intel) },
    { key: "momentum", label: "Recent momentum", max: 20, score: Math.round((intel.momentum / 100) * 20) },
    { key: "progress", label: "Progress made", max: 15, score: Math.round((intel.progress.progressPct / 100) * 15) },
    { key: "consistency", label: "Consistency", max: 10, score: Math.round((intel.consistency.consistencyPct / 100) * 10) },
  ]
  const score = rubric.reduce((s, r) => s + r.score, 0)
  return { score, max: 100, rubric }
}

// --- Proposal request -------------------------------------------------------

const QUALITY_SYSTEM_PROMPT = `You explain a GOAL QUALITY SCORE that Ascend computed automatically.
The score and rubric are DETERMINISTIC and AUTHORITATIVE. You do NOT calculate, change, or second-guess the score — it is not part of your output.
Ground every claim ONLY in the deterministic facts provided. Never invent progress, dates, milestones, behavior, achievements, or scores.
- summary: a short explanation of the quality and what it reflects.
- strengths: what is working (from the facts only).
- improvements: concrete, small levers that would raise quality.
- suggested_next_step: one specific next action.
Respond with ONLY JSON (no markdown fences):
{"summary":"...","strengths":["..."],"improvements":["..."],"suggested_next_step":"..."}`

export interface GoalQualityRequestOptions {
  userId?: string
  costKey?: string
  modelCall?: ModelCall
}

export function makeGoalQualityRequest(
  goal: GoalContextRow,
  intel: GoalIntel,
  opts: GoalQualityRequestOptions = {},
): RunnableAIProposalRequest<GoalQualityExplanation> {
  const collect = async () => buildGoalFacts(goal, intel)
  return {
    userId: opts.userId ?? "local",
    kind: "goal",
    costKey: opts.costKey ?? "goal:quality",
    collect,
    buildMessages: (facts): ChatMessage[] => [
      { role: "system", content: QUALITY_SYSTEM_PROMPT },
      { role: "user", content: `=== GOAL CONTEXT (deterministic facts) ===\nScore: ${computeGoalQuality(goal, intel).score}/100\n${facts.text}\n=== END ===` },
    ],
    schema: goalQualityExplanationSchema,
    ...(opts.modelCall ? { modelCall: opts.modelCall } : {}),
  }
}

export type GoalQualityResult =
  | { ok: true; data: GoalQuality }
  | { ok: false; data: GoalQuality; reason: AIProposalFailureReason }

/**
 * Deterministic score always, AI explanation when available. Never fabricates:
 * on any pipeline failure the score/rubric are returned with explanation null.
 */
export async function proposeGoalQuality(
  goal: GoalContextRow,
  intel: GoalIntel,
  opts: GoalQualityRequestOptions = {},
): Promise<GoalQualityResult> {
  const { score, max, rubric } = computeGoalQuality(goal, intel)
  const res = await runAIProposal<GoalQualityExplanation>(makeGoalQualityRequest(goal, intel, opts))
  if (res.ok) {
    return { ok: true, data: { score, max, rubric, explanation: res.proposal, source: res.source } }
  }
  return { ok: false, data: { score, max, rubric, explanation: null, source: "none" }, reason: res.reason }
}
