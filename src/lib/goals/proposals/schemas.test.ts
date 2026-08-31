import { describe, it, expect } from "vitest"
import {
  goalQualityExplanationSchema,
  goalUnderstandingSchema,
  goalDecompositionSchema,
  validateGoalDecomposition,
  MAX_DECOMPOSITION_PHASES,
  MAX_DECOMPOSITION_MILESTONES_PER_PHASE,
  MAX_DECOMPOSITION_QUESTS,
  type GoalDecomposition,
} from "@/lib/goals/proposals/schemas"

describe("goalQualityExplanationSchema", () => {
  it("accepts a well-formed explanation", () => {
    const r = goalQualityExplanationSchema.safeParse({
      summary: "Solid goal with momentum.",
      strengths: ["Has a target date"],
      improvements: ["Add a desired outcome"],
      suggested_next_step: "Write an outcome",
    })
    expect(r.success).toBe(true)
  })
  it("rejects a missing required field", () => {
    const r = goalQualityExplanationSchema.safeParse({ strengths: [], improvements: [], suggested_next_step: "x" })
    expect(r.success).toBe(false)
  })
  it("rejects null in place of a string", () => {
    const r = goalQualityExplanationSchema.safeParse({
      summary: null,
      strengths: [],
      improvements: [],
      suggested_next_step: "x",
    })
    expect(r.success).toBe(false)
  })
  it("rejects an oversized strengths array", () => {
    const r = goalQualityExplanationSchema.safeParse({
      summary: "s",
      strengths: ["a", "b", "c", "d", "e", "f"],
      improvements: [],
      suggested_next_step: "x",
    })
    expect(r.success).toBe(false)
  })
  it("rejects an over-long summary string", () => {
    const r = goalQualityExplanationSchema.safeParse({
      summary: "x".repeat(401),
      strengths: [],
      improvements: [],
      suggested_next_step: "x",
    })
    expect(r.success).toBe(false)
  })
  it("does not accept a score field (score is deterministic, not model-set)", () => {
    const r = goalQualityExplanationSchema.safeParse({
      summary: "s",
      strengths: [],
      improvements: [],
      suggested_next_step: "x",
      score: 99,
    })
    // unknown keys are stripped, not a schema error
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).not.toHaveProperty("score")
  })
})

describe("goalUnderstandingSchema", () => {
  it("accepts a well-formed understanding", () => {
    const r = goalUnderstandingSchema.safeParse({
      state: "On track",
      trajectory: "Steady",
      risks: ["Low momentum"],
      opportunities: ["Next milestone"],
      open_questions: ["Scope?"],
    })
    expect(r.success).toBe(true)
  })
  it("rejects missing trajectory", () => {
    const r = goalUnderstandingSchema.safeParse({ state: "s", risks: [], opportunities: [], open_questions: [] })
    expect(r.success).toBe(false)
  })
  it("rejects oversized risks array", () => {
    const r = goalUnderstandingSchema.safeParse({
      state: "s",
      trajectory: "t",
      risks: Array(6).fill("r"),
      opportunities: [],
      open_questions: [],
    })
    expect(r.success).toBe(false)
  })
  it("rejects unknown (non-string) values", () => {
    const r = goalUnderstandingSchema.safeParse({
      state: "s",
      trajectory: "t",
      risks: ["r1", 123],
      opportunities: [],
      open_questions: [],
    })
    expect(r.success).toBe(false)
  })
})

describe("goalDecompositionSchema", () => {
  const ok: GoalDecomposition = {
    phases: [{ title: "Foundations", objective: "Learn syntax", milestones: [{ title: "Core work" }] }],
    quests: [{ title: "Write a loop", category: "intellect", difficulty: "easy", description: "Small" }],
  }
  it("accepts a small valid decomposition", () => {
    expect(goalDecompositionSchema.safeParse(ok).success).toBe(true)
  })
  it("rejects an empty phases array", () => {
    const r = goalDecompositionSchema.safeParse({ phases: [], quests: [] })
    expect(r.success).toBe(false)
  })
  it("rejects more than MAX_DECOMPOSITION_PHASES phases", () => {
    const phases = Array(MAX_DECOMPOSITION_PHASES + 1).fill({ title: "p", objective: "o" })
    expect(goalDecompositionSchema.safeParse({ phases, quests: [] }).success).toBe(false)
  })
  it("rejects more than MAX_DECOMPOSITION_MILESTONES_PER_PHASE milestones", () => {
    const milestones = Array(MAX_DECOMPOSITION_MILESTONES_PER_PHASE + 1).fill({ title: "m" })
    const phases = [{ title: "p", objective: "o", milestones }]
    expect(goalDecompositionSchema.safeParse({ phases, quests: [] }).success).toBe(false)
  })
  it("rejects more than MAX_DECOMPOSITION_QUESTS quests", () => {
    const quests = Array(MAX_DECOMPOSITION_QUESTS + 1).fill({ title: "q", category: "intellect", difficulty: "easy" })
    const r = goalDecompositionSchema.safeParse({ phases: [{ title: "p", objective: "o" }], quests })
    expect(r.success).toBe(false)
  })
  it("rejects an invalid quest category enum", () => {
    const r = goalDecompositionSchema.safeParse({
      phases: [{ title: "p", objective: "o" }],
      quests: [{ title: "q", category: "not-a-category", difficulty: "easy" }],
    })
    expect(r.success).toBe(false)
  })
  it("rejects an invalid quest difficulty enum", () => {
    const r = goalDecompositionSchema.safeParse({
      phases: [{ title: "p", objective: "o" }],
      quests: [{ title: "q", category: "intellect", difficulty: "insane" }],
    })
    expect(r.success).toBe(false)
  })
  it("rejects a phase title over 120 chars", () => {
    const r = goalDecompositionSchema.safeParse({
      phases: [{ title: "x".repeat(121), objective: "o" }],
      quests: [],
    })
    expect(r.success).toBe(false)
  })
  it("rejects a quest title over 150 chars", () => {
    const r = goalDecompositionSchema.safeParse({
      phases: [{ title: "p", objective: "o" }],
      quests: [{ title: "x".repeat(151), category: "intellect", difficulty: "easy" }],
    })
    expect(r.success).toBe(false)
  })

  describe("validateGoalDecomposition (deterministic domain gate)", () => {
    it("accepts a decomposition with milestones", () => {
      expect(validateGoalDecomposition(ok)).toEqual({ ok: true })
    })
    it("accepts a decomposition with only quests", () => {
      expect(validateGoalDecomposition({ phases: [{ title: "p", objective: "o" }], quests: [ok.quests[0]] })).toEqual({ ok: true })
    })
    it("rejects a decomposition with no milestones and no quests", () => {
      expect(validateGoalDecomposition({ phases: [{ title: "p", objective: "o" }], quests: [] })).toEqual({
        ok: false,
        error: "decomposition must propose milestones or quests",
      })
    })
    it("rejects an empty decomposition", () => {
      expect(validateGoalDecomposition({ phases: [], quests: [] }).ok).toBe(false)
    })
  })
})
