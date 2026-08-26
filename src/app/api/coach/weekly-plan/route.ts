import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callModel, extractJson, type ChatMessage } from "@/lib/coach/provider"
import { buildSystemPrompt } from "@/lib/coach/prompt"
import { gatherCoachContext } from "@/lib/coach/context"
import { rateLimited } from "@/lib/coach/ratelimit"

export const runtime = "nodejs"

export type PlanItem = { day: string; focus: string; quest_title: string }
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/**
 * POST /api/coach/weekly-plan
 * → { ok:true, plan: PlanItem[] } | { ok:false, unavailable:true }
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (rateLimited(`plan:${user.id}`)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const ctx = await gatherCoachContext(supabase, user.id)

  const messages: ChatMessage[] = [
    buildSystemPrompt(ctx.text),
    {
      role: "user",
      content: `Create this week's plan from the user's real open quests and phase.

Rules:
- Exactly 7 items, one per day in order: ${DAYS.join(", ")}.
- Realistic daily load; at least one day MUST be an explicit rest/recovery day (quest_title like "Rest & recover").
- quest_title max 80 chars, phrased as an actionable task grounded in their data.
Respond with ONLY a JSON array: [{"day":"Monday","focus":"...","quest_title":"..."}]`,
    },
  ]

  const result = await callModel(messages, { maxTokens: 700, temperature: 0.6 })
  if (!result.ok) return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })

  const parsed = extractJson<PlanItem[]>(result.content)
  const plan = Array.isArray(parsed)
    ? parsed.slice(0, 7).map((p, i) => ({
        day: DAYS[i] ?? String(p.day ?? `Day ${i + 1}`).slice(0, 12),
        focus: String(p.focus ?? "").trim().slice(0, 120),
        quest_title: String(p.quest_title ?? "").trim().slice(0, 150),
      }))
    : []
  if (plan.length === 0) return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })

  return NextResponse.json({ ok: true, plan })
}
