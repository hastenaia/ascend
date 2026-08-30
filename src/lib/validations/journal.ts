import { z } from "zod"

export const MOODS = ["terrible", "low", "okay", "good", "great"] as const
export type Mood = (typeof MOODS)[number]

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

export const journalSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional(),
  body: z.string().max(5000).nullable().optional(),
  learnings: z.string().max(1500).nullable().optional(),
  worked: z.string().max(1500).nullable().optional(),
  didnt_work: z.string().max(1500).nullable().optional(),
  change_plan: z.string().max(1500).nullable().optional(),
  mood: z.preprocess(emptyToNull, z.enum(MOODS).nullable()),
  tags: z.array(z.string().max(24)).max(8).nullable().optional(),
  phase_id: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  quest_id: z.preprocess(emptyToNull, z.string().uuid().nullable()),
})

export type JournalInput = z.infer<typeof journalSchema>

export function hasContent(input: JournalInput): boolean {
  const parts = [input.body, input.learnings, input.worked, input.didnt_work, input.change_plan].map((s) => (s ?? "").trim())
  return parts.some((s) => s.length > 0)
}
