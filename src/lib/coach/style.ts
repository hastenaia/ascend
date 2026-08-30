import { COACH_STYLES } from "@/lib/validations/profile"

export type CoachStyle = (typeof COACH_STYLES)[number]

const INSTRUCTIONS: Record<CoachStyle, string> = {
  balanced: `STYLE: balanced — warm and concise; affirm real evidence, name stalls factually, and end with one clear next step.`,
  socratic: `STYLE: socratic — lead with 1-2 sharp, specific questions grounded in the user's data before giving advice; help them choose their own next step; then close with a concrete suggestion. Never interrogate for its own sake.`,
  direct: `STYLE: direct — plain-spoken and economical. Skip pleasantries, state the fact-based issue in one or two sentences, and give exactly one clear next step. Stay respectful; never harsh.`,
}

/**
 * Maps the user's stated coach-style preference to deterministic prompt
 * instructions. Unknown/empty values fall back to "balanced". Style affects
 * TONE ONLY — factual accuracy and safety rules are never overridden.
 */
export function coachStyleInstructions(style: CoachStyle | string | null | undefined): string {
  if (style === "socratic") return INSTRUCTIONS.socratic
  if (style === "direct") return INSTRUCTIONS.direct
  return INSTRUCTIONS.balanced
}

export { COACH_STYLES }