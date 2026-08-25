import type { SupabaseClient, User } from "@supabase/supabase-js"

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

function fallbackUsername(user: User): string {
  const base = (user.email?.split("@")[0] ?? "user").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "user"
  const suffix = user.id.replace(/-/g, "").slice(0, 4)
  return `${base}_${suffix}`.slice(0, 30)
}

/**
 * Ensures a profile row exists for the authenticated user.
 * Handles race where trigger handle_new_user hasn't fired yet or failed.
 * Safe to call repeatedly from server components.
 */
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()

  if (!error && data) return data as Profile

  // If missing, attempt insert with fallback username
  const displayName = (user.user_metadata?.display_name as string | undefined)?.trim() || null
  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined)?.trim() || null
  const username = fallbackUsername(user).toLowerCase()

  // Try insert, handle unique violation by retrying with random suffix
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = attempt === 0 ? username : `${username.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 30)
    const { data: inserted, error: insErr } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        display_name: displayName,
        username: candidate.toLowerCase(),
        avatar_url: avatarUrl,
        bio: null,
      })
      .select()
      .single()

    if (!insErr && inserted) return inserted as Profile

    // If unique violation, retry; otherwise re-fetch (maybe trigger created it concurrently)
    if (insErr && insErr.code === "23505") continue

    const { data: retry } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
    if (retry) return retry as Profile

    // If RLS or other transient, break and return what we have
    break
  }

  // Final attempt: fetch again (trigger may have succeeded)
  const { data: final } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
  return (final as Profile) ?? null
}
