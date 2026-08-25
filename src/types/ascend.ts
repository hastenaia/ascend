export type PhaseStatus = "locked" | "available" | "active" | "completed" | "archived"

export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6

export type Difficulty = "easy" | "standard" | "hard" | "extreme"

export type FinalChallenge = {
  title: string
  description: string
  xp_reward: number
  status: "locked" | "available" | "completed"
}

export type AscendMechanic =
  | "GOAL"
  | "PHASE"
  | "MILESTONES"
  | "QUESTS"
  | "XP"
  | "SKILLS"
  | "STATS"
  | "FINAL_CHALLENGE"
  | "PHASE_COMPLETION"
  | "NEXT_PHASE"
