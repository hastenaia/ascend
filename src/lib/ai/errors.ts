import type { AIProposalFailureReason } from "./types"

/**
 * Error types + safe formatting for the AI plumbing. Never log or echo raw
 * secrets, tokens, or full prompts. `toSafeAPIError` produces only sanitized,
 * client-safe messages.
 */

export class AIUnavailableError extends Error {
  reason: AIProposalFailureReason
  constructor(reason: AIProposalFailureReason = "unavailable", detail?: string) {
    super(detail ?? "AI service unavailable")
    this.name = "AIUnavailableError"
    this.reason = reason
  }
}

export class ProposalInvalidError extends Error {
  issues: string[]
  constructor(issues: string[]) {
    super("Proposal failed validation")
    this.name = "ProposalInvalidError"
    this.issues = issues
  }
}

export class ContextTooLargeError extends Error {
  constructor(public maxChars: number) {
    super(`Context exceeds ${maxChars} characters`)
    this.name = "ContextTooLargeError"
  }
}

/** Map an internal error to a client-safe API shape. */
export function toSafeAPIError(e: unknown): { error: string; reason?: string } {
  if (e instanceof AIUnavailableError) return { error: "AI service unavailable", reason: e.reason }
  if (e instanceof ContextTooLargeError) return { error: "Context too large", reason: "context_too_large" }
  if (e instanceof ProposalInvalidError) return { error: "Invalid proposal", reason: "invalid" }
  if (e instanceof Error) return { error: "Unexpected error" }
  return { error: "Unexpected error" }
}
