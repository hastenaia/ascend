export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      phase_templates: {
        Row: { id: string; slug: string; title: string; subtitle: string; order_index: number; description: string; focus_areas: Json; created_at: string }
        Insert: { id?: string; slug: string; title: string; subtitle: string; order_index: number; description: string; focus_areas?: Json; created_at?: string }
        Update: { id?: string; slug?: string; title?: string; subtitle?: string; order_index?: number; description?: string; focus_areas?: Json; created_at?: string }
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
        Row: { id: string; user_id: string; goal_id: string | null; template_id: string | null; title: string; slug: string | null; status: string; order_index: number; description: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; goal_id?: string | null; template_id?: string | null; title: string; slug?: string | null; status?: string; order_index?: number; description?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; goal_id?: string | null; template_id?: string | null; title?: string; slug?: string | null; status?: string; order_index?: number; description?: string | null; created_at?: string; updated_at?: string }
      }
      // remaining tables typed loosely for now; expand as needed
      [key: string]: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
