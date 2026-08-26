import { HeartPulse, Brain, BookOpen, MessagesSquare, ShieldCheck, GraduationCap, Users, Briefcase, type LucideIcon } from "lucide-react"
import { attributeFromXp } from "@/lib/character"

/**
 * The 8 Ascend character stats. Game-style progression attributes ONLY —
 * they are not IQ/EQ, personality, fitness, or mental-health measurements,
 * and must never be presented as such (see GAME_ATTRIBUTES_NOTE).
 */
export const STAT_SLUGS = [
  "physical",
  "mental",
  "intellect",
  "emotional-intelligence",
  "discipline",
  "knowledge",
  "social",
  "career",
] as const

export type StatSlug = (typeof STAT_SLUGS)[number]

export const STAT_META: Record<StatSlug, { label: string; icon: LucideIcon; blurb: string }> = {
  physical: { label: "Physical", icon: HeartPulse, blurb: "Grows with workouts and movement quests." },
  mental: { label: "Mental", icon: Brain, blurb: "Grows with focus, reflection, and recovery." },
  intellect: { label: "Intellect", icon: BookOpen, blurb: "Grows with study, reading, and practice problems." },
  "emotional-intelligence": { label: "Emotional Intelligence", icon: MessagesSquare, blurb: "Grows with communication and empathy quests." },
  discipline: { label: "Discipline", icon: ShieldCheck, blurb: "Grows with routines kept and hard tasks finished." },
  knowledge: { label: "Knowledge", icon: GraduationCap, blurb: "Grows with learning sessions and applied craft." },
  social: { label: "Social", icon: Users, blurb: "Grows with people-focused quests and teamwork." },
  career: { label: "Career", icon: Briefcase, blurb: "Grows with work and professional development." },
}

export const GAME_ATTRIBUTES_NOTE =
  "Game-style progression indicators derived from quests you complete. Not IQ or EQ tests, and not scientific measurements of intelligence, personality, fitness, or mental health."

/**
 * Quest category → stat weights. MUST stay in sync with the mapping embedded in
 * supabase/migrations/0005 (complete_quest + backfill). Weights per category sum
 * to ≤ 1 so a quest can never generate more stat points than XP awarded.
 */
export const CATEGORY_STAT_WEIGHTS: Record<string, Partial<Record<StatSlug, number>>> = {
  physical: { physical: 1.0 },
  discipline: { discipline: 0.7, mental: 0.3 },
  reflection: { mental: 0.7, "emotional-intelligence": 0.3 },
  intellect: { intellect: 0.6, knowledge: 0.4 },
  craft: { knowledge: 0.5, career: 0.3, mental: 0.2 },
  work: { career: 0.6, discipline: 0.4 },
  general: { social: 0.4, "emotional-intelligence": 0.35, mental: 0.25 },
}

export function statsForCategory(category: string): { stat: StatSlug; pct: number }[] {
  return Object.entries(CATEGORY_STAT_WEIGHTS[category] ?? {}).map(([stat, weight]) => ({
    stat: stat as StatSlug,
    pct: Math.round((weight ?? 0) * 100),
  }))
}

/** Display value 0–99 from accumulated stat points (asymptotic, honest at zero) */
export function statDisplayValue(points: number): number {
  return attributeFromXp(points)
}

export type StatTier = { name: string; min: number }
export const STAT_TIERS: StatTier[] = [
  { name: "Novice", min: 0 },
  { name: "Apprentice", min: 20 },
  { name: "Adept", min: 40 },
  { name: "Expert", min: 60 },
  { name: "Master", min: 80 },
]

export function statTier(value: number): StatTier {
  let tier = STAT_TIERS[0]
  for (const t of STAT_TIERS) if (value >= t.min) tier = t
  return tier
}

export function nextTier(value: number): StatTier | null {
  return STAT_TIERS.find((t) => t.min > value) ?? null
}
