import { describe, it, expect } from "vitest"
import { parseWeeklyReview, weeklyReviewSchema } from "@/lib/weekly/schema"

const VALID = {
  summary: "Strong week: you finished 17 of 23 quests and your momentum kept climbing.",
  wins: ["Programming consistency improved", "Completed the current milestone"],
  challenges: ["Business quests were postponed repeatedly"],
  patterns: ["You complete clearly defined tasks more consistently than open-ended ones."],
  lessons: ["Smaller quests get finished more often"],
  recommended_focus: ["Turn 'Work on business' into a measurable outcome"],
  next_actions: ["Interview 5 potential customers", "Complete 3 programming quests", "Finish the current milestone"],
}

describe("weekly review schema", () => {
  it("parses a valid AI output", () => {
    const out = parseWeeklyReview(VALID)
    expect(out).not.toBeNull()
    expect(out?.wins).toHaveLength(2)
    expect(out?.next_actions).toHaveLength(3)
  })

  it("rejects output missing required fields", () => {
    const { summary: _drop, ...missing } = VALID
    void _drop
    expect(parseWeeklyReview(missing)).toBeNull()
  })

  it("rejects output with an over-length summary", () => {
    expect(parseWeeklyReview({ ...VALID, summary: "x".repeat(500) })).toBeNull()
  })

  it("rejects output with too many wins (untrusted hallucination of volume)", () => {
    expect(parseWeeklyReview({ ...VALID, wins: Array.from({ length: 9 }, () => "win") })).toBeNull()
  })

  it("rejects non-object JSON (e.g. a bare string)", () => {
    expect(parseWeeklyReview("just a chatbot sentence")).toBeNull()
  })

  it("normalizes the schema type for type-safety", () => {
    const parsed = weeklyReviewSchema.safeParse(VALID)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.summary).toBe(VALID.summary)
  })
})