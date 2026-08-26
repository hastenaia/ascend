"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

function mustUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Not authenticated")
  return user.id
}

export async function createBossAction(title: string, hp: number): Promise<{ id: string }> {
  const name = title.trim()
  if (name.length < 1 || name.length > 80) throw new Error("Name your challenge (1–80 characters)")
  if (!Number.isInteger(hp) || hp < 100 || hp > 10000) throw new Error("HP must be between 100 and 10,000")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  const { data: inserted, error } = await supabase
    .from("boss_challenges")
    .insert({ user_id: userId, title: name, hp, status: "active" })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  revalidatePath("/experiments")
  return { id: inserted!.id }
}

/**
 * Land a hit. When cumulative damage depletes HP the boss is auto-defeated.
 * Returns the new HP so the UI can celebrate immediately.
 */
export async function addBossHitAction(bossId: string, label: string, damage: number): Promise<{ currentHp: number; defeated: boolean }> {
  const text = label.trim()
  if (text.length < 1 || text.length > 80) throw new Error("Describe the move (1–80 characters)")
  if (!Number.isInteger(damage) || damage < 1 || damage > 1000) throw new Error("Damage must be between 1 and 1000")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = mustUserId(user)

  // Ownership check
  const { data: boss } = await supabase.from("boss_challenges").select("id,status").eq("id", bossId).eq("user_id", userId).single()
  if (!boss) throw new Error("Boss not found")
  if ((boss as { status: string }).status !== "active") throw new Error("This challenge is already settled")

  const { error: hitErr } = await supabase.from("boss_hits").insert({ user_id: userId, boss_id: bossId, label: text, damage })
  if (hitErr) throw new Error(hitErr.message)

  // Recompute from ledger (single source of truth)
  const { data: hits } = await supabase.from("boss_hits").select("damage").eq("boss_id", bossId).eq("user_id", userId)
  const total = ((hits as { damage: number }[] | null) ?? []).reduce((s, h) => s + h.damage, 0)

  let currentHp = 0
  let defeated = false
  const { data: updated } = await supabase.from("boss_challenges").select("hp").eq("id", bossId).single()
  const maxHp = (updated as { hp: number } | null)?.hp ?? 0
  currentHp = Math.max(0, maxHp - total)

  if (currentHp <= 0 && maxHp > 0) {
    await supabase
      .from("boss_challenges")
      .update({ status: "defeated", defeated_at: new Date().toISOString() })
      .eq("id", bossId)
      .eq("user_id", userId)
      .eq("status", "active")
    defeated = true
  }

  revalidatePath("/experiments")
  return { currentHp, defeated }
}
