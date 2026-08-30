import { describe, it, expect } from "vitest"
import { computeWeeklyMetrics, isoWeekWindow, previousWeekWindow, type WeekData } from "@/lib/weekly/metrics"

const WINDOW = { start: "2026-08-10", end: "2026-08-16" }

const emptyWeek: WeekData = {
  window: WINDOW,
  completions: [],
  plannedQuests: [],
  postponeDelays: [],
  skipEvents: 0,
  adaptEvents: 0,
  xpDelta: 0,
  momentumStart: 0,
  momentumNow: 0,
  bestStreak: 0,
  statDeltas: [],
  skillDeltas: [],
  milestonesCompleted: 0,
  goalsAdvanced: 0,
}

describe("computeWeeklyMetrics", () => {
  it("computes the headline numbers for a full week", () => {
    const m = computeWeeklyMetrics({
      ...emptyWeek,
      completions: [
        { questId: "a", difficulty: "easy", category: "intellect", at: "2026-08-11T10:00:00Z" },
        { questId: "b", difficulty: "easy", category: "intellect", at: "2026-08-12T10:00:00Z" },
        { questId: "c", difficulty: "medium", category: "work", at: "2026-08-13T10:00:00Z" },
        { questId: "d", difficulty: "hard", category: "work", at: "2026-08-14T10:00:00Z" },
      ],
      plannedQuests: [
        { id: "a", difficulty: "easy", recurrence: "none" },
        { id: "b", difficulty: "easy", recurrence: "none" },
        { id: "c", difficulty: "medium", recurrence: "none" },
        { id: "d", difficulty: "hard", recurrence: "none" },
        { id: "e", difficulty: "hard", recurrence: "weekly" },
      ],
      postponeDelays: [1, 2],
      skipEvents: 1,
      adaptEvents: 1,
      xpDelta: 420,
      momentumStart: 50,
      momentumNow: 54,
      bestStreak: 6,
      statDeltas: [{ name: "Mental", delta: 4 }],
      skillDeltas: [{ name: "Programming", delta: 40 }],
      milestonesCompleted: 1,
      goalsAdvanced: 1,
    })

    expect(m.questsCompleted).toBe(4)
    expect(m.questsPlanned).toBe(5)
    expect(m.completionRate).toBe(80)
    expect(m.postponed).toBe(2)
    expect(m.avgDelayDays).toBe(1.5)
    expect(m.skipped).toBe(1)
    expect(m.adapts).toBe(1)
    expect(m.xpEarned).toBe(420)
    expect(m.momentumDeltaPct).toBe(8)
    expect(m.momentumDeltaPts).toBe(4)
    expect(m.bestStreak).toBe(6)
    expect(m.milestonesCompleted).toBe(1)
    expect(m.goalsAdvanced).toBe(1)

    const easy = m.difficultyPerformance.find((d) => d.difficulty === "easy")
    expect(easy).toEqual({ difficulty: "easy", completed: 2, planned: 2, rate: 100 })
    const hard = m.difficultyPerformance.find((d) => d.difficulty === "hard")
    expect(hard?.planned).toBe(2)
    expect(hard?.rate).toBe(50)
  })

  it("handles an empty week gracefully (rate 0, no NaN)", () => {
    const m = computeWeeklyMetrics(emptyWeek, "2026-08-16")
    expect(m.questsCompleted).toBe(0)
    expect(m.questsPlanned).toBe(0)
    expect(m.completionRate).toBe(0)
    expect(m.avgDelayDays).toBe(0)
    expect(m.xpEarned).toBe(0)
    expect(m.momentumDeltaPct).toBeNull()
    expect(m.difficultyPerformance).toEqual([])
  })

  it("marks an in-progress week as partial", () => {
    const m = computeWeeklyMetrics({ ...emptyWeek, completions: [], plannedQuests: [] }, "2026-08-14")
    expect(m.isPartialWeek).toBe(true)
  })

  it("treats a completed past week as not partial", () => {
    const m = computeWeeklyMetrics({ ...emptyWeek, window: { start: "2026-08-03", end: "2026-08-09" } } as WeekData, "2026-08-16")
    expect(m.isPartialWeek).toBe(false)
  })

  it("computes a negative momentum delta honestly", () => {
    const m = computeWeeklyMetrics({ ...emptyWeek, momentumStart: 50, momentumNow: 42 })
    expect(m.momentumDeltaPct).toBe(-16)
    expect(m.momentumDeltaPts).toBe(-8)
  })

  it("cleans empty postpone delays to 0 average", () => {
    const m = computeWeeklyMetrics({ ...emptyWeek, postponeDelays: [] })
    expect(m.postponed).toBe(0)
    expect(m.avgDelayDays).toBe(0)
  })
})

describe("week window helpers", () => {
  it("isoWeekWindow returns Monday–Sunday for a given date", () => {
    const win = isoWeekWindow(new Date(2026, 7, 13)) // Thu 2026-08-13
    expect(win).toEqual({ start: "2026-08-10", end: "2026-08-16" })
  })

  it("previousWeekWindow shifts back exactly one week", () => {
    expect(previousWeekWindow({ start: "2026-08-10", end: "2026-08-16" })).toEqual({ start: "2026-08-03", end: "2026-08-09" })
  })
})