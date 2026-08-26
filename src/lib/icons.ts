import { Brain, HeartPulse, BookOpen, MessagesSquare, ShieldCheck, GraduationCap, Briefcase, Sparkles, type LucideIcon } from "lucide-react"

/** Quest categories → icon */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  intellect: Brain,
  physical: HeartPulse,
  discipline: ShieldCheck,
  reflection: Sparkles,
  craft: BookOpen,
  work: Briefcase,
  general: Sparkles,
}

export function categoryIcon(category: string | null | undefined): LucideIcon {
  return CATEGORY_ICONS[category ?? "general"] ?? Sparkles
}

/** Character attributes (game-style progression) → icon + explanation */
export type CharacterAttribute = "physical" | "mental" | "intellect" | "eq" | "discipline" | "knowledge"

export const ATTRIBUTE_META: Record<CharacterAttribute, { label: string; icon: LucideIcon; blurb: string }> = {
  physical: { label: "Physical", icon: HeartPulse, blurb: "Grows with workouts and movement quests." },
  mental: { label: "Mental", icon: Brain, blurb: "Grows with focus, difficult tasks, and recovery." },
  intellect: { label: "Intellect", icon: BookOpen, blurb: "Grows with study, practice problems, and deep reading." },
  eq: { label: "EQ", icon: MessagesSquare, blurb: "Grows with reflection and communication quests." },
  discipline: { label: "Discipline", icon: ShieldCheck, blurb: "Grows with routines kept and hard tasks finished." },
  knowledge: { label: "Knowledge", icon: GraduationCap, blurb: "Grows with learning sessions and applied skills." },
}

/** Completed-quest categories that feed each attribute */
export const ATTRIBUTE_SOURCES: Record<CharacterAttribute, string[]> = {
  physical: ["physical"],
  mental: ["discipline", "reflection"],
  intellect: ["intellect", "craft"],
  eq: ["reflection", "general"],
  discipline: ["discipline", "work"],
  knowledge: ["intellect", "work", "craft"],
}
