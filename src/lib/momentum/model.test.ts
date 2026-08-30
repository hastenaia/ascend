import { describe, expect, it } from "vitest"
import {
  FULL_DAY_POINTS,
  MOMENTUM_DECAY,
  MOMENTUM_WINDOW_DAYS,
  RECOVERY_DAY_POINTS,
  computeMomentumScore,
  momentumDayPoints,
  momentumTiers,
  projectedTomorrowScore,
  type MomentumDayRow,
} from "@/lib/momentum/model"

const AS_OF = "2026-08-30"

function dayAtOffset(offset: number, score: number, recovery = false): MomentumDayRow {
  const d = new Date(AS_OF + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - offset)
  return { date: d.toISOString().slice(0, 10), score, recovery }
}

describe("momentumDayPoints", () => {
  it("gives full points to a full-scoring day today", () => {
    expect(momentumDayPoints(dayAtOffset(0, 20), AS_OF)).toBe(FULL_DAY_POINTS)
  })

  it("scales lighter days proportionally", () => {
    // half of FULL_DAY_SCORE -> half of FULL_DAY_POINTS, age 0 weight 1
    expect(momentumDayPoints(dayAtOffset(0, 7.5), AS_OF)).toBeCloseTo(FULL_DAY_POINTS * 0.5, 5)
  })

  it("credits a rest day at the recovery floor", () => {
    expect(momentumDayPoints(dayAtOffset(0, 0, true), AS_OF)).toBe(RECOVERY_DAY_POINTS)
  })

  it("decays past days by MOMENTUM_DECAY per day of age", () => {
    expect(momentumDayPoints(dayAtOffset(1, 20), AS_OF)).toBeCloseTo(FULL_DAY_POINTS * MOMENTUM_DECAY, 5)
  })

  it("ignores days outside the window and in the future", () => {
    expect(momentumDayPoints(dayAtOffset(MOMENTUM_WINDOW_DAYS, 20), AS_OF)).toBe(0)
    expect(momentumDayPoints(dayAtOffset(-1, 20), AS_OF)).toBe(0)
  })
})

describe("computeMomentumScore", () => {
  it("scores 0 with no activity", () => {
    expect(computeMomentumScore([], AS_OF)).toBe(0)
  })

  it("clamps a 21-day perfect streak at 100", () => {
    const streak = Array.from({ length: MOMENTUM_WINDOW_DAYS }, (_, i) => dayAtOffset(i, 20))
    expect(computeMomentumScore(streak, AS_OF)).toBe(100)
  })

  it("scores a single full day as 20", () => {
    expect(computeMomentumScore([dayAtOffset(0, 20)], AS_OF)).toBe(20)
  })
})

describe("projectedTomorrowScore", () => {
  it("shows a gentle decay with no activity tomorrow", () => {
    const rows = [dayAtOffset(0, 20)]
    const tomorrow = projectedTomorrowScore(rows, AS_OF)
    const today = computeMomentumScore(rows, AS_OF)
    expect(tomorrow).toBeLessThan(today)
    expect(tomorrow).toBe(Math.round(FULL_DAY_POINTS * MOMENTUM_DECAY))
  })
})

describe("momentumTiers", () => {
  it("labels boundary scores correctly", () => {
    expect(momentumTiers(0).label).toBe("Resting")
    expect(momentumTiers(24).label).toBe("Warming up")
    expect(momentumTiers(25).label).toBe("Building")
    expect(momentumTiers(69).label).toBe("Steady")
    expect(momentumTiers(84).label).toBe("Strong")
    expect(momentumTiers(85).label).toBe("Peak flow")
  })
})