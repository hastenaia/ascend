import { describe, it, expect } from "vitest"
import {
  detectGoalConflicts,
  normalizeTitle,
  tokenJaccard,
  isNearDuplicate,
  activeWindow,
  windowOverlapDays,
} from "@/lib/goals/intelligence/conflicts"
import type { GoalConflictGoal } from "@/lib/goals/intelligence/conflicts"

const TODAY = "2026-08-30"

function g(row: Partial<GoalConflictGoal>): GoalConflictGoal {
  return {
    id: "g-" + Math.random().toString(36).slice(2, 8),
    title: "Untitled",
    status: "active",
    category: "health",
    priority: "medium",
    target_date: null,
    created_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    ...row,
  }
}

describe("normalizeTitle / tokenJaccard / isNearDuplicate", () => {
  it("normalizes case, punctuation and whitespace", () => {
    expect(normalizeTitle("  Run a 5K,   Every Week! ")).toBe("run a 5k every week")
  })
  it("identical titles are near-duplicates with similarity 1", () => {
    const r = isNearDuplicate("Lose 10 pounds", "lose 10 pounds!")
    expect(r.duplicate).toBe(true)
    expect(r.similarity).toBe(1)
  })
  it("one title contained in another is a near-duplicate", () => {
    expect(isNearDuplicate("Get fit", "Get fit this summer").duplicate).toBe(true)
  })
  it("high token overlap is a near-duplicate", () => {
    expect(isNearDuplicate("Learn Python", "Learn Python deeply").duplicate).toBe(true)
  })
  it("distinct goals are not duplicates", () => {
    expect(isNearDuplicate("Learn Python", "Run a marathon").duplicate).toBe(false)
  })
  it("tokenJaccard is symmetric and bounded", () => {
    const a = "Learn Python"
    const b = "Learn Python deeply"
    expect(tokenJaccard(a, b)).toBe(tokenJaccard(b, a))
    expect(tokenJaccard(a, b)).toBeGreaterThan(0)
    expect(tokenJaccard(a, b)).toBeLessThanOrEqual(1)
  })
})

describe("activeWindow / windowOverlapDays", () => {
  it("window with a target ends at target; without ends open", () => {
    const wTarget = activeWindow(g({ created_at: "2026-01-01T00:00:00Z", target_date: "2026-12-31" }), TODAY)
    expect(wTarget.end).toBe("2026-12-31")
    const wOpen = activeWindow(g({ created_at: "2026-01-01T00:00:00Z", target_date: null }), TODAY)
    expect(wOpen.end).toBeNull()
  })
  it("overlapping windows yield days; non-overlapping yield null", () => {
    expect(windowOverlapDays({ start: "2026-01-01", end: null }, { start: "2026-01-01", end: "2026-06-01" }, TODAY)).not.toBeNull()
    expect(windowOverlapDays({ start: "2026-01-01", end: "2026-02-01" }, { start: "2026-03-01", end: "2026-04-01" }, TODAY)).toBeNull()
  })
  it("open window overlaps any active window today", () => {
    expect(windowOverlapDays({ start: "2026-01-01", end: null }, { start: "2026-08-01", end: "2026-08-31" }, TODAY)).not.toBeNull()
  })
})

describe("detectGoalConflicts", () => {
  it("returns nothing for empty input", () => {
    expect(detectGoalConflicts([], TODAY)).toEqual([])
  })

  it("ignores archived and completed goals", () => {
    const a = g({ title: "Learn Python", status: "archived", priority: "critical" })
    const b = g({ title: "Learn Python", status: "completed", priority: "critical" })
    expect(detectGoalConflicts([a, b], TODAY)).toEqual([])
  })

  it("does not claim conflict for goals sharing a category without priority overlap", () => {
    const a = g({ title: "Run a 5K", category: "health", priority: "low" })
    const b = g({ title: "Eat healthier", category: "health", priority: "low" })
    expect(detectGoalConflicts([a, b], TODAY)).toEqual([])
  })

  it("detects near-duplicate goal titles", () => {
    const a = g({ title: "Learn Python" })
    const b = g({ title: "Learn Python!  " })
    const res = detectGoalConflicts([a, b], TODAY)
    expect(res).toHaveLength(1)
    expect(res[0].reasons[0].type).toBe("near_duplicate")
  })

  it("surface an ordered pair (A vs B) once with the strongest reason first", () => {
    const a = g({ title: "Become a software engineer", priority: "critical", category: "career" })
    const b = g({ title: "Become a software engineer", priority: "critical", category: "career" })
    const res = detectGoalConflicts([a, b], TODAY)
    expect(res).toHaveLength(1)
    expect(res[0].reasons[0].type).toBe("near_duplicate")
  })

  it("detects category + time-window overlap only when both are high/critical", () => {
    const a = g({ title: "Train for a marathon", category: "health", priority: "high", target_date: "2026-12-01" })
    const b = g({ title: "Eat healthier", category: "health", priority: "critical" })
    const res = detectGoalConflicts([a, b], TODAY)
    const reason = res.find((c) => c.reasons.some((r) => r.type === "category_time_overlap"))
    expect(reason).toBeDefined()
    expect(res[0].reasons).toContainEqual(
      expect.objectContaining({ type: "category_time_overlap", category: "health" }),
    )
  })

  it("does not fire category overlap for high-priority goals in different categories", () => {
    const a = g({ title: "Train for a marathon", category: "health", priority: "critical" })
    const b = g({ title: "Get promoted", category: "career", priority: "critical" })
    const res = detectGoalConflicts([a, b], TODAY)
    expect(res.some((c) => c.reasons.some((r) => r.type === "category_time_overlap"))).toBe(false)
  })

  it("detects priority clash between two critical goals regardless of category", () => {
    const a = g({ title: "Run a marathon", category: "health", priority: "critical" })
    const b = g({ title: "Get promoted", category: "career", priority: "critical" })
    const res = detectGoalConflicts([a, b], TODAY)
    expect(res.some((c) => c.reasons.some((r) => r.type === "priority_clash"))).toBe(true)
  })

  it("detects priority clash between critical and high", () => {
    const a = g({ title: "Run a marathon", category: "health", priority: "critical" })
    const b = g({ title: "Learn guitar", category: "creative", priority: "high" })
    const res = detectGoalConflicts([a, b], TODAY)
    expect(res.some((c) => c.reasons.some((r) => r.type === "priority_clash"))).toBe(true)
  })

  it("does not emit a conflict when active windows do not overlap (non-conflicting goals)", () => {
    // a: created Jan, target -> Feb (expired; window ends far past? target < today => open)
    // Force non-overlap: both windows done in the past, no overlap.
    const a = g({ title: "Learn Python", priority: "critical", created_at: "2026-01-01T00:00:00Z", target_date: "2026-02-01" })
    const b = g({ title: "Learn Python", priority: "critical", created_at: "2026-03-01T00:00:00Z", target_date: "2026-04-01" })
    // Both ends (2026-02-01, 2026-04-01) < today -> windows are open by our rule;
    // an open window overlaps. To exercise the null-overlap path use a second
    // today earlier than both.
    const res = detectGoalConflicts([a, b], "2026-01-10")
    expect(res).toEqual([])
  })
})
