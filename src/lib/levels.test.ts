import { describe, expect, it } from "vitest"
import { MAX_LEVEL, levelFromXp, levelProgress, xpForLevel } from "@/lib/levels"

describe("xpForLevel", () => {
  it("returns 0 for level 1 and below", () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(0)).toBe(0)
    expect(xpForLevel(-3)).toBe(0)
  })

  it("increases strictly between consecutive levels", () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l))
    }
  })
})

describe("levelFromXp", () => {
  it("starts at level 1", () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(24)).toBe(1)
  })

  it("hits exact level boundaries", () => {
    expect(levelFromXp(25)).toBe(2) // xpForLevel(2) = 25
    expect(levelFromXp(127)).toBe(3) // xpForLevel(3) = round(25 * 2^2.35)
  })

  it("is consistent with xpForLevel boundaries", () => {
    for (let l = 2; l <= MAX_LEVEL - 1; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l)
      expect(levelFromXp(xpForLevel(l) - 1)).toBe(l - 1)
    }
  })

  it("caps at MAX_LEVEL", () => {
    expect(levelFromXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL)
  })
})

describe("levelProgress", () => {
  it("reports the empty state at 0 XP", () => {
    const p = levelProgress(0)
    expect(p.level).toBe(1)
    expect(p.totalXp).toBe(0)
    expect(p.xpToNext).toBe(25)
    expect(p.intoLevel).toBe(0)
    expect(p.progressPct).toBe(0)
  })

  it("computes partial progress below a boundary", () => {
    const floor = xpForLevel(2)
    const ceiling = xpForLevel(3)
    const into = Math.floor((ceiling - floor) / 2)
    const p = levelProgress(floor + into)
    expect(p.level).toBe(2)
    expect(p.intoLevel).toBe(into)
    expect(p.progressPct).toBeGreaterThan(0)
    expect(p.progressPct).toBeLessThan(100)
    expect(p.xpToNext).toBe(ceiling - (floor + into))
  })

  it("caps progress at 100 for MAX_LEVEL", () => {
    const p = levelProgress(Number.MAX_SAFE_INTEGER)
    expect(p.level).toBe(MAX_LEVEL)
    expect(p.progressPct).toBe(100)
    expect(p.xpToNext).toBe(0)
  })
})