import { describe, it, expect } from "vitest"
import { validateAdaptationProposal, type AdaptQuestContext } from "@/lib/quests/adapt"

const USER = "11110000-0000-4000-8000-000000000001"
const QUEST = "22220000-0000-4000-8000-000000000002"
const OTHER_QUEST = "33330000-0000-4000-8000-000000000003"

function ctx(over: Partial<AdaptQuestContext["quest"]> = {}): AdaptQuestContext {
  return {
    userId: USER,
    quest: {
      id: QUEST,
      user_id: USER,
      status: "active",
      title: "Study Java for 60 minutes",
      difficulty: "hard",
      xp_reward: 100,
      evidence: null,
      adapted_from_difficulty: null,
      ...over,
    },
  }
}

describe("validateAdaptationProposal", () => {
  it("accepts a valid step-down adaptation and records the ORIGINAL difficulty", () => {
    const result = validateAdaptationProposal(ctx(), {
      quest_id: QUEST,
      difficulty: "medium",
      xp_reward: 40,
      title: "Study Java for 20 minutes and solve 2 problems",
      reason: "Repeatedly postponed",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changes.difficulty).toBe("medium")
    expect(result.changes.xp_reward).toBe(40)
    expect(result.changes.title).toBe("Study Java for 20 minutes and solve 2 problems")
    expect(result.changes.adapted_from_difficulty).toBe("hard") // preserved original
  })

  it("clamps absurd XP into the difficulty band", () => {
    const result = validateAdaptationProposal(ctx(), {
      quest_id: QUEST,
      difficulty: "easy",
      xp_reward: 5000,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.changes.xp_reward).toBe(30) // easy max band
  })

  it("rejects an invalid difficulty", () => {
    const result = validateAdaptationProposal(ctx(), {
      quest_id: QUEST,
      difficulty: "impossible" as never,
      xp_reward: 40,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/invalid/i)
  })

  it("rejects a proposal for someone else's quest", () => {
    const result = validateAdaptationProposal(ctx({ user_id: "44440000-0000-4000-8000-000000000004" }), {
      quest_id: QUEST,
      difficulty: "easy",
      xp_reward: 20,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("not_owner")
  })

  it("rejects adapting a completed quest", () => {
    const result = validateAdaptationProposal(ctx({ status: "completed" }), {
      quest_id: QUEST,
      difficulty: "easy",
      xp_reward: 20,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("quest_not_active")
  })

  it("rejects no-op proposals (same difficulty, no content change)", () => {
    const result = validateAdaptationProposal(ctx(), {
      quest_id: QUEST,
      difficulty: "hard",
      xp_reward: 100,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_change")
  })

  it("keeps the FIRST adapted_from_difficulty on later adaptations", () => {
    const result = validateAdaptationProposal(ctx({ adapted_from_difficulty: "hard" }), {
      quest_id: QUEST,
      difficulty: "easy",
      xp_reward: 20,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.changes.adapted_from_difficulty).toBe("hard")
  })

  it("rejects a mismatched quest_id", () => {
    const result = validateAdaptationProposal(ctx(), {
      quest_id: OTHER_QUEST,
      difficulty: "easy",
      xp_reward: 20,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("quest_id_mismatch")
  })
})