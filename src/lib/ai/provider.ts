import { callGemini, geminiKey, type ChatMessage, type ModelCallOptions, type ModelResult } from "@/lib/coach/provider"
import type { AIProposalKind } from "./types"

/**
 * Model-selection abstraction. Gemini is the ONLY provider (requirement 8).
 * `modelFor` centralizes kind→model sizing so future domains pick the right
 * model in one place without touching the network layer.
 */

export function aiConfigured(): boolean {
  return Boolean(geminiKey())
}

const KIND_MODEL: Record<AIProposalKind, string | undefined> = {
  goal: undefined,
  phase: undefined,
  quest: undefined,
  habit: undefined,
  journal: undefined,
  learning: undefined,
  business: undefined,
  finance: undefined,
  market: undefined,
  coach: undefined,
  generic: undefined,
}

/** Resolve the model for a kind. Default: GEMINI_MODEL (or the flash default). */
export function modelFor(kind: AIProposalKind): string {
  const env = process.env.GEMINI_MODEL
  if (env) return env
  return KIND_MODEL[kind] ?? "gemini-3.6-flash"
}

/**
 * Single call entry point for proposals. Uses the P1 gemini path (same
 * provider, same no-fabrication contract). Throws nothing — returns a
 * `ModelResult` that callers map to a proposal result.
 */
export async function proposeModel(
  messages: ChatMessage[],
  kind: AIProposalKind,
  opts: ModelCallOptions = {},
): Promise<ModelResult> {
  return callGemini(messages, { ...opts })
}
