// Supabase Edge Function: ai-coach -> Google Gemini 2.5 Flash
// Architecture: Ascend Frontend -> Supabase Edge Function ai-coach -> Gemini -> Ascend UI
// Env: GEMINI_API_KEY (server-only, never exposed)
// Model: gemini-2.5-flash via generateContent REST

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// --- CORS ---
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // Follow existing Ascend deployment; Next.js routes are same-origin. Edge Functions require explicit. Supabase recommends specific origin but current coach had no CORS needed; using * for simplicity and dashboard parity.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SAFETY_RULES = `
HARD SAFETY RULES (always apply, no exceptions):
- You are NOT a therapist, doctor, or mental-health professional. Never diagnose conditions.
- Never make medical claims or prescribe treatment, diets, supplements, or medication.
- Never encourage dangerous activities, extreme dieting, caloric restriction, sleep deprivation,
  overtraining, substance use, or unhealthy productivity ("hustle at all costs").
- If a user mentions self-harm, hopelessness, or crisis: respond with warmth, urge them to contact
  local emergency services or a crisis hotline, and do not attempt to counsel.
- Actively encourage rest days, recovery, sleep, and sustainable pacing. Refuse requests that push
  toward harm, and briefly redirect to a safer alternative.
- Stay in scope: personal growth planning (goals, phases, milestones, quests, reflection).
  Politely decline unrelated tasks (code generation, essays for submission, etc.).`;

function clip(s: string | null | undefined, n = 160): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Minimal momentum helper (duplicated from src/lib/momentum/model to avoid import)
function computeMomentumScore(rows: { date: string; score: number; recovery: boolean }[]): number {
  // Simplified: average score last 7d normalized to 0..100 (real model is more complex but this mirrors context intent)
  if (rows.length === 0) return 0;
  const last7 = rows.slice(-7);
  const sum = last7.reduce((a, r) => a + (r.score ?? 0), 0);
  return Math.min(100, Math.round((sum / 70) * 100));
}
function momentumLabel(score: number): string {
  if (score >= 80) return "High";
  if (score >= 50) return "Steady";
  if (score >= 20) return "Building";
  return "Starting";
}

async function gatherContext(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const since21 = todayIso(new Date(Date.now() - 20 * 86400000));
  const [phasesRes, goalsRes, questsOpenRes, questDoneRes, userSkillsRes, statsRes, momRes, reflRes, journalRes, levelRes] = await Promise.all([
    supabase.from("phases").select("id,title,objective,status,goal_id").eq("user_id", userId).order("order_index"),
    supabase.from("goals").select("id,title,status,priority,target_date").eq("user_id", userId).neq("status", "archived").limit(8),
    supabase.from("quests").select("title,difficulty,due_date,category").eq("user_id", userId).eq("status", "active").order("due_date", { ascending: true }).limit(10),
    supabase.from("quests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase.from("user_skills").select("skill_id,xp").eq("user_id", userId).gt("xp", 0).order("xp", { ascending: false }).limit(5),
    supabase.from("user_stats").select("stat_id,value").eq("user_id", userId),
    supabase.from("momentum").select("date,score,recovery,recovery_kinds").eq("user_id", userId).gte("date", since21),
    supabase.from("reflections").select("body,entry_date,mood,tags").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("reflections").select("entry_date,mood,tags").eq("user_id", userId).not("entry_date", "is", null).order("entry_date", { ascending: false }).limit(7),
    supabase.from("user_levels").select("level,xp").eq("user_id", userId).maybeSingle(),
  ]);

  let statLines = "";
  const statIds = ((statsRes.data as { stat_id: string; value: number }[] | null) ?? []).filter((s) => s.value > 0);
  if (statIds.length > 0) {
    const { data: catalog } = await supabase.from("stats").select("id,name").in("id", statIds.map((s) => s.stat_id));
    const names = new Map(((catalog as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]));
    statLines = "CHARACTER STATS: " + statIds.sort((a, b) => b.value - a.value).slice(0, 6).map((s) => `${names.get(s.stat_id) ?? "?"} ${Math.round(s.value)}`).join(", ");
  }
  let skillsLine = "";
  const userSkills = (userSkillsRes.data as { skill_id: string; xp: number }[] | null) ?? [];
  if (userSkills.length > 0) {
    const ids = userSkills.map((s) => s.skill_id);
    const { data: skillCatalog } = await supabase.from("skills").select("id,name").in("id", ids);
    const nameMap = new Map(((skillCatalog as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name]));
    skillsLine = "TOP SKILLS: " + userSkills.map((s) => `${nameMap.get(s.skill_id) ?? "?"} (${Math.round(s.xp)} xp)`).join(", ");
  }
  const levelRow = levelRes.data as { level: number; xp: number } | null;
  const levelLine = levelRow ? `LEVEL: ${levelRow.level} (${Math.round(levelRow.xp)} XP total)` : "";
  const journals = (journalRes.data as { entry_date: string | null; mood: string | null; tags: string[] | null }[] | null) ?? [];
  let journalLine = "";
  if (journals.length > 0) {
    const dated = journals.filter((j) => j.entry_date).slice(0, 7);
    if (dated.length > 0) journalLine = `JOURNAL: ${dated.length} entries last 7d, moods [${dated.map((j) => j.mood ?? "—").join(", ")}], tags [${[...new Set(dated.flatMap((j) => j.tags ?? []))].slice(0, 8).join(", ") || "none"}]`;
  }
  const phases = (phasesRes.data as { id: string; title: string; objective: string | null; status: string; goal_id: string | null }[] | null) ?? [];
  const activePhase = phases.find((p) => p.status === "active");
  let milestoneLines = "";
  if (activePhase) {
    const { data: ms } = await supabase.from("milestones").select("title,status,is_final_challenge").eq("phase_id", activePhase.id).order("sort_order");
    const rows = (ms as { title: string; status: string; is_final_challenge: boolean }[] | null) ?? [];
    if (rows.length > 0) milestoneLines = "MILESTONES: " + rows.slice(0, 8).map((m) => `${m.status === "completed" ? "[x]" : "[ ]"} ${clip(m.title, 60)}${m.is_final_challenge ? " (final)" : ""}`).join(" · ");
  }
  const goals = (goalsRes.data as { id: string; title: string; status: string; priority: string; target_date: string | null }[] | null) ?? [];
  type Row = { date: string; score: number; recovery: boolean; recovery_kinds?: string[] };
  const momRows = ((momRes.data as Row[] | null) ?? []).map((r) => ({ date: r.date, score: r.score ?? 0, recovery: !!r.recovery }));
  const momentumScore = computeMomentumScore(momRows);
  const { data: streakData } = await supabase.from("momentum").select("streak").eq("user_id", userId).order("streak", { ascending: false }).limit(1);
  const bestStreak = (streakData as { streak: number }[] | null)?.[0]?.streak ?? 0;
  const lines: string[] = [];
  if (activePhase) {
    lines.push(`CURRENT PHASE: ${clip(activePhase.title, 80)}${activePhase.goal_id ? " (goal journey)" : ""}`);
    if (activePhase.objective) lines.push(`PHASE OBJECTIVE: ${clip(activePhase.objective)}`);
  }
  if (milestoneLines) lines.push(milestoneLines);
  const openQuests = (questsOpenRes.data as { title: string; difficulty: string; due_date: string | null; category: string }[] | null) ?? [];
  if (openQuests.length > 0) lines.push(`OPEN QUESTS: ${openQuests.map((q) => `${clip(q.title, 50)} (${q.difficulty}/${q.category}${q.due_date ? `, due ${q.due_date}` : ""})`).join("; ")}`);
  lines.push(`COMPLETED QUESTS TOTAL: ${(questDoneRes.count ?? 0)}`);
  if (goals.length > 0) lines.push(`GOALS: ${goals.map((g) => `${clip(g.title, 50)} [${g.status}/${g.priority}${g.target_date ? `, target ${g.target_date}` : ""}]`).join("; ")}`);
  if (skillsLine) lines.push(skillsLine);
  if (statLines) lines.push(statLines);
  if (levelLine) lines.push(levelLine);
  if (journalLine) lines.push(journalLine);
  lines.push(`MOMENTUM: ${momentumScore}/100 (${momentumLabel(momentumScore)}); best streak ever ${bestStreak}d`);
  const reflections = (reflRes.data as { body: string; entry_date: string | null; mood: string | null }[] | null) ?? [];
  if (reflections.length > 0) {
    const fmt = reflections.map((r) => {
      const tag = r.entry_date ? `[${r.entry_date}${r.mood ? ` ${r.mood}` : ""}]` : r.mood ? `[${r.mood}]` : "";
      return `${tag} "${clip(r.body, 110)}"`;
    }).join(" | ");
    lines.push(`RECENT REFLECTIONS/JOURNAL: ${fmt}`);
  }
  return lines.join("\n") || "New user — no activity yet.";
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Auth: expect Supabase JWT in Authorization: Bearer <token>
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ ok: false, unavailable: true, error: "not_configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Create supabase client with user token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: { message?: unknown; history?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Rate limit (in-memory per isolate - best-effort)
  // Simple: rely on DB history length; not implementing distributed limit here.

  // Gather Ascend context (preserved)
  let contextText = "";
  try {
    contextText = await gatherContext(supabase, user.id);
  } catch {
    contextText = "New user — no activity yet.";
  }

  // Load history for continuity (last 20)
  let history: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const { data } = await supabase.from("coach_messages").select("role,content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    history = ((data as { role: "user" | "assistant"; content: string }[] | null) ?? []).reverse();
  } catch { /* ignore */ }

  // Persist user message
  try {
    await supabase.from("coach_messages").insert({ user_id: user.id, role: "user", content: message.slice(0, 6000) });
  } catch { /* ignore */ }

  // GEMINI_API_KEY (server-only)
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    // Preserve fallback: do not fabricate, return unavailable (frontend shows COACH_UNAVAILABLE_MESSAGE)
    return new Response(JSON.stringify({ ok: false, unavailable: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Build Gemini request
  const systemInstruction = `You are Ascend AI Coach, a practical personal-development coach inside the Ascend application.

