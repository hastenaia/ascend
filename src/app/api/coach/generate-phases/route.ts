import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callModel, extractJson, type ChatMessage } from "@/lib/coach/provider"
import { buildSystemPrompt } from "@/lib/coach/prompt"
import { gatherCoachContext } from "@/lib/coach/context"
import { rateLimited } from "@/lib/coach/ratelimit"
import { sanitizeForPrompt } from "@/lib/ai/context"

export const runtime = "nodejs"

type ProposedPhase = { title: string; objective: string }

/**
 * POST /api/coach/generate-phases   Body: { goalTitle: string, notes?: string }
 * → { ok:true, phases: ProposedPhase[] } | { ok:false, unavailable:true }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (rateLimited(`gen:${user.id}`)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  let body: { goalTitle?: unknown; notes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  const goalTitle = typeof body.goalTitle === "string" ? body.goalTitle.trim().slice(0, 120) : ""
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : ""
  if (!goalTitle) return NextResponse.json({ error: "bad_request" }, { status: 400 })

  const ctx = await gatherCoachContext(supabase, user.id)

  // Sanitize user-controlled strings so they remain data, not instructions
  const safeTitle = sanitizeForPrompt(goalTitle) || goalTitle
  const safeNotes = notes ? sanitizeForPrompt(notes) || notes : ""

  const messages: ChatMessage[] = [
    buildSystemPrompt(ctx.text),
    {
      role: "user",
      content: `Design a personalized phase journey for this goal: "${safeTitle}"${safeNotes ? `\nUser notes: ${safeNotes}` : ""}

Requirements:
- 3 to 5 phases, each a real progression step (foundations -> practice -> depth -> mastery style arc).
- Titles max 60 chars; objectives one concrete sentence.
- Respond with ONLY a JSON array, no prose: [{"title":"...","objective":"..."}]`,
    },
  ]

  const result = await callModel(messages, { maxTokens: 600, temperature: 0.7 })
  if (!result.ok) return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })

  const parsed = extractJson<ProposedPhase[]>(result.content)
  const phases = Array.isArray(parsed)
    ? parsed
        .filter((p) => p && typeof p.title === "string")
        .slice(0, 8)
        .map((p) => ({ title: String(p.title).trim().slice(0, 120), objective: String(p.objective ?? "").trim().slice(0, 300) }))
        .filter((p) => p.title.length > 0)
    : []
  if (phases.length === 0) return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })

  return NextResponse.json({ ok: true, phases })
}
