import type { SupabaseClient } from "@supabase/supabase-js"
import {
  STAT_SLUGS,
  STAT_META,
  statDisplayValue,
  type StatSlug,
} from "@/lib/stats"
import {
  deriveCategoryNodes,
  isLeaf,
  type SkillCatalogRow,
  type UserSkillRow,
} from "@/lib/skills/tree"

export type StatSummary = {
  slug: StatSlug
  label: string
  points: number
  value: number
  deltaMonth: number
  trend: number[] // last 8 weeks of raw point gains, oldest → newest
}

export type StatHistoryEntry = {
  id: string
  delta: number
  description: string | null
  created_at: string
}

function startOfMonthIso(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function weeksAgoIso(weeks: number, d = new Date()): string {
  const dt = new Date(d)
  dt.setDate(dt.getDate() - weeks * 7)
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).toISOString()
}

/** All 8 stats with real persisted values + monthly delta + weekly trend */
export async function getStatsOverview(supabase: SupabaseClient): Promise<StatSummary[]> {
  const [{ data: catalog }, { data: userStats }] = await Promise.all([
    supabase.from("stats").select("id, slug").in("slug", [...STAT_SLUGS]),
    supabase.from("user_stats").select("stat_id, value"),
  ])
  const rows = (catalog as { id: string; slug: StatSlug }[]) ?? []
  if (rows.length === 0) return []

  const pointsByStat = new Map<string, number>()
  for (const r of ((userStats as { stat_id: string; value: number }[]) ?? [])) {
    pointsByStat.set(r.stat_id, Number(r.value ?? 0))
  }

  // Full ledger for the 8 stats — bounded volume, powers month-delta + trends
  const { data: hist } = await supabase
    .from("stat_history")
    .select("stat_id, delta, created_at")
    .in("stat_id", rows.map((r) => r.id))
    .gte("created_at", weeksAgoIso(9))
  const history = (hist as { stat_id: string; delta: number; created_at: string }[]) ?? []

  const monthStart = startOfMonthIso()

  return STAT_SLUGS.map((slug) => {
    const row = rows.find((r) => r.slug === slug)
    const points = row ? (pointsByStat.get(row.id) ?? 0) : 0
    const mine = history.filter((h) => row && h.stat_id === row.id)

    let beforeMonth = 0
    for (const h of mine) if (new Date(h.created_at) < new Date(monthStart)) beforeMonth += h.delta

    const now = new Date()
    const trend = Array.from({ length: 8 }, (_, i) => {
      const daysBackEnd = (7 - i) * 7 // newest bucket ends today
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBackEnd + 1)
      const start = new Date(end)
      start.setDate(start.getDate() - 7)
      return mine
        .filter((h) => new Date(h.created_at) >= start && new Date(h.created_at) < end)
        .reduce((s, h) => s + h.delta, 0)
    })

    const valueNow = statDisplayValue(points)
    return {
      slug,
      label: STAT_META[slug].label,
      points,
      value: valueNow,
      deltaMonth: Math.max(-99, valueNow - statDisplayValue(Math.max(0, points - beforeMonth))),
      trend,
    }
  })
}

export async function getStatHistory(supabase: SupabaseClient, slug: StatSlug, limit = 25): Promise<StatHistoryEntry[]> {
  const { data: cat } = await supabase.from("stats").select("id").eq("slug", slug).maybeSingle()
  if (!cat) return []
  const { data } = await supabase
    .from("stat_history")
    .select("id, delta, description, created_at")
    .eq("stat_id", (cat as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(limit)
  return ((data as StatHistoryEntry[]) ?? [])
}

export type SkillTreeData = {
  categories: {
    slug: StatSlug
    branches: ReturnType<typeof deriveCategoryNodes>["branches"]
  }[]
}

export async function getSkillTreeData(supabase: SupabaseClient): Promise<SkillTreeData> {
  const [{ data: skills }, { data: userSkills }] = await Promise.all([
    supabase.from("skills").select("id, slug, name, description, category, parent_id, sort_order, unlock_xp"),
    supabase.from("user_skills").select("skill_id, xp"),
  ])
  const catalog = (skills as unknown as SkillCatalogRow[]) ?? []
  const xpMap = new Map<string, number>()
  for (const r of ((userSkills as UserSkillRow[]) ?? [])) xpMap.set(r.skill_id, Number(r.xp ?? 0))

  const categories = STAT_SLUGS.map((slug) => {
    const inCat = catalog.filter((s) => s.category === slug)
    const branchRows = inCat.filter((s) => !isLeaf(s))
    const leavesByBranch: Record<string, SkillCatalogRow[]> = {}
    for (const leaf of inCat.filter(isLeaf)) {
      if (leaf.parent_id) (leavesByBranch[leaf.parent_id] ??= []).push(leaf)
    }
    return { slug, branches: deriveCategoryNodes(branchRows, leavesByBranch, xpMap).branches }
  })

  return { categories }
}

/** Leaf-skill options for the quest-create "linked skill" picker */
export async function getLeafSkillOptions(supabase: SupabaseClient): Promise<{ id: string; name: string; category: string | null }[]> {
  const { data } = await supabase
    .from("skills")
    .select("id, name, category, parent_id, sort_order")
    .not("parent_id", "is", null)
    .order("category")
    .order("sort_order")
  return ((data as { id: string; name: string; category: string | null }[]) ?? [])
}
