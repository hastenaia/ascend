import type { SupabaseClient } from "@supabase/supabase-js"

export type JournalEntry = {
  id: string
  entry_date: string | null
  body: string | null
  learnings: string | null
  worked: string | null
  didnt_work: string | null
  change_plan: string | null
  mood: string | null
  tags: string[] | null
  phase_id: string | null
  quest_id: string | null
  created_at: string
  updated_at: string
  phaseTitle?: string | null
  questTitle?: string | null
}

export function todayDateString(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export async function getTodaysJournal(supabase: SupabaseClient, userId: string): Promise<JournalEntry | null> {
  const today = todayDateString()
  const { data } = await supabase
    .from("reflections")
    .select("id,entry_date,body,learnings,worked,didnt_work,change_plan,mood,tags,phase_id,quest_id,created_at,updated_at")
    .eq("user_id", userId)
    .eq("entry_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as JournalEntry | null) ?? null
}

export async function getJournalHistory(supabase: SupabaseClient, userId: string, limit = 30): Promise<JournalEntry[]> {
  const { data } = await supabase
    .from("reflections")
    .select("id,entry_date,body,learnings,worked,didnt_work,change_plan,mood,tags,phase_id,quest_id,created_at,updated_at")
    .eq("user_id", userId)
    .not("entry_date", "is", null)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
  return (data as JournalEntry[] | null) ?? []
}

export async function getJournalStreak(supabase: SupabaseClient, userId: string): Promise<{ streak: number; count: number }> {
  const { count } = await supabase
    .from("reflections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("entry_date", "is", null)
  const total = count ?? 0

  const history = await getJournalHistory(supabase, userId, 200)
  if (history.length === 0) return { streak: 0, count: total }
  const dates = new Set(history.map((h) => h.entry_date))
  let streak = 0
  const d = new Date()
  for (let i = 0; i < 90; i++) {
    const key = todayDateString(d)
    if (dates.has(key)) streak++
    else break
    d.setDate(d.getDate() - 1)
  }
  return { streak, count: total }
}

export async function getJournalWithMeta(supabase: SupabaseClient, userId: string, entries: JournalEntry[]): Promise<JournalEntry[]> {
  // Enrich phase/quest titles for display (optional, batched)
  const phaseIds = [...new Set(entries.map((e) => e.phase_id).filter(Boolean) as string[])]
  const questIds = [...new Set(entries.map((e) => e.quest_id).filter(Boolean) as string[])]
  const [phases, quests] = await Promise.all([
    phaseIds.length ? supabase.from("phases").select("id,title").in("id", phaseIds) : Promise.resolve({ data: [] } as never),
    questIds.length ? supabase.from("quests").select("id,title").eq("user_id", userId).in("id", questIds) : Promise.resolve({ data: [] } as never),
  ])
  const phaseMap = new Map(((phases.data as { id: string; title: string }[] | null) ?? []).map((p) => [p.id, p.title]))
  const questMap = new Map(((quests.data as { id: string; title: string }[] | null) ?? []).map((q) => [q.id, q.title]))
  return entries.map((e) => ({ ...e, phaseTitle: e.phase_id ? (phaseMap.get(e.phase_id) ?? null) : null, questTitle: e.quest_id ? (questMap.get(e.quest_id) ?? null) : null }))
}
