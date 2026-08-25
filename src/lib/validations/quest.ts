import { z } from "zod"

export const QUEST_CATEGORIES = ["intellect", "physical", "discipline", "reflection", "craft", "work", "general"] as const
export const QUEST_DIFFICULTIES = ["easy", "medium", "hard", "challenge"] as const
export const RECURRENCES = ["none", "daily", "weekly"] as const

export type QuestDifficultyValue = (typeof QUEST_DIFFICULTIES)[number]

// Suggested XP bands per difficulty (server-enforced clamp)
export const XP_BANDS: Record<QuestDifficultyValue, { min: number; max: number; default: number }> = {
  easy: { min: 10, max: 30, default: 20 },
  medium: { min: 30, max: 75, default: 40 },
  hard: { min: 75, max: 150, default: 100 },
  challenge: { min: 150, max: 500, default: 250 },
}

export function clampXpForDifficulty(difficulty: QuestDifficultyValue, xp: number): number {
  const band = XP_BANDS[difficulty] ?? XP_BANDS.medium
  return Math.min(band.max, Math.max(band.min, Math.round(xp)))
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

export const createQuestSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  category: z.enum(QUEST_CATEGORIES).default("general"),
  difficulty: z.enum(QUEST_DIFFICULTIES).default("medium"),
  xp_reward: z.number().int().min(5).max(500),
  estimated_duration: z.number().int().min(5).max(480).optional().nullable(),
  due_date: dateString.optional().nullable(),
  recurrence: z.enum(RECURRENCES).default("none"),
  phase_id: z.string().uuid().optional().nullable(),
  milestone_id: z.string().uuid().optional().nullable(),
  linked_skill: z.string().uuid().optional().nullable(),
})

export type CreateQuestInput = z.infer<typeof createQuestSchema>
