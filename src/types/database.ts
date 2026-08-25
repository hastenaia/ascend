export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Difficulty = "easy" | "standard" | "hard" | "extreme"
export type PhaseStatus = "locked" | "available" | "active" | "completed" | "archived"

export type FinalChallengeJson = {
  title: string
  description: string
  xp_reward: number
  status: "locked" | "available" | "completed"
} | null

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
        Row: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; bio: string | null; created_at: string; updated_at: string }
        Insert: { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; bio?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; bio?: string | null; created_at?: string; updated_at?: string }
      }
      goals: {
        Row: { id: string; user_id: string; title: string; description: string | null; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; title: string; description?: string | null; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; title?: string; description?: string | null; status?: string; created_at?: string; updated_at?: string }
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
      // remaining tables loosely typed
      [key: string]: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
