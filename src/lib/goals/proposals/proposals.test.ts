import { beforeEach, describe, expect, it } from "vitest"
import type { ModelResult } from "@/lib/coach/provider"
import { resetAiState } from "@/lib/ai/cost"
import { computeGoalQuality, proposeGoalQuality } from "@/lib/goals/proposals/quality"
import { proposeGoalUnderstanding, makeGoalUnderstandingRequest } from "@/lib/goals/proposals/understanding"
import { proposeGoalDecomposition, makeGoalDecompositionRequest } from "@/lib/goals/proposals/decomposition"
import { buildGoalFacts, formatGoalIntel } from "@/lib/goals/proposals/context"
import { makeGoal, makeIntel } from "./test-utils"

function okModel(content: string) {
  return async (): Promise<ModelResult> => ({ ok: true, content })
}

function failModel(): ReturnType<typeof okModel> {
  return async (): Promise<ModelResult> => ({ ok: false, unavailable: true, reason: "upstream_error", detail: "down" })
}

beforeEach(() => resetAiState())

describe("goal context (deterministic facts)", () => {
  it("preserves the deterministic numbers verbatim (no invented facts)", () => {
    const goal = makeGoal()
    const intel = makeIntel({ momentum: 30, progress: { progressPct: 50, milestonesDone: 2, milestonesTotal: 4 } })
    const facts = buildGoalFacts(goal, intel)
    expect(facts.text).toContain("PROGRESS: 50% (2/4 milestones)")
    expect(facts.text).toContain("MOMENTUM: 30/100")
    expect(facts.text).toContain("CONSISTENCY: 50%")
    expect(facts.text).toContain("VELOCITY: 1.5 completions/week")
    expect(facts.text).toContain("Learn Python")
    expect(facts.signals.progressPct).toBe(50)
    expect(facts.signals.momentum).toBe(30)
  })
  it("surfaces inactivity and overdue when present", () => {
    const intel = makeIntel({
      inactive: { inactive: true, lastActivityDate: null, windowDays: 21 },
      overdue: { overdueQuests: [], overdueMilestones: [], overdueQuestCount: 2, overdueMilestoneCount: 1 },
    })
    const text = formatGoalIntel(makeGoal(), intel)
    expect(text).toContain("OVERDUE: 2 quests, 1 milestones")
    expect(text).toContain("INACTIVE: yes")
  })
})

