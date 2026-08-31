import { extractJson } from "@/lib/coach/provider"
import { assertContextSize } from "./context"
import { assertCostGate, getCache, makeCacheKey, shouldUseAI, setCache } from "./cost"
import { proposeModel } from "./provider"
import { rateLimited } from "./ratelimit"
import { sanitizeForPrompt } from "./context"
import type { AIProposalRequest, AIProposalResult } from "./types"
import type { ChatMessage, ModelCallOptions, ModelResult } from "@/lib/coach/provider"

export type ModelCall = (messages: ChatMessage[], opts?: ModelCallOptions) => Promise<ModelResult>

/** Internal request shape with the injectable seam for tests. */
interface RunnableAIProposalRequest<T> extends AIProposalRequest<T> {
  modelCall?: ModelCall
}

/**
 * The shared AI proposal pipeline (P2.0 core).
 *
 *   cost/rate gate → deterministic facts → context (minimal + safe)
 *   → model → extractJson → Zod schema → domain validate
 *
 * The model NEVER writes to the database. It returns a validated *proposal*
 * for the caller (typically a route) to persist via a security-definer RPC
 * after the user approves. No fabrication: any upstream failure yields
 * { ok:false, unavailable:true }.
 *
 * `modelCall` is injectable for unit tests (kept out of the public type by
 * using a module-level internal in tests).
 */
export async function runAIProposal<T>(req: RunnableAIProposalRequest<T>): Promise<AIProposalResult<T>> {
  const modelCall: ModelCall = req.modelCall ?? ((messages, opts) => proposeModel(messages, req.kind, opts))

  if (rateLimited(`${req.costKey}:${req.userId}`)) {
    return { ok: false, reason: "rate_limited" }
  }
  if (assertCostGate(req.userId, req.kind)) {
    return { ok: false, reason: "rate_limited" }
  }

  const facts = await req.collect()

  // Deterministic-first: skip the model when facts already resolve the task.
  if (!shouldUseAI(facts, req.kind)) {
    // No fabrication permitted — when facts don't warrant a model call the
    // caller must handle the not-applicable case explicitly.
    return { ok: false, reason: "unavailable", detail: "no_ai_value" }
  }

  if (req.cache) {
    const key = makeCacheKey(req.userId, req.kind, facts.text)
    const hit = getCache(key)
    if (hit !== null) {
      const { ok, proposal } = hit as { ok: boolean; proposal: T }
      if (ok) return { ok: true, proposal, source: "cache" }
    }
  }

  const contextText = sanitizeForPrompt(facts.text)
  const maxChars = 6000
  assertContextSize(contextText, maxChars)

  const messages = req.buildMessages(facts)
  const result = await modelCall(messages, req.model ?? {})
  if (!result.ok) {
    return { ok: false, unavailable: true, reason: mapUnavailable(result) }
  }

  const parsed = extractJson<T>(result.content)
  if (parsed === null) {
    return { ok: false, reason: "parse_failed" }
  }

  const parsedObj = req.schema.safeParse(parsed)
  if (!parsedObj.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsedObj.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "value"}: ${i.message}`),
    }
  }

  const validated = parsedObj.data as T
  if (req.validate) {
    const check = req.validate(validated)
    if (!check.ok) return { ok: false, reason: "domain_invalid", detail: check.error }
  }

  if (req.cache) {
    const key = makeCacheKey(req.userId, req.kind, facts.text)
    setCache(key, { ok: true, proposal: validated }, req.cache.ttlMs)
  }

  return { ok: true, proposal: validated, source: "ai" }
}

type ModelCall = (messages: ChatMessage[], opts?: ModelCallOptions) => Promise<ModelResult>

function mapUnavailable(result: ModelResult): AIProposalResult<never>["reason"] {
  if (result.ok) return "unavailable"
  if (result.reason === "no_key") return "no_key"
  if (result.reason === "upstream_error") return "upstream_error"
  return "upstream_error"
}
