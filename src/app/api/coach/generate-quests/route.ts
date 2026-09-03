import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callModel, extractJson, type ChatMessage } from "@/lib/coach/provider"
import { buildSystemPrompt } from "@/lib/coach/prompt"
import { gatherCoachContext } from "@/lib/coach/context"
import { rateLimited } from "@/lib/coach/ratelimit"

export const runtime = "nodejs"

type ProposedQuest = {
  title: string
  category: string
  difficulty: string
  estimated_duration: number | null
}

const CATEGORIES = ["intellect", "physical", "discipline", "reflection", "craft", "work", "general"]
const DIFFICULTIES = ["easy", "medium", "hard", "challenge"]

/**
 * POST /api/coach/generate-quests   Body: { focus?: string }
 * → { ok:true, quests: ProposedQuest[] }
 *   | { ok:false, rate_limited:true, retryAfter?: number } (HTTP 429)
 *   | { ok:false, unavailable:true } (HTTP 200)
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (rateLimited(`gen:${user.id}`)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  let body: { focus?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, 300) : ""

  const ctx = await gatherCoachContext(supabase, user.id)

  const messages: ChatMessage[] = [
    buildSystemPrompt(ctx.text),
    {
      role: "user",
      content: `Propose 3 to 5 realistic quests for the user right now${focus ? `, focused on: "${focus}"` : ""}.

Rules:
- Ground them in their open milestones/phase objective.
- Sustainable volume — nothing dangerous or extreme; include recovery-friendly options when momentum is low.
- category must be exactly one of: ${CATEGORIES.join(", ")}.
- difficulty must be exactly one of: ${DIFFICULTIES.join(", ")}.
- estimated_duration minutes (5–90) or null.
Respond with ONLY a JSON array: [{"title":"...","category":"...","difficulty":"...","estimated_duration":30}]`,
    },
  ]

  const result = await callModel(messages, { maxTokens: 600, temperature: 0.7 })
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { ok: false, rate_limited: true, retryAfter: result.retryAfterSeconds ?? null },
        { status: 429 },
      )
    }
    return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })
  }

  const parsed = extractJson<ProposedQuest[]>(result.content)
  const quests = Array.isArray(parsed)
    ? parsed
        .filter((q) => q && typeof q.title === "string" && CATEGORIES.includes(String(q.category)) && DIFFICULTIES.includes(String(q.difficulty)))
        .slice(0, 6)
        .map((q) => ({
          title: String(q.title).trim().slice(0, 150),
          category: String(q.category),
          difficulty: String(q.difficulty),
          estimated_duration:
            typeof q.estimated_duration === "number" && q.estimated_duration >= 5 && q.estimated_duration <= 480
              ? Math.round(q.estimated_duration)
              : null,
        }))
        .filter((q) => q.title.length > 0)
    : []
  if (quests.length === 0) return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })

  return NextResponse.json({ ok: true, quests })
}
