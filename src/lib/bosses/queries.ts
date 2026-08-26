import type { SupabaseClient } from "@supabase/supabase-js"

export type BossRow = {
  id: string
  title: string
  hp: number
  status: "active" | "defeated" | "archived"
  created_at: string
  defeated_at: string | null
}

export type BossHit = {
  id: string
  label: string
  damage: number
  created_at: string
}

export type BossWithStats = {
  boss: BossRow
  currentHp: number
  totalDamage: number
  hpPct: number
  hits: BossHit[] // newest first, capped by query
}

export async function getBosses(supabase: SupabaseClient, userId: string): Promise<BossWithStats[]> {
  const { data: bosses } = await supabase
    .from("boss_challenges")
    .select("id,title,hp,status,created_at,defeated_at")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
  const rows = (bosses as BossRow[] | null) ?? []
  if (rows.length === 0) return []

  const { data: hits } = await supabase
    .from("boss_hits")
    .select("id,boss_id,label,damage,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500)

  const byBoss = new Map<string, BossHit[]>()
  for (const h of (hits as (BossHit & { boss_id: string })[] | null) ?? []) {
    const arr = byBoss.get(h.boss_id) ?? []
    if (arr.length < 20) arr.push({ id: h.id, label: h.label, damage: h.damage, created_at: h.created_at })
    byBoss.set(h.boss_id, arr)
  }

  return rows.map((boss) => {
    const hitList = byBoss.get(boss.id) ?? []
    const totalDamage = hitList.reduce((s, h) => s + h.damage, 0)
    const currentHp = Math.max(0, boss.hp - totalDamage)
    return {
      boss,
      currentHp,
      totalDamage,
      hpPct: Math.round((currentHp / boss.hp) * 100),
      hits: hitList,
    }
  })
}
