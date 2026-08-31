import type { ChatMessage, ModelCallOptions } from "@/lib/coach/provider"

/**
 * Future AI domains. Each kind maps to a cost/rate-limit budget and (later)
 * a domain-specific proposal schema. Kept minimal today; P2.1+ adds kinds.
 */
export type AIProposalKind =
  | "goal"
  | "phase"
  | "quest"
  | "habit"
  | "journal"
  | "learning"
  | "business"
  | "finance"
  | "market"
  | "coach"
  | "generic"

/** Deterministic facts gathered before any model call. Domain-supplied. */
export interface GatherFactsResult {
  /** Short framing text a human would read. Always domain-specific + minimal. */
  text: string
  /** Machine-checkable signals used by the deterministic-first heuristic. */
  signals: Record<string, unknown>
  /** True when the facts already answer the task with no reasoning needed. */
  resolved?: boolean
}

export interface AIProposalRequest<T> {
  /** Authenticated user id (from supabase auth). */
  userId: string
  /** Which domain this proposal targets (drives budget + future schema). */
  kind: AIProposalKind
  /** Rate-limit key, e.g. `goal:clarify`. */
  costKey: string
  /** Build the (deterministic) fact set. Runs before the model is consulted. */
  collect: () => Promise<GatherFactsResult>
  /** Compose the model conversation from facts + shared safety anchor. */
  buildMessages: (facts: GatherFactsResult) => ChatMessage[]
  /** Zod schema that validates the parsed model output. */
  schema: import("zod").ZodType<T>
  /** Optional extra domain/server validation after Zod. */
  validate?: (parsed: T) => { ok: boolean; error?: string }
  /** Model knobs (maxTokens / temperature). */
  model?: ModelCallOptions
  /** Optional deterministic-keyed cache entry. */
  cache?: { key: string; ttlMs: number }
}

export type ProposalSource = "ai" | "deterministic" | "cache"

export type AIProposalFailureReason =
  | "unavailable"
  | "no_key"
  | "upstream_error"
  | "rate_limited"
  | "context_too_large"
  | "parse_failed"
  | "invalid"
  | "domain_invalid"

export type AIProposalResult<T> =
  | { ok: true; proposal: T; source: ProposalSource }
  | {
      ok: false
      unavailable?: boolean
      reason: AIProposalFailureReason
      detail?: string
      /** Zod issues surfaced when reason === "invalid" (sanitized). */
      issues?: string[]
    }

/** A single long-term memory note (concise summary only). */
export interface MemoryNote {
  id: string
  kind: string
  summary: string
  importance: number
  createdAt: string
  sourceRef?: Record<string, unknown>
}

/** RPC-style write result shared by the security-definer calls. */
export interface RpcResult {
  ok: boolean
  id?: string
  error?: string
}
