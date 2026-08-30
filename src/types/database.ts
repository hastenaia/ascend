export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Difficulty = "easy" | "standard" | "hard" | "extreme"
export type PhaseStatus = "locked" | "available" | "active" | "completed" | "archived"

export type QuestStatus = "active" | "completed" | "archived"
export type QuestDifficulty = "easy" | "medium" | "hard" | "challenge"
export type QuestCategory = "intellect" | "physical" | "discipline" | "reflection" | "craft" | "work" | "general"
export type Recurrence = "none" | "daily" | "weekly"

export type GoalCategory = "career" | "health" | "skills" | "personal" | "finance" | "creative" | "other"
export type GoalPriority = "low" | "medium" | "high" | "critical"

export type UnlockedAchievement = {
  slug: string
  name: string
  description: string
  flavor: string
  xp_reward: number
}

export type CompleteQuestResult = {
  ok: boolean
  error?: string
  already_completed?: boolean
  xp_awarded?: number
  xp_total?: number
  level?: number
  xp_to_next?: number
  milestone_updated?: boolean
  streak?: number | null
  unlocked_achievements?: UnlockedAchievement[] | null
}

export type FinalChallengeJson = {
  title: string
  description: string
  xp_reward: number
  status: "locked" | "available" | "completed"
} | null

export type ProfileExperienceLevel = "beginner" | "intermediate" | "advanced"
export type CoachStyle = "balanced" | "socratic" | "direct"

export type ProfilePreferences = {
  coachStyle?: CoachStyle
}

