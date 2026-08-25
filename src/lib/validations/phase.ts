import { z } from "zod"

export const phaseStatusSchema = z.enum(["locked", "available", "active", "completed", "archived"])

export const finalChallengeSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  xp_reward: z.number().int().min(0).max(5000),
  status: z.enum(["locked", "available", "completed"]),
})

export const phaseSchema = z.object({
  title: z.string().min(1).max(120),
  objective: z.string().max(300).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  phase_number: z.number().int().min(1).max(20).optional().nullable(),
})
