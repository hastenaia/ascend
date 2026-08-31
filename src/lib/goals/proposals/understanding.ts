import type { GoalIntel } from "@/lib/goals/intelligence/metrics"
import { runAIProposal, type ModelCall, type RunnableAIProposalRequest } from "@/lib/ai/pipeline"
import type { AIProposalResult } from "@/lib/ai/types"
import type { ChatMessage } from "@/lib/coach/provider"
import { goalUnderstandingSchema, type GoalUnderstanding } from "./schemas"
import { buildGoalFacts, type GoalContextRow } from "./context"

/**
 * Goal Understanding — a concise synthesis of a goal's STATE + TRAJECTORY +
 * RISKS + OPPORTUNITIES + OPEN QUESTIONS.
 *
 * The model sees ONLY the deterministic facts from `buildGoalFacts` and is
 * instructed to ground every claim in them. It may not invent progress, dates,
 * milestones, behavior, or achievements. All bounds are enforced by the schema;
 * no DB writes occur here (proposal only).
 */

const UNDERSTANDING_SYSTEM_PROMPT = `You synthesize a concise understanding of the user's goal from the DETERMINISTIC facts provided.
Every factual claim MUST come from the facts. Do NOT invent progress, dates, milestones, behavior, achievements, or data not present.
- state: where the goal stands right now (grounded in progress/completion/overdue/inactive).
- trajectory: the trend implied by momentum, consistency, and velocity.
- risks: concrete risks visible in the facts (e.g. inactivity, zero momentum, overdue items).
- opportunities: realistic next levers.
- open_questions: what is genuinely unclear from the data.
Be concise and specific. Respond with ONLY JSON (no markdown fences):
{"state":"...","trajectory":"...","risks":["..."],"opportunities":["..."],"open_questions":["..."]}`

export interface GoalUnderstandingOptions {
  userId?: string
  costKey?: string
  modelCall?: ModelCall
}

export function makeGoalUnderstandingRequest(
  goal: GoalContextRow,
  intel: GoalIntel,
  opts: GoalUnderstandingOptions = {},
): RunnableAIProposalRequest<GoalUnderstanding> {
  const collect = async () => buildGoalFacts(goal, intel)
  return {
    userId: opts.userId ?? "local",
    kind: "goal",
    costKey: opts.costKey ?? "goal:understand",
    collect,
    buildMessages: (facts): ChatMessage[] => [
      { role: "system", content: UNDERSTANDING_SYSTEM_PROMPT },
      { role: "user", content: `=== GOAL CONTEXT (deterministic facts) ===\n${facts.text}\n=== END ===` },
    ],
    schema: goalUnderstandingSchema,
    ...(opts.modelCall ? { modelCall: opts.modelCall } : {}),
  }
}

export type GoalUnderstandingResult = AIProposalResult<GoalUnderstanding>

export function proposeGoalUnderstanding(
  goal: GoalContextRow,
  intel: GoalIntel,
  opts: GoalUnderstandingOptions = {},
): Promise<GoalUnderstandingResult> {
  return runAIProposal<GoalUnderstanding>(makeGoalUnderstandingRequest(goal, intel, opts))
}
