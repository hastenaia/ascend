import { describe, it, expect } from "vitest"
import { computeBehaviorFacts, type BehaviorFacts, type BehaviorQuestRow } from "@/lib/coach/behavior"
import { detectPatterns, PATTERN_THRESHOLDS } from "@/lib/patterns/engine"
import { bucketCompletionsPerWeek } from "@/lib/patterns/gather"

function quest(id: string, over: Partial<BehaviorQuestRow> = {}): BehaviorQuestRow {
  return {
    id,
    title: `Quest ${id}`,
    difficulty: "medium",
    category: "general",
    recurrence: "none",
    status: "active",
    due_date: "2026-08-10",
    completed_at: null,
    postponed_count: 0,
    skipped_count: 0,
    ...over,
  }
}

function facts(rows: BehaviorQuestRow[]): BehaviorFacts {
  return computeBehaviorFacts(rows)
}

const CATEGORIES = [
  { category: "intellect", active: 2, closed: 6, completed: 5 },
  { category: "physical", active: 1, closed: 4, completed: 4 },
]

const STEADY_WEEKS = [3, 4, 5, 4, 3]

function input(partial: Partial<{ facts: BehaviorFacts; categories: typeof CATEGORIES; activeGoalCount: number; completionsPerWeek: number[] }> = {}) {
  return {
    facts: facts([
      quest("a", { difficulty: "easy", status: "completed", recurrence: "none" }),
      quest("b", { difficulty: "medium", status: "completed" }),
    ]),
    categories: CATEGORIES,
    activeGoalCount: 2,
    completionsPerWeek: STEADY_WEEKS,
    ...partial,
  }
}

describe("difficulty_avoidance", () => {
  it("fires when hard follow-through collapses vs an easier band", () => {
    const f = facts([
      quest("e1", { difficulty: "easy", status: "completed" }),
      quest("e2", { difficulty: "easy", status: "completed" }),
      quest("e3", { difficulty: "easy", status: "completed" }),
      quest("e4", { difficulty: "easy", status: "completed" }),
      quest("e5", { difficulty: "easy", status: "completed" }),
      quest("e6", { difficulty: "easy", status: "archived" }),
      quest("h1", { difficulty: "hard", status: "completed" }),
      quest("h2", { difficulty: "hard", status: "archived" }),
      quest("h3", { difficulty: "hard", status: "archived" }),
      quest("h4", { difficulty: "hard", status: "archived" }),
    ])
    const patterns = detectPatterns(input({ facts: f }))
    const p = patterns.find((x) => x.type === "difficulty_avoidance")
    expect(p).toBeDefined()
    expect(p?.severity).toBe("warning")
    expect(p?.evidence.join(" ")).toMatch(/easy/)
    expect(p?.evidence.join(" ")).toMatch(/hard/)
    expect(p?.evidence.join(" ")).toMatch(/\d+%/)
  })

  it("does not fire when hard quests are completed at a healthy rate", () => {
    const f = facts([
      quest("e1", { difficulty: "easy", status: "completed" }),
      quest("e2", { difficulty: "medium", status: "completed" }),
      quest("h1", { difficulty: "hard", status: "completed" }),
      quest("h2", { difficulty: "hard", status: "completed" }),
      quest("h3", { difficulty: "hard", status: "completed" }),
      quest("h4", { difficulty: "hard", status: "archived" }),
    ])
    const patterns = detectPatterns(input({ facts: f }))
    expect(patterns.find((x) => x.type === "difficulty_avoidance")).toBeUndefined()
  })

  it("does not fire with too little difficulty history", () => {
    const f = facts([quest("h1", { difficulty: "hard", status: "archived" })])
    const patterns = detectPatterns(input({ facts: f }))
    expect(patterns.find((x) => x.type === "difficulty_avoidance")).toBeUndefined()
  })
})

describe("postponement & skipping", () => {
  it("fires repeated postponement at the threshold", () => {
    const f = facts([quest("p", { postponed_count: PATTERN_THRESHOLDS.postponeCount })])
    const patterns = detectPatterns(input({ facts: f }))
    const p = patterns.find((x) => x.type === "repeated_postponement")
    expect(p).toBeDefined()
    expect(p?.evidence[0]).toContain("postponed")
  })

  it("does not fire for a single postpone", () => {
    const f = facts([quest("p", { postponed_count: 1 })])
    const patterns = detectPatterns(input({ facts: f }))
    expect(patterns.find((x) => x.type === "repeated_postponement")).toBeUndefined()
  })

  it("fires repeated skipping at the threshold", () => {
    const f = facts([quest("s", { skipped_count: PATTERN_THRESHOLDS.skipCount })])
    const patterns = detectPatterns(input({ facts: f }))
    expect(patterns.find((x) => x.type === "repeated_skipping")).toBeDefined()
  })

  it("does not fire skipping below the threshold", () => {
    const f = facts([quest("s", { skipped_count: 2 })])
    const patterns = detectPatterns(input({ facts: f }))
    expect(patterns.find((x) => x.type === "repeated_skipping")).toBeUndefined()
  })
})

