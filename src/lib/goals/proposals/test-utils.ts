import type { GoalIntel } from "@/lib/goals/intelligence/metrics"
import type { GoalContextRow } from "@/lib/goals/proposals/context"

export function makeIntel(over: Partial<GoalIntel> = {}): GoalIntel {
  return {
    goalId: "goal-1",
    progress: { progressPct: 50, milestonesDone: 2, milestonesTotal: 4 },
    completion: { goalCompleted: false, phasesCompleted: 1, phasesTotal: 3, milestonesCompleted: 2, milestonesTotal: 4, questsCompleted: 3 },
    overdue: { overdueQuests: [], overdueMilestones: [], overdueQuestCount: 0, overdueMilestoneCount: 0 },
    inactive: { inactive: false, lastActivityDate: "2026-08-28", windowDays: 21 },
    momentum: 30,
    consistency: { consistencyPct: 50, weeksTotal: 4, weeksActive: 2 },
    velocity: { value: 1.5, unit: "completions/week", weeksElapsed: 4, sufficientData: true },
    ...over,
  }
}

export function makeGoal(over: Partial<GoalContextRow> = {}): GoalContextRow {
  return {
    id: "goal-1",
    title: "Learn Python",
    description: "Become productive in Python for data work.",
    status: "active",
    category: "skills",
    priority: "high",
    target_date: "2026-12-31",
    desired_outcome: "Ship a data analysis project in Python",
    created_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    ...over,
  }
}
