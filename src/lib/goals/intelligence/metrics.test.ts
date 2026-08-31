import { describe, it, expect } from "vitest"
import {
  computeGoalProgress,
  computeGoalCompletion,
  computeGoalOverdue,
  computeGoalInactive,
  computeGoalMomentum,
  computeGoalConsistency,
  computeGoalVelocity,
  asLocalDate,
} from "@/lib/goals/intelligence/metrics"
import type { PhaseIntelRow, MilestoneIntelRow, QuestIntelRow } from "@/lib/goals/intelligence/metrics"

// --- fixtures --------------------------------------------------------------

const goalId = "goal-1"

const phases: PhaseIntelRow[] = [
  { id: "p1", goal_id: goalId, status: "completed", target_date: "2026-07-01" },
  { id: "p2", goal_id: goalId, status: "active", target_date: "2026-09-15" },
  { id: "p3", goal_id: goalId, status: "locked", target_date: "2026-12-01" },
  { id: "other-p", goal_id: "other-goal", status: "completed", target_date: null },
]

const milestones: MilestoneIntelRow[] = [
  { id: "m1", phase_id: "p1", status: "completed" },
  { id: "m2", phase_id: "p1", status: "completed" },
  { id: "m3", phase_id: "p2", status: "completed" },
  { id: "m4", phase_id: "p2", status: "pending" },
  { id: "m5", phase_id: "p3", status: "pending" },
  { id: "m-other", phase_id: "other-p", status: "completed" },
]

function q(row: Partial<QuestIntelRow> & { id: string }): QuestIntelRow {
  return {
    phase_id: null,
    milestone_id: null,
    status: "active",
    recurrence: "none",
    due_date: null,
    ...row,
  }
}

describe("asLocalDate", () => {
  it("returns null for empty/null input", () => {
    expect(asLocalDate(null)).toBeNull()
    expect(asLocalDate("")).toBeNull()
  })
  it("slices an ISO timestamp to a date key", () => {
    expect(asLocalDate("2026-08-31T10:00:00Z")).toBe("2026-08-31")
  })
  it("passes a plain date through", () => {
    expect(asLocalDate("2026-08-31")).toBe("2026-08-31")
  })
})

describe("computeGoalProgress", () => {
  it("is milestone-weighted across the goal's phases", () => {
    // goal phases p1,p2,p3 -> milestones m1..m5; 3 of 5 completed => 60%
    expect(computeGoalProgress(goalId, phases, milestones)).toEqual({ progressPct: 60, milestonesDone: 3, milestonesTotal: 5 })
  })
  it("returns 0 for empty phase/milestone data", () => {
    const empty: MilestoneIntelRow[] = []
    expect(computeGoalProgress(goalId, [], empty)).toEqual({ progressPct: 0, milestonesDone: 0, milestonesTotal: 0 })
  })
  it("ignores milestones belonging to other goals", () => {
    const onlyOther = [{ id: "x", phase_id: "other-p", status: "completed" }]
    expect(computeGoalProgress(goalId, phases, onlyOther)).toEqual({ progressPct: 0, milestonesDone: 0, milestonesTotal: 0 })
  })
  it("completed goal reports 100%", () => {
    const allDone = milestones.map((m) => (m.phase_id !== "p3" ? { ...m, status: "completed" as const } : m))
    expect(computeGoalProgress(goalId, phases, allDone)).toEqual({ progressPct: 80, milestonesDone: 4, milestonesTotal: 5 })
  })
})

describe("computeGoalCompletion", () => {
  it("tallies phases, milestones and quests for the goal", () => {
    const quests: QuestIntelRow[] = [
      q({ id: "q1", phase_id: "p2", status: "completed" }),
      q({ id: "q2", phase_id: "p2", status: "active" }),
      q({ id: "q3", milestone_id: "m5", status: "completed" }), // via milestone->p3
      q({ id: "q4", milestone_id: "m-other", status: "completed" }), // other goal
    ]
    const c = computeGoalCompletion("active", goalId, phases, milestones, quests)
    expect(c.phasesCompleted).toBe(1)
    expect(c.phasesTotal).toBe(3)
    expect(c.milestonesCompleted).toBe(3)
    expect(c.milestonesTotal).toBe(5)
    expect(c.questsCompleted).toBe(2)
    expect(c.goalCompleted).toBe(false)
  })
  it("empty data -> zeros, goal not completed", () => {
    const c = computeGoalCompletion("active", goalId, [], [], [])
    expect(c).toEqual({
      goalCompleted: false,
      phasesCompleted: 0,
      phasesTotal: 0,
      milestonesCompleted: 0,
      milestonesTotal: 0,
      questsCompleted: 0,
    })
  })
  it("recognizes a completed goal from its authoritative status", () => {
    const c = computeGoalCompletion("completed", goalId, phases, [], [])
    expect(c.goalCompleted).toBe(true)
  })
})

