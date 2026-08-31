import { describe, expect, it } from "vitest"
import { AIUnavailableError, ContextTooLargeError, ProposalInvalidError, toSafeAPIError } from "./errors"

describe("ai/errors toSafeAPIError", () => {
  it("maps AIUnavailableError safely", () => {
    expect(toSafeAPIError(new AIUnavailableError("no_key"))).toEqual({
      error: "AI service unavailable",
      reason: "no_key",
    })
  })

  it("maps ContextTooLargeError", () => {
    expect(toSafeAPIError(new ContextTooLargeError(100))).toEqual({
      error: "Context too large",
      reason: "context_too_large",
    })
  })

  it("maps ProposalInvalidError", () => {
    expect(toSafeAPIError(new ProposalInvalidError(["a"]))).toEqual({
      error: "Invalid proposal",
      reason: "invalid",
    })
  })

  it("never leaks unexpected internals", () => {
    expect(toSafeAPIError(new Error("secret db password=abc"))).toEqual({ error: "Unexpected error" })
  })
})
