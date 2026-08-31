import { describe, it, expect } from "vitest"
import type { PhaseIntelRow, MilestoneIntelRow, QuestIntelRow } from "@/lib/goals/intelligence/metrics"
import type { GoalWithProgress } from "@/lib/goals/queries"
import { buildGoalQualityScore, qualityGrade, proposalErrorState, type UIGoalQualityRow } from "@/lib/goals/intel-ui"

const TODAY = "2026-08-15"

function goal(id: string, over: Partial<UIGoalQualityRow> = {}): UIGoalQualityRow {
  return {
    id,
    title: `Goal ${id}`,
    status: "active",
    category: "skills",
    priority: "medium",
    target_date: "2026-12-01",
    created_at: "2026-01-10",
    completed_at: null,
    description: null,
    desired_outcome: "A meaningful, measurable outcome for this goal",
    ...over,
  }
}

function phase(id: string, goalId: string, over: Partial<PhaseIntelRow & { completed_at?: string | null }> = {}): PhaseIntelRow & { completed_at?: string | null } {
  return { id, goal_id: goalId, status: "available", target_date: null, completed_at: null, ...over }
}

function milestone(id: string, phaseId: string, over: Partial<MilestoneIntelRow & { completed_at?: string | null }> = {}): MilestoneIntelRow & { completed_at?: string | null } {
  return { id, phase_id: phaseId, status: "pending", completed_at: null, ...over }
}

function quest(id: string, phaseId: string, over: Partial<QuestIntelRow & { completed_at?: string | null }> = {}): QuestIntelRow & { completed_at?: string | null } {
  return { id, phase_id: phaseId, milestone_id: null, status: "active", recurrence: "none", due_date: null, completed_at: null, ...over }
}

describe("goal intelligence UI chip — deterministic quality score", () => {
  it("computes a deterministic score without AI (explanation null, source none)", () => {
    const q = buildGoalQualityScore(goal("g1"), [phase("p1", "g1")], [], [], TODAY)
    expect(q.source).toBe("none")
    expect(q.explanation).toBeNull()
    expect(q.max).toBe(100)
    expect(q.score).toBeGreaterThanOrEqual(0)
    expect(q.score).toBeLessThanOrEqual(100)
  })

  it("rewards a stated desired outcome, target date, and decomposed journey", () => {
    const rich = buildGoalQualityScore(
      goal("g1", { desired_outcome: "A clear measurable outcome to aim for here", target_date: "2026-12-01" }),
      [phase("p1", "g1", { status: "active" })],
      [milestone("m1", "p1", { status: "completed", completed_at: "2026-08-10T09:00:00Z" })],
      [quest("q1", "p1", { completed_at: "2026-08-09T09:00:00Z" })],
      TODAY,
    )
    const bare = buildGoalQualityScore(goal("g2", { desired_outcome: null, target_date: null, created_at: TODAY }), [], [], [], TODAY)
    expect(rich.score).toBeGreaterThan(bare.score)
  })

  it("scores zero for a brand-new goal with nothing set", () => {
    const q = buildGoalQualityScore(goal("g1", { desired_outcome: null, target_date: null, created_at: TODAY, status: "draft" }), [], [], [], TODAY)
    expect(q.score).toBe(0)
  })

  it("includes breakdown rubric items with labels", () => {
    const q = buildGoalQualityScore(goal("g1"), [], [], [], TODAY)
    expect(q.rubric.length).toBeGreaterThan(0)
    expect(q.rubric[0]).toMatchObject({ max: expect.any(Number), score: expect.any(Number), label: expect.any(String) })
    expect(q.rubric.some((r) => r.label.includes("Target date"))).toBe(true)
  })
})

describe("qualityGrade", () => {
  it("labels high scores Strong", () => expect(qualityGrade(85).label).toBe("Strong"))
  it("labels mid scores Developing", () => expect(qualityGrade(50).label).toBe("Developing"))
  it("labels low scores Needs work", () => expect(qualityGrade(20).label).toBe("Needs work"))
  it("maps boundaries correctly", () => {
    expect(qualityGrade(70).tone).toBe("good")
    expect(qualityGrade(45).tone).toBe("warn")
    expect(qualityGrade(44).tone).toBe("bad")
  })
  it("handles max other than 100", () => expect(qualityGrade(7, 10).label).toBe("Strong"))
})

describe("proposalErrorState", () => {
  it("returns none for success", () => expect(proposalErrorState({ ok: true })).toEqual({ kind: "none" }))
  it("flags unavailable reasons", () => {
    expect(proposalErrorState({ ok: false, reason: "unavailable" }).kind).toBe("unavailable")
    expect(proposalErrorState({ ok: false, reason: "upstream_error" }).kind).toBe("unavailable")
    expect(proposalErrorState({ ok: false, reason: "rate_limited" }).kind).toBe("unavailable")
  })
  it("flags unavailable when flag set even with another reason", () => {
    expect(proposalErrorState({ ok: false, reason: "upstream_error", unavailable: true }).kind).toBe("unavailable")
  })
  it("maps goal_not_found and not_authenticated to friendly errors", () => {
    expect(proposalErrorState({ ok: false, reason: "goal_not_found" })).toEqual({ kind: "error", message: "This goal no longer exists." })
    expect(proposalErrorState({ ok: false, reason: "not_authenticated" })).toEqual({ kind: "error", message: "You need to be signed in." })
  })
  it("falls back to detail for unknown reasons", () => {
    expect(proposalErrorState({ ok: false, reason: "rpc_failed", detail: "boom" })).toEqual({ kind: "error", message: "boom" })
  })
})

describe("goal quality score accepts GoalWithProgress rows (UI contract)", () => {
  it("works with a GoalWithProgress-shaped object", () => {
    const row = {
      id: "gx",
      title: "Ship it",
      description: null,
      status: "active",
      category: "career",
      priority: "high",
      target_date: "2026-12-01",
      desired_outcome: "Launch the product",
      completed_at: null,
      created_at: "2026-02-01",
      phasesTotal: 2,
      phasesCompleted: 0,
      progressPct: 0,
      activePhaseTitle: null,
    } as GoalWithProgress
    const q = buildGoalQualityScore(row, [], [], [], TODAY)
    expect(q.score).toBeGreaterThanOrEqual(0)
  })
})