import { z } from "zod"
import { QUEST_DIFFICULTIES, clampXpForDifficulty, type QuestDifficultyValue } from "@/lib/validations/quest"

/**
 * Quest adaptation — AI PROPOSES, server VALIDATES and APPLIES.
 *
 * The model may suggest { quest_id, difficulty, xp_reward, title?, evidence? }
 * plus a human-readable `reason`. Nothing it proposes can mutate the database:
 * every value is re-validated server-side with Zod, XP is clamped to the
 * existing per-difficulty bands, ownership is checked, and history is kept
 * (adapted_from_difficulty preserves the ORIGINAL difficulty).
 */

export const adaptQuestProposalSchema = z.object({
  quest_id: z.string().uuid(),
  difficulty: z.enum(QUEST_DIFFICULTIES),
  xp_reward: z.number().int().min(1).max(10_000),
  title: z.string().trim().min(1).max(150).optional(),
  evidence: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(300).optional(),
})

export type AdaptQuestProposal = z.infer<typeof adaptQuestProposalSchema>

export type AdaptQuestContext = {
  userId: string
  quest: {
    id: string
    user_id: string
    status: string
    title: string
    difficulty: string
    xp_reward: number
    evidence: string | null
    adapted_from_difficulty: string | null
  }
}

export type AdaptSession = {
  difficulty: QuestDifficultyValue
  xp_reward: number
  title?: string
  evidence?: string
  adapted_from_difficulty: QuestDifficultyValue
  reason?: string
}

export type AdaptResult = { ok: true; changes: AdaptSession } | { ok: false; error: string }

/**
 * Pure validation gate. Returns the clamped, history-preserving change plan
 * or an error code. No I/O — used by the server action (and unit-tested).
 */
export function validateAdaptationProposal(ctx: AdaptQuestContext, proposal: AdaptQuestProposal): AdaptResult {
  if (!ctx.userId) return { ok: false, error: "not_authenticated" }
  if (ctx.quest.user_id !== ctx.userId) return { ok: false, error: "not_owner" }
  if (ctx.quest.status !== "active") return { ok: false, error: "quest_not_active" }

  const parsed = adaptQuestProposalSchema.safeParse(proposal)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_proposal" }

  const p = parsed.data
  if (p.quest_id !== ctx.quest.id) return { ok: false, error: "quest_id_mismatch" }

  const clampedXp = clampXpForDifficulty(p.difficulty, p.xp_reward)
  const newTitle = p.title

  const hasMeaningfulChange =
    p.difficulty !== ctx.quest.difficulty || clampedXp !== ctx.quest.xp_reward || (newTitle !== undefined && newTitle !== ctx.quest.title) || p.evidence !== undefined

  if (!hasMeaningfulChange) return { ok: false, error: "no_change" }

  return {
    ok: true,
    changes: {
      difficulty: p.difficulty,
      xp_reward: clampedXp,
      title: newTitle,
      evidence: p.evidence,
      adapted_from_difficulty: (ctx.quest.adapted_from_difficulty ?? ctx.quest.difficulty) as QuestDifficultyValue,
      reason: p.reason,
    },
  }
}