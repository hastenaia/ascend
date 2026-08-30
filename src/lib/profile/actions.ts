"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { coachProfileSchema, type CoachProfileInput } from "@/lib/validations/profile"
import type { CoachStyle } from "@/types/database"

// Keep the JSON shape loose at the write boundary; reads are typed.
type ProfilePreferencesLike = Record<string, unknown>

export async function updateCoachProfileAction(raw: CoachProfileInput): Promise<{ ok: true }> {
  const parsed = coachProfileSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid profile")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const preferences: { coachStyle?: CoachStyle } = {}
  if (parsed.data.coach_style) preferences.coachStyle = parsed.data.coach_style

  const { error } = await supabase
    .from("profiles")
    .update({
      experience_level: parsed.data.experience_level ?? null,
      long_term_objectives: parsed.data.long_term_objectives?.trim() ? parsed.data.long_term_objectives.trim() : null,
      preferences: preferences as ProfilePreferencesLike,
    })
    .eq("id", user.id)
  if (error) throw new Error(error.message)

  revalidatePath("/settings")
  return { ok: true }
}