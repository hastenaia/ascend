import { z } from "zod"

export const GOAL_CATEGORIES = ["career", "health", "skills", "personal", "finance", "creative", "other"] as const
export const GOAL_PRIORITIES = ["low", "medium", "high", "critical"] as const

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

export const createGoalSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(GOAL_CATEGORIES).default("other"),
  priority: z.enum(GOAL_PRIORITIES).default("medium"),
  target_date: z.preprocess(emptyToNull, dateString.nullable()),
  desired_outcome: z.string().max(1000).optional().nullable(),
})

export type CreateGoalInput = z.input<typeof createGoalSchema>

export const goalJourneySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("blueprint"), blueprintSlug: z.string().min(1) }),
  z.object({
    mode: z.literal("custom"),
    titles: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    objectives: z.array(z.string().trim().max(300)).optional(),
  }),
])

export type GoalJourneyInput = z.infer<typeof goalJourneySchema>
