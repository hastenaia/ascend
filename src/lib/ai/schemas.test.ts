import { describe, expect, it } from "vitest"
import { boundedString, cleanString, boundedInt, cleanArray, proposalWrapper } from "./schemas"

describe("ai/schemas boundedString", () => {
  it("trims and accepts a valid string", () => {
    const s = boundedString(1, 100)
    expect(s.parse("  hello  ")).toBe("hello")
  })

  it("rejects empty", () => {
    const s = boundedString(1, 100)
    expect(s.safeParse("   ").success).toBe(false)
  })

  it("rejects oversized", () => {
    const s = boundedString(1, 5)
    expect(s.safeParse("abcdef").success).toBe(false)
  })
})

describe("ai/schemas cleanString", () => {
  it("normalizes null/undefined to empty", () => {
    const s = cleanString(100)
    expect(s.parse(null)).toBe("")
    expect(s.parse(undefined)).toBe("")
  })

  it("trims and caps length", () => {
    const s = cleanString(3)
    expect(s.parse("  abcdef  ")).toBe("abc")
  })
})

describe("ai/schemas boundedInt", () => {
  it("accepts bounded int, nulls others", () => {
    const s = boundedInt(5, 90)
    expect(s.parse(30)).toBe(30)
    expect(s.parse(null)).toBe(null)
    expect(s.parse(undefined)).toBe(null)
    expect(s.parse(200)).toBeNull()
  })
})

describe("ai/schemas cleanArray", () => {
  it("filters + caps", () => {
    const out = cleanArray([1, "x", 2, "y", 3, 4], (v): v is number => typeof v === "number", 2)
    expect(out).toEqual([1, 2])
  })

  it("returns [] for non-array", () => {
    expect(cleanArray(undefined, () => true, 5)).toEqual([])
  })
})

describe("ai/schemas proposalWrapper", () => {
  it("wraps a payload", () => {
    const W = proposalWrapper(boundedString(1, 50))
    expect(W.parse({ proposal: "x" }).proposal).toBe("x")
    expect(W.safeParse({ proposal: "" }).success).toBe(false)
  })
})