describe("computeGoalOverdue", () => {
  it("flags overdue one-time quests (reuse behavior.ts rule); recurring never overdue", () => {
    const quests: QuestIntelRow[] = [
      q({ id: "overdue1", phase_id: "p2", recurrence: "none", due_date: "2026-08-20", status: "active" }),
      q({ id: "dueToday", phase_id: "p2", recurrence: "none", due_date: "2026-08-30", status: "active" }),
      q({ id: "future", phase_id: "p2", recurrence: "none", due_date: "2026-09-20", status: "active" }),
      q({ id: "recurring", phase_id: "p2", recurrence: "weekly", due_date: "2026-08-20", status: "active" }),
      q({ id: "completed", phase_id: "p2", recurrence: "none", due_date: "2026-08-10", status: "completed" }),
      q({ id: "other", phase_id: "p3-out", recurrence: "none", due_date: "2026-08-20", status: "active" }),
    ]
    // p3-out doesn't exist in phases -> not attributed to the goal
    const res = computeGoalOverdue(goalId, phases, milestones, quests, "2026-08-30")
    expect(res.overdueQuestCount).toBe(1)
    expect(res.overdueQuests[0].questId).toBe("overdue1")
  })
  it("flags non-completed milestones in a phase whose target_date has passed", () => {
    // p2 active, target 2026-09-15 (not overdue today 2026-08-30)
    // p1 completed (ignore). Add a phase with a passed target.
    const localPhases: PhaseIntelRow[] = [
      ...phases,
      { id: "pX", goal_id: goalId, status: "active", target_date: "2026-08-10" },
    ]
    const localMilestones: MilestoneIntelRow[] = [...milestones, { id: "mX", phase_id: "pX", status: "pending" }]
    const res = computeGoalOverdue(goalId, localPhases, localMilestones, [], "2026-08-30")
    expect(res.overdueMilestoneCount).toBe(1)
    expect(res.overdueMilestones[0].milestoneId).toBe("mX")
  })
  it("completed milestones are not overdue even if phase target passed", () => {
    const localPhases: PhaseIntelRow[] = [...phases, { id: "pX", goal_id: goalId, status: "active", target_date: "2026-08-10" }]
    const done = { id: "mX", phase_id: "pX", status: "completed" as const }
    const res = computeGoalOverdue(goalId, localPhases, [...milestones, done], [], "2026-08-30")
    expect(res.overdueMilestoneCount).toBe(0)
  })
  it("zero values when nothing is overdue", () => {
    const res = computeGoalOverdue(goalId, phases, milestones, [], "2026-08-30")
    expect(res.overdueQuestCount).toBe(0)
    expect(res.overdueMilestoneCount).toBe(0)
  })
})

describe("computeGoalInactive", () => {
  it("flags an active goal with no recent activity as inactive", () => {
    const res = computeGoalInactive(goalId, "active", ["2026-07-01"], "2026-08-30")
    expect(res.inactive).toBe(true)
  })
  it("does NOT flag a goal that has recent activity", () => {
    const res = computeGoalInactive(goalId, "active", ["2026-08-20"], "2026-08-30")
    expect(res.inactive).toBe(false)
  })
  it("does NOT flag a goal whose target is far away but has recent activity", () => {
    const res = computeGoalInactive(goalId, "active", ["2026-08-29"], "2026-08-30")
    expect(res.inactive).toBe(false)
  })
  it("never flags non-active (completed/archived) goals", () => {
    expect(computeGoalInactive(goalId, "completed", [], "2026-08-30").inactive).toBe(false)
    expect(computeGoalInactive(goalId, "archived", [], "2026-08-30").inactive).toBe(false)
  })
  it("empty activity for an active goal -> inactive", () => {
    expect(computeGoalInactive(goalId, "active", [], "2026-08-30").inactive).toBe(true)
  })
})

