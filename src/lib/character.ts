import { ATTRIBUTE_SOURCES, type CharacterAttribute } from "@/lib/icons"

/**
 * Game-style progression attributes derived from REAL completed-quest XP.
 * Curve: 99 * sqrt(xp) / sqrt(xp + 600) — smooth, asymptotic, honest at zero.
 * These are Ascend progression attributes, NOT validated psychological measures.
 */
export function attributeFromXp(xp: number): number {
  if (xp <= 0) return 0
  return Math.round(99 * Math.sqrt(xp) / Math.sqrt(xp + 600))
}

export function computeCharacterAttributes(categoryXp: Record<string, number>): Record<CharacterAttribute, number> {
  const entries = Object.keys(ATTRIBUTE_SOURCES) as CharacterAttribute[]
  const result = {} as Record<CharacterAttribute, number>
  for (const attr of entries) {
    const xp = ATTRIBUTE_SOURCES[attr].reduce((s, c) => s + (categoryXp[c] ?? 0), 0)
    result[attr] = attributeFromXp(xp)
  }
  return result
}

/** Momentum message tiers — encouraging without streak pressure */
export function momentumMessage(streak: number, score: number): string {
  if (streak === 0 && score === 0) return "Every ascent starts with one quest."
  if (streak <= 1) return "You've started something — keep the thread."
  if (streak < 4) return "You're building consistency."
  if (streak < 8) return "Strong rhythm. Protect the chain."
  return "Remarkable consistency. This is who you are now."
}
