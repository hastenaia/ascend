import type { SupabaseClient } from "@supabase/supabase-js"
import { computeMomentumScore, momentumTiers, projectedTomorrowScore, type MomentumDayRow } from "@/lib/momentum/model"

export type MomentumSummary = {
  score: number
  tier: { label: string; message: string }
  tomorrowIfIdle: number
  todayActive: boolean
  recoveryKindsToday: string[]
  last7: boolean[] // oldest → newest
  bestStreak: number
}

const RECOVERY_KINDS = ["rest", "light", "reflection", "planning"] as const

export async function getMomentumSummary(supabase: SupabaseClient, userId: string): Promise<MomentumSummary> {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20)
  const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const [rowsRes, bestRes] = await Promise.all([
    supabase.from("momentum").select("date,score,recovery,recovery_kinds").eq("user_id", userId).gte("date", fromIso).order("date"),
    supabase.from("momentum").select("streak").eq("user_id", userId).order("streak", { ascending: false }).limit(1),
  ])

  type Row = MomentumDayRow & { recovery_kinds?: string[] | null }
  const rows = ((rowsRes.data as Row[] | null) ?? []).map((r) => ({
    date: r.date,
    score: r.score ?? 0,
    recovery: !!r.recovery,
    recovery_kinds: r.recovery_kinds ?? [],
  }))

  const score = computeMomentumScore(rows)
  const todayRow = rows.find((r) => r.date === todayIso)

  const last7: boolean[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const row = rows.find((r) => r.date === iso)
    last7.push(!!row && ((row.score ?? 0) > 0 || row.recovery))
  }

  return {
    score,
    tier: momentumTiers(score),
    tomorrowIfIdle: projectedTomorrowScore(rows),
    todayActive: !!todayRow && ((todayRow.score ?? 0) > 0 || todayRow.recovery),
    recoveryKindsToday: (todayRow?.recovery_kinds ?? []).filter((k): k is (typeof RECOVERY_KINDS)[number] => RECOVERY_KINDS.includes(k as never)),
    last7,
    bestStreak: (bestRes.data as { streak: number }[] | null)?.[0]?.streak ?? 0,
  }
}
