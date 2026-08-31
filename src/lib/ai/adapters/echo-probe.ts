import { z } from "zod"
import { runAIProposal, type ModelCall } from "../pipeline"
import type { AIProposalResult, GatherFactsResult } from "../types"
import type { ChatMessage } from "@/lib/coach/provider"

/**
 * Reference proof-of-use for the shared AI pipeline.
 *
 * Runs the FULL 10-step pipeline against real Gemini with a trivial, safe
 * schema and returns `{ ok:true, reply }`. It is NOT wired to any user-facing
 * route and mutates nothing in the database. It exists to (a) prove the
 * plumbing works end-to-end against the live provider and (b) serve as a
 * template that P2.1+ domains copy for their real gatherers/schemas.
 *
 * `modelCall` is injectable for tests; `userId` is arbitrary here because this
 * probe performs no writes.
 */

const EchoSchema = z.object({
  reply: z.string().trim().max(200),
})

export type EchoProbeInput = { prompt?: string }

export async function runEchoProbe(
  input: EchoProbeInput = {},
  modelCall?: ModelCall,
): Promise<AIProposalResult<{ reply: string }>> {
  const prompt = input.prompt?.trim() || "Reply with a one-word JSON object: {\"reply\":\"pong\"}"

  const collect = async (): Promise<GatherFactsResult> => {
    // Deterministic facts that still warrant a model response (not resolved).
    return { text: "Echo probe (diagnostic). No real user data is used.", signals: { probe: true } }
  }

  const buildMessages = (): ChatMessage[] => [
    {
      role: "system",
      content:
        "You are an echo/diagnostic helper. Follow the user's instructions exactly. Respond with ONLY a JSON object of the requested shape, no prose.",
    },
    { role: "user", content: prompt },
  ]

  return runAIProposal({
    userId: "echo-probe",
    kind: "generic",
    costKey: "echo:probe",
    collect,
    buildMessages,
    schema: EchoSchema,
    model: { maxTokens: 120, temperature: 0 },
    modelCall,
  })
}