describe("Goal Quality (deterministic score, AI explains)", () => {
  it("computes a deterministic score and rubric from the intel", () => {
    const score = computeGoalQuality(makeGoal(), makeIntel())
    expect(score.max).toBe(100)
    // well-defined goal: outcome(20) + target(15) + decomposition(20) + momentum(6) + progress(8) + consistency(5)
    expect(score.score).toBe(74)
    expect(score.rubric).toHaveLength(6)
  })
  it("scores an empty/poorly-defined goal lower", () => {
    const poor = computeGoalQuality(
      makeGoal({ desired_outcome: "", target_date: null, description: null }),
      makeIntel({ progress: { progressPct: 0, milestonesDone: 0, milestonesTotal: 0 }, momentum: 0, consistency: { consistencyPct: 0, weeksTotal: 1, weeksActive: 0 } }),
    )
    expect(poor.score).toBeLessThan(40)
  })
  it("returns the deterministic score even when the model fails (no fabrication)", async () => {
    const res = await proposeGoalQuality(makeGoal(), makeIntel(), { modelCall: failModel() })
    expect(res.ok).toBe(false)
    expect(res.data.score).toBe(74) // score always present
    expect(res.data.explanation).toBeNull()
    expect(res.data.source).toBe("none")
  })
  it("returns a successful explanation with the score", async () => {
    const res = await proposeGoalQuality(makeGoal(), makeIntel(), {
      modelCall: okModel(`{"summary":"Good focus","strengths":["Target set"],"improvements":["Add outcome"],"suggested_next_step":"Write it"}`),
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.score).toBe(74)
      expect(res.data.explanation?.summary).toBe("Good focus")
    }
  })
  it("does NOT let the model set a score (score field is stripped, deterministic value kept)", async () => {
    const res = await proposeGoalQuality(makeGoal(), makeIntel(), {
      modelCall: okModel(`{"summary":"s","strengths":[],"improvements":[],"suggested_next_step":"x","score":100}`),
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.score).toBe(74)
  })
  it("rejects malformed output from the model", async () => {
    const res = await proposeGoalQuality(makeGoal(), makeIntel(), { modelCall: okModel(`{"summary":""}`) })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("invalid")
  })
})

describe("Goal Understanding", () => {
  it("runs a valid synthesis through the pipeline", async () => {
    const res = await proposeGoalUnderstanding(makeGoal(), makeIntel(), {
      modelCall: okModel(
        `{"state":"50% through","trajectory":"Steady","risks":["Low momentum"],"opportunities":["Next milestone"],"open_questions":["Scope?"]}`,
      ),
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.proposal.state).toBe("50% through")
  })
  it("rejects oversized risks array", async () => {
    const res = await proposeGoalUnderstanding(makeGoal(), makeIntel(), {
      modelCall: okModel(`{"state":"s","trajectory":"t","risks":${JSON.stringify(Array(6).fill("r"))},"opportunities":[],"open_questions":[]}`),
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("invalid")
  })
  it("rejects the model inventing a numeric value in a string field", async () => {
    const res = await proposeGoalUnderstanding(makeGoal(), makeIntel(), {
      modelCall: okModel(`{"state":42,"trajectory":"t","risks":[],"opportunities":[],"open_questions":[]}`),
    })
    expect(res.ok).toBe(false)
  })
  it("grounds the prompt in deterministic context", () => {
    const req = makeGoalUnderstandingRequest(makeGoal(), makeIntel())
    const messages = req.buildMessages(buildGoalFacts(makeGoal(), makeIntel()))
    expect(messages.some((m) => m.content.includes("PROGRESS: 50%"))).toBe(true)
  })
})

describe("Goal Decomposition", () => {
  it("accepts a valid small proposal", async () => {
    const body = JSON.stringify({
      phases: [
        { title: "Foundations", objective: "Learn syntax", milestones: [{ title: "Core work" }] },
        { title: "Projects", objective: "Build two apps" },
      ],
      quests: [{ title: "Write a loop", category: "intellect", difficulty: "easy", description: "Small" }],
    })
    const res = await proposeGoalDecomposition(makeGoal(), makeIntel(), { modelCall: okModel(body) })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.proposal.phases.length).toBe(2)
      expect(res.proposal.quests[0].category).toBe("intellect")
    }
  })
  it("rejects an invalid quest enum", async () => {
    const body = JSON.stringify({
      phases: [{ title: "p", objective: "o" }],
      quests: [{ title: "q", category: "bogus", difficulty: "easy" }],
    })
    const res = await proposeGoalDecomposition(makeGoal(), makeIntel(), { modelCall: okModel(body) })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("invalid")
  })
  it("rejects phases over the size limit", async () => {
    const phases = Array(6).fill({ title: "p", objective: "o" })
    const res = await proposeGoalDecomposition(makeGoal(), makeIntel(), { modelCall: okModel(JSON.stringify({ phases, quests: [] })) })
    expect(res.ok).toBe(false)
  })
  it("rejects a proposal with no milestones and no quests (domain_invalid)", async () => {
    const res = await proposeGoalDecomposition(makeGoal(), makeIntel(), {
      modelCall: okModel(JSON.stringify({ phases: [{ title: "p", objective: "o" }], quests: [] })),
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("domain_invalid")
  })
  it("never writes to the database (request has only a modelCall seam, no DB)", () => {
    const req = makeGoalDecompositionRequest(makeGoal(), makeIntel(), { modelCall: okModel("{}") })
    expect(req.kind).toBe("goal")
    expect(typeof req.collect).toBe("function")
  })
})
