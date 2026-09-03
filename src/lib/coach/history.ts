import type { SupabaseClient } from "@supabase/supabase-js"

const MAX_CONTENT = 6000

export async function loadHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 30
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data } = await supabase
    .from("coach_messages")
    .select("role,content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  return ((data as { role: "user" | "assistant"; content: string }[] | null) ?? [])
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }))
}

export async function appendMessage(supabase: SupabaseClient, userId: string, role: "user" | "assistant", content: string): Promise<void> {
  const trimmed = content.trim().slice(0, MAX_CONTENT)
  if (!trimmed) return
  if (role === "assistant") {
    // Assistant history is trusted — route through SECURITY DEFINER RPC so the
    // browser cannot forge arbitrary assistant rows via direct table INSERT.
    // Fall back to direct insert only if the RPC is unavailable (e.g. migration
    // not yet applied on local/prod) to keep existing conversations working.
    const { error } = await supabase.rpc("append_coach_assistant_message", { p_content: trimmed })
    if (!error) return
    await supabase.from("coach_messages").insert({ user_id: userId, role, content: trimmed })
    return
  }
  await supabase.from("coach_messages").insert({ user_id: userId, role, content: trimmed })
}

export async function clearHistory(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from("coach_messages").delete().eq("user_id", userId)
}
