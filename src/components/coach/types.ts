export type CoachMsg = { role: "user" | "assistant"; content: string }

export type ChatOk = { ok: true; reply: string }
export type ChatUnavailable = { ok: false; unavailable: true }
export type ChatResponse = ChatOk | ChatUnavailable

/** Exact string the product spec requires when the model can't be reached */
export const COACH_UNAVAILABLE_MESSAGE = "AI Coach is currently unavailable."

export type ProposedPhase = { title: string; objective: string }
export type ProposedQuest = {
  title: string
  category: string
  difficulty: string
  estimated_duration: number | null
}
export type PlanItem = { day: string; focus: string; quest_title: string }

export const SUGGESTED_PROMPTS: { label: string; text: string }[] = [
  { label: "Today's priorities", text: "What should I prioritize today based on my open quests and momentum?" },
  { label: "Analyze my progress", text: "Analyze my recent progress — what's working and what's stalling?" },
  { label: "I'm behind", text: "I've fallen behind lately. Help me build a gentle plan to recover momentum." },
  { label: "Help me reflect", text: "Ask me sharp questions to reflect on my current phase." },
]