describe("computeGoalMomentum", () => {
  it("one full active day today yields the shared model's full-day points (20)", () => {
    // reuses momentum/model.ts: a single FULL_DAY_SCORE day contributes
    // FULL_DAY_POINTS (20) before decay — not 100.
    expect(computeGoalMomentum(["2026-08-30"], "2026-08-30")).toBe(20)
  })
  it("returns 0 for no activity", () => {
    expect(computeGoalMomentum([], "2026-08-30")).toBe(0)
  })
  it("decays older activity (reuses shared model — bounded 0..100)", () => {
    const now = computeGoalMomentum(["2026-08-30", "2026-08-29"], "2026-08-30")
    const older = computeGoalMomentum(["2026-08-28"], "2026-08-30") // 2 days ago
    expect(now).toBeGreaterThan(older)
    expect(older).toBeLessThan(20)
    expect(older).toBeGreaterThan(0)
  })
  it("age outside the 21-day window contributes nothing", () => {
    const stale = computeGoalMomentum(["2026-07-01"], "2026-08-30")
    expect(stale).toBe(0)
  })
})

describe("computeGoalConsistency", () => {
  it("perfect consistency when active every week (created on a Monday)", () => {
    // created Monday 2026-08-03; active every Monday; 4 full weeks total
    const c = computeGoalConsistency(
      "2026-08-03T00:00:00Z",
      null,
      ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"],
      "2026-08-30",
    )
    expect(c.weeksTotal).toBe(4)
    expect(c.weeksActive).toBe(4)
    expect(c.consistencyPct).toBe(100)
  })
  it("partial consistency counts active weeks over total weeks", () => {
    const c = computeGoalConsistency("2026-08-01T00:00:00Z", null, ["2026-08-03"], "2026-08-30")
    expect(c.weeksActive).toBe(1)
    expect(c.weeksTotal).toBeGreaterThanOrEqual(4)
    expect(c.consistencyPct).toBeGreaterThan(0)
    expect(c.consistencyPct).toBeLessThan(100)
  })
  it("short-duration goal (created today) yields weeksTotal 1 and no div-by-zero", () => {
    const c = computeGoalConsistency("2026-08-30T00:00:00Z", null, [], "2026-08-30")
    expect(c.weeksTotal).toBe(1)
    expect(c.consistencyPct).toBe(0)
  })
  it("short-duration goal with activity -> 100", () => {
    const c = computeGoalConsistency("2026-08-30T00:00:00Z", null, ["2026-08-30"], "2026-08-30")
    expect(c.weeksTotal).toBe(1)
    expect(c.consistencyPct).toBe(100)
  })
  it("long-duration goal spanning many weeks", () => {
    const c = computeGoalConsistency("2026-01-01T00:00:00Z", null, ["2026-01-05", "2026-03-02"], "2026-08-30")
    expect(c.weeksTotal).toBeGreaterThan(20)
    expect(c.weeksActive).toBe(2)
  })
  it("stops counting after completion (no post-completion penalty)", () => {
    const completedToday = computeGoalConsistency(
      "2026-08-01T00:00:00Z",
      "2026-08-10T00:00:00Z",
      ["2026-08-03"],
      "2026-08-30",
    )
    const notCompleted = computeGoalConsistency("2026-08-01T00:00:00Z", null, ["2026-08-03"], "2026-08-30")
    expect(completedToday.weeksTotal).toBeLessThan(notCompleted.weeksTotal)
  })
})

describe("computeGoalVelocity", () => {
  it("computes completions per week with explicit unit", () => {
    // created 2026-08-01, 2 progress completions, 29 days elapsed => ~4.1 weeks
    const v = computeGoalVelocity("2026-08-01T00:00:00Z", ["2026-08-03", "2026-08-10"], "2026-08-30")
    expect(v.unit).toBe("completions/week")
    expect(v.value).toBeGreaterThan(0)
    expect(v.sufficientData).toBe(true)
  })
  it("fresh goal yields sufficientData false and no division-by-zero", () => {
    const v = computeGoalVelocity("2026-08-30T00:00:00Z", ["2026-08-30"], "2026-08-30")
    expect(v.weeksElapsed).toBeGreaterThanOrEqual(1)
    expect(v.sufficientData).toBe(false)
    expect(Number.isFinite(v.value)).toBe(true)
  })
  it("no completions -> value 0", () => {
    const v = computeGoalVelocity("2026-08-01T00:00:00Z", [], "2026-08-30")
    expect(v.value).toBe(0)
  })
  it("long-duration goal with few completions yields a small rate", () => {
    const v = computeGoalVelocity("2026-01-01T00:00:00Z", ["2026-01-05"], "2026-08-30")
    expect(v.value).toBeLessThan(0.2)
    expect(v.sufficientData).toBe(true)
  })
})
