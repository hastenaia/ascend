import { z } from "zod"

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(30, "At most 30 characters")
  .regex(/^[a-z0-9_]+$/, "Only letters, numbers, and underscore")

export const profileSchema = z.object({
  display_name: z.string().trim().max(40, "At most 40 characters").optional().nullable(),
  username: usernameSchema.optional().nullable(),
  bio: z.string().trim().max(300, "At most 300 characters").optional().nullable(),
  avatar_url: z.string().trim().url("Must be a valid URL").max(500).optional().nullable().or(z.literal("")),
})

export type ProfileValues = z.infer<typeof profileSchema>

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30)
}