export type Database = {
  public: {
    Tables: {
      phase_templates: {
        Row: {
          id: string
          slug: string
          title: string
          subtitle: string
          order_index: number
          description: string
          objective: string | null
          difficulty: Difficulty
          reward_xp: number
          focus_areas: Json
          completion_requirements: Json
          final_challenge: FinalChallengeJson
          color_accent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          subtitle: string
          order_index: number
          description: string
          objective?: string | null
          difficulty?: Difficulty
          reward_xp?: number
          focus_areas?: Json
          completion_requirements?: Json
          final_challenge?: FinalChallengeJson
          color_accent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          subtitle?: string
          order_index?: number
          description?: string
          objective?: string | null
          difficulty?: Difficulty
          reward_xp?: number
          focus_areas?: Json
          completion_requirements?: Json
          final_challenge?: FinalChallengeJson
          color_accent?: string | null
          created_at?: string
        }
      }
      profiles: {
        Row: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; bio: string | null; experience_level: ProfileExperienceLevel | null; preferences: ProfilePreferences; long_term_objectives: string | null; created_at: string; updated_at: string }
        Insert: { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; bio?: string | null; experience_level?: ProfileExperienceLevel | null; preferences?: ProfilePreferences; long_term_objectives?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; bio?: string | null; experience_level?: ProfileExperienceLevel | null; preferences?: ProfilePreferences; long_term_objectives?: string | null; created_at?: string; updated_at?: string }
      }
      goals: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          status: string
          category: GoalCategory
          priority: GoalPriority
          target_date: string | null
          desired_outcome: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          status?: string
          category?: GoalCategory
          priority?: GoalPriority
          target_date?: string | null
          desired_outcome?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          status?: string
          category?: GoalCategory
          priority?: GoalPriority
          target_date?: string | null
          desired_outcome?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      phases: {
        Row: {
          id: string
          user_id: string
          goal_id: string | null
          template_id: string | null
          title: string
          slug: string | null
          status: PhaseStatus
          order_index: number
          phase_number: number | null
          objective: string | null
          description: string | null
          difficulty: Difficulty | null
          focus_areas: Json
          completion_requirements: Json
          final_challenge: FinalChallengeJson
          reward_xp: number
          start_date: string | null
          target_date: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          goal_id?: string | null
          template_id?: string | null
          title: string
          slug?: string | null
          status?: PhaseStatus
          order_index?: number
          phase_number?: number | null
          objective?: string | null
          description?: string | null
          difficulty?: Difficulty | null
          focus_areas?: Json
          completion_requirements?: Json
          final_challenge?: FinalChallengeJson
          reward_xp?: number
          start_date?: string | null
          target_date?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          goal_id?: string | null
          template_id?: string | null
          title?: string
          slug?: string | null
          status?: PhaseStatus
          order_index?: number
          phase_number?: number | null
          objective?: string | null
          description?: string | null
          difficulty?: Difficulty | null
          focus_areas?: Json
          completion_requirements?: Json
          final_challenge?: FinalChallengeJson
          reward_xp?: number
          start_date?: string | null
          target_date?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      milestones: {
        Row: {
          id: string
          phase_id: string
          title: string
          description: string | null
          sort_order: number
          status: string
          xp_reward: number
          requirements: Json | null
          is_final_challenge: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          phase_id: string
          title: string
          description?: string | null
          sort_order?: number
          status?: string
          xp_reward?: number
          requirements?: Json | null
          is_final_challenge?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          phase_id?: string
          title?: string
          description?: string | null
          sort_order?: number
          status?: string
          xp_reward?: number
          requirements?: Json | null
          is_final_challenge?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      quests: {
        Row: {
          id: string
          user_id: string
          milestone_id: string | null
          phase_id: string | null
          title: string
          description: string | null
          xp_reward: number
          sort_order: number
          is_recurring: boolean
          status: QuestStatus
          category: QuestCategory
          difficulty: QuestDifficulty
          estimated_duration: number | null
          due_date: string | null
          recurrence: Recurrence
          linked_skill: string | null
          completed_at: string | null
          postponed_count: number
          last_postponed_at: string | null
          skipped_count: number
          last_skipped_at: string | null
          evidence: string | null
          adapted_from_difficulty: QuestDifficulty | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          milestone_id?: string | null
          phase_id?: string | null
          title: string
          description?: string | null
          xp_reward?: number
          sort_order?: number
          is_recurring?: boolean
          status?: QuestStatus
          category?: QuestCategory
          difficulty?: QuestDifficulty
          estimated_duration?: number | null
          due_date?: string | null
          recurrence?: Recurrence
          linked_skill?: string | null
          completed_at?: string | null
          postponed_count?: number
          last_postponed_at?: string | null
          skipped_count?: number
          last_skipped_at?: string | null
          evidence?: string | null
          adapted_from_difficulty?: QuestDifficulty | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          milestone_id?: string | null
          phase_id?: string | null
          title?: string
          description?: string | null
          xp_reward?: number
          sort_order?: number
          is_recurring?: boolean
          status?: QuestStatus
          category?: QuestCategory
          difficulty?: QuestDifficulty
          estimated_duration?: number | null
          due_date?: string | null
          recurrence?: Recurrence
          linked_skill?: string | null
          completed_at?: string | null
          postponed_count?: number
          last_postponed_at?: string | null
          skipped_count?: number
          last_skipped_at?: string | null
          evidence?: string | null
          adapted_from_difficulty?: QuestDifficulty | null
          created_at?: string
          updated_at?: string
        }
      }
      xp_transactions: {
        Row: {
          id: string
          user_id: string
          amount: number
          source: string
          source_type: "quest" | "milestone" | "phase" | "bonus" | "adjustment" | "achievement" | null
          source_id: string | null
          source_key: string | null
          quest_id: string | null
          skill_id: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          source: string
          source_type?: "quest" | "milestone" | "phase" | "bonus" | "adjustment" | "achievement" | null
          source_id?: string | null
          source_key?: string | null
          quest_id?: string | null
          skill_id?: string | null
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          source?: string
          source_type?: "quest" | "milestone" | "phase" | "bonus" | "adjustment" | "achievement" | null
          source_id?: string | null
          source_key?: string | null
          quest_id?: string | null
          skill_id?: string | null
          description?: string | null
          created_at?: string
        }
      }
      user_levels: {
        Row: { id: string; user_id: string; level: number; xp: number; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; level?: number; xp?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; level?: number; xp?: number; created_at?: string; updated_at?: string }
      }
      // remaining tables loosely typed
      [key: string]: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
