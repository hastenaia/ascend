import type { SupabaseClient } from "@supabase/supabase-js"

export type StructuredReflection = {
  learnings: string | null
  worked: string | null
  didnt_work: string | null
  change_plan: string | null
  body: string
}

export type ReflectionEntry = {
  id: string
  phaseTitle: string | null
  phaseCompletedAt: string | null
  createdAt: string
  reflection: StructuredReflection
}

function toStructured(row: {
  body: string
  learnings: string | null
  worked: string | null
  didnt_work: string | null
  change_plan: string | null
}): StructuredReflection {
  return { body: row.body, learnings: row.learnings, worked: row.worked, didnt_work: row.didnt_work, change_plan: row.change_plan }
}

/** All saved reflections, newest first, joined with their phase titles */
export async function getReflectionHistory(supabase: SupabaseClient, userId: string): Promise<ReflectionEntry[]> {
  const { data } = await supabase
    .from("reflections")
    .select("id,phase_id,body,learnings,worked,didnt_work,change_plan,created_at,updated_at,phases(title,completed_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)

  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => {
    const phase = row.phases as { title: string; completed_at: string } | { title: string; completed_at: string }[] | null
    const p = Array.isArray(phase) ? phase[0] : phase
    return {
      id: row.id as string,
      phaseTitle: p?.title ?? null,
      phaseCompletedAt: p?.completed_at ?? null,
      createdAt: (row.updated_at ?? row.created_at) as string,
      reflection: toStructured(row as never),
    }
  })
}
