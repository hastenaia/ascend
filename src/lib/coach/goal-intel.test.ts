import { describe, it, expect } from "vitest"
import {
  buildGoalIntel,
  formatGoalIntelligence,
  formatGoalIntelLine,
  summarizeGoalIntel,
  type CoachGoalRow,
  type CoachMilestoneRow,
  type CoachPhaseRow,
  type CoachQuestRow,
} from "@/lib/coach/goal-intel"

const TODAY = "2026-08-15"

function goal(id: string, over: Partial<CoachGoalRow> = {}): CoachGoalRow {
  return {
    id,
    title: `Goal ${id}`,
    status: "active",
    category: "skills",
    priority: "medium",
    target_date: "2026-12-01",
    created_at: "2026-01-10",
    completed_at: null,
    ...over,
  }
}

function phase(id: string, goalId: string, over: Partial<CoachPhaseRow> = {}): CoachPhaseRow {
  return { id, goal_id: goalId, status: "available", title: `Phase ${id}`, target_date: null, completed_at: null, ...over }
}

function milestone(id: string, phaseId: string, over: Partial<CoachMilestoneRow> = {}): CoachMilestoneRow {
  return { id, phase_id: phaseId, status: "pending", completed_at: null, ...over }
}

function quest(id: string, phaseId: string, over: Partial<CoachQuestRow> = {}): CoachQuestRow {
  return {
    id,
    phase_id: phaseId,
    milestone_id: null,
    status: "active",
    recurrence: "none",
    due_date: null,
    completed_at: null,
    ...over,
  }
}

describe("coach goal intelligence formatting", () => {
  it("emits the GOAL INTELLIGENCE header and one line per non-archived goal", () => {
    const goals = [goal("g1"), goal("g2")]
    const phases = [phase("p1", "g1"), phase("p2", "g2")]
    const txt = formatGoalIntelligence(goals, phases, [], [], TODAY)
    expect(txt.startsWith("GOAL INTELLIGENCE:")).toBe(true)
    expect(txt.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(2)
  })

  it("excludes archived goals entirely", () => {
    const goals = [goal("g1"), goal("g2", { status: "archived" })]
    const txt = formatGoalIntelligence(goals, [phase("p1", "g1")], [], [], TODAY)
    expect(txt).toContain('"Goal g1"')
    expect(txt).not.toContain("g2")
    expect(txt.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1)
  })

  it("returns empty string when there are no non-archived goals (bounded/no data)", () => {
    expect(formatGoalIntelligence([], [], [], [], TODAY)).toBe("")
    expect(formatGoalIntelligence([goal("a", { status: "archived" })], [], [], [], TODAY)).toBe("")
  })

  it("formats every required deterministic signal on the line", () => {
    const g = goal("g1")
    const p = phase("p1", "g1", { status: "active", title: "Foundations" })
    const over = quest("q1", "p1", { due_date: "2026-08-01", completed_at: "2026-08-10T09:00:00Z" })
    const intel = buildGoalIntel(g, [p], [], [over], TODAY)
    const line = formatGoalIntelLine(summarizeGoalIntel(g, intel, [p]))

    expect(line).toContain(`"Goal g1"`)
    expect(line).toContain("[active/medium]")
    expect(line).toContain("progress")
    expect(line).toContain("%")
    expect(line).toContain('active phase: "Foundations"')
    expect(line).toContain("completion: in_progress")
    expect(line).toContain("overdue")
    expect(line).toContain("momentum")
    expect(line).toContain("consistency")
    expect(line).toContain("velocity")
    expect(line).toContain("active")
  })

  it("reports a overdue quest in the count", () => {
    const g = goal("g1")
    const p = phase("p1", "g1", { status: "active" })
    const overdue = quest("q1", "p1", { due_date: "2026-08-01" })
    const ok = quest("q2", "p1", { due_date: "2026-08-20" })
    const intel = buildGoalIntel(g, [p], [], [overdue, ok], TODAY)
    const line = formatGoalIntelLine(summarizeGoalIntel(g, intel, [p]))
    expect(line).toContain("1q/0m overdue")
  })

  it("reports a overdue milestone when a phase target is past due and incomplete", () => {
    const g = goal("g1")
    const past = phase("p1", "g1", { status: "available", target_date: "2026-08-01", completed_at: null })
    const m = milestone("m1", "p1", { status: "pending", completed_at: null })
    const intel = buildGoalIntel(g, [past], [m], [], TODAY)
    const line = formatGoalIntelLine(summarizeGoalIntel(g, intel, [past]))
    expect(line).toContain("0q/1m overdue")
  })

  it("flags a goal with no recent activity as inactive", () => {
    const g = goal("g1", { created_at: "2026-01-10" })
    const p = phase("p1", "g1", { status: "active" })
    const stale = quest("q1", "p1", { completed_at: "2026-07-01T09:00:00Z" }) // 45 days ago > 21-day window
    const intel = buildGoalIntel(g, [p], [], [stale], TODAY)
    expect(intel.inactive.inactive).toBe(true)
    expect(formatGoalIntelLine(summarizeGoalIntel(g, intel, [p]))).toContain("inactive")
  })

  it("treats a goal with recent activity as active (not inactive)", () => {
    const g = goal("g1")
    const p = phase("p1", "g1", { status: "active" })
    const fresh = quest("q1", "p1", { completed_at: "2026-08-14T09:00:00Z" })
    const intel = buildGoalIntel(g, [p], [], [fresh], TODAY)
    expect(intel.inactive.inactive).toBe(false)
    expect(formatGoalIntelLine(summarizeGoalIntel(g, intel, [p]))).toContain("active")
  })

  it("reflects higher momentum for recent activity than for distant activity", () => {
    const g = goal("g1")
    const recent = buildGoalIntel(
      g,
      [phase("p1", "g1", { status: "active" })],
      [],
      [quest("q1", "p1", { completed_at: "2026-08-14T09:00:00Z" })],
      TODAY,
    )
    const distant = buildGoalIntel(
      g,
      [phase("p1", "g1", { status: "active" })],
      [],
      [quest("q1", "p1", { completed_at: "2026-07-01T09:00:00Z" })],
      TODAY,
    )
    expect(recent.momentum).toBeGreaterThan(distant.momentum)
  })

  it("exposes consistency and velocity numbers on the summary", () => {
    const g = goal("g1", { created_at: "2026-06-01" })
    const p = phase("p1", "g1", { status: "active" })
    const m = milestone("m1", "p1", { status: "completed", completed_at: "2026-08-14T09:00:00Z" })
    const intel = buildGoalIntel(g, [p], [m], [], TODAY)
    const s = summarizeGoalIntel(g, intel, [p])
    expect(typeof s.consistency).toBe("number")
    expect(typeof s.velocity).toBe("number")
    expect(typeof s.momentum).toBe("number")
    const line = formatGoalIntelLine(s)
    expect(line).toMatch(/consistency \d+%/)
    expect(line).toMatch(/velocity [\d.]+/)
  })

  it("does not read or emit cross-goal data (each line uses only its own rows)", () => {
    const g1 = goal("g1")
    const g2 = goal("g2", { target_date: "2099-01-01" })
    const p1 = phase("p1", "g1", { status: "active", title: "Alpha" })
    const p2 = phase("p2", "g2", { status: "active", title: "Beta" })
    const txt = formatGoalIntelligence([g1, g2], [p1, p2], [], [], TODAY)
    const line1 = txt.split("\n").find((l) => l.includes("Goal g1"))!
    expect(line1).toContain("Alpha")
    expect(line1).not.toContain("Beta")
    expect(line1).not.toContain("Goal g2")
  })
})
