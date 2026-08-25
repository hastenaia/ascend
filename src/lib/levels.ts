// Progressive level formula — SQL mirror lives in supabase/migrations/0003 (xp_for_level / level_from_xp).
// Keep both in sync: xpForLevel(L) = round(25 * (L-1)^2.35), cumulative XP required to REACH level L.

export const MAX_LEVEL = 200

export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.round(25 * Math.pow(level - 1, 2.35))
}

export function levelFromXp(xp: number): number {
  let level = 1
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++
  return level
}

export type LevelProgress = {
  level: number
  totalXp: number
  xpToNext: number
  intoLevel: number
  levelSpan: number
  progressPct: number
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp)
  const floor = xpForLevel(level)
  const ceiling = level >= MAX_LEVEL ? floor : xpForLevel(level + 1)
  const span = Math.max(1, ceiling - floor)
  const into = Math.min(span, Math.max(0, totalXp - floor))
  return {
    level,
    totalXp,
    xpToNext: Math.max(0, ceiling - totalXp),
    intoLevel: into,
    levelSpan: span,
    progressPct: level >= MAX_LEVEL ? 100 : Math.round((into / span) * 100),
  }
}
