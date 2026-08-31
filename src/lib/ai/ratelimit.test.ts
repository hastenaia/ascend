import { describe, expect, it } from "vitest"
import { rateLimited } from "./ratelimit"
import { rateLimited as p1RateLimited } from "@/lib/coach/ratelimit"

describe("ai/ratelimit (re-export of P1)", () => {
  it("shares the identical P1 implementation", () => {
    expect(rateLimited).toBe(p1RateLimited)
  })

  it("allows a first request and rejects no ones", () => {
    // unique key so this never trips the shared window
    expect(rateLimited(`ai-ratelimit-test:${Math.random()}`)).toBe(false)
  })
})