describe("consistency changes", () => {
  it("detects declining consistency", () => {
    const patterns = detectPatterns(input({ completionsPerWeek: [6, 5, 7, 4, 2] }))
    const p = patterns.find((x) => x.type === "declining_consistency")
    expect(p).toBeDefined()
    expect(p?.severity).toBe("warning")
    expect(p?.evidence[0]).toMatch(/completions per week/)
  })

  it("detects improving consistency", () => {
    const patterns = detectPatterns(input({ completionsPerWeek: [2, 2, 3, 6, 8] }))
    const p = patterns.find((x) => x.type === "improving_consistency")
    expect(p).toBeDefined()
    expect(p?.severity).toBe("info")
  })

  it("does not flag consistency without enough history", () => {
    const patterns = detectPatterns(input({ completionsPerWeek: [1, 2] }))
    expect(patterns.find((x) => x.type === "declining_consistency")).toBeUndefined()
    expect(patterns.find((x) => x.type === "improving_consistency")).toBeUndefined()
  })

  it("drops low_quest_velocity when declining_consistency already fired (no duplicated feedback)", () => {
    const patterns = detectPatterns(input({ completionsPerWeek: [7, 8, 6, 2, 1] }))
    expect(patterns.find((x) => x.type === "declining_consistency")).toBeDefined()
    expect(patterns.find((x) => x.type === "low_quest_velocity")).toBeUndefined()
  })
})

describe("other patterns", () => {
  it("detects overdue accumulation", () => {
    const rows = [1, 2, 3].map((n) => quest(`o${n}`, { recurrence: "none", due_date: "2026-07-01" }))
    const patterns = detectPatterns(input({ facts: facts(rows) }))
    expect(patterns.find((x) => x.type === "overdue_accumulation")).toBeDefined()
  })

  it("detects low follow-through on meaningful history", () => {
    const rows = [
      quest("d1", { status: "completed" }),
      ...Array.from({ length: 5 }, (_, n) => quest(`arch${n}`, { status: "archived" })),
    ]
    const patterns = detectPatterns(input({ facts: facts(rows), completionsPerWeek: [1, 1, 1, 1, 0] }))
    expect(patterns.find((x) => x.type === "low_follow_through")).toBeDefined()
  })

  it("detects excessive active goals", () => {
    const patterns = detectPatterns(input({ activeGoalCount: 6 }))
    expect(patterns.find((x) => x.type === "excessive_active_goals")).toBeDefined()
  })

  it("detects neglected categories only when there is completion history", () => {
    const categories = [
      { category: "business", active: 2, closed: 4, completed: 4 },
      { category: "craft", active: 2, closed: 0, completed: 0 },
    ]
    const patterns = detectPatterns(input({ categories }));
    const p = patterns.find((x) => x.type === "neglected_categories")
    expect(p).toBeDefined()
    expect(p?.evidence[0]).toMatch(/craft/)
  })

  it("does not flag neglected categories for a new user with no history", () => {
    const categories = [{ category: "craft", active: 2, closed: 0, completed: 0 }]
    const patterns = detectPatterns(input({ categories }))
    expect(patterns.find((x) => x.type === "neglected_categories")).toBeUndefined()
  })
})

describe("no-pattern situations", () => {
  it("returns no patterns for a balanced, consistent user", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, n) => quest(`easy${n}`, { difficulty: "easy", status: "completed" })),
      ...Array.from({ length: 3 }, (_, n) => quest(`med${n}`, { difficulty: "medium", status: "completed" })),
      quest("active1", { difficulty: "easy", due_date: "2026-09-01" }),
    ]
    const patterns = detectPatterns(
      input({
        facts: facts(rows),
        categories: [
          { category: "intellect", active: 1, closed: 4, completed: 4 },
          { category: "physical", active: 1, closed: 3, completed: 3 },
        ],
        activeGoalCount: 1,
        completionsPerWeek: [4, 5, 4, 5, 2],
      }),
    )
    expect(patterns).toEqual([])
  })
})

describe("bucketCompletionsPerWeek", () => {
  it("buckets completions into the supplied ISO week keys", () => {
    const keys = bucketCompletionsPerWeek(["2026-08-10T10:00:00Z", "2026-08-12T10:00:00Z", "2026-08-03T10:00:00Z"], ["2026-W32", "2026-W33"])
    expect(keys).toEqual([1, 2])
  })
})