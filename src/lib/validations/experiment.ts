import { z } from "zod"

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

export const createExperimentSchema = z.object({
  title: z.string().trim().min(1).max(150),
  hypothesis: z.preprocess(emptyToNull, z.string().max(1000).nullable()),
  duration_days: z.number().int().min(1).max(90),
  track_sleep: z.boolean().default(false),
})

export type CreateExperimentInput = z.input<typeof createExperimentSchema>

export const logEntrySchema = z.object({
  completed: z.boolean().default(false),
  mood: z.number().int().min(1).max(5).optional().nullable(),
  energy: z.number().int().min(1).max(5).optional().nullable(),
  productivity: z.number().int().min(1).max(5).optional().nullable(),
  sleep_quality: z.number().int().min(1).max(5).optional().nullable(),
  body: z.preprocess(emptyToNull, z.string().max(2000).nullable()),
})
