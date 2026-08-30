import { z } from "zod"

/**
 * Zod schema for the AI-generated Weekly Review narrative.
 * The app computes the numbers; the model fills the words. Arbitrary/untrusted
 * AI JSON is parsed through this schema and normalized before reaching the UI.
 */

export const weeklyReviewSchema = z.object({
  summary: z.string().trim().min(1, "summary required").max(400),
  wins: z.array(z.string().trim().min(1).max(200)).max(5),
  challenges: z.array(z.string().trim().min(1).max(200)).max(5),
  patterns: z.array(z.string().trim().min(1).max(250)).max(4),
  lessons: z.array(z.string().trim().min(1).max(200)).max(3),
  recommended_focus: z.array(z.string().trim().min(1).max(150)).max(3),
  next_actions: z.array(z.string().trim().min(1).max(200)).max(3),
})

export type WeeklyReviewOutput = z.infer<typeof weeklyReviewSchema>

/** Strictly validates and normalizes a Weekly Review output. Returns null for anything malformed. */
export function parseWeeklyReview(raw: unknown): WeeklyReviewOutput | null {
  const parsed = weeklyReviewSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}