Your purpose is to help the user grow through self-awareness, discipline, emotional regulation, learning, character development, goals, phases, milestones, quests, journaling, and consistent action.

Use the user's Ascend context when it is provided.

Be:
- practical
- calm
- honest
- encouraging
- concise
- respectful
- non-judgmental
- action-oriented

Do not give empty motivational speeches.
Do not excessively lecture.
For simple questions, give concise answers.
For difficult situations:
1. acknowledge the situation briefly,
2. identify useful patterns or lessons,
3. provide practical next steps,
4. suggest a small actionable step or quest when appropriate.

Help the user think clearly instead of simply agreeing with everything they say.
Do not pretend to be a therapist, doctor, lawyer, or other licensed professional.
Do not diagnose medical or mental-health conditions.
When appropriate, encourage the user to seek qualified professional help.
The goal of Ascend is long-term personal growth, not temporary motivation.

${SAFETY_RULES}

=== USER'S ACTUAL ASCEND DATA ===
${contextText}
=== END DATA ===`;

  // Convert history + current message to Gemini contents
  // Gemini expects: contents: [{role:"user", parts:[{text:"..."}]}, {role:"model", parts:[{text:"..."}]}]
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const m of history.slice(-20)) {
    const role = m.role === "assistant" ? "model" : "user";
    // Skip empty
    if (!m.content?.trim()) continue;
    contents.push({ role, parts: [{ text: m.content.slice(0, 6000) }] });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
      }),
    });

    if (!geminiRes.ok) {
      const txt = (await geminiRes.text()).slice(0, 600);
      console.error("[ai-coach] gemini upstream", geminiRes.status, txt);
      // Map common codes to safe messages
      if (geminiRes.status === 429) {
        return new Response(JSON.stringify({ ok: false, unavailable: true, error: "rate_limited" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (geminiRes.status === 400 || geminiRes.status === 401 || geminiRes.status === 403) {
        return new Response(JSON.stringify({ ok: false, unavailable: true, error: "not_configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, unavailable: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await geminiRes.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: unknown;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!text) {
      console.error("[ai-coach] gemini empty candidates", JSON.stringify(json).slice(0, 800));
      return new Response(JSON.stringify({ ok: false, unavailable: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Persist assistant message
    try {
      await supabase.from("coach_messages").insert({ user_id: user.id, role: "assistant", content: text.slice(0, 6000) });
    } catch { /* ignore */ }

    // Preserve existing frontend contract: { ok:true, reply: string }
    // Also include { response: string } for Edge Function callers expecting that shape
    return new Response(JSON.stringify({ ok: true, reply: text, response: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-coach] fetch failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ ok: false, unavailable: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
