import { describe, it, expect } from "vitest"
import { recommendNextAction, type CandidateQuest, type NextActionInput } from "@/lib/coach/next-action"

function q(id: string, over: Partial<CandidateQuest> = {}): CandidateQuest {
  return {
    id,
    title: `Quest ${id}`,
    category: "general",
    difficulty: "medium",
    recurrence: "none",
    due_date: null,
    phase_id: null,
    milestone_id: null,
    postponed_count: 0,
    skipped_count: 0,
    ...over,
  }
}

function input(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    quests: [],
    today: "2026-08-15",
    currentPhase: null,
    nextMilestone: null,
    phasePriority: {},
    avoidHard: false,
    ...over,
  }
}

describe("next best action", () => {
  it("returns null when there are no open quests", () => {
    expect(recommendNextAction(input())).toBeNull()
  })

  it("prioritizes an overdue quest over one due tomorrow", () => {
    const action = recommendNextAction(
      input({
        quests: [q("a", { due_date: "2026-08-16" }), q("b", { due_date: "2026-08-10" })],
      }),
    )
    expect(action?.quest.id).toBe("b")
    expect(action?.kind).toBe("complete")
    expect(action?.dueLabel).toBe("overdue since 2026-08-10")
  })

  it("prioritizes due today over a far-future due date", () => {
    const action = recommendNextAction(
      input({
        quests: [q("a", { due_date: null }), q("b", { due_date: "2026-09-01" })],
      }),
    )
    expect(action?.quest.id).toBe("a")
    expect(action?.dueLabel).toBe("no due date set")
  })

  it("milestone + critical-priority beats a low-priority due-today quest", () => {
    const action = recommendNextAction(
      input({
        quests: [
          q("a", { due_date: "2026-08-15", phase_id: "p1", milestone_id: "m1" }),
          q("b", { due_date: "2026-08-15", phase_id: "p2" }),
        ],
        currentPhase: { id: "p1", title: "Phase One" },
        nextMilestone: { id: "m1", title: "Milestone One" },
        phasePriority: { p1: "critical", p2: "low" },
      }),
    )
    expect(action?.quest.id).toBe("a")
  })

  it("references the milestone and priority in the why", () => {
    const action = recommendNextAction(
      input({
        quests: [q("a", { due_date: "2026-08-15", phase_id: "p1", milestone_id: "m1" })],
        currentPhase: { id: "p1", title: "Phase One" },
        nextMilestone: { id: "m1", title: "Milestone One" },
        phasePriority: { p1: "high" },
      }),
    )
    expect(action?.why.join(" ")).toContain("Milestone One")
    expect(action?.why.join(" ")).toContain("high-priority")
  })

  it("recommends adapting a chronically postponed quest instead of forcing it", () => {
    const action = recommendNextAction(
      input({
        quests: [q("java", { postponed_count: 5, due_date: "2026-08-15" }), q("clean", { due_date: "2026-09-20" })],
      }),
    )
    expect(action?.quest.id).toBe("java")
    expect(action?.kind).toBe("adapt")
    expect(action?.why.join(" ")).toContain("postponed 5 times")
  })

  it("prefers a smaller task when the user shows difficulty avoidance", () => {
    const withAvoidance = recommendNextAction(
      input({
        quests: [q("easy1", { difficulty: "easy", due_date: "2026-08-13" }), q("hard1", { difficulty: "hard", due_date: "2026-08-12" })],
        avoidHard: true,
      }),
    )
    expect(withAvoidance?.quest.id).toBe("easy1")

    const withoutAvoidance = recommendNextAction(
      input({
        quests: [q("easy1", { difficulty: "easy", due_date: "2026-08-13" }), q("hard1", { difficulty: "hard", due_date: "2026-08-12" })],
        avoidHard: false,
      }),
    )
    // more overdue wins when not steering toward small tasks
    expect(withoutAvoidance?.quest.id).toBe("hard1")
  })

  it("handles multiple goals without error and resolves a single winner", () => {
    const action = recommendNextAction(
      input({
        quests: [
          q("b1", { due_date: "2026-08-20", phase_id: "pb", milestone_id: "mb" }),
          q("g1", { due_date: "2026-08-18", phase_id: "pg", milestone_id: "mg" }),
        ],
        nextMilestone: { id: "mg", title: "Milestone G" },
        phasePriority: { pg: "critical", pb: "medium" },
      }),
    )
    expect(action).not.toBeNull()
    expect(action?.quest.id).toBe("g1")
  })
})