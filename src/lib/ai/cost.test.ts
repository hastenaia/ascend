import { beforeEach, describe, expect, it } from "vitest"
import { assertCostGate, getCache, makeCacheKey, resetAiState, setCache, shouldUseAI } from "./cost"
import type { GatherFactsResult } from "./types"

function facts(over: Partial<GatherFactsResult> = {}): GatherFactsResult {
  return { text: "facts", signals: { a: 1 }, resolved: false, ...over }
}

beforeEach(() => resetAiState())

describe("ai/cost shouldUseAI", () => {
  it("skips the model when resolved (deterministic answer exists)", () => {
    expect(shouldUseAI(facts({ resolved: true }), "generic")).toBe(false)
  })

  it("skips when facts are empty", () => {
    expect(shouldUseAI(facts({ text: "", signals: {} }), "generic")).toBe(false)
  })

  it("skips below minSignals threshold", () => {
    expect(shouldUseAI(facts({ signals: { a: 1 } }), "generic", 5)).toBe(false)
  })

  it("proceeds when interpretation adds value", () => {
    expect(shouldUseAI(facts({ signals: { a: 1, b: 2, c: 3 } }), "goal", 3)).toBe(true)
  })
})

describe("ai/cost assertCostGate", () => {
  it("budgets per kind and window", () => {
    const g = (n: number) => Array.from({ length: n }, () => assertCostGate("u1", "generic"))
    // generic budget = 8
    expect(g(8).every((b) => b === false)).toBe(true)
    expect(assertCostGate("u1", "generic")).toBe(true)
  })

  it("tracks users independently", () => {
    for (let i = 0; i < 20; i++) assertCostGate("u2", "goal")
    expect(assertCostGate("u3", "goal")).toBe(false)
  })
})

describe("ai/cost cache", () => {
  it("set/get round trip within TTL", () => {
    setCache("k", { ok: true, proposal: "x" }, 1000)
    expect(getCache("k")).toEqual({ ok: true, proposal: "x" })
  })

  it("expires", () => {
    setCache("k2", 1, -1)
    expect(getCache("k2")).toBeNull()
  })
})

describe("ai/cost makeCacheKey", () => {
  it("is deterministic + scoped", () => {
    expect(makeCacheKey("u", "goal", "facts")).toBe(makeCacheKey("u", "goal", "facts"))
    expect(makeCacheKey("u", "goal", "facts")).not.toBe(makeCacheKey("u2", "goal", "facts"))
    expect(makeCacheKey("u", "goal", "facts")).not.toBe(makeCacheKey("u", "goal", "other"))
  })
})
