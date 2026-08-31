import type { GoalIntel } from "@/lib/goals/intelligence/metrics"
import { runAIProposal, type ModelCall, type RunnableAIProposalRequest } from "@/lib/ai/pipeline"
import type { AIProposalResult } from "@/lib/ai/types"
import type { ChatMessage } from "@/lib/coach/provider"
import {
  goalDecompositionSchema,
  validateGoalDecomposition,
  MAX_DECOMPOSITION_PHASES,
  MAX_DECOMPOSITION_QUESTS,
  type GoalDecomposition,
} from "./schemas"
import { buildGoalFacts, type GoalContextRow } from "./context"

/**
 * Goal Decomposition — the AI PROPOSES phases/milestones/quests; nothing is
 * written to the database. After the user approves, a later stage persists the
 * validated plan via a security-definer RPC. Scope is kept small: at most
 * `MAX_DECOMPOSITION_PHASES` phases, `MAX_DECOMPOSITION_MILESTONES_PER_PHASE`
 * milestones, and `MAX_DECOMPOSITION_QUESTS` quests — the model must NOT create
 * filler phases/quests merely to hit a limit.
 */

const DECOMPOSITION_SYSTEM_PROMPT = `You propose a SMALL, ACTIONABLE decomposition of the user's goal.
Proposals only — you never modify the database.
Rules:
- Propose only what is genuinely needed. DO NOT pad with filler phases or quests to reach a limit.
- Phases: at most ${MAX_DECOMPOSITION_PHASES}; each title concise; each objective concrete.
- Milestones per phase: at most 4; must be concrete checkpoints within that phase.
- Quests: at most ${MAX_DECOMPOSITION_QUESTS}; each one small and completable.
- quest category must be one of: intellect, physical, discipline, reflection, craft, work, general.
- quest difficulty must be one of: easy, medium, hard, challenge.
- Keep titles under their length limits. Base phase order on the deterministic goal context provided.
Respond with ONLY JSON (no markdown fences):
{"phases":[{"title":"...","objective":"...","milestones":[{"title":"..."}]}],"quests":[{"title":"...","category":"...","difficulty":"...","description":"..."}]}`

export interface GoalDecompositionOptions {
  userId?: string
  costKey?: string
  modelCall?: ModelCall
}

export function makeGoalDecompositionRequest(
  goal: GoalContextRow,
  intel: GoalIntel,
  opts: GoalDecompositionOptions = {},
): RunnableAIProposalRequest<GoalDecomposition> {
  const collect = async () => buildGoalFacts(goal, intel)
  return {
    userId: opts.userId ?? "local",
    kind: "goal",
    costKey: opts.costKey ?? "goal:decompose",
    collect,
    buildMessages: (facts): ChatMessage[] => [
      { role: "system", content: DECOMPOSITION_SYSTEM_PROMPT },
      { role: "user", content: `=== GOAL CONTEXT (deterministic facts) ===\n${facts.text}\n=== END ===` },
    ],
    schema: goalDecompositionSchema,
    validate: validateGoalDecomposition,
    ...(opts.modelCall ? { modelCall: opts.modelCall } : {}),
  }
}

export type GoalDecompositionResult = AIProposalResult<GoalDecomposition>

export function proposeGoalDecomposition(
  goal: GoalContextRow,
  intel: GoalIntel,
  opts: GoalDecompositionOptions = {},
): Promise<GoalDecompositionResult> {
  return runAIProposal<GoalDecomposition>(makeGoalDecompositionRequest(goal, intel, opts))
}
