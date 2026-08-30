import { describe, expect, it } from "vitest"
import { computeBehaviorFacts, formatBehaviorFacts, type BehaviorQuestRow } from "@/lib/coach/behavior"

const TODAY = "2026-08-30"

function row(partial: Partial<BehaviorQuestRow> = {}): BehaviorQuestRow {
  return {
    id: "q-1",
    title: "Quest",
    difficulty: "medium",
    category: "general",
    recurrence: "none",
    status: "active",
    due_date: null,
    completed_at: null,
    postponed_count: 0,
    skipped_count: 0,
    ...partial,
  }
}

describe("computeBehaviorFacts", () => {
  it("handles an empty history", () => {
    const f = computeBehaviorFacts([], TODAY)
    expect(f.activeCount).toBe(0)
    expect(f.closedTotal).toBe(0)
    expect(f.overallCompletionRate).toBe(0)
    expect(f.closedByDifficulty).toEqual([])
  })

  it("counts activity by status", () => {
    const f = computeBehaviorFacts(
      [
        row({ id: "a", status: "active", recurrence: "none" }),
        row({ id: "b", status: "active", recurrence: "daily" }),
        row({ id: "c", status: "completed" }),
        row({ id: "d", status: "archived" }),
      ],
      TODAY
    )
    expect(f.activeCount).toBe(2)
    expect(f.activeOneTime).toBe(1)
    expect(f.activeRecurring).toBe(1)
    expect(f.closedTotal).toBe(2)
    expect(f.completedTotal).toBe(1)
    expect(f.overallCompletionRate).toBe(50)
  })

  it("computes completion rate per difficulty", () => {
    const f = computeBehaviorFacts(
      [
        row({ id: "e1", difficulty: "easy", status: "completed" }),
        row({ id: "e2", difficulty: "easy", status: "completed" }),
        row({ id: "e3", difficulty: "easy", status: "archived" }),
        row({ id: "m1", difficulty: "medium", status: "completed" }),
        row({ id: "m2", difficulty: "medium", status: "archived" }),
        row({ id: "h1", difficulty: "hard", status: "archived" }),
        row({ id: "ch1", difficulty: "challenge", status: "completed" }),
        row({ id: "c1", difficulty: "easy", status: "active" }), // not closed: ignored
      ],
      TODAY
    )
    const easy = f.closedByDifficulty.find((d) => d.difficulty === "easy")
    const med = f.closedByDifficulty.find((d) => d.difficulty === "medium")
    const hard = f.closedByDifficulty.find((d) => d.difficulty === "hard")
    const ch = f.closedByDifficulty.find((d) => d.difficulty === "challenge")

    expect(easy).toEqual({ difficulty: "easy", closed: 3, completed: 2, rate: 67 })
    expect(med).toEqual({ difficulty: "medium", closed: 2, completed: 1, rate: 50 })
    expect(hard).toEqual({ difficulty: "hard", closed: 1, completed: 0, rate: 0 })
    expect(ch).toEqual({ difficulty: "challenge", closed: 1, completed: 1, rate: 100 })
    expect(f.closedByDifficulty).toHaveLength(4)
    // closed = 3 easy + 2 med + 1 hard + 1 challenge = 7; completed = 4
    expect(f.overallCompletionRate).toBe(Math.round((4 / 7) * 100)) // 57
  })

  it("flags overdue one-time quests only", () => {
    const f = computeBehaviorFacts(
      [
        row({ id: "ov1", recurrence: "none", due_date: "2026-08-20" }), // overdue
        row({ id: "ov2", recurrence: "none", due_date: "2026-08-29" }), // yesterday -> overdue
        row({ id: "today1", recurrence: "none", due_date: "2026-08-30" }), // today -> not overdue
        row({ id: "dly1", recurrence: "daily", due_date: "2026-08-01" }), // recurring: not counted
        row({ id: "nodue", recurrence: "none", due_date: null }), // immediate -> not overdue
      ],
      TODAY
    )
    expect(f.overdueActive).toBe(2)
  })

  it("ranks most-postponed and most-skipped quests", () => {
    const f = computeBehaviorFacts(
      [
        row({ id: "p2", title: "Gym", difficulty: "hard", postponed_count: 2 }),
        row({ id: "p1", title: "Read", difficulty: "easy", postponed_count: 1 }),
        row({ id: "s3", title: "Code", difficulty: "challenge", skipped_count: 3 }),
        row({ id: "p4", title: "Meditate", postponed_count: 4 }),
        row({ id: "s1", title: "Call", difficulty: "medium", skipped_count: 1 }),
      ],
      TODAY
    )
    expect(f.mostPostponed.map((q) => q.title)).toEqual(["Meditate", "Gym", "Read"])
    expect(f.avgPostponedPerActive).toBe(7 / 5)
    expect(f.mostSkipped.map((q) => q.title)).toEqual(["Code", "Call"])
  })
})

describe("formatBehaviorFacts", () => {
  it("renders only meaningful sections", () => {
    const f = computeBehaviorFacts(
      [
        row({ id: "e1", title: "Easy one", difficulty: "easy", status: "completed" }),
        row({ id: "e2", title: "Easy two", difficulty: "easy", status: "completed" }),
        row({ id: "m1", title: "Med", difficulty: "medium", status: "archived" }),
        row({ id: "a1", title: "Active", difficulty: "hard" }),
        row({ id: "pv", title: "Procrast", difficulty: "hard", postponed_count: 3 }),
      ],
      TODAY
    )
    const text = formatBehaviorFacts(f)
    expect(text).toContain("BEHAVIOR")
    expect(text).toContain("CLOSED QUESTS: 2/3 finished (67% follow-through)")
    expect(text).toContain("POSTPONES: avg 1.5 per active quest")
    expect(text).toContain("MOST POSTPONED: \"Procrast\" (hard ×3)")
    expect(text).not.toContain("MOST SKIPPED")
  })
})