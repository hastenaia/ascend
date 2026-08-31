import { describe, expect, it } from "vitest"
import { composeContext, sanitizeForPrompt, assertContextSize, buildSafeSystemPrompt } from "./context"
import { ContextTooLargeError } from "./errors"

describe("ai/context composeContext", () => {
  it("joins sections within the cap", () => {
    const out = composeContext([
      { title: "A", body: "aaa" },
      { title: "B", body: "bbb" },
    ])
    expect(out).toContain("[A]")
    expect(out).toContain("aaa")
    expect(out).toContain("[B]")
    expect(out).toContain("bbb")
  })

  it("caps total size and clips", () => {
    const out = composeContext([{ title: "A", body: "x".repeat(200) }], { maxChars: 50, perSection: 40 })
    expect(out.length).toBeLessThanOrEqual(50)
  })

  it("limits section count", () => {
    const out = composeContext(
      [1, 2, 3, 4, 5].map((i) => ({ title: `S${i}`, body: "v" })),
      { maxSections: 2 },
    )
    expect(out).toContain("[S1]")
    expect(out).toContain("[S2]")
    expect(out).not.toContain("[S3]")
  })

  it("returns empty for no sections", () => {
    expect(composeContext([])).toBe("")
  })
})

describe("ai/context sanitizeForPrompt", () => {
  it("passes safe summaries", () => {
    expect(sanitizeForPrompt("User prefers morning workouts.")).toBe(
      "User prefers morning workouts.",
    )
  })

  it("strips raw secret-bearing text", () => {
    expect(sanitizeForPrompt("Authorization: Bearer abc123")).toBe("")
    expect(sanitizeForPrompt("x-goog-api-key: sk-123")).toBe("")
    expect(sanitizeForPrompt("password=hunter2")).toBe("")
  })

  it("strips oversized blobs", () => {
    expect(sanitizeForPrompt("a".repeat(30000))).toBe("")
  })
})

describe("ai/context assertContextSize", () => {
  it("throws when too large", () => {
    expect(() => assertContextSize("a".repeat(101), 100)).toThrow(ContextTooLargeError)
  })

  it("passes when within cap", () => {
    expect(() => assertContextSize("abc", 100)).not.toThrow()
  })
})

describe("ai/context buildSafeSystemPrompt", () => {
  it("embeds the P1 safety anchor for a bounded context", () => {
    const msg = buildSafeSystemPrompt("some context")
    expect(msg.role).toBe("system")
    expect(msg.content).toContain("some context")
    expect(msg.content).toContain("HARD SAFETY RULES")
  })

  it("prefixes additional domain instructions", () => {
    const msg = buildSafeSystemPrompt("ctx", "Propose goals only.")
    expect(msg.content).toContain("Propose goals only.")
  })
})
