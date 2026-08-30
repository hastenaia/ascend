import { z } from "zod"

export const MOODS = ["terrible", "low", "okay", "good", "great"] as const
export type Mood = (typeof MOODS)[number]

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

export const journalSchema = z
  .object({
    entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
      .refine((v) => v <= new Date().toISOString().slice(0, 10), "Future entries not allowed")
      .nullable()
      .optional(),
    body: z.string().max(5000).nullable().optional(),
    learnings: z.string().max(1500).nullable().optional(),
    worked: z.string().max(1500).nullable().optional(),
    didnt_work: z.string().max(1500).nullable().optional(),
    change_plan: z.string().max(1500).nullable().optional(),
    mood: z.preprocess(emptyToNull, z.enum(MOODS).nullable().optional()),
    tags: z
      .array(z.string().trim().min(1).max(24))
      .max(8)
      .nullable()
      .optional()
      .refine((arr) => !arr || new Set(arr.map((t) => t.trim().toLowerCase())).size === arr.length, "Duplicate tags not allowed"),
    phase_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    quest_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    const combined = [data.body, data.learnings, data.worked, data.didnt_work, data.change_plan].map((s) => (s ?? "").trim()).join("\n\n")
    if (combined.length > 5000) {
      ctx.addIssue({ code: "custom", message: "Entry too long (max 5000 chars combined)", path: ["body"] })
    }
  })

export type JournalInput = z.infer<typeof journalSchema>

export function hasContent(input: JournalInput): boolean {
  const parts = [input.body, input.learnings, input.worked, input.didnt_work, input.change_plan].map((s) => (s ?? "").trim())
  return parts.some((s) => s.length > 0)
}